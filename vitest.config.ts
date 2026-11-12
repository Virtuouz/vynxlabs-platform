import { defineConfig } from "vitest/config";

// The interface runs on Preact. The root package.json overrides `react` and
// `react-dom` with Preact's compatibility layer, so no aliases are needed here.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  test: {
    include: ["{apps,packages}/*/src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
