import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

/** LLM-as-a-judge evals only. Opt-in: needs a local Ollama model (see evals/judge). */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["evals/judge/**/*.eval.ts"],
    testTimeout: 600_000,
  },
});



