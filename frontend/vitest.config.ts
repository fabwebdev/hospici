import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Array form ensures order is respected — more-specific aliases must come first.
    // Rollup alias uses prefix matching, so `@tanstack/react-start` would otherwise
    // match `@tanstack/react-start/server` before the explicit stub is tried.
    alias: [
      { find: "@", replacement: resolve(__dirname, "./src") },
      // Specific subpath first — must precede the bare package alias
      {
        find: "@tanstack/react-start/server",
        replacement: resolve(__dirname, "./tests/__mocks__/tanstack-react-start-server.ts"),
      },
      {
        find: "@tanstack/react-start",
        replacement: resolve(__dirname, "./tests/__mocks__/tanstack-react-start.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
