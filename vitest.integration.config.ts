import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Integration tests are sequential — they share state (posts, comments)
    // and hit real rate limits.
    sequence: { concurrent: false },
    // Generous timeout: Ollama-backed sentinel endpoints and rate-limit
    // backoffs can take a while.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
