import Fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import Redis, { RedisClientType } from "redis";
import * as k8s from "@kubernetes/client-node";
import { v4 as uuidv4 } from "uuid";
import axios, { AxiosResponse, Method } from "axios";

// Type definitions
interface Config {
  port: number | string;
  redis: {
    host: string;
    port: number;
    password?: string | undefined;
  };
  kubernetes: {
    namespace: string;
    browserAPIImage: string;
    browserUIImage: string;
    apiURL: string;
    browserAPIPort: number | string;
    browserUIPort: number | string;
    jobTtl: number | string;
    podResources: {
      requests: {
        memory: string;
        cpu: string;
      };
      limits: {
        memory: string;
        cpu: string;
      };
    };
  };
  session: {
    defaultTimeout: number | string;
    maxSessions: number | string;
  };
}

interface SessionOptions {
  timeout?: number;
  [key: string]: any;
}

interface SessionData {
  sessionId: string;
  jobName: string;
  status: "pending" | "running" | "failed";
  createdAt: string;
  lastUsed: string;
  options: SessionOptions;
  timeout: number;
  podName?: string | undefined;
  podIP?: string | undefined;
}

interface CreateSessionRequest {
  timeout?: number;
  options?: Record<string, any>;
}

interface SessionParams {
  sessionId: string;
}

interface ProxyParams extends SessionParams {
  "*": string;
}

interface HealthResponse {
  healthy: boolean;
  status?: number;
  error?: string;
}

const fastify: FastifyInstance = Fastify({
  logger: true,
  requestTimeout: 300000,
});

// Environment configuration
const config: Config = {
  port: process.env.PORT || 3000,
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  kubernetes: {
    namespace: process.env.K8S_NAMESPACE || "browser-sessions",
    browserAPIImage:
      process.env.BROWSER_API_IMAGE ||
      "ghcr.io/steel-dev/steel-browser-api:latest",
    browserUIImage:
      process.env.BROWSER_UI_IMAGE ||
      "ghcr.io/steel-dev/steel-browser-ui:latest",
    apiURL: process.env.API_URL || "http://localhost:3000",
    browserAPIPort: Number(process.env.BROWSER_API_PORT) || 3000,
    browserUIPort: Number(process.env.BROWSER_UI_PORT) || 80,
    jobTtl: Number(process.env.JOB_TTL_SECONDS) || 3600, // 1 hour
    podResources: {
      requests: {
        memory: process.env.POD_MEMORY_REQUEST || "512Mi",
        cpu: process.env.POD_CPU_REQUEST || "200m",
      },
      limits: {
        memory: process.env.POD_MEMORY_LIMIT || "2Gi",
        cpu: process.env.POD_CPU_LIMIT || "1000m",
      },
    },
  },
  session: {
    defaultTimeout: Number(process.env.SESSION_TIMEOUT) || 1800, // 30 minutes
    maxSessions: Number(process.env.MAX_SESSIONS) || 100,
  },
};

// Initialize Redis client
const redis: RedisClientType = Redis.createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  },
  ...(config.redis.password && { password: config.redis.password }),
});

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
if (process.env.NODE_ENV === "production") {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);
const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);

// Session management class
class SessionManager {
  private redis: RedisClientType;
  private k8s: k8s.BatchV1Api;
  private k8sCore: k8s.CoreV1Api;
  private config: Config;

  constructor(
    redisClient: RedisClientType,
    k8sClient: k8s.BatchV1Api,
    coreApi: k8s.CoreV1Api,
    config: Config,
  ) {
    this.redis = redisClient;
    this.k8s = k8sClient;
    this.k8sCore = coreApi;
    this.config = config;
  }

  // Create a new browser session
  async createSession(options: SessionOptions = {}): Promise<string> {
    const sessionId = uuidv4();
    const jobName = `browser-session-${sessionId}`;
    fastify.log.info(`Creating session ${sessionId}...`);
    fastify.log.info(`Job ${jobName}`);

    try {
      // Check if we're at max capacity
      const activeCount = await this.getActiveSessionCount();
      if (activeCount >= Number(this.config.session.maxSessions)) {
        throw new Error("Maximum session capacity reached");
      }

      // Create Kubernetes Job
      const job = this.createJobManifest(sessionId, jobName, options);
      fastify.log.info(`Job manifest ${job} created`);
      const newJob = await this.k8s.createNamespacedJob(
        this.config.kubernetes.namespace,
        job,
      );

      fastify.log.info(`Job ${newJob} created`);

      // Store session data in Redis
      const sessionData: SessionData = {
        sessionId,
        jobName,
        status: "pending",
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        options: options,
        timeout:
          Number(options.timeout) || Number(this.config.session.defaultTimeout),
      };

      await this.redis.setEx(
        `session:${sessionId}`,
        sessionData.timeout,
        JSON.stringify(sessionData),
      );

      // Wait for pod to be ready
      await this.waitForPodReady(sessionId, jobName);

      return sessionId;
    } catch (error) {
      // Cleanup on failure
      await this.cleanupSession(sessionId);
      throw error;
    }
  }

