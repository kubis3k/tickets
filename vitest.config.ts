import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // server-only vyhazuje chybu mimo RSC; v testech je no-op
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 20000,
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", ".claude/**"],
  },
});
