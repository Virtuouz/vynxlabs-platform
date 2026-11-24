import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: ["{apps,packages}/*/src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    // Each test file makes a database of its own and holds a few connections to it. On a
    // machine with many cores, running them all at once asks Postgres for more connections
    // than its default of 100 allows.
    // A CI runner has four cores: more files at once than that only makes each slower, and
    // tests that wait on processes, builds and threads then pass on time or not by luck.
    maxWorkers: process.env.CI ? 4 : 8,
    // The console tests run on the editor's plain text box, never on Monaco (see the file).
    setupFiles: ["apps/console/src/vitest.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
