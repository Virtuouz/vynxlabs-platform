import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: ["{apps,packages}/*/src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
