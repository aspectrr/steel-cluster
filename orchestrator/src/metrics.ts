import {
  register,
  Gauge,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from "prom-client";

// Enable default Node.js metrics collection
collectDefaultMetrics({ prefix: "steel_orchestrator_" });

// Gauge for current number of running sessions
export const sessionsRunning = new Gauge({
  name: "steel_sessions_running",
  help: "Number of currently running browser sessions",
});

// Counter for total sessions created
export const sessionsTotal = new Counter({
  name: "steel_sessions_total",
  help: "Total number of browser sessions created",
});

// Histogram for session start times (time from creation to running)
export const sessionStartTime = new Histogram({
  name: "steel_session_start_time_seconds",
  help: "Time taken for sessions to start (from creation to running state)",
  buckets: [1, 5, 10, 30, 60, 120, 300], // buckets in seconds
});

// Function to get metrics as Prometheus format string
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

// Function to update running sessions count
export function updateLiveSessions(count: number): void {
  sessionsRunning.set(count);
}
