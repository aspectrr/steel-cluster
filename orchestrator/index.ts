import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import replyFrom from "@fastify/reply-from";
import Redis, { RedisClientType } from "redis";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  CoreV1Api,
  KubeConfig,
  V1Pod,
  V1Service,
  V1ContainerPort,
  V1Probe,
  V1HTTPGetAction,
} from "@kubernetes/client-node";
import { startServer } from "./src/server";

// =========================
/* Environment / Configuration */
// =========================

const PORT = Number(process.env.PORT || 3000);

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const K8S_NAMESPACE = process.env.K8S_NAMESPACE || "browser-sessions";

// Browser container image and port
const BROWSER_IMAGE = "steel-browser-cluster:latest";
// process.env.BROWSER_IMAGE || "ghcr.io/steel-dev/steel-browser:latest";
const BROWSER_PORT = Number(process.env.BROWSER_PORT || 3000);
const RAW_BASE_PATH = process.env.BASE_PATH || "";
const BASE_PATH =
  RAW_BASE_PATH === "/" ? "" : RAW_BASE_PATH.replace(/\/+$/, "");

// Session parameters
const SESSION_TIMEOUT_DEFAULT = Number(process.env.SESSION_TIMEOUT || 1800); // seconds
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 100);

// Prewarm pool
// const PREWARM_POOL_SIZE = Number(process.env.PREWARM_POOL_SIZE || 2);

// Resource requests/limits (optional)
const POD_MEMORY_REQUEST = process.env.POD_MEMORY_REQUEST || "256Mi";
const POD_CPU_REQUEST = process.env.POD_CPU_REQUEST || "200m";
const POD_MEMORY_LIMIT = process.env.POD_MEMORY_LIMIT || "512Mi";
const POD_CPU_LIMIT = process.env.POD_CPU_LIMIT || "500m";

// Optional image pull secret
const IMAGE_PULL_SECRET = process.env.IMAGE_PULL_SECRET;

// Readiness probe timing
const READINESS_INITIAL_DELAY = Number(
  process.env.READINESS_INITIAL_DELAY || 3,
);
const READINESS_PERIOD_SECONDS = Number(
  process.env.READINESS_PERIOD_SECONDS || 5,
);
const READINESS_TIMEOUT_SECONDS = Number(
  process.env.READINESS_TIMEOUT_SECONDS || 60,
);

// Janitor tuning
const JANITOR_INTERVAL_MS = Number(process.env.JANITOR_INTERVAL_MS || 15000);
// const PREWARM_CHECK_INTERVAL_MS = Number(
//   process.env.PREWARM_CHECK_INTERVAL_MS || 20000,
// );

// =========================
/* Types */
// =========================

type SessionStatus = "pending" | "running" | "failed";

interface SessionData {
  sessionId: string;
  status: SessionStatus;
  createdAt: string;
  lastUsed: string;
  timeoutSeconds: number;
  serviceName: string | null;
  podName: string | null;
  serviceHost: string | null; // FQDN or cluster DNS
  notes?: string;
  // free-form options for future use
  options?: Record<string, unknown>;
}

// =========================
/* Fastify + Redis + K8s Setup */
// =========================

const fastify: FastifyInstance = Fastify({
  logger: true,
  requestTimeout: 120_000,
  trustProxy: true,
});

if (BASE_PATH) {
  fastify.addHook("onRequest", async (request, _reply) => {
    const url = request.raw.url || "/";
    if (url === BASE_PATH || url.startsWith(BASE_PATH + "/")) {
      request.raw.url = url.slice(BASE_PATH.length) || "/";
    }
  });
}
const redis: RedisClientType = Redis.createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
});

// Kubernetes client
const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();
const core = kubeConfig.makeApiClient(CoreV1Api);

// =========================
/* Redis Helpers */
// =========================

const SESSION_KEY_PREFIX = "session:";

