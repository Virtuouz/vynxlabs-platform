import type { FailureAlert } from "@vynxlabs/db";
import type { HttpConfig } from "@vynxlabs/sdk";
import { httpConnector } from "@vynxlabs/sdk";
import { mutate, SYSTEM } from "../audit.js";
import type { Kernel } from "../kernel.js";
import { readConnection } from "./bindings.js";
import { type ScriptBody, startRun } from "./runs.js";

interface FailedRun {
  id: string;
  tenant_id: string;
  workspace_id: string;
  resource_id: string;
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
  const script = await kernel.db
    .selectFrom("resource")
    .select("body")
    .where("id", "=", run.resource_id)
    .executeTakeFirst();
  const outcome = await alert(kernel, {
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
      .set({ alert: JSON.stringify(outcome) })
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
  const outcome = await alert(kernel, {
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
      .set({ alert: JSON.stringify(outcome) })
      .where("id", "=", flowRun.id)
      .execute();
  }
}

async function alert(
  kernel: Kernel,
  failure: Failure,
): Promise<Record<string, unknown> | undefined> {
  const workspace = await kernel.db
    .selectFrom("workspace")
    .select(["failure_alert", "slug"])
    .where("id", "=", failure.workspaceId)
    .executeTakeFirstOrThrow();
  const wanted: FailureAlert = { ...workspace.failure_alert, ...failure.own };
  if (!wanted.script && !wanted.notify) return undefined;

  const summary = {
    id: failure.id,
    script: failure.name,
    attempt: failure.attempt,
    error: failure.error,
  };
  const outcome: Record<string, unknown> = {};

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
      const client = httpConnector.create(
        connection.config as unknown as HttpConfig,
        connection.credential,
        AbortSignal.timeout(10_000),
      );
      await client.post("", {
        text: `Run failed: ${summary.script} in ${workspace.slug}. ${summary.error}`,
        run: { ...summary, workspace: workspace.slug },
      });
      outcome.notified = true;
    } catch (error) {
      outcome.notified = false;
      outcome.notifyError = (error as Error).message;
    }
  }
  return outcome;
}
