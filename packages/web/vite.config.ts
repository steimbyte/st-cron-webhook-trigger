import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3737",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@cronboard/core/scheduler/cronExpr": path.resolve(__dirname, "../core/src/scheduler/cronExpr.ts"),
    },
  },
});