  // Wait for pod to be ready and update session data
  async waitForPodReady(
    sessionId: string,
    jobName: string,
    maxRetries: number = 60,
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Get pods for this job
        const pods = await this.k8sCore.listNamespacedPod(
          this.config.kubernetes.namespace,
          undefined,
          undefined,
          undefined,
          undefined,
          `job-name=${jobName}`,
        );

        if (pods.body.items.length > 0) {
          const pod = pods.body.items[0];

          if (
            pod &&
            pod.status?.phase === "Running" &&
            pod.status.conditions?.some(
              (c) => c.type === "Ready" && c.status === "True",
            )
          ) {
            // Update session with pod info
            const sessionData = await this.getSession(sessionId);
            sessionData.status = "running";
            sessionData.podName = pod.metadata?.name || undefined;
            sessionData.podIP = pod.status.podIP || undefined;

            await this.redis.setEx(
              `session:${sessionId}`,
              sessionData.timeout,
              JSON.stringify(sessionData),
            );

            return;
          }

          if (pod && pod.status?.phase === "Failed") {
            throw new Error(
              `Pod failed to start: ${pod.status.reason || "Unknown reason"}`,
            );
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      } catch (error) {
        if (i === maxRetries - 1) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    throw new Error("Timeout waiting for pod to be ready");
  }

  // Create Kubernetes Job manifest
  createJobManifest(
    sessionId: string,
    jobName: string,
    _options: SessionOptions,
  ): k8s.V1Job {
    return {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        labels: {
          app: "steel-browser",
          "session-id": sessionId,
          component: "browser-session",
        },
      },
      spec: {
        ttlSecondsAfterFinished: Number(this.config.kubernetes.jobTtl),
        backoffLimit: 0,
        template: {
          metadata: {
            labels: {
              app: "steel-browser",
              "session-id": sessionId,
              component: "browser-session",
            },
          },
          spec: {
            restartPolicy: "Never",
            containers: [
              {
                name: "browser-api",
                image: this.config.kubernetes.browserAPIImage,
                ports: [
                  {
                    containerPort: Number(
                      this.config.kubernetes.browserAPIPort,
                    ),
                  },
                ],
                env: [
                  {
                    name: "SESSION_ID",
                    value: sessionId,
                  },
                  {
                    name: "POD_NAME",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.name",
                      },
                    },
                  },
                  {
                    name: "POD_IP",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "status.podIP",
                      },
                    },
                  },
                ],
                resources: this.config.kubernetes.podResources,
                readinessProbe: {
                  httpGet: {
                    path: "/v1/health",
                    port: Number(this.config.kubernetes.browserAPIPort),
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 5,
                },
                livenessProbe: {
                  httpGet: {
                    path: "/v1/health",
                    port: Number(this.config.kubernetes.browserAPIPort),
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                },
              },
              {
                name: "browser-ui",
                image: this.config.kubernetes.browserUIImage,
                ports: [
                  {
                    containerPort: Number(this.config.kubernetes.browserUIPort),
                  },
                ],
                env: [
                  {
                    name: "SESSION_ID",
                    value: sessionId,
                  },
                  {
                    name: "API_URL",
                    value: this.config.kubernetes.apiURL,
                  },
                  {
                    name: "POD_NAME",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.name",
                      },
                    },
                  },
                  {
                    name: "POD_IP",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "status.podIP",
                      },
                    },
                  },
                ],
                resources: this.config.kubernetes.podResources,
                // readinessProbe: {
                //   httpGet: {
                //     path: "/",
                //     port: Number(this.config.kubernetes.browserUIPort),
                //   },
                //   initialDelaySeconds: 10,
                //   periodSeconds: 5,
                // },
                // livenessProbe: {
                //   httpGet: {
                //     path: "/",
                //     port: Number(this.config.kubernetes.browserUIPort),
                //   },
                //   initialDelaySeconds: 30,
                //   periodSeconds: 10,
                // },
              },
            ],
          },
        },
      },
    };
  }

  // Get session data from Redis
  async getSession(sessionId: string): Promise<SessionData> {
    const data = await this.redis.get(`session:${sessionId}`);
    if (!data) {
      throw new Error("Session not found");
    }
    return JSON.parse(data) as SessionData;
  }

  // Update session last used timestamp
  async updateSessionActivity(sessionId: string): Promise<void> {
    const sessionData = await this.getSession(sessionId);
    sessionData.lastUsed = new Date().toISOString();

    await this.redis.setEx(
      `session:${sessionId}`,
      sessionData.timeout,
      JSON.stringify(sessionData),
    );
  }

  // Proxy request to browser pod
  async proxyRequest(
    sessionId: string,
    path: string,
    method: Method = "GET",
    data: any = null,
    headers: Record<string, any> = {},
  ): Promise<AxiosResponse> {
    const sessionData = await this.getSession(sessionId);

    if (sessionData.status !== "running" || !sessionData.podIP) {
      throw new Error("Session not ready or not running");
    }

    // Update activity
    await this.updateSessionActivity(sessionId);

    const url = `http://${sessionData.podIP}:${this.config.kubernetes.browserAPIPort}${path}`;

    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          ...headers,
          "X-Session-ID": sessionId,
        },
        timeout: 30000, // 30 second timeout
      });

      return response;
    } catch (error: any) {
      if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        // Pod might be dead, mark session as failed
        sessionData.status = "failed";
        await this.redis.setEx(
          `session:${sessionId}`,
          60, // Keep failed sessions for 1 minute for debugging
          JSON.stringify(sessionData),
        );
      }
      throw error;
    }
  }

  // Clean up session and associated resources
  async cleanupSession(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);

      // Delete Kubernetes Job
      if (sessionData.jobName) {
        try {
          await this.k8s.deleteNamespacedJob(
            sessionData.jobName,
            this.config.kubernetes.namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            "Background", // Delete pods immediately
          );
        } catch (error: any) {
          console.error(
            `Failed to delete job ${sessionData.jobName}:`,
            error.message,
          );
        }
      }

      // Remove from Redis
      await this.redis.del(`session:${sessionId}`);

      return true;
    } catch (error: any) {
      console.error(`Failed to cleanup session ${sessionId}:`, error.message);
      return false;
    }
  }

  // Get all active sessions
  async getAllSessions(): Promise<SessionData[]> {
    const keys = await this.redis.keys("session:*");
    const sessions: SessionData[] = [];

    for (const key of keys) {
      try {
        const data = await this.redis.get(key);
        if (data) {
          sessions.push(JSON.parse(data) as SessionData);
        }
      } catch (error: any) {
        console.error(
          `Failed to parse session data for ${key}:`,
          error.message,
        );
      }
    }

    return sessions;
  }

  // Get count of active sessions
  async getActiveSessionCount(): Promise<number> {
    const keys = await this.redis.keys("session:*");
    return keys.length;
  }

  // Health check for session
  async checkSessionHealth(sessionId: string): Promise<HealthResponse> {
    try {
      const response = await this.proxyRequest(sessionId, "/v1/health", "GET");
      return { healthy: true, status: response.status };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }
}