async function ensureRedisConnected(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
    fastify.log.info("Connected to Redis");
  }
}

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

async function saveSession(session: SessionData): Promise<void> {
  const key = sessionKey(session.sessionId);
  await redis.setEx(key, session.timeoutSeconds, JSON.stringify(session));
  // Maintain an index of active session IDs for optional listing
  await redis.sAdd("sessions:index", session.sessionId);
  await redis.expire("sessions:index", Math.max(session.timeoutSeconds, 3600));
}

async function getSession(sessionId: string): Promise<SessionData> {
  const key = sessionKey(sessionId);
  const raw = await redis.get(key);
  if (!raw) {
    throw new Error("Session not found");
  }
  return JSON.parse(raw) as SessionData;
}

async function touchSession(
  sessionId: string,
  timeoutSeconds: number,
): Promise<void> {
  const key = sessionKey(sessionId);
  const raw = await redis.get(key);
  if (!raw) {
    // session may have expired
    return;
  }
  const data = JSON.parse(raw) as SessionData;
  data.lastUsed = new Date().toISOString();
  await redis.setEx(key, timeoutSeconds, JSON.stringify(data));
}

async function deleteSessionKey(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
  await redis.sRem("sessions:index", sessionId);
}

async function listSessions(): Promise<SessionData[]> {
  // Fall back to scanning keys if index set is empty
  const ids = await redis.sMembers("sessions:index");
  const sessions: SessionData[] = [];
  if (ids.length > 0) {
    for (const id of ids) {
      const raw = await redis.get(sessionKey(id));
      if (!raw) {
        continue;
      }
      try {
        sessions.push(JSON.parse(raw));
      } catch {
        // ignore malformed
      }
    }
    return sessions;
  }
  // Scan keys
  const keys = await redis.keys(`${SESSION_KEY_PREFIX}*`);
  for (const k of keys) {
    try {
      const v = await redis.get(k);
      if (v) {
        sessions.push(JSON.parse(v));
      }
    } catch (err) {
      fastify.log.error(`Error parsing redis value for ${k}: ${String(err)}`);
    }
  }
  return sessions;
}

// =========================
/**
 * Kubernetes Helpers
 */
// =========================

function browserServiceHost(sessionId: string): string {
  return `browser-session-${sessionId}.${K8S_NAMESPACE}.svc.cluster.local`;
}

function makeReadinessProbe(): V1Probe {
  const httpGet: V1HTTPGetAction = {
    path: "/v1/health",
    port: BROWSER_PORT,
    scheme: "HTTP",
  };
  return {
    httpGet,
    initialDelaySeconds: READINESS_INITIAL_DELAY,
    periodSeconds: READINESS_PERIOD_SECONDS,
    timeoutSeconds: 5,
    failureThreshold: 12,
    successThreshold: 1,
  };
}

function makeContainerPorts(): V1ContainerPort[] {
  return [
    {
      containerPort: BROWSER_PORT,
      name: "http",
      protocol: "TCP",
    },
  ];
}

// function makePrewarmPodName(): string {
//   return `browser-prewarm-${uuidv4()}`;
// }

function makeSessionPodName(sessionId: string): string {
  return `browser-session-${sessionId}`;
}

function makeSessionServiceName(sessionId: string): string {
  return `browser-session-${sessionId}`;
}

