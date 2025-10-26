import type { V1Service, V1Pod } from "@kubernetes/client-node";
import {
  listActiveServices,
  listPrewarmPods,
  isPodReady,
  deleteService,
  deletePod,
  makeSessionPodName,
} from "./k8s";
import { redis, sessionKey } from "./redisStore";
import { JANITOR_INTERVAL_MS } from "./config";

export interface MinimalLogger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

const defaultLogger: MinimalLogger = console as unknown as MinimalLogger;

/**
 * Cleanup orphaned session resources:
 * - Finds active Services that look like session Services (labels/annotations/prefix).
 * - If the corresponding Redis session is missing, deletes the Service and its Pod.
 * - Trims prewarm Pods that are not Ready for > 10 minutes.
 */
export async function cleanupOrphans(
  logger: MinimalLogger = defaultLogger,
): Promise<void> {
  try {
    // 1) Clean orphaned active session Services/Pods
    const services: V1Service[] = await listActiveServices();
    for (const svc of services) {
      const annotations = svc.metadata?.annotations || {};
      const sessionId = annotations["steel/sessionId"];
      const targetPodName = annotations["steel/targetPodName"];
      if (!sessionId) {
        continue;
      }

      let hasSession = 0;
      try {
        hasSession = await redis.exists(sessionKey(sessionId));
      } catch (err) {
        logger.warn({ err, sessionId }, "Redis EXISTS failed; skipping");
        continue;
      }

      if (hasSession === 0) {
        const svcName = svc.metadata?.name;
        // Best-effort deletion; ignore not found
        if (svcName) {
          try {
            await deleteService(svcName);
          } catch (err) {
            logger.warn({ err, service: svcName }, "Failed to delete service");
          }
        }
        const podToDelete = targetPodName || makeSessionPodName(sessionId);
        try {
          await deletePod(podToDelete);
        } catch (err) {
          logger.warn({ err, pod: podToDelete }, "Failed to delete pod");
        }
        logger.info(
          { sessionId, service: svcName, pod: podToDelete },
          "Cleaned orphaned session resources",
        );
      }
    }

    // 2) Trim stale prewarm pods (non-Ready for > 10 minutes)
    const prewarms: V1Pod[] = await listPrewarmPods();
    for (const p of prewarms) {
      const ready = isPodReady(p);
      const createdMs = new Date(p.metadata?.creationTimestamp || 0).getTime();
      const ageMs = Date.now() - createdMs;
      if (!ready && ageMs > 10 * 60 * 1000) {
        const n = p.metadata?.name;
        if (!n) {
          continue;
        }
        try {
          await deletePod(n);
          logger.info({ pod: n, ageMs }, "Deleted stale prewarm pod");
        } catch (err) {
          logger.warn({ err, pod: n }, "Failed to delete stale prewarm pod");
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "cleanupOrphans failed");
  }
}

/**
 * Start background workers:
 * - Schedules the janitor loop at JANITOR_INTERVAL_MS
 * - Triggers an initial best-effort cleanup
 *
 * Returns the interval handle so callers can stop it if needed.
 */
export function startBackgroundWorkers(
  logger: MinimalLogger = defaultLogger,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    cleanupOrphans(logger).catch((err) =>
      logger.warn({ err }, "Janitor loop error"),
    );
  }, JANITOR_INTERVAL_MS);

  // Allow the process to exit even if the timer is running (Node.js behavior)
  if (typeof (timer as any).unref === "function") {
    (timer as any).unref();
  }

  // Kick off an initial cleanup (best effort)
  cleanupOrphans(logger).catch((err) =>
    logger.warn({ err }, "Initial janitor run error"),
  );

  return timer;
}

/**
 * Stop previously started background workers.
 */
export function stopBackgroundWorkers(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}
