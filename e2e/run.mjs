// Runs the browser suite in its two goes (see `projects()` in playwright.config.ts): everything
// that can run beside everything else, then what must run alone. The exit status is the worse of
// the two. What follows the command reaches both: `pnpm e2e phase-27`, `pnpm e2e --grep @builder`,
// `pnpm e2e --update-snapshots`.
//
// What must run alone changes the whole instance (its branding, its logo, its identity providers).
// Given a second instance in E2E_ALONE_URL, it runs there at the same time as the rest, with
// E2E_ALONE_SOURCE_URL as that instance's own database for E2E_SOURCE_URL; without one, it runs
// after the rest, on the same instance. The second instance must sign its operator in with the
// same E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD, and run on a port Keycloak's test realm sends
// sign-ins back to (8080 or 8090, deploy/compose/keycloak/acme-realm.json).
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const listing = args.includes("--list");

/** One go of Playwright, with the phase and anything that differs for it in the environment. */
const go = (phase, env = {}) =>
  new Promise((done) => {
    const child = spawn("playwright", ["test", "-c", "e2e", "--pass-with-no-tests", ...args], {
      stdio: "inherit",
      env: { ...process.env, E2E_PHASE: phase, ...env },
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => done(code ?? 1));
    child.on("error", () => done(1));
  });

const second = process.env.E2E_ALONE_URL;
// Side by side, each go writes outside the folder Playwright searches for specs: a go empties its
// output folder when it starts, and the other go, still listing its specs, would find a folder
// gone from under it.
const mainEnv = second ? { E2E_OUTPUT: "../e2e-results/main" } : {};
const aloneEnv = second
  ? {
      E2E_URL: second,
      E2E_OUTPUT: "../e2e-results/alone",
      ...(process.env.E2E_ALONE_SOURCE_URL
        ? { E2E_SOURCE_URL: process.env.E2E_ALONE_SOURCE_URL }
        : {}),
    }
  : {};

let main;
let alone;
if (second && !listing) {
  [main, alone] = await Promise.all([go("main", mainEnv), go("alone", aloneEnv)]);
} else {
  main = await go("main");
  alone = listing ? 0 : await go("alone", aloneEnv);
}
process.exit(main || alone);
