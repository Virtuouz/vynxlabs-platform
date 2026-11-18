import type { FailureAlert } from "@vynxlabs/db";
import { sql } from "@vynxlabs/db";
import { mutate, SYSTEM } from "../audit.js";
import type { Kernel } from "../kernel.js";
import { observe } from "../metrics.js";
import { readConnection } from "./bindings.js";
import { type ScriptBody, startRun } from "./runs.js";
import { onTaskEnded, queueTask } from "./tasks.js";

/**
 * A notification is posted by one of the tenant's workers, not by the control
 * plane (decision 0001): the alert says `notified` once the worker has.
 */
onTaskEnded("deliver", async (kernel, task, outcome) => {
  const [table, id] = (task.subject ?? "").split(":") as [string, string | undefined];
  if (!id || (table !== "run" && table !== "flow_run")) return;
  const result =
    "result" in outcome
      ? { notified: true }
      : { notified: false, notifyError: outcome.error.message };
  observe.alert(kernel.metrics, "result" in outcome ? "delivered" : "failed");
  await sql`
    update ${sql.table(table)} set alert = coalesce(alert, '{}'::jsonb) || ${JSON.stringify(result)}::jsonb
    where id = ${id} and tenant_id = ${task.tenant_id}
  `.execute(kernel.db);
});

interface FailedRun {
  id: string;
  tenant_id: string;
  workspace_id: string;
  resource_id: string | null;
  script_path: string;
  attempt: number;
  trigger_type: string;
  error: { message: string } | null;
}

interface Failure {
  tenantId: string;
  workspaceId: string;
  /** The run or flow run that failed. */
  id: string;
  /** The script's or flow's path. */
  name: string;
  attempt: number;
  error: string;
  /** What the failed thing asks for itself. Wins over the workspace's default. */
  own?: FailureAlert | undefined;
}

/**
 * Tells people about a run that failed for the last time: starts the handler
 * script, posts to the notification connection, or both. The script's own
 * `onFailure` wins over the workspace's default.
 */
export async function sendAlerts(kernel: Kernel, run: FailedRun): Promise<void> {
  // A failing handler must not start another handler.
  if (run.trigger_type === "alert") return;
  const script = run.resource_id
    ? await kernel.db
        .selectFrom("resource")
        .select("body")
        .where("id", "=", run.resource_id)
        .executeTakeFirst()
    : undefined;
  const outcome = await alert(kernel, "run", {
    tenantId: run.tenant_id,
    workspaceId: run.workspace_id,
    id: run.id,
    name: run.script_path,
    attempt: run.attempt,
    error: run.error?.message ?? "The run failed.",
    own: (script?.body as unknown as ScriptBody | undefined)?.onFailure,
  });
  if (outcome) {
    await kernel.db
      .updateTable("run")
      // A worker may have delivered already; what it said stands.
      .set({ alert: sql`${JSON.stringify(outcome)}::jsonb || coalesce(alert, '{}'::jsonb)` })
      .where("id", "=", run.id)
      .execute();
  }
}

/** The same for a flow run that failed. A flow uses the workspace's alert. */
export async function alertFlowFailure(
  kernel: Kernel,
  flowRun: { id: string; tenant_id: string; workspace_id: string; flow_path: string },
  error: string,
): Promise<void> {
  const outcome = await alert(kernel, "flow_run", {
    tenantId: flowRun.tenant_id,
    workspaceId: flowRun.workspace_id,
    id: flowRun.id,
    name: flowRun.flow_path,
    attempt: 1,
    error,
  });
  if (outcome) {
    await kernel.db
      .updateTable("flow_run")
      // A worker may have delivered already; what it said stands.
      .set({ alert: sql`${JSON.stringify(outcome)}::jsonb || coalesce(alert, '{}'::jsonb)` })
      .where("id", "=", flowRun.id)
      .execute();
  }
}

