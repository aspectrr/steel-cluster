/**
 * Shared types for the orchestrator modules.
 * These mirror the original types that lived in index.ts and expand with
 * a few response payload shapes used by the HTTP handlers.
 */

/**
 * Session lifecycle states.
 */
export type SessionStatus = "pending" | "running" | "failed";

/**
 * ISO 8601 / RFC 3339 timestamp string (UTC recommended).
 */
export type IsoTimestamp = string;

/**
 * Primary session model persisted to Redis and used across the app.
 */
export interface SessionData {
  /**
   * Stable session identifier (UUID v4).
   */
  sessionId: string;

  /**
   * Current state of the session.
   */
  status: SessionStatus;

  /**
   * Creation timestamp in ISO 8601 format.
   */
  createdAt: IsoTimestamp;

  /**
   * Last-used timestamp in ISO 8601 format.
   * Updated when the proxy is hit (session "touch").
   */
  lastUsed: IsoTimestamp;

  /**
   * TTL in seconds; used both as Redis key TTL and touch refresh value.
   */
  timeoutSeconds: number;

  /**
   * Name of the k8s Service created for this session (ClusterIP),
   * or null if not created or cleaned up.
   */
  serviceName: string | null;

  /**
   * Name of the k8s Pod running the browser container for this session,
   * or null if not created or cleaned up.
   */
  podName: string | null;

  /**
   * FQDN or cluster DNS address for the Service backing the session,
   * or null if unavailable.
   */
  serviceHost: string | null;

  /**
   * Optional diagnostic/operational note (e.g., failure reason).
   */
  notes?: string;

  /**
   * Free-form options provided at creation time for future extensibility.
   */
  options?: Record<string, unknown>;
}

/**
 * Request body for POST /sessions
 */
export interface CreateSessionRequest {
  /**
   * Optional timeout (seconds). Defaults to configured sessionTimeoutDefault.
   */
  timeout?: number;

  /**
   * Optional free-form options bag passed through to the session.
   */
  options?: Record<string, unknown>;
}

/**
 * Response for POST /sessions
 */
export interface CreateSessionResponse {
  sessionId: string;
  status: SessionStatus;
  serviceHost?: string | null;
  serviceName?: string | null;
  podName?: string | null;
  error?: string;
}

/**
 * Response for GET /sessions/:sessionId/status
 */
export interface SessionWithHealth extends SessionData {
  healthy: boolean;
}

/**
 * Response for GET /sessions
 */
export interface ListSessionsResponse {
  sessions: SessionData[];
  count: number;
}

/**
 * Response for DELETE /sessions/:sessionId
 */
export interface DeleteSessionResponse {
  success: boolean;
  error?: string;
}

/**
 * Response for GET /health
 */
export interface HealthResponse {
  status: "ok" | "unhealthy";
  sessions: number;
  namespace: string;
  basePath: string;
  timestamp?: IsoTimestamp;
  error?: string;
}

/**
 * Internal constants shared across modules.
 */
export const SESSION_KEY_PREFIX = "session:";
export const SESSION_INDEX_KEY = "sessions:index";

export interface OrchestratorConfig {
  // Server
  port: number;
  basePath: string; // normalized: "/" => "", trailing slashes trimmed

  // Redis
  redisHost: string;
  redisPort: number;
  redisPassword: string | undefined;

  // Kubernetes
  k8sNamespace: string;

  // Browser Pod defaults
  browserImage: string;
  browserPort: number;

  // Session parameters
  sessionTimeoutDefault: number; // seconds
  maxSessions: number;

  // Resource hints for session pods
  podMemoryRequest: string;
  podCpuRequest: string;
  podMemoryLimit: string;
  podCpuLimit: string;

  // Optional image pull secret for session pods
  imagePullSecret: string | undefined;

  // Readiness settings for session pods
  readinessInitialDelay: number;
  readinessPeriodSeconds: number;
  readinessTimeoutSeconds: number;

  // Background janitor cadence (ms)
  janitorIntervalMs: number;
}
