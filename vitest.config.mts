import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/serverOnly.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "evals/**/*.test.ts"],
    restoreMocks: true,
    // Deterministic runs: no live lookups and no language model unless a test injects one.
    env: { WAYFARE_OFFLINE: "1", LLM_PROVIDER: "none" },
  },
});