// Initialize session manager
const sessionManager = new SessionManager(redis, k8sApi, k8sCoreApi, config);

// Register plugins
await fastify.register(import("@fastify/cors"));
await fastify.register(import("@fastify/swagger"), {
  swagger: {
    info: {
      title: "Browser Session Orchestrator",
      description: "API for managing headless browser sessions in Kubernetes",
      version: "1.0.0",
    },
  },
});

await fastify.register(import("@fastify/swagger-ui"), {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "full",
    deepLinking: false,
  },
  uiHooks: {
    onRequest: function (request, reply, next) {
      next();
    },
    preHandler: function (request, reply, next) {
      next();
    },
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
  transformSpecification: (swaggerObject, _request, _reply) => {
    return swaggerObject;
  },
  transformSpecificationClone: true,
});

// API Routes

// Create new session
fastify.post<{
  Body: CreateSessionRequest;
}>(
  "/sessions",
  {
    schema: {
      description: "Create a new browser session",
      body: {
        type: "object",
        properties: {
          timeout: {
            type: "number",
            description: "Session timeout in seconds",
            default: 3000,
          },
          options: {
            type: "object",
            description: "Additional browser options",
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            sessionId: { type: "string" },
            status: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
  },
  async (
    request: FastifyRequest<{ Body: CreateSessionRequest }>,
    reply: FastifyReply,
  ) => {
    try {
      console.log("Creating session...");
      console.log(request.body);
      const sessionId = await sessionManager.createSession(request.body || {});
      return {
        sessionId,
        status: "created",
        message: "Session created successfully",
      };
    } catch (error: any) {
      reply.code(500);
      return { error: error.message };
    }
  },
);

// Get session status
fastify.get<{
  Params: SessionParams;
}>(
  "/sessions/:sessionId/status",
  {
    schema: {
      description: "Get session status",
      params: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
        },
      },
    },
  },
  async (
    request: FastifyRequest<{ Params: SessionParams }>,
    reply: FastifyReply,
  ) => {
    try {
      const sessionData = await sessionManager.getSession(
        request.params.sessionId,
      );
      const health = await sessionManager.checkSessionHealth(
        request.params.sessionId,
      );

      return {
        ...sessionData,
        health,
      };
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  },
);

// Proxy requests to browser
fastify.all<{
  Params: ProxyParams;
}>(
  "/sessions/:sessionId/*",
  async (
    request: FastifyRequest<{ Params: ProxyParams }>,
    reply: FastifyReply,
  ) => {
    try {
      const sessionId = request.params.sessionId;
      const path = "/" + request.params["*"];
      fastify.log.info(request.params);

      const response = await sessionManager.proxyRequest(
        sessionId,
        path,
        request.method as Method,
        request.body,
        request.headers as Record<string, any>,
      );

      // Forward response
      reply.code(response.status);
      Object.entries(response.headers).forEach(([key, value]) => {
        if (key.toLowerCase() !== "content-length") {
          reply.header(key, value as string);
        }
      });

      return response.data;
    } catch (error: any) {
      reply.code(500);
      return { error: error.message };
    }
  },
);

// Delete session
fastify.delete<{
  Params: SessionParams;
}>(
  "/sessions/:sessionId",
  {
    schema: {
      description: "Delete a session",
      params: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
        },
      },
    },
  },
  async (
    request: FastifyRequest<{ Params: SessionParams }>,
    reply: FastifyReply,
  ) => {
    try {
      const success = await sessionManager.cleanupSession(
        request.params.sessionId,
      );
      return {
        success,
        message: success
          ? "Session deleted successfully"
          : "Failed to delete session",
      };
    } catch (error: any) {
      reply.code(500);
      return { error: error.message };
    }
  },
);

// List all sessions
fastify.get(
  "/sessions",
  {
    schema: {
      description: "List all active sessions",
    },
  },
  async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      return {
        sessions,
        count: sessions.length,
      };
    } catch (error: any) {
      reply.code(500);
      return { error: error.message };
    }
  },
);

