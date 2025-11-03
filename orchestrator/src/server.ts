import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import replyFrom from "@fastify/reply-from";
import fastifyScalar from "@scalar/fastify-api-reference";
import fastifySwagger from "@fastify/swagger";
import fastifyCors from "@fastify/cors";
import { v4 as uuidv4 } from "uuid";
// import fs from "fs";

import {
  PORT,
  BASE_PATH,
  SESSION_TIMEOUT_DEFAULT,
  MAX_SESSIONS,
  READINESS_TIMEOUT_SECONDS,
  K8S_NAMESPACE,
  BROWSER_PORT,
} from "./config.js";
import {
  ensureRedisConnected,
  saveSession,
  getSession,
  touchSession,
  deleteSessionKey,
  listSessions,
  ping as redisPing,
} from "./redisStore.js";
import scalarTheme from "./scalar-theme.js";
import {
  browserServiceHost,
  makeSessionServiceName,
  createSessionPod,
  createSessionService,
  deleteService,
  deletePod,
  listActiveServices,
  waitForServiceReadiness,
  core as k8sCore,
} from "./k8s.js";
import { startBackgroundWorkers } from "./janitor.js";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  DeleteSessionResponse,
  HealthResponse,
  ListSessionsResponse,
  SessionData,
  SessionWithHealth,
} from "./types.js";
import { titleCase } from "../utils/text.js";
import {
  getMetrics,
  sessionsTotal,
  sessionStartTime,
  updateLiveSessions,
} from "./metrics.js";

/**
 * Create and configure a Fastify server with all routes registered.
 * This function does not start listening; use startServer to boot the app.
 */
export function createServer(): FastifyInstance {
  const fastify: FastifyInstance = Fastify({
    logger: true,
    requestTimeout: 120_000,
    trustProxy: true,
  });

  return fastify;
}

