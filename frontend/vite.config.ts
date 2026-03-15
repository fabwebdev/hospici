import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api and /auth to the backend in dev
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/fhir": "http://localhost:3000",
    },
  },
});
