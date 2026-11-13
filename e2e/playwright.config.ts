import { defineConfig } from "@playwright/test";

/**
 * Walks the phase's exit criterion in a browser, against an instance that is
 * already running: the image, with Postgres, an object store and Keycloak
 * beside it. See the README here for how to start those.
 */
export default defineConfig({
  testDir: ".",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:8080",
    viewport: { width: 1500, height: 1000 },
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "results",
});
