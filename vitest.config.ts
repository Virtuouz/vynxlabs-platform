import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: ["{apps,packages}/*/src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    // Each test file makes a database of its own and holds a few connections to it. On a
    // machine with many cores, running them all at once asks Postgres for more connections
    // than its default of 100 allows.
    maxWorkers: 8,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
