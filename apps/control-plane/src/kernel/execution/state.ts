import { sql } from "@volvel/db";
import { Type } from "typebox";

/**
 * What a run, a flow run or a step is doing, in one vocabulary for every screen:
 * a flow run that waits for a person is not "running", and a queued run is not
 * "waiting".
 */
export const RUN_STATES = [
  "queued",
  "running",
  "waiting_approval",
  "waiting_time",
  "succeeded",
  "failed",
  "canceled",
  "skipped",
] as const;
export type RunState = (typeof RUN_STATES)[number];

export const RunStateSchema = Type.Union(
  [
    Type.Literal("queued"),
    Type.Literal("running"),
    Type.Literal("waiting_approval"),
    Type.Literal("waiting_time"),
    Type.Literal("succeeded"),
    Type.Literal("failed"),
    Type.Literal("canceled"),
    Type.Literal("skipped"),
  ],
  {
    description:
      "What it is doing: `queued`, `running`, `waiting_approval` (a person must decide), " +
      "`waiting_time` (a delay), `succeeded`, `failed`, `canceled` or `skipped`.",
  },
);

/**
 * A script run's state from its status. A queued run set to start later is waiting for its
 * time, not queued: nothing is holding it up (OPS-25).
 */
export const runState = (status: string, scheduledFor?: Date | null): RunState =>
  status === "queued" && scheduledFor && scheduledFor.getTime() > Date.now()
    ? "waiting_time"
    : status === "cancelled"
      ? "canceled"
      : (status as RunState);

/** A step's state: a waiting step is an approval when it has a title, a delay when it has a time. */
export function stepState(step: {
  status: string;
  detail: Record<string, unknown> | null;
  wake_at: Date | null;
}): RunState {
  if (step.status === "waiting") {
    if (step.detail && "title" in step.detail) return "waiting_approval";
    if (step.wake_at) return "waiting_time";
    // Waiting on its items or a sub-flow: that is work going on.
    return "running";
  }
  return runState(step.status);
}

/**
 * The same for a script run, in SQL, for a column such as `r.status`. With the run's
 * `scheduled_for` column, a queued run set to start later is `waiting_time`.
 */
export const runStateSql = (status: string, scheduledFor?: string) => {
  // british-ok: `cancelled` is the stored value, said as `canceled`.
  const stored = sql<RunState>`case when ${sql.ref(status)} = 'cancelled' then 'canceled' else ${sql.ref(status)}::text end`;
  if (!scheduledFor) return stored;
  // british-ok: `cancelled` is the stored value, said as `canceled`.
  return sql<RunState>`case
    when ${sql.ref(status)} = 'queued' and ${sql.ref(scheduledFor)} > now() then 'waiting_time'
    when ${sql.ref(status)} = 'cancelled' then 'canceled'
    else ${sql.ref(status)}::text end`;
};

/**
 * A flow run's state, in SQL, for the flow run aliased `alias`. A running flow
 * run with a step waiting for a person is `waiting_approval`; one with only a
 * delay waiting is `waiting_time`.
 */
export const flowStateSql = (alias: string) => {
  const id = sql.ref(`${alias}.id`);
  const status = sql.ref(`${alias}.status`);
  return sql<RunState>`case
    when ${status} = 'running' and exists (
      select 1 from step_run s
      where s.flow_run_id = ${id} and s.status = 'waiting' and s.detail ? 'title'
    ) then 'waiting_approval'
    when ${status} = 'running' and exists (
      select 1 from step_run s
      where s.flow_run_id = ${id} and s.status = 'waiting' and s.wake_at is not null
    ) and not exists (
      select 1 from step_run s
      where s.flow_run_id = ${id} and s.status in ('running', 'waiting')
        and s.wake_at is null
    ) then 'waiting_time'
    when ${status} = 'cancelled' then 'canceled'
    else ${status}::text
  end`;
};
