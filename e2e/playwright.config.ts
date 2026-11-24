import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));

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
const inGroup = (file: string) =>
  group === "a" || group === "b"
    ? (GROUPS[group] as string[]).includes(file)
    : group === "c"
      ? !(GROUPS.a as string[]).concat(GROUPS.b as string[]).includes(file)
      : true;

/**
 * Where each spec runs (the README says why):
 *
 * - `fernhill`: the specs that walk Fernhill, the seeded example. Files run side by side, the
 *   tests of one file in order. Each writes only what is its own (names with the run's stamp)
 *   in Fernhill's shared Sandbox.
 * - `alone`: the specs that change the whole instance (every identity provider, the branding
 *   and its minute of cache, the logo) or what every signed-in operator shares. One worker,
 *   after everything else, so that nothing else is running.
 * - `parallel`: everything else. Each makes a tenant of its own (stamped), and so can run
 *   beside any other.
 */
const ALONE = ["exit-criterion", "redesign", "favicon", "polish-behaviour"];
const FERNHILL = /^(phase-2[2-8].*|approvals-mine|screenshots)$/;
/** Both ask a workspace for its one `docs-feedback` table, so the second waits for the first. */
const DOCS_FEEDBACK = ["phase-23", "phase-24"];
const files = readdirSync(here)
  .filter((file) => file.endsWith(".spec.ts"))
  .filter(inGroup);
const nameOf = (file: string) => file.replace(/\.spec\.ts$/, "");
const fernhill = files.filter(
  (file) => FERNHILL.test(nameOf(file)) && !DOCS_FEEDBACK.includes(nameOf(file)),
);
const feedback = DOCS_FEEDBACK.flatMap((name) => files.filter((file) => nameOf(file) === name));
const alone = files.filter((file) => ALONE.includes(nameOf(file)));
const parallel = files.filter(
  (file) => !fernhill.includes(file) && !alone.includes(file) && !feedback.includes(file),
);

/** A project whose list is empty in this group matches nothing. */
const only = (list: string[]) => ({ testMatch: list.length > 0 ? list : "no-such-file.spec.ts" });

export default defineConfig({
  testDir: ".",
  timeout: 240_000,
  expect: {
    timeout: 20_000,
    // Reviewed pictures: a few pixels of anti-aliasing may differ, not a moved layout.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2 },
  },
  snapshotPathTemplate: "{testDir}/snapshots/{testFileName}/{arg}{ext}",
  // Files side by side, the tests in a file in order.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 4),
  // A test that passes only on its retry is reported by `retry-report.ts`, not hidden.
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["./retry-report.ts"]],
  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:8080",
    viewport: { width: 1500, height: 1000 },
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "results",
  projects: projects(),
});

/**
 * `run.mjs` runs the suite in two goes, so that a filter (`pnpm e2e phase-27`, `--grep`,
 * `--only-changed`) reaches every spec: the setup project and the dependencies of a project
 * always run in full, which `alone` coming after the rest would have made of the whole suite.
 * E2E_PHASE=main is everything but `alone`, E2E_PHASE=alone is `alone` by itself, and without
 * it all of them are one run (what `--list` shows).
 */
function projects() {
  const phase = process.env.E2E_PHASE;
  const main = [
    { name: "setup", testMatch: "auth.setup.ts" },
    { name: "parallel", ...only(parallel), dependencies: ["setup"] },
    { name: "fernhill", ...only(fernhill), dependencies: ["setup"] },
    // Fernhill's feedback specs, one after the other, beside the rest of Fernhill's.
    ...feedback.map((file, at) => ({
      name: `fernhill-${nameOf(file)}`,
      testMatch: file,
      dependencies: at === 0 ? ["setup"] : [`fernhill-${nameOf(feedback[at - 1] as string)}`],
    })),
  ];
  // One worker, the files one after the other.
  const lone = { name: "alone", ...only(alone), workers: 1 };
  return phase === "alone" ? [lone] : phase === "main" ? main : [...main, lone];
}
