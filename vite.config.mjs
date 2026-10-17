import { defineConfig } from "vite";
export default defineConfig({
  worker: { format: "es" },
  server: { proxy: { "/api": "http://127.0.0.1:8792" } },
  build: { target: "es2022", chunkSizeWarningLimit: 1600 },
});
