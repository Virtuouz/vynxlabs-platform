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
  const workspace = await kernel.db
    .selectFrom("workspace")
    .select(["failure_alert", "slug"])
    .where("id", "=", run.workspace_id)
    .executeTakeFirstOrThrow();
  const own = (script?.body as unknown as ScriptBody | undefined)?.onFailure;
  const alert: FailureAlert = { ...workspace.failure_alert, ...own };
  if (!alert.script && !alert.notify) return;

  const summary = {
    id: run.id,
    script: run.script_path,
    attempt: run.attempt,
    error: run.error?.message ?? "The run failed.",
  };
  const outcome: Record<string, unknown> = {};

  if (alert.script) {
    try {
      const handler = await mutate(kernel.db, { principal: SYSTEM }, async (trx, audit) => {
        const started = await startRun(kernel, trx, {
          tenantId: run.tenant_id,
          workspaceId: run.workspace_id,
          script: alert.script as string,
          input: { run: summary },
          trigger: { type: "alert", detail: { failedRunId: run.id } },
          startedBy: { type: "system", id: null },
          idempotencyKey: `alert:${run.id}`,
        });
        await audit({
          action: "run.alert_started",
          targetType: "run",
          targetId: started.run.id,
          tenantId: run.tenant_id,
          workspaceId: run.workspace_id,
          details: { failedRunId: run.id, script: alert.script },
        });
        return started.run;
      });
      outcome.handlerRunId = handler.id;
    } catch (error) {
      outcome.handlerError = (error as Error).message;
    }
  }

  if (alert.notify) {
    try {
      const connection = await readConnection(kernel, kernel.db, {
        tenantId: run.tenant_id,
        workspaceId: run.workspace_id,
        path: alert.notify,
      });
      if (!connection) throw new Error(`The connection "${alert.notify}" is not bound.`);
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

  await kernel.db
    .updateTable("run")
    .set({ alert: JSON.stringify(outcome) })
    .where("id", "=", run.id)
    .execute();
}
