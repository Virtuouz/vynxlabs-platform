import { defineConfig } from "@playwright/test";

/**
 * Walks the phase's exit criterion in a browser, against an instance that is
 * already running: the image, with Postgres, an object store and Keycloak
 * beside it. See the README here for how to start those.
 */
/**
 * CI runs the suite on three runners at once, one group each (E2E_GROUP). The groups are cut
 * by how long their tests take, not by their names: Playwright's own `--shard` splits files in
 * order by count, which put every slow spec on one runner. Group c is whatever a and b do not
 * name, so a new spec is never left out. Without E2E_GROUP, everything runs.
 */
const GROUPS: Record<string, string[]> = {
  a: ["polish-measures.spec.ts", "redesign.spec.ts"],
  b: ["polish-layout.spec.ts", "polish-behaviour.spec.ts"],
};
const group = process.env.E2E_GROUP;
const chosen =
  group === "a" || group === "b"
    ? { testMatch: GROUPS[group] as string[] }
    : group === "c"
      ? { testIgnore: [...(GROUPS.a as string[]), ...(GROUPS.b as string[])] }
      : {};

export default defineConfig({
  testDir: ".",
  ...chosen,
  timeout: 240_000,
  expect: {
    timeout: 20_000,
    // Reviewed pictures: a few pixels of anti-aliasing may differ, not a moved layout.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2 },
  },
  snapshotPathTemplate: "{testDir}/snapshots/{testFileName}/{arg}{ext}",
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
