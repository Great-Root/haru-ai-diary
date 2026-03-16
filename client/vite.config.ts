import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: ["dev.34.22.82.6.nip.io", "34.22.82.6.nip.io"],
    proxy: {
      "/ws": {
        target: "http://localhost:8080",
        ws: true,
      },
      "/health": {
        target: "http://localhost:8080",
      },
      "/generated": {
        target: "http://localhost:8080",
      },
      "/uploads": {
        target: "http://localhost:8080",
      },
      "/api": {
        target: "http://localhost:8080",
      },
      "/avatars": {
        target: "http://localhost:8080",
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