// async function createPrewarmPod(): Promise<string> {
//   const name = makePrewarmPodName();
//   const pod: V1Pod = {
//     apiVersion: "v1",
//     kind: "Pod",
//     metadata: {
//       name,
//       namespace: K8S_NAMESPACE,
//       labels: {
//         app: "browser-session",
//         role: "prewarm",
//         podName: name,
//         "app.kubernetes.io/name": "browser-session",
//         "app.kubernetes.io/component": "prewarm",
//       },
//     },
//     spec: {
//       restartPolicy: "Always",
//       containers: [
//         {
//           name: "browser",
//           image: BROWSER_IMAGE,
//           imagePullPolicy: "IfNotPresent",
//           env: [
//             { name: "PORT", value: String(BROWSER_PORT) },
//             { name: "NODE_ENV", value: "production" },
//           ],
//           ports: makeContainerPorts(),
//           readinessProbe: makeReadinessProbe(),
//           resources: {
//             requests: { memory: POD_MEMORY_REQUEST, cpu: POD_CPU_REQUEST },
//             limits: { memory: POD_MEMORY_LIMIT, cpu: POD_CPU_LIMIT },
//           },
//         },
//       ],
//       ...(IMAGE_PULL_SECRET
//         ? {
//             imagePullSecrets: [{ name: IMAGE_PULL_SECRET }],
//           }
//         : {}),
//     },
//   };

//   await core.createNamespacedPod({
//     namespace: K8S_NAMESPACE,
//     body: pod,
//   } as any);
//   fastify.log.info({ name }, "Created prewarm pod");
//   return name;
// }

async function createSessionPod(sessionId: string): Promise<string> {
  const name = makeSessionPodName(sessionId);
  const pod: V1Pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name,
      namespace: K8S_NAMESPACE,
      labels: {
        app: "browser-session",
        role: "active",
        sessionId,
        podName: name,
      },
    },
    spec: {
      restartPolicy: "Always",
      containers: [
        {
          name: "browser",
          image: BROWSER_IMAGE,
          imagePullPolicy: "IfNotPresent",
          env: [
            { name: "PORT", value: String(BROWSER_PORT) },
            { name: "NODE_ENV", value: "production" },
            { name: "BASE_PATH", value: `/sessions/${sessionId}` },
            // { name: "API_URL", value: "http://localhost" },
          ],
          ports: makeContainerPorts(),
          readinessProbe: makeReadinessProbe(),
          resources: {
            requests: { memory: POD_MEMORY_REQUEST, cpu: POD_CPU_REQUEST },
            limits: { memory: POD_MEMORY_LIMIT, cpu: POD_CPU_LIMIT },
          },
        },
      ],
      ...(IMAGE_PULL_SECRET
        ? {
            imagePullSecrets: [{ name: IMAGE_PULL_SECRET }],
          }
        : {}),
    },
  };

  await core.createNamespacedPod({
    namespace: K8S_NAMESPACE,
    body: pod,
  } as any);
  fastify.log.info({ name, sessionId }, "Created session pod");
  return name;
}

async function createSessionService(
  sessionId: string,
  selector: Record<string, string>,
  annotations?: Record<string, string>,
): Promise<string> {
  const name = makeSessionServiceName(sessionId);
  const service: V1Service = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name,
      namespace: K8S_NAMESPACE,
      labels: {
        app: "browser-session",
        sessionId,
      },
      annotations: {
        "steel/sessionId": sessionId,
        ...(selector.podName
          ? { "steel/targetPodName": selector.podName }
          : {}),
        ...(annotations || {}),
      },
    },
    spec: {
      type: "ClusterIP",
      selector,
      ports: [
        {
          name: "http",
          port: BROWSER_PORT,
          targetPort: BROWSER_PORT,
          protocol: "TCP",
        },
      ],
    },
  };

  await core.createNamespacedService({
    namespace: K8S_NAMESPACE,
    body: service,
  } as any);

  fastify.log.info({ name, sessionId, selector }, "Created session service");
  return name;
}

async function deleteService(name: string): Promise<void> {
  try {
    await core.deleteNamespacedService({
      name,
      namespace: K8S_NAMESPACE,
    } as any);
    fastify.log.info({ name }, "Deleted service");
  } catch (err: any) {
    if (err?.response?.statusCode === 404) {
      return;
    }
    fastify.log.warn({ err, name }, "Failed to delete service");
  }
}