async function alert(
  kernel: Kernel,
  table: "run" | "flow_run",
  failure: Failure,
): Promise<Record<string, unknown> | undefined> {
  const workspace = await kernel.db
    .selectFrom("workspace")
    .select(["failure_alert", "slug"])
    .where("id", "=", failure.workspaceId)
    .executeTakeFirstOrThrow();
  const wanted: FailureAlert = { ...workspace.failure_alert, ...failure.own };
  if (!wanted.script && !wanted.notify) return undefined;

  // One alert per script or flow per window: the rest are counted on it, not sent.
  const gated = await gate(kernel, table, failure);
  if (gated.suppressed) {
    observe.alert(kernel.metrics, "suppressed");
    return { suppressed: true, sameAs: gated.sameAs };
  }

  const summary = {
    id: failure.id,
    script: failure.name,
    attempt: failure.attempt,
    error:
      gated.missed > 0
        ? `${failure.error} (and ${gated.missed} more failure${gated.missed === 1 ? "" : "s"} since the last alert)`
        : failure.error,
  };
  const outcome: Record<string, unknown> = { alertedAt: new Date().toISOString() };

  if (wanted.script) {
    try {
      const handler = await mutate(kernel.db, { principal: SYSTEM }, async (trx, audit) => {
        const started = await startRun(kernel, trx, {
          tenantId: failure.tenantId,
          workspaceId: failure.workspaceId,
          script: wanted.script as string,
          input: { run: summary },
          trigger: { type: "alert", detail: { failedRunId: failure.id } },
          startedBy: { type: "system", id: null },
          idempotencyKey: `alert:${failure.id}`,
        });
        await audit({
          action: "run.alert_started",
          targetType: "run",
          targetId: started.run.id,
          tenantId: failure.tenantId,
          workspaceId: failure.workspaceId,
          details: { failedRunId: failure.id, script: wanted.script },
        });
        return started.run;
      });
      outcome.handlerRunId = handler.id;
    } catch (error) {
      outcome.handlerError = (error as Error).message;
    }
  }

  if (wanted.notify) {
    try {
      const connection = await readConnection(kernel, kernel.db, {
        tenantId: failure.tenantId,
        workspaceId: failure.workspaceId,
        path: wanted.notify,
      });
      if (!connection) throw new Error(`The connection "${wanted.notify}" is not bound.`);
      await queueTask(kernel.db, {
        tenantId: failure.tenantId,
        workspaceId: failure.workspaceId,
        kind: "deliver",
        subject: `${table}:${failure.id}`,
        request: {
          connection: wanted.notify,
          payload: {
            text: `Run failed: ${summary.script} in ${workspace.slug}. ${summary.error}`,
            run: { ...summary, workspace: workspace.slug },
          },
        },
      });
      // Said once a worker has posted it.
      outcome.notified = null;
    } catch (error) {
      outcome.notified = false;
      outcome.notifyError = (error as Error).message;
    }
  }
  return outcome;
}

/** How long one alert stands for a script or a flow: failures within it are counted on it. */
export const ALERT_WINDOW_MS = 10 * 60_000;

/**
 * Whether a failure is alerted, or counted on an alert already sent for the
 * same script or flow in the window. Decided under a lock per script or flow,
 * so that replicas agree; the failure's own record says it was alerted before
 * the lock is let go. `missed` is how many were counted on the alert before
 * this one, for its message to say.
 */
async function gate(
  kernel: Kernel,
  table: "run" | "flow_run",
  failure: Failure,
): Promise<{ suppressed: true; sameAs: string } | { suppressed: false; missed: number }> {
  const column = table === "run" ? sql`script_path` : sql`flow_path`;
  return kernel.db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtext(${`alert:${failure.workspaceId}:${table}:${failure.name}`}))`.execute(
      trx,
    );
    const last = await sql<{ id: string; alert: Record<string, unknown>; recent: boolean }>`
      select id, alert,
        (alert->>'alertedAt')::timestamptz > now() - make_interval(secs => ${ALERT_WINDOW_MS / 1000}) as recent
      from ${sql.table(table)}
      where workspace_id = ${failure.workspaceId} and ${column} = ${failure.name}
        and id <> ${failure.id} and alert ? 'alertedAt'
      order by (alert->>'alertedAt')::timestamptz desc
      limit 1
    `.execute(trx);
    const previous = last.rows[0];
    if (previous?.recent) {
      await sql`
        update ${sql.table(table)} set alert = alert || jsonb_build_object(
          'repeats', coalesce((alert->>'repeats')::int, 0) + 1,
          'lastRepeatAt', ${new Date().toISOString()}::text)
        where id = ${previous.id}
      `.execute(trx);
      return { suppressed: true as const, sameAs: previous.id };
    }
    // This one is the alert now; a failure that comes while it is being sent is counted on it.
    await sql`
      update ${sql.table(table)}
      set alert = coalesce(alert, '{}'::jsonb) || jsonb_build_object('alertedAt', ${new Date().toISOString()}::text)
      where id = ${failure.id}
    `.execute(trx);
    return { suppressed: false as const, missed: Number(previous?.alert.repeats ?? 0) };
  });
}
