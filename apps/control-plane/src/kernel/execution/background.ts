import { sweepDueAppFiles } from "../apps/assets.js";
import { removeExpiredAppSessions } from "../apps/sessions.js";
import { checkDueSources } from "../data/health.js";
import { removeOldLinks } from "../flows/approval-links.js";
import { advanceDueFlows } from "../flows/engine.js";
import type { Kernel } from "../kernel.js";
import { pruneRateLimits } from "../ratelimit.js";
import { rekeyIfRotating } from "../rekey.js";
import { removeExpiredAliases } from "../resolve.js";
import { pruneOnce } from "../retention.js";
import { removeExpiredSso } from "../sso/flow.js";
import { removeExpiredImports } from "../tenancy/staging.js";
import { removeOldPreviews } from "./bundles.js";
import { removeExpiredAuthorizations } from "./oauth.js";
import { reapDeadRuns, requeueLostRuns } from "./runs.js";
import type { WorkerSupervisor } from "./supervisor.js";
import { sweepTasks } from "./tasks.js";
import { fireDueSchedules } from "./triggers.js";

/**
 * The control plane's recurring work: fire schedules that are due, put back in
 * line the runs whose worker went silent, close runs whose retries ran out,
 * and keep managed workers running where there is work.
 * Every replica runs this. Each step is safe to run concurrently.
 */
/** How often the retention job runs. */
const RETENTION_EVERY_MS = 10 * 60_000;

export function startBackground(kernel: Kernel, supervisor?: WorkerSupervisor, intervalMs = 2000) {
  const running = false;
  let swept = 0;
  let checked = 0;
  /** Data sources are reached at most once a minute here; each is due every ten. */
  const health = async () => {
    if (Date.now() - checked < 60_000) return;
    checked = Date.now();
    await checkDueSources(kernel);
  };
  /** Sign-ins and links that have run out are useless already. Clearing them can wait a minute. */
  const sweep = async () => {
    if (Date.now() - swept < 60_000) return;
    swept = Date.now();
    await removeExpiredAppSessions(kernel.db);
    await removeExpiredSso(kernel.db);
    await removeExpiredAuthorizations(kernel.db);
    await removeOldLinks(kernel.db);
    await removeExpiredAliases(kernel);
    await removeOldPreviews(kernel);
    await sweepDueAppFiles(kernel);
    await removeExpiredImports(kernel);
    await pruneRateLimits(kernel);
  };
  let pruned = 0;
  /** What is past each tenant's retention goes, every ten minutes, on one replica at a time. */
  const retention = async () => {
    if (Date.now() - pruned < RETENTION_EVERY_MS) return;
    pruned = Date.now();
    const result = await pruneOnce(kernel);
    if (result !== "busy") kernel.log.info({ pruned: result }, "retention pass");
  };
  let rekeyed = Date.now();
  /** During a rotation, what a replica still sealing with the old key wrote since is moved. */
  const masterKey = async () => {
    if (Date.now() - rekeyed < RETENTION_EVERY_MS) return;
    rekeyed = Date.now();
    await rekeyIfRotating(kernel);
  };
  const steps: [string, () => Promise<unknown>][] = [
    ["schedules", () => fireDueSchedules(kernel)],
    ["lost runs", () => requeueLostRuns(kernel)],
    ["dead runs", () => reapDeadRuns(kernel)],
    ["tasks", () => sweepTasks(kernel)],
    ["flows", () => advanceDueFlows(kernel)],
    ["expired sign-ins", sweep],
    ["health", health],
    ["retention", retention],
    ["master key", masterKey],
    ...(supervisor
      ? ([["managed workers", () => supervisor.tick()]] as [string, () => Promise<unknown>][])
      : []),
  ];
  const loop = startStepLoops(steps, kernel.log, { intervalMs });
  return {
    async stop() {
      await loop.stop();
      await supervisor?.stop();
    },
  };
}

/** A step that runs longer than this is said to be late; it is still waited for, never run twice. */
export const STEP_LIMIT_MS = 60_000;

interface StepLog {
  error(object: object, message: string): void;
  warn(object: object, message: string): void;
}

/**
 * Each step has a loop of its own and its own "still going" flag, so a step that waits (a data
 * source that never answers, a store that is slow) delays only itself. A step past its limit is
 * logged once per run, with the time it has taken so far. `stop()` ends the timers and waits
 * for the steps in progress, for at most the limit, so the database is not closed under them.
 */
export function startStepLoops(
  steps: [string, () => Promise<unknown>][],
  log: StepLog,
  options: { intervalMs: number; limitMs?: number },
) {
  const limitMs = options.limitMs ?? STEP_LIMIT_MS;
  const going = new Map<string, Promise<unknown>>();
  /** Steps that ran past their limit since the loops began. */
  const late: Record<string, number> = {};
  const timers = steps.map(([name, step]) => {
    const tick = () => {
      if (going.has(name)) return;
      const started = Date.now();
      const warning = setTimeout(() => {
        late[name] = (late[name] ?? 0) + 1;
        log.warn(
          { step: name, limitMs, late: late[name] },
          "a background step is taking longer than its limit; the others go on",
        );
      }, limitMs);
      warning.unref();
      const run = step()
        .catch((error) =>
          log.error(
            { err: error, step: name, ms: Date.now() - started },
            "a background step failed",
          ),
        )
        .finally(() => {
          clearTimeout(warning);
          going.delete(name);
        });
      going.set(name, run);
    };
    return setInterval(tick, options.intervalMs);
  });
  return {
    late,
    async stop() {
      for (const timer of timers) clearInterval(timer);
      let give: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.allSettled([...going.values()]),
        new Promise<void>((resolve) => {
          give = setTimeout(resolve, limitMs);
        }),
      ]);
      clearTimeout(give);
    },
  };
}