function registerRoutes(fastify: FastifyInstance): void {
  // Preflight handler for CORS (applies to all prefixed routes)
  fastify.options("/*", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    );
    reply.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept",
    );
    // Some clients expect this header when sending credentials; keep it false by default.
    reply.header("Access-Control-Allow-Credentials", "false");
    // No content for preflight
    reply.code(204).send();
  });

  // Create session
  fastify.post<{ Body: CreateSessionRequest }>("/sessions", async (request) => {
    const { timeout = SESSION_TIMEOUT_DEFAULT, options = {} } =
      request.body || {};

    const sessionId = uuidv4();
    const serviceName = makeSessionServiceName(sessionId);
    const serviceHost = browserServiceHost(sessionId);

    const session: SessionData = {
      id: sessionId,
      status: "pending",
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      timeoutSeconds: Number(timeout) || SESSION_TIMEOUT_DEFAULT,
      serviceName,
      podName: null,
      serviceHost,
      options,
    };

    await saveSession(session);

    // Increment total sessions counter
    sessionsTotal.inc();

    // Respect MAX_SESSIONS based on existing active services
    const activeServices = await listActiveServices();
    if (activeServices.length >= MAX_SESSIONS) {
      session.status = "failed";
      session.notes = "Max sessions reached";
      await saveSession(session);
      const resp: CreateSessionResponse = {
        sessionId,
        status: "failed",
        error: "Max sessions reached",
      };
      return resp;
    }

    // Create dedicated session pod
    let podName: string | null = null;
    try {
      podName = await createSessionPod(sessionId);
    } catch (err: any) {
      session.status = "failed";
      session.notes = `Failed to create pod: ${String(err?.message || err)}`;
      await saveSession(session);
      const resp: CreateSessionResponse = {
        sessionId,
        status: "failed",
        error: session.notes,
      };
      return resp;
    }
    session.podName = podName;
    await saveSession(session);

    // Create service selecting session pod (via sessionId label)
    try {
      await createSessionService(
        sessionId,
        { sessionId },
        {
          "steel/targetPodName": podName!,
          "steel/handOff": "cold",
        },
      );
    } catch (err: any) {
      session.status = "failed";
      session.notes = `Failed to create service: ${String(err?.message || err)}`;
      await saveSession(session);
      // Cleanup pod on failure to create service
      if (podName) {
        await deletePod(podName).catch(() => {});
      }
      const resp: CreateSessionResponse = {
        sessionId,
        status: "failed",
        error: session.notes,
      };
      return resp;
    }

    // Wait for readiness
    try {
      await waitForServiceReadiness(serviceName, READINESS_TIMEOUT_SECONDS);
      session.status = "live";
      await saveSession(session);

      // Track session start time
      const startTime =
        (new Date().getTime() - new Date(session.createdAt).getTime()) / 1000;
      sessionStartTime.observe(startTime);

      // Update live sessions gauge
      const allSessions = await listSessions();
      const liveCount = allSessions.filter((s) => s.status === "live").length;
      updateLiveSessions(liveCount);

      const resp: CreateSessionResponse = {
        sessionId,
        status: "live",
        serviceHost,
        serviceName,
        podName: podName!,
      };
      return resp;
    } catch (err: any) {
      session.status = "failed";
      session.notes = `Cold start readiness failed: ${String(err?.message || err)}`;
      await saveSession(session);
      // Cleanup service + pod on failure
      await deleteService(serviceName).catch(() => {});
      if (podName) {
        await deletePod(podName).catch(() => {});
      }
      const resp: CreateSessionResponse = {
        sessionId,
        status: "failed",
        error: session.notes,
      };
      return resp;
    }
  });

  // Session landing: redirect to proxied root if live; otherwise show a small HTML status
  fastify.get<{ Params: { sessionId: string } }>(
    "/sessions/:sessionId",
    async (request, reply) => {
      try {
        const s = await getSession(request.params.sessionId);
        if (s.status !== "live") {
          reply.type("text/html");
          return `<html><body><h1>Session ${s.id}</h1><p>Status: ${s.status}</p></body></html>`;
        }
        // Redirect to proxied root path to keep UI behavior consistent
        return reply.redirect(`${BASE_PATH || ""}/sessions/${s.id}/`);
      } catch (err: any) {
        reply.code(404).type("text/html");
        return `<html><body><h1>Session Not Found</h1><p>${String(
          err?.message || err,
        )}</p></body></html>`;
      }
    },
  );

  // Session status
  fastify.get<{ Params: { sessionId: string } }>(
    "/sessions/:sessionId/status",
    async (request): Promise<SessionWithHealth | { error: string }> => {
      try {
        const session = await getSession(request.params.sessionId);
        return { ...session, healthy: session.status === "live" };
      } catch (err: any) {
        return { error: String(err?.message || err) };
      }
    },
  );

  // Delete session
  fastify.delete<{ Params: { sessionId: string } }>(
    "/sessions/:sessionId",
    async (request): Promise<DeleteSessionResponse> => {
      const sid = request.params.sessionId;
      try {
        const s = await getSession(sid).catch(() => null);
        if (s?.serviceName) {
          await deleteService(s.serviceName).catch(() => {});
        }
        if (s?.podName) {
          await deletePod(s.podName).catch(() => {});
        }
        await deleteSessionKey(sid);

        // Update live sessions gauge
        const allSessions = await listSessions();
        const liveCount = allSessions.filter((s) => s.status === "live").length;
        updateLiveSessions(liveCount);

        return { success: true };
      } catch (err: any) {
        return { success: false, error: String(err?.message || err) };
      }
    },
  );

  // List sessions
  fastify.get("/sessions", async (): Promise<ListSessionsResponse> => {
    const sessions = await listSessions();
    return { sessions, count: sessions.length };
  });

  // Health
  fastify.get("/health", async (): Promise<HealthResponse> => {
    try {
      await redisPing();
      // Basic k8s check: list services with small limit (best-effort)
      await k8sCore
        .listNamespacedService({ namespace: K8S_NAMESPACE, limit: 1 } as any)
        .catch(() => null);
      const sessions = await listSessions();
      return {
        status: "ok",
        sessions: sessions.length,
        namespace: K8S_NAMESPACE,
        basePath: BASE_PATH,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: "unhealthy",
        sessions: 0,
        error: String(err?.message || err),
        namespace: K8S_NAMESPACE,
        basePath: BASE_PATH,
      };
    }
  });

  // Metrics
  fastify.get("/metrics", async (_request, reply) => {
    try {
      // Update live sessions gauge before returning metrics
      const allSessions = await listSessions();
      const liveCount = allSessions.filter((s) => s.status === "live").length;
      updateLiveSessions(liveCount);

      const metrics = await getMetrics();
      reply.type("text/plain; version=0.0.4; charset=utf-8");
      return metrics;
    } catch (err: any) {
      reply.code(500).type("text/plain");
      return `Error generating metrics: ${String(err?.message || err)}`;
    }
  });

  // Proxy path: all methods
  fastify.all("/sessions/:sessionId/*", async (request, reply) => {
    return proxyToSession(fastify, request, reply);
  });
}

