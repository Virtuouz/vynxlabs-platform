import { api } from "../api.ts";
import { ask, notify } from "../ask.tsx";

/**
 * Running a run again, from wherever it is offered: the run page and the
 * runs list's row menu. Each asks first, saying what runs again and on which
 * version, then hands the new run's ID to `started`. A refusal is said once.
 * Phase 15: every command that changes something asks first, as its button does.
 */

/** Which version a run is run again on: the one it ran, or the one deployed now. */
export type Version = "original" | "active";

export interface RetryPlan {
  bundleVersion: number;
  changed: string[];
  kept: string[];
  again: string[];
  approvalsKept: { node: string; decidedBy: string | null }[];
}

interface Again {
  root: string;
  /** The run being run again. */
  id: string;
  started: (id: string) => void;
}

/** A script run, again with the same input. */
export async function scriptAgain(
  run: Again & { script: string; bundleVersion: number },
  bundle: Version,
): Promise<void> {
  const sure = await ask.confirm({
    title: `Run ${run.script} again?`,
    text:
      bundle === "original"
        ? `With the same input, on version ${run.bundleVersion}, the one it ran.`
        : "With the same input, on the version deployed now.",
    action: "Run again",
  });
  if (!sure) return;
  await api
    .post<{ id: string }>(`${run.root}/runs/${run.id}/rerun`, { bundle })
    .then((one) => run.started(one.id), notify.error);
}

/** A flow run, from its failed step: what runs again and what is kept are said first. */
export async function flowFromFailed(run: Again, bundle: Version = "original"): Promise<void> {
  let plan: RetryPlan;
  try {
    plan = await api.get(`${run.root}/flow-runs/${run.id}/retry-plan?bundle=${bundle}`);
  } catch (caught) {
    notify.error(caught);
    return;
  }
  const approvals = plan.approvalsKept
    .map((one) => `${one.node}${one.decidedBy ? ` (approved by ${one.decidedBy})` : ""}`)
    .join(", ");
  const sure = await ask.confirm({
    title: "Retry from the failed step?",
    text:
      `Runs again: ${plan.again.join(", ") || "nothing"}. ` +
      `Kept as it was: ${plan.kept.join(", ") || "nothing"}. ` +
      (approvals ? `Approvals kept, not asked again: ${approvals}. ` : "") +
      `On version ${plan.bundleVersion}${bundle === "active" ? ", the one deployed now" : ""}, with the same input.`,
    action: "Retry",
  });
  if (!sure) return;
  await api
    .post<{ id: string }>(`${run.root}/flow-runs/${run.id}/retry`, {
      from: "failed",
      ...(bundle === "active" ? { bundle } : {}),
    })
    .then((one) => run.started(one.id), notify.error);
}

/** A flow run, every step again from the start. */
export async function flowFromStart(
  run: Again & { flow: string; bundleVersion: number },
  bundle: Version,
): Promise<void> {
  const sure = await ask.confirm({
    title: `Run ${run.flow} again from the start?`,
    text:
      bundle === "original"
        ? `Every step runs again, with the same input, on version ${run.bundleVersion}.`
        : "Every step runs again, with the same input, on the version deployed now.",
    action: "Run again",
  });
  if (!sure) return;
  await api
    .post<{ id: string }>(`${run.root}/flow-runs/${run.id}/retry`, { from: "start", bundle })
    .then((one) => run.started(one.id), notify.error);
}
