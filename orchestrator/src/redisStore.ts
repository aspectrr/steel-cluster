/**
 * Redis session store helpers.
 *
 * This module encapsulates all Redis-related logic that previously lived in index.ts:
 * - Client initialization and connection management
 * - Session CRUD helpers (save/get/touch/delete/list)
 * - Lightweight indexing of active sessions for faster listing
 *
 * It relies on environment-driven configuration from src/config.ts and shared types from src/types.ts.
 */

import Redis, { type RedisClientType } from "redis";
import {
  type SessionData,
  SESSION_KEY_PREFIX,
  SESSION_INDEX_KEY,
} from "./types.js";
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from "./config.js";

/**
 * Export a single Redis client instance for the process.
 * The caller should call ensureRedisConnected() during startup.
 */
export const redis: RedisClientType = Redis.createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
});

/**
 * Ensure the shared Redis client is connected.
 * Safe to call multiple times.
 */
export async function ensureRedisConnected(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
    // eslint-disable-next-line no-console
    console.log("Connected to Redis");
  }
}

/**
 * Build a session key.
 */
export function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

/**
 * Save a session payload with TTL and maintain the index of active sessions.
 *
 * - TTL is set to session.timeoutSeconds
 * - Index set receives a coarse TTL of max(session.timeoutSeconds, 3600)
 */
export async function saveSession(session: SessionData): Promise<void> {
  const key = sessionKey(session.id);
  // Persist the session with TTL
  await redis.setEx(key, session.timeoutSeconds, JSON.stringify(session));
  // Maintain an index of active session IDs for optional listing
  await redis.sAdd(SESSION_INDEX_KEY, session.id);
  await redis.expire(SESSION_INDEX_KEY, Math.max(session.timeoutSeconds, 3600));
}

/**
 * Fetch a session by ID or throw if not found.
 */
export async function getSession(sessionId: string): Promise<SessionData> {
  const key = sessionKey(sessionId);
  const raw = await redis.get(key);
  if (!raw) {
    throw new Error("Session not found");
  }
  return JSON.parse(raw) as SessionData;
}

/**
 * Refresh session TTL and lastUsed timestamp.
 * No-op if the session does not exist (it may have expired).
 */
export async function touchSession(
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

/**
 * Delete a session key and remove it from the index.
 */
export async function deleteSessionKey(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
  await redis.sRem(SESSION_INDEX_KEY, sessionId);
}

/**
 * List all known sessions.
 * Prefers the index set; falls back to scanning keys if index is empty.
 */
export async function listSessions(): Promise<SessionData[]> {
  const sessions: SessionData[] = [];

  // Try the index set first
  const ids = await redis.sMembers(SESSION_INDEX_KEY);
  if (ids.length > 0) {
    for (const id of ids) {
      const raw = await redis.get(sessionKey(id));
      if (!raw) {
        continue;
      }
      try {
        sessions.push(JSON.parse(raw) as SessionData);
      } catch {
        // ignore malformed values
      }
    }
    return sessions;
  }

  // Fallback: scan by key prefix
  const keys = await redis.keys(`${SESSION_KEY_PREFIX}*`);
  for (const k of keys) {
    try {
      const v = await redis.get(k);
      if (v) {
        sessions.push(JSON.parse(v) as SessionData);
      }
    } catch {
      // ignore malformed values
    }
  }
  return sessions;
}

/**
 * Simple reachability check for health endpoint.
 * Exposed to avoid importing the raw client in unrelated modules.
 */
export async function ping(): Promise<void> {
  await redis.ping();
}
