import { startServer } from "./src/server.js";

startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start orchestrator server:", err);
});
