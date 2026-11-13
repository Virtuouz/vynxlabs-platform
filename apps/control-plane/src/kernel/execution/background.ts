import { removeExpiredAppSessions } from "../apps/sessions.js";
import { advanceDueFlows } from "../flows/engine.js";
import type { Kernel } from "../kernel.js";
import { removeExpiredSso } from "../sso/flow.js";
import { removeOldPreviews } from "./bundles.js";
import { reapDeadRuns, requeueLostRuns } from "./runs.js";
import type { WorkerSupervisor } from "./supervisor.js";
import { fireDueSchedules } from "./triggers.js";

/**
 * The control plane's recurring work: fire schedules that are due, put back in
 * line the runs whose worker went silent, close runs whose retries ran out,
 * and keep managed workers running where there is work.
 * Every replica runs this. Each step is safe to run concurrently.
 */
export function startBackground(kernel: Kernel, supervisor?: WorkerSupervisor, intervalMs = 2000) {
  let running = false;
  let swept = 0;
  /** Sign-ins and links that have run out are useless already. Clearing them can wait a minute. */
  const sweep = async () => {
    if (Date.now() - swept < 60_000) return;
    swept = Date.now();
    await removeExpiredAppSessions(kernel.db);
    await removeExpiredSso(kernel.db);
    await removeOldPreviews(kernel);
  };
  const steps: [string, () => Promise<unknown>][] = [
    ["schedules", () => fireDueSchedules(kernel)],
    ["lost runs", () => requeueLostRuns(kernel)],
    ["dead runs", () => reapDeadRuns(kernel)],
    ["flows", () => advanceDueFlows(kernel)],
    ["expired sign-ins", sweep],
    ...(supervisor
      ? ([["managed workers", () => supervisor.tick()]] as [string, () => Promise<unknown>][])
      : []),
  ];
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    for (const [name, step] of steps) {
      await step().catch((error) =>
        kernel.log.error({ err: error, step: name }, "a background step failed"),
      );
    }
    running = false;
  }, intervalMs);
  return {
    async stop() {
      clearInterval(timer);
      await supervisor?.stop();
    },
  };
}