async function deletePod(name: string): Promise<void> {
  try {
    await core.deleteNamespacedPod({ name, namespace: K8S_NAMESPACE } as any);
    fastify.log.info({ name }, "Deleted pod");
  } catch (err: any) {
    if (err?.response?.statusCode === 404) {
      return;
    }
    fastify.log.warn({ err, name }, "Failed to delete pod");
  }
}

async function listPrewarmPods(): Promise<V1Pod[]> {
  const podsAllRes: any = await core.listNamespacedPod({
    namespace: K8S_NAMESPACE,
  } as any);
  const all = (podsAllRes.body || podsAllRes.data)?.items || [];

  const byLabel = all.filter(
    (p: any) =>
      p.metadata?.labels?.app === "browser-session" &&
      p.metadata?.labels?.role === "prewarm",
  );
  const byPrefix = all.filter((p: any) =>
    (p.metadata?.name || "").startsWith("browser-prewarm-"),
  );

  const unionMap: Record<string, any> = {};
  for (const p of [...byLabel, ...byPrefix]) {
    const n = p.metadata?.name;
    if (n) {
      unionMap[n] = p;
    }
  }
  const list = Object.values(unionMap) as V1Pod[];
  return list;
}

async function listActiveServices(): Promise<V1Service[]> {
  const svcsAllRes: any = await core.listNamespacedService({
    namespace: K8S_NAMESPACE,
  } as any);
  const all = (svcsAllRes.body || svcsAllRes.data)?.items || [];

  const byAnnotation = all.filter(
    (s: any) => s.metadata?.annotations?.["steel/sessionId"],
  );
  const byLabel = all.filter(
    (s: any) => s.metadata?.labels?.app === "browser-session",
  );
  const byPrefix = all.filter((s: any) =>
    (s.metadata?.name || "").startsWith("browser-session-"),
  );

  const serviceUnionMap: Record<string, any> = {};
  for (const s of [...byAnnotation, ...byLabel, ...byPrefix]) {
    const n = s.metadata?.name;
    if (n) {
      serviceUnionMap[n] = s;
    }
  }
  const list = Object.values(serviceUnionMap) as V1Service[];
  return list;
}

function isPodReady(pod: V1Pod): boolean {
  const conditions = pod.status?.conditions || [];
  return conditions.some((c) => c.type === "Ready" && c.status === "True");
}

