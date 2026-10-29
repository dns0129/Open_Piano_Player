import { defineConfig } from "vite";
export default defineConfig({
  worker: { format: "es" },
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${Number(process.env.QINBAN_PORT) || 8792}`,
    },
  },
  build: {
    ...(process.env.VITE_HOSTED_SITE === "1"
      ? {
          rollupOptions: {
            input: [
              "commercial.html",
              "practice.html",
              "account.html",
              "recognition.html",
              "operations.html",
              "subscription.html",
            ],
          },
        }
      : {}),
    target: "es2022",
    chunkSizeWarningLimit: 1600,
  },
});
