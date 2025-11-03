import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: { port: 3001 },

  plugins: [react()],

  resolve: {
    alias: {
      // eslint-disable-next-line no-undef
      "@": path.resolve(__dirname, "./src"),
      // Add path polyfill for monaco-editor-auto-typings
      path: "rollup-plugin-node-polyfills/polyfills/path",
    },
  },

  build: { sourcemap: true },
});
