// Runs the browser suite in its two goes (see `projects()` in playwright.config.ts): everything
// that can run beside everything else, then what must run alone. The second go runs whether or
// not the first passed, and the exit status is the worse of the two. What follows the command
// reaches both: `pnpm e2e phase-27`, `pnpm e2e --grep @builder`, `pnpm e2e --update-snapshots`.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const go = (phase) =>
  spawnSync("playwright", ["test", "-c", "e2e", "--pass-with-no-tests", ...args], {
    stdio: "inherit",
    env: { ...process.env, E2E_PHASE: phase },
    shell: process.platform === "win32",
  }).status ?? 1;

const main = go("main");
const alone = args.includes("--list") ? 0 : go("alone");
process.exit(main || alone);