async function proxyToSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void | FastifyReply> {
  const sessionId = (request.params as any).sessionId as string;
  if (!sessionId) {
    return reply.code(400).send({ error: "Missing sessionId" });
  }

  // Validate session exists, and refresh TTL
  let session: SessionData;
  try {
    session = await getSession(sessionId);
  } catch {
    return reply.code(404).send({ error: "Session not found" });
  }
  // Update usage / TTL
  await touchSession(sessionId, session.timeoutSeconds);

  if (session.status !== "live") {
    return reply
      .code(409)
      .send({ error: `Session not ready: ${session.status}` });
  }

  // Path suffix
  const suffix = (request.params as any)["*"] || "";
  // Build target URL
  const targetHost = browserServiceHost(sessionId);
  const originalUrl = request.raw.url || "/";
  const queryIndex = originalUrl.indexOf("?");
  const queryPart = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  const dest = `http://${targetHost}:${BROWSER_PORT}/${suffix}${queryPart}`;

  // Use reply.from to proxy the request to upstream
  fastify.log.debug({ dest }, "Proxying session request");
  return reply.from(dest);
}

/**
 * Bootstraps and starts the orchestrator server:
 * - Connects to Redis and verifies reachability
 * - Starts background workers
 * - Registers proxy plugin
 * - Listens on configured port
 */
export async function startServer(): Promise<FastifyInstance> {
  const fastify = createServer();

  fastify.log.info(
    { namespace: K8S_NAMESPACE, basePath: BASE_PATH },
    "Startup configuration",
  );

  // Register CORS plugin early so it applies to all routes and preflight requests.
  // Allow all origins by default — adjust as needed for production security.
  await fastify.register(fastifyCors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    credentials: false,
  });

  // Add an onSend hook to ensure CORS headers are present even for proxied responses.
  fastify.addHook("onSend", async (request, reply, payload) => {
    // Only set headers if they aren't already set by upstream / other handlers.
    if (!reply.getHeader("Access-Control-Allow-Origin")) {
      reply.header("Access-Control-Allow-Origin", "*");
    }
    if (!reply.getHeader("Access-Control-Allow-Methods")) {
      reply.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
      );
    }
    if (!reply.getHeader("Access-Control-Allow-Headers")) {
      reply.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, Accept",
      );
    }
    return payload;
  });

  // Ensure Redis client is connected (with internal retries)
  await ensureRedisConnected();

  // Extra Redis reachability check
  await redisPing();

  // Start background workers
  startBackgroundWorkers(fastify.log as any);

  // Proxy plugin
  await fastify.register(replyFrom, {
    undici: { connections: 100, pipelining: 1 },
  });

  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Steel Browser Instance API",
        description:
          "Documentation for controlling a single instance of Steel Browser",
        version: "0.0.1",
      },
      servers: [
        {
          // url: getBaseUrl(),
          url: "http://localhost/api",
          description: "Local server",
        },
      ],
      paths: {}, // paths must be included even if it's an empty object
      components: {
        securitySchemes: {},
      },
    },
    refResolver: {
      buildLocalReference: (json, baseUri, fragment, i) => {
        return titleCase(json.$id as string) || `Fragment${i}`;
      },
    },
  });

  await fastify.register(fastifyScalar as any, {
    // scalar still uses fastify v4
    routePrefix: "/docs",
    configuration: {
      customCss: scalarTheme,
    },
  });

  await fastify.register(
    async (scoped) => {
      registerRoutes(scoped);
    },
    { prefix: `${BASE_PATH || ""}/v1` },
  );
  // await fastify.ready();

  // fs.writeFileSync(
  //   "./openapi.json",
  //   JSON.stringify(fastify.swagger(), null, 2),
  // );

  // Listen
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  fastify.log.info(`Orchestrator listening on ${PORT}`);
  return fastify;
}
