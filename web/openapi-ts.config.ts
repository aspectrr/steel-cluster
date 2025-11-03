import { defineConfig } from "@hey-api/openapi-ts";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: process.env.VITE_OPENAPI_URL as string,
  output: {
    format: "prettier",
    path: "./src/steel-client",
  },
  types: {
    dates: "types+transform",
    enums: "javascript",
  },
});
