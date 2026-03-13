// app.config.ts
import { defineConfig } from "@tanstack/react-start/config";
const app_config_default = defineConfig({
  server: {
    preset: "node-server",
  },
  routers: {
    api: {
      entry: "./src/api.ts",
    },
    ssr: {
      entry: "./src/entry-server.tsx",
    },
    client: {
      entry: "./src/entry-client.tsx",
    },
  },
});
export { app_config_default as default };
