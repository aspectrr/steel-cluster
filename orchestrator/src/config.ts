import { OrchestratorConfig } from "./types.js";

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBasePath(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  // Empty or "/" means no base path
  if (v === "" || v === "/") {
    return "";
  }
  // Ensure a single leading slash and remove any trailing slashes
  const withLeading = v.startsWith("/") ? v : `/${v}`;
  return withLeading.replace(/\/+$/, "");
}

export function loadConfig(): OrchestratorConfig {
  return {
    // Server
    port: parseNumber(process.env.PORT, 3000),
    basePath: normalizeBasePath(process.env.BASE_PATH),

    // Redis
    redisHost: process.env.REDIS_HOST || "localhost",
    redisPort: parseNumber(process.env.REDIS_PORT, 6379),
    redisPassword:
      process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.length > 0
        ? process.env.REDIS_PASSWORD
        : undefined,

    // Kubernetes
    k8sNamespace: process.env.K8S_NAMESPACE || "browser-sessions",

    // Browser Pod defaults (allow override, keep prior default)
    browserImage:
      process.env.BROWSER_IMAGE || "ghrc.io/steel-dev/steel-browser-api:latest",
    browserPort: parseNumber(process.env.BROWSER_PORT, 3000),

    // Session parameters
    sessionTimeoutDefault: parseNumber(process.env.SESSION_TIMEOUT, 1800),
    maxSessions: parseNumber(process.env.MAX_SESSIONS, 100),

    // Resource hints for session pods
    podMemoryRequest: process.env.POD_MEMORY_REQUEST || "256Mi",
    podCpuRequest: process.env.POD_CPU_REQUEST || "200m",
    podMemoryLimit: process.env.POD_MEMORY_LIMIT || "512Mi",
    podCpuLimit: process.env.POD_CPU_LIMIT || "500m",

    // Optional image pull secret
    imagePullSecret:
      process.env.IMAGE_PULL_SECRET && process.env.IMAGE_PULL_SECRET.length > 0
        ? process.env.IMAGE_PULL_SECRET
        : undefined,

    // Readiness settings
    readinessInitialDelay: parseNumber(process.env.READINESS_INITIAL_DELAY, 3),
    readinessPeriodSeconds: parseNumber(
      process.env.READINESS_PERIOD_SECONDS,
      5,
    ),
    readinessTimeoutSeconds: parseNumber(
      process.env.READINESS_TIMEOUT_SECONDS,
      60,
    ),

    // Background janitor cadence
    janitorIntervalMs: parseNumber(process.env.JANITOR_INTERVAL_MS, 15000),
  };
}

// Eagerly evaluate a singleton config for convenience imports.
export const config: OrchestratorConfig = loadConfig();

// Optional named exports for easy migration from inline constants
export const PORT = config.port;
export const BASE_PATH = config.basePath;

export const REDIS_HOST = config.redisHost;
export const REDIS_PORT = config.redisPort;
export const REDIS_PASSWORD = config.redisPassword;

export const K8S_NAMESPACE = config.k8sNamespace;

export const BROWSER_IMAGE = config.browserImage;
export const BROWSER_PORT = config.browserPort;

export const SESSION_TIMEOUT_DEFAULT = config.sessionTimeoutDefault;
export const MAX_SESSIONS = config.maxSessions;

export const POD_MEMORY_REQUEST = config.podMemoryRequest;
export const POD_CPU_REQUEST = config.podCpuRequest;
export const POD_MEMORY_LIMIT = config.podMemoryLimit;
export const POD_CPU_LIMIT = config.podCpuLimit;

export const IMAGE_PULL_SECRET = config.imagePullSecret;

export const READINESS_INITIAL_DELAY = config.readinessInitialDelay;
export const READINESS_PERIOD_SECONDS = config.readinessPeriodSeconds;
export const READINESS_TIMEOUT_SECONDS = config.readinessTimeoutSeconds;

export const JANITOR_INTERVAL_MS = config.janitorIntervalMs;
