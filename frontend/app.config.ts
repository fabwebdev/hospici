import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@tanstack/react-start/config";
import { resolve } from "node:path";

export default defineConfig({
  tsr: {
    routesDirectory: "./src/routes",
    generatedRouteTree: "./src/routeTree.gen.ts",
  },
  server: {
    preset: "node-server",
    port: 5173,
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
  },
  routers: {
    ssr: {
      entry: "./src/entry-server.tsx",
    },
    client: {
      entry: "./src/entry-client.tsx",
    },
  },
});