async function waitForServiceReadiness(
  serviceName: string,
  timeoutSeconds: number,
): Promise<void> {
  const fqdn = `${serviceName}.${K8S_NAMESPACE}.svc.cluster.local`;
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastErr: any = null;

  while (Date.now() < deadline) {
    try {
      const url = `http://${fqdn}:${BROWSER_PORT}/v1/health`;
      const res = await axios.get(url, { timeout: 3000 });
      if (res.status >= 200 && res.status < 300) {
        return;
      }
      lastErr = new Error(`Unexpected HTTP ${res.status}`);
    } catch (err: any) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Timed out waiting for service ${serviceName} readiness: ${lastErr ? String(lastErr) : "unknown error"}`,
  );
}

// async function ensurePrewarmPool(): Promise<void> {
//   // Simple Redis-based lock to avoid overshoot with multiple orchestrator instances
//   const lockKey = "prewarm:lock";
//   const lockTtlMs = 30000;
//   const token = uuidv4();

//   try {
//     // Acquire lock (SET NX PX)
//     const acquired = await redis.set(lockKey, token, {
//       NX: true,
//       PX: lockTtlMs,
//     });
//     if (!acquired) {
//       return;
//     }

//     const [pods, services] = await Promise.all([
//       listPrewarmPods(),
//       listActiveServices(),
//     ]);

//     if (pods.length === 0) {
//       // Fallback scan without selector to diagnose issues
//       const podsAllRes: any = await core.listNamespacedPod({
//         namespace: K8S_NAMESPACE,
//       } as any);
//       const podsAll = (podsAllRes.body || podsAllRes.data)?.items || [];
//       fastify.log.warn(
//         {
//           ns: K8S_NAMESPACE,
//           selector: "app=browser-session,role=prewarm",
//           allCount: podsAll.length,
//           sample: podsAll.map((p: any) => p.metadata?.name).slice(0, 10),
//         },
//         "No prewarm pods matched selector; fallback scan",
//       );
//     }

//     if (services.length === 0) {
//       const svcsAllRes: any = await core.listNamespacedService({
//         namespace: K8S_NAMESPACE,
//       } as any);
//       const svcsAll = (svcsAllRes.body || svcsAllRes.data)?.items || [];
//       fastify.log.warn(
//         {
//           ns: K8S_NAMESPACE,
//           selector: "app=browser-session,role=active",
//           allCount: svcsAll.length,
//           sample: svcsAll.map((s: any) => s.metadata?.name).slice(0, 10),
//         },
//         "No active services matched selector; fallback scan",
//       );
//     }

//     // Pods targeted by an active Service (handoff in-use)
//     const targeted = new Set<string>(
//       services
//         .map((s) => s.metadata?.annotations?.["steel/targetPodName"])
//         .filter((n): n is string => !!n),
//     );

//     // Consider all non-terminating prewarm pods, not just Ready, to avoid overshoot
//     const nonTerminating = pods.filter(
//       (p) =>
//         !p.metadata?.deletionTimestamp &&
//         p.status?.phase !== "Failed" &&
//         p.status?.phase !== "Succeeded",
//     );

//     // Free = not targeted by any active session service
//     const freeNonTerminating = nonTerminating.filter((p) => {
//       const n = p.metadata?.name;
//       return !!n && !targeted.has(n);
//     });

//     const currentCount = freeNonTerminating.length;
//     fastify.log.info(
//       {
//         ns: K8S_NAMESPACE,
//         totals: {
//           prewarmPods: pods.length,
//           nonTerminating: nonTerminating.length,
//           targeted: targeted.size,
//           free: currentCount,
//           desired: PREWARM_POOL_SIZE,
//         },
//       },
//       "Prewarm pool state",
//     );

//     if (currentCount < PREWARM_POOL_SIZE) {
//       const toCreate = PREWARM_POOL_SIZE - currentCount;
//       fastify.log.info(
//         {
//           ns: K8S_NAMESPACE,
//           toCreate,
//           free: currentCount,
//           desired: PREWARM_POOL_SIZE,
//         },
//         "Creating prewarm pods to maintain free pool",
//       );
//       for (let i = 0; i < toCreate; i++) {
//         await createPrewarmPod();
//       }
//     } else if (currentCount > PREWARM_POOL_SIZE) {
//       // Prefer trimming oldest Ready free prewarms first; fallback to any free non-terminating
//       const freeReady = freeNonTerminating.filter((p) => isPodReady(p));
//       const candidates =
//         freeReady.length > 0 ? freeReady.slice() : freeNonTerminating.slice();

//       const sorted = candidates.sort((a, b) => {
//         const ta = new Date(a.metadata?.creationTimestamp || 0).getTime();
//         const tb = new Date(b.metadata?.creationTimestamp || 0).getTime();
//         return ta - tb;
//       });
//       const extras = sorted.slice(0, currentCount - PREWARM_POOL_SIZE);
//       fastify.log.info(
//         {
//           ns: K8S_NAMESPACE,
//           toTrim: extras.length,
//           free: currentCount,
//           desired: PREWARM_POOL_SIZE,
//         },
//         "Trimming extra free prewarm pods",
//       );
//       for (const p of extras) {
//         if (p.metadata?.name) {
//           await deletePod(p.metadata.name);
//         }
//       }
//     }
//   } catch (err) {
//     fastify.log.warn({ err }, "ensurePrewarmPool failed");
//   } finally {
//     // Release lock safely
//     try {
//       const val = await redis.get(lockKey);
//       if (val === token) {
//         await redis.del(lockKey);
//       }
//     } catch (e) {
//       fastify.log.warn({ err: e }, "Failed to release prewarm lock");
//     }
//   }
// }

// async function pickPrewarmPod(): Promise<V1Pod | null> {
//   const [pods, services] = await Promise.all([
//     listPrewarmPods(),
//     listActiveServices(),
//   ]);

//   if (pods.length === 0) {
//     const podsAllRes: any = await core.listNamespacedPod({
//       namespace: K8S_NAMESPACE,
//     } as any);
//     const podsAll = (podsAllRes.body || podsAllRes.data)?.items || [];
//     fastify.log.warn(
//       {
//         ns: K8S_NAMESPACE,
//         selector: "app=browser-session,role=prewarm",
//         allCount: podsAll.length,
//         sample: podsAll.map((p: any) => p.metadata?.name).slice(0, 10),
//       },
//       "No prewarm pods matched selector in pickPrewarmPod; fallback scan",
//     );
//   }

//   // Pods already targeted by an active session service should be excluded from selection
//   const targeted = new Set<string>(
//     services
//       .map((s) => s.metadata?.annotations?.["steel/targetPodName"])
//       .filter((n): n is string => !!n),
//   );

//   // Consider only non-terminating prewarm pods that are not targeted
//   const free = pods.filter(
//     (p) =>
//       !!p.metadata?.name &&
//       !targeted.has(p.metadata.name) &&
//       !p.metadata?.deletionTimestamp &&
//       p.status?.phase !== "Failed" &&
//       p.status?.phase !== "Succeeded",
//   );

//   const readyFree = free.filter((p) => isPodReady(p));
//   const chosen = readyFree[0] || free[0] || null;

//   if (!chosen) {
//     fastify.log.info(
//       {
//         ns: K8S_NAMESPACE,
//         prewarms: pods.length,
//         targeted: targeted.size,
//         free: free.length,
//       },
//       "No free prewarm pod available",
//     );
//   } else {
//     fastify.log.info(
//       {
//         ns: K8S_NAMESPACE,
//         chosen: chosen.metadata?.name,
//         ready: isPodReady(chosen),
//       },
//       "Selected prewarm pod",
//     );
//   }

//   return chosen;
// }

// Cleanup orphaned resources for expired sessions
async function cleanupOrphans(): Promise<void> {
  try {
    const services = await listActiveServices();
    for (const svc of services) {
      const sessionId = svc.metadata?.annotations?.["steel/sessionId"];
      const targetPodName = svc.metadata?.annotations?.["steel/targetPodName"];
      if (!sessionId) {
        continue;
      }
      const hasSession = await redis.exists(sessionKey(sessionId));
      if (!hasSession) {
        // Delete service and its pod (if assigned)
        if (svc.metadata?.name) {
          await deleteService(svc.metadata.name);
        }
        if (targetPodName) {
          await deletePod(targetPodName);
        } else if (sessionId) {
          // Fallback: try deleting conventional session pod name
          await deletePod(makeSessionPodName(sessionId));
        }
        fastify.log.info(
          { sessionId, service: svc.metadata?.name, pod: targetPodName },
          "Cleaned orphaned session resources",
        );
      }
    }
    // Optionally: clear stale prewarms that are not Ready for a long time
    const prewarms = await listPrewarmPods();
    for (const p of prewarms) {
      const ready = isPodReady(p);
      const created = new Date(p.metadata?.creationTimestamp || 0).getTime();
      const age = Date.now() - created;
      if (!ready && age > 10 * 60 * 1000 && p.metadata?.name) {
        await deletePod(p.metadata.name);
      }
    }
  } catch (err) {
    fastify.log.warn({ err }, "cleanupOrphans failed");
  }
}

// =========================
/* Fastify Routes */
// =========================

fastify.post<{
  Body: { timeout?: number; options?: Record<string, unknown> };
}>("/sessions", async (request) => {
  const { timeout = SESSION_TIMEOUT_DEFAULT, options = {} } =
    request.body || {};
  const sessionId = uuidv4();
  const serviceName = makeSessionServiceName(sessionId);
  const serviceHost = browserServiceHost(sessionId);
  let podName: string | null = null;

  const session: SessionData = {
    sessionId,
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

  // Respect MAX_SESSIONS based on existing active services
  const activeServices = await listActiveServices();
  if (activeServices.length >= MAX_SESSIONS) {
    session.status = "failed";
    session.notes = "Max sessions reached";
    await saveSession(session);
    return { sessionId, status: "failed", error: "Max sessions reached" };
  }

  // Hand off to prewarm if available, otherwise create a dedicated pod
  // const prewarm = await pickPrewarmPod();
  // if (prewarm && prewarm.metadata?.name) {
  //   podName = prewarm.metadata.name;
  //   session.podName = podName;

  //   // Create a service that selects this specific pod via a unique label
  //   // Prewarm pods are created with label podName=<metadata.name>
  //   await createSessionService(
  //     sessionId,
  //     { podName },
  //     {
  //       "steel/targetPodName": podName,
  //       "steel/handOff": "prewarm",
  //     },
  //   );

  //   // Wait for readiness on the service (should be immediate since pod is ready)
  //   try {
  //     await waitForServiceReadiness(serviceName, READINESS_TIMEOUT_SECONDS);
  //     session.status = "running";
  //     await saveSession(session);
  //     return {
  //       sessionId,
  //       status: "running",
  //       serviceHost,
  //       serviceName,
  //       podName,
  //     };
  //   } catch (err: any) {
  //     session.status = "failed";
  //     session.notes = `Prewarm handoff readiness failed: ${String(err?.message || err)}`;
  //     await saveSession(session);
  //     // cleanup service (pod remains as prewarm will be recycled or deleted later)
  //     await deleteService(serviceName);
  //     return { sessionId, status: "failed", error: session.notes };
  //   }
  // }

  // Create dedicated session pod
  podName = await createSessionPod(sessionId);
  session.podName = podName;

  // Create service selecting session pod (via sessionId label or podName)
  await createSessionService(
    sessionId,
    { sessionId },
    {
      "steel/targetPodName": podName,
      "steel/handOff": "cold",
    },
  );

  // Wait for readiness
  try {
    await waitForServiceReadiness(serviceName, READINESS_TIMEOUT_SECONDS);
    session.status = "running";
    await saveSession(session);
    return { sessionId, status: "running", serviceHost, serviceName, podName };
  } catch (err: any) {
    session.status = "failed";
    session.notes = `Cold start readiness failed: ${String(err?.message || err)}`;
    await saveSession(session);
    // Cleanup pod + service on failure
    await deleteService(serviceName);
    if (podName) {
      await deletePod(podName);
    }
    return { sessionId, status: "failed", error: session.notes };
  }
});

fastify.get<{ Params: { sessionId: string } }>(
  "/sessions/:sessionId",
  async (request, reply) => {
    try {
      const s = await getSession(request.params.sessionId);
      if (s.status !== "running") {
        reply.type("text/html");
        return `<html><body><h1>Session ${s.sessionId}</h1><p>Status: ${s.status}</p></body></html>`;
      }
      // Redirect to proxied root path to keep UI behavior consistent
      return reply.redirect(`${BASE_PATH}/sessions/${s.sessionId}/`);
    } catch (err: any) {
      reply.code(404).type("text/html");
      return `<html><body><h1>Session Not Found</h1><p>${String(
        err.message || err,
      )}</p></body></html>`;
    }
  },
);

fastify.get<{ Params: { sessionId: string } }>(
  "/sessions/:sessionId/status",
  async (request) => {
    try {
      const session = await getSession(request.params.sessionId);
      return { ...session, healthy: session.status === "running" };
    } catch (err: any) {
      return { error: String(err.message || err) };
    }
  },
);

fastify.delete<{ Params: { sessionId: string } }>(
  "/sessions/:sessionId",
  async (request) => {
    const sid = request.params.sessionId;
    try {
      const s = await getSession(sid).catch(() => null);
      if (s?.serviceName) {
        await deleteService(s.serviceName);
      }
      if (s?.podName) {
        await deletePod(s.podName);
      }
      await deleteSessionKey(sid);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
);

fastify.get("/sessions", async () => {
  const sessions = await listSessions();
  return { sessions, count: sessions.length };
});

fastify.get("/health", async () => {
  try {
    await redis.ping();
    // Basic k8s check: list services with small timeout
    await core
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
  } catch (err) {
    return {
      status: "unhealthy",
      error: String(err),
      namespace: K8S_NAMESPACE,
      basePath: BASE_PATH,
    };
  }
});

fastify.get("/", async (_request, reply) => {
  reply.type("text/html");
  const base = BASE_PATH || "";
  return `<html><body><h1>Steel Browser Orchestrator</h1><p>Namespace: ${K8S_NAMESPACE} • Base path: ${base || "/"}</p><ul><li><a href="${base}/sessions">Sessions</a></li><li><a href="${base}/health">Health</a></li><li><a href="${base}/docs">Docs</a></li></ul></body></html>`;
});
// Dynamic proxy to per-session service
async function proxyToSession(
  request: FastifyRequest,
  reply: FastifyReply,
  includeTrailingSlashRoot = false,
) {
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

  if (session.status !== "running") {
    return reply
      .code(409)
      .send({ error: `Session not ready: ${session.status}` });
  }

  // Path suffix
  let suffix = (request.params as any)["*"] || "";
  if (includeTrailingSlashRoot && !suffix) {
    suffix = "";
  }
  // Build target URL
  const targetHost = browserServiceHost(sessionId);
  const originalUrl = request.raw.url || "/";
  const queryIndex = originalUrl.indexOf("?");
  const queryPart = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  const dest = `http://${targetHost}:${BROWSER_PORT}/${suffix}${queryPart}`;

  // Use reply.from to proxy the request to upstream
  return reply.from(dest);
}

// Proxy all subpaths
fastify.all("/sessions/:sessionId/*", async (request, reply) => {
  return proxyToSession(request, reply);
});

// =========================
/* Background Workers */
// =========================

async function startBackgroundWorkers(): Promise<void> {
  // Prewarm ensure loop
  // setInterval(() => {
  //   ensurePrewarmPool().catch((err) =>
  //     fastify.log.warn({ err }, "Prewarm loop error"),
  //   );
  // }, PREWARM_CHECK_INTERVAL_MS).unref();

  // Janitor loop for orphans and general cleanup
  setInterval(() => {
    cleanupOrphans().catch((err) =>
      fastify.log.warn({ err }, "Janitor loop error"),
    );
  }, JANITOR_INTERVAL_MS).unref();

  // Initial bootstrap
  // await ensurePrewarmPool();
  await cleanupOrphans();
}

// =========================
/* Startup */
// =========================

async function start(): Promise<void> {
  console.log("Starting orchestrator...");
  fastify.log.info(
    { namespace: K8S_NAMESPACE, basePath: BASE_PATH },
    "Startup configuration",
  );

  // Ensure Redis client is connected (with internal retries)
  await ensureRedisConnected();

  // Extra Redis reachability check
  try {
    await redis.ping();
  } catch (err) {
    throw new Error(`Redis ping failed after connect: ${String(err)}`);
  }

  // Only after Redis and Service DNS/endpoints are good, start workers and server
  await startBackgroundWorkers();

  await fastify.register(replyFrom, {
    // upstream: "http://unused-upstream.local",
    undici: { connections: 100, pipelining: 1 },
  });

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  fastify.log.info(`Orchestrator listening on ${PORT}`);
}

startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start orchestrator server:", err);
});