// Health check endpoint
fastify.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await redis.ping();
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      activeSessions: await sessionManager.getActiveSessionCount(),
    };
  } catch (error: any) {
    reply.code(500);
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
});

// Metrics endpoint (Prometheus format)
fastify.get(
  "/metrics",
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      const activeCount = sessions.length;
      const runningCount = sessions.filter(
        (s) => s.status === "running",
      ).length;
      const pendingCount = sessions.filter(
        (s) => s.status === "pending",
      ).length;
      const failedCount = sessions.filter((s) => s.status === "failed").length;

      const metrics = `
# HELP browser_sessions_total Total number of browser sessions
# TYPE browser_sessions_total gauge
browser_sessions_total ${activeCount}

# HELP browser_sessions_running Number of running browser sessions
# TYPE browser_sessions_running gauge
browser_sessions_running ${runningCount}

# HELP browser_sessions_pending Number of pending browser sessions
# TYPE browser_sessions_pending gauge
browser_sessions_pending ${pendingCount}

# HELP browser_sessions_failed Number of failed browser sessions
# TYPE browser_sessions_failed gauge
browser_sessions_failed ${failedCount}
    `.trim();

      reply.type("text/plain");
      return metrics;
    } catch (error: any) {
      reply.code(500);
      return `# Error generating metrics: ${error.message}`;
    }
  },
);

// Background cleanup task
setInterval(async () => {
  try {
    const sessions = await sessionManager.getAllSessions();
    const now = new Date();

    for (const session of sessions) {
      const lastUsed = new Date(session.lastUsed);
      const ageMinutes = (now.getTime() - lastUsed.getTime()) / (1000 * 60);

      // Cleanup sessions that haven't been used for longer than their timeout
      if (ageMinutes > session.timeout / 60) {
        console.log(`Cleaning up inactive session: ${session.sessionId}`);
        await sessionManager.cleanupSession(session.sessionId);
      }
    }
  } catch (error: any) {
    console.error("Background cleanup error:", error.message);
  }
}, 60000); // Run every minute

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log("Shutting down gracefully...");

  try {
    // Close Redis connection
    await redis.quit();

    // Close Fastify
    await fastify.close();

    console.log("Shutdown complete");
    process.exit(0);
  } catch (error: any) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
const start = async (): Promise<void> => {
  try {
    // Connect to Redis
    await redis.connect();
    console.log("Connected to Redis");

    // Start Fastify server
    await fastify.listen({
      port: Number(config.port),
      host: "0.0.0.0",
    });

    console.log(`Server listening on port ${config.port}`);
    console.log(`API docs available at http://localhost:${config.port}/docs`);
  } catch (error: any) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
