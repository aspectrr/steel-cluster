const fastify = require("fastify")({
  logger: true,
  requestTimeout: 300000, // 5 minute timeout for long operations
});

const Redis = require("redis");
const k8s = require("@kubernetes/client-node");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const yaml = require("js-yaml");

// Environment configuration
const config = {
  port: process.env.PORT || 3000,
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
  },
  kubernetes: {
    namespace: process.env.K8S_NAMESPACE || "default",
    browserImage: process.env.BROWSER_IMAGE || "your-browser:latest",
    browserPort: process.env.BROWSER_PORT || 8080,
    jobTtl: process.env.JOB_TTL_SECONDS || 3600, // 1 hour
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
    defaultTimeout: process.env.SESSION_TIMEOUT || 1800, // 30 minutes
    maxSessions: process.env.MAX_SESSIONS || 100,
  },
};

// Initialize Redis client
const redis = Redis.createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  },
  password: config.redis.password,
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
  constructor(redisClient, k8sClient, coreApi, config) {
    this.redis = redisClient;
    this.k8s = k8sClient;
    this.k8sCore = coreApi;
    this.config = config;
  }

  // Create a new browser session
  async createSession(options = {}) {
    const sessionId = uuidv4();
    const jobName = `browser-session-${sessionId}`;

    try {
      // Check if we're at max capacity
      const activeCount = await this.getActiveSessionCount();
      if (activeCount >= this.config.session.maxSessions) {
        throw new Error("Maximum session capacity reached");
      }

      // Create Kubernetes Job
      const job = this.createJobManifest(sessionId, jobName, options);
      await this.k8s.createNamespacedJob(this.config.kubernetes.namespace, job);

      // Store session data in Redis
      const sessionData = {
        sessionId,
        jobName,
        status: "pending",
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        options: options,
        timeout: options.timeout || this.config.session.defaultTimeout,
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
  async waitForPodReady(sessionId, jobName, maxRetries = 60) {
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
            pod.status.phase === "Running" &&
            pod.status.conditions?.some(
              (c) => c.type === "Ready" && c.status === "True",
            )
          ) {
            // Update session with pod info
            const sessionData = await this.getSession(sessionId);
            sessionData.status = "running";
            sessionData.podName = pod.metadata.name;
            sessionData.podIP = pod.status.podIP;

            await this.redis.setEx(
              `session:${sessionId}`,
              sessionData.timeout,
              JSON.stringify(sessionData),
            );

            return;
          }

          if (pod.status.phase === "Failed") {
            throw new Error(`Pod failed to start: ${pod.status.reason}`);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    throw new Error("Timeout waiting for pod to be ready");
  }

  // Create Kubernetes Job manifest
  createJobManifest(sessionId, jobName, options) {
    return {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        labels: {
          app: "headless-browser",
          "session-id": sessionId,
          component: "browser-session",
        },
      },
      spec: {
        ttlSecondsAfterFinished: this.config.kubernetes.jobTtl,
        backoffLimit: 0,
        template: {
          metadata: {
            labels: {
              app: "headless-browser",
              "session-id": sessionId,
              component: "browser-session",
            },
          },
          spec: {
            restartPolicy: "Never",
            containers: [
              {
                name: "browser",
                image: this.config.kubernetes.browserImage,
                ports: [
                  {
                    containerPort: this.config.kubernetes.browserPort,
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
                    path: "/health",
                    port: this.config.kubernetes.browserPort,
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 5,
                },
                livenessProbe: {
                  httpGet: {
                    path: "/health",
                    port: this.config.kubernetes.browserPort,
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                },
              },
            ],
          },
        },
      },
    };
  }

  // Get session data from Redis
  async getSession(sessionId) {
    const data = await this.redis.get(`session:${sessionId}`);
    if (!data) {
      throw new Error("Session not found");
    }
    return JSON.parse(data);
  }

  // Update session last used timestamp
  async updateSessionActivity(sessionId) {
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
    sessionId,
    path,
    method = "GET",
    data = null,
    headers = {},
  ) {
    const sessionData = await this.getSession(sessionId);

    if (sessionData.status !== "running" || !sessionData.podIP) {
      throw new Error("Session not ready or not running");
    }

    // Update activity
    await this.updateSessionActivity(sessionId);

    const url = `http://${sessionData.podIP}:${this.config.kubernetes.browserPort}${path}`;

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
    } catch (error) {
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
  async cleanupSession(sessionId) {
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
        } catch (error) {
          console.error(
            `Failed to delete job ${sessionData.jobName}:`,
            error.message,
          );
        }
      }

      // Remove from Redis
      await this.redis.del(`session:${sessionId}`);

      return true;
    } catch (error) {
      console.error(`Failed to cleanup session ${sessionId}:`, error.message);
      return false;
    }
  }

  // Get all active sessions
  async getAllSessions() {
    const keys = await this.redis.keys("session:*");
    const sessions = [];

    for (const key of keys) {
      try {
        const data = await this.redis.get(key);
        sessions.push(JSON.parse(data));
      } catch (error) {
        console.error(
          `Failed to parse session data for ${key}:`,
          error.message,
        );
      }
    }

    return sessions;
  }

  // Get count of active sessions
  async getActiveSessionCount() {
    const keys = await this.redis.keys("session:*");
    return keys.length;
  }

  // Health check for session
  async checkSessionHealth(sessionId) {
    try {
      const response = await this.proxyRequest(sessionId, "/health", "GET");
      return { healthy: true, status: response.status };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

// Initialize session manager
const sessionManager = new SessionManager(redis, k8sApi, k8sCoreApi, config);

// Register plugins
fastify.register(require("@fastify/cors"));
fastify.register(require("@fastify/swagger"), {
  swagger: {
    info: {
      title: "Browser Session Orchestrator",
      description: "API for managing headless browser sessions in Kubernetes",
      version: "1.0.0",
    },
  },
});
fastify.register(require("@fastify/swagger-ui"), {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "full",
    deepLinking: false,
  },
});

// API Routes

// Create new session
fastify.post(
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
  async (request, reply) => {
    try {
      const sessionId = await sessionManager.createSession(request.body || {});
      return {
        sessionId,
        status: "created",
        message: "Session created successfully",
      };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  },
);

// Get session status
fastify.get(
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
  async (request, reply) => {
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
    } catch (error) {
      reply.code(404);
      return { error: error.message };
    }
  },
);

// Proxy requests to browser
fastify.all("/sessions/:sessionId/proxy/*", async (request, reply) => {
  try {
    const sessionId = request.params.sessionId;
    const path = "/" + request.params["*"];

    const response = await sessionManager.proxyRequest(
      sessionId,
      path,
      request.method,
      request.body,
      request.headers,
    );

    // Forward response
    reply.code(response.status);
    Object.entries(response.headers).forEach(([key, value]) => {
      if (key.toLowerCase() !== "content-length") {
        reply.header(key, value);
      }
    });

    return response.data;
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

// Delete session
fastify.delete(
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
  async (request, reply) => {
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
    } catch (error) {
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
  async (request, reply) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      return {
        sessions,
        count: sessions.length,
      };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  },
);

// Health check endpoint
fastify.get("/health", async (request, reply) => {
  try {
    await redis.ping();
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      activeSessions: await sessionManager.getActiveSessionCount(),
    };
  } catch (error) {
    reply.code(500);
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
});

// Metrics endpoint (Prometheus format)
fastify.get("/metrics", async (request, reply) => {
  try {
    const sessions = await sessionManager.getAllSessions();
    const activeCount = sessions.length;
    const runningCount = sessions.filter((s) => s.status === "running").length;
    const pendingCount = sessions.filter((s) => s.status === "pending").length;
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
  } catch (error) {
    reply.code(500);
    return `# Error generating metrics: ${error.message}`;
  }
});

// Background cleanup task
setInterval(async () => {
  try {
    const sessions = await sessionManager.getAllSessions();
    const now = new Date();

    for (const session of sessions) {
      const lastUsed = new Date(session.lastUsed);
      const ageMinutes = (now - lastUsed) / (1000 * 60);

      // Cleanup sessions that haven't been used for longer than their timeout
      if (ageMinutes > session.timeout / 60) {
        console.log(`Cleaning up inactive session: ${session.sessionId}`);
        await sessionManager.cleanupSession(session.sessionId);
      }
    }
  } catch (error) {
    console.error("Background cleanup error:", error.message);
  }
}, 60000); // Run every minute

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");

  try {
    // Close Redis connection
    await redis.quit();

    // Close Fastify
    await fastify.close();

    console.log("Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
const start = async () => {
  try {
    // Connect to Redis
    await redis.connect();
    console.log("Connected to Redis");

    // Start Fastify server
    await fastify.listen({
      port: config.port,
      host: "0.0.0.0",
    });

    console.log(`Server listening on port ${config.port}`);
    console.log(`API docs available at http://localhost:${config.port}/docs`);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
