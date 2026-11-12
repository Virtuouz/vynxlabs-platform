import { createHash, randomBytes } from "node:crypto";
import type { TriggerSource } from "@vynxlabs/sdk";
import { CronExpressionParser } from "cron-parser";
import type { Trx } from "../audit.js";
import { badRequest, HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import type { AppliedResource, KindHook } from "../kinds.js";
import { decryptFor, encryptFor } from "./bindings.js";
import { startRun } from "./runs.js";

interface ScheduleBody {
  script: string;
  cron: string;
  timezone?: string;
  input?: Record<string, unknown>;
  enabled?: boolean;
}
interface WebhookBody {
  type: "webhook";
  script: string;
  enabled?: boolean;
}

/** The built-in trigger sources, written against the SDK's extension interface. */
export const scheduleSource: TriggerSource<ScheduleBody> = {
  type: "schedule",
  script: (body) => body.script,
  nextFire(body, after) {
    const expression = CronExpressionParser.parse(body.cron, {
      currentDate: after,
      tz: body.timezone ?? "UTC",
    });
    return expression.next().toDate();
  },
};

export const webhookSource: TriggerSource<WebhookBody> = {
  type: "webhook",
  script: (body) => body.script,
  toInput: (_body, request) => request.body ?? {},
};

export const manualSource: TriggerSource<{ script: string }> = {
  type: "manual",
  script: (body) => body.script,
};

export const WEBHOOK_TOKEN_PREFIX = "vxh_";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function scriptExists(trx: Trx, resource: AppliedResource, script: string) {
  const found = await trx
    .selectFrom("resource")
    .select("id")
    .where("workspace_id", "=", resource.workspaceId)
    .where("kind", "=", "script")
    .where("path", "=", script)
    .executeTakeFirst();
  if (!found) {
    throw badRequest("The trigger refers to a script that does not exist.", [
      { path: "/body/script", message: `no script has the path "${script}" in this workspace` },
    ]);
  }
}

function scheduleHook(): KindHook {
  return {
    async apply(trx, resource) {
      const body = resource.body as unknown as ScheduleBody;
      await scriptExists(trx, resource, body.script);
      let next: Date | null;
      try {
        if (body.cron.trim().split(/\s+/).length !== 5) throw new Error("it must have five fields");
        next = scheduleSource.nextFire?.(body, new Date()) ?? null;
      } catch (error) {
        throw badRequest("The schedule is not valid.", [
          {
            path: "/body/cron",
            message: `"${body.cron}" is not a usable cron expression: ${(error as Error).message}`,
          },
        ]);
      }
      const values = {
        script_path: body.script,
        enabled: body.enabled ?? true,
        next_fire_at: next,
      };
      await trx
        .insertInto("trigger_state")
        .values({
          resource_id: resource.id,
          tenant_id: resource.tenantId,
          workspace_id: resource.workspaceId,
          type: "schedule",
          last_fired_at: null,
          token_hash: null,
          token_encrypted: null,
          ...values,
        })
        .onConflict((oc) => oc.column("resource_id").doUpdateSet(values))
        .execute();
    },
  };
}

function webhookHook(kernel: Kernel): KindHook {
  return {
    async apply(trx, resource) {
      const body = resource.body as unknown as WebhookBody;
      await scriptExists(trx, resource, body.script);
      const existing = await trx
        .selectFrom("trigger_state")
        .select("resource_id")
        .where("resource_id", "=", resource.id)
        .executeTakeFirst();
      if (existing) {
        // The address stays the same across deploys.
        await trx
          .updateTable("trigger_state")
          .set({ script_path: body.script, enabled: body.enabled ?? true })
          .where("resource_id", "=", resource.id)
          .execute();
        return;
      }
      const token = `${WEBHOOK_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
      await trx
        .insertInto("trigger_state")
        .values({
          resource_id: resource.id,
          tenant_id: resource.tenantId,
          workspace_id: resource.workspaceId,
          type: "webhook",
          script_path: body.script,
          enabled: body.enabled ?? true,
          next_fire_at: null,
          last_fired_at: null,
          token_hash: hashToken(token),
          token_encrypted: await encryptFor(
            kernel,
            trx,
            resource.tenantId,
            resource.workspaceId,
            `webhook:${resource.id}`,
            token,
          ),
        })
        .execute();
    },
  };
}

export function registerExecutionHooks(kernel: Kernel) {
  kernel.hooks.set("schedule", scheduleHook());
  kernel.hooks.set("trigger", webhookHook(kernel));
}

/** A webhook's token, for showing its address to someone allowed to see it. */
export function webhookToken(
  kernel: Kernel,
  state: {
    resource_id: string;
    tenant_id: string;
    workspace_id: string;
    token_encrypted: Buffer | null;
  },
) {
  if (!state.token_encrypted) return undefined;
  return decryptFor(
    kernel,
    kernel.db,
    state.tenant_id,
    state.workspace_id,
    `webhook:${state.resource_id}`,
    state.token_encrypted,
  );
}

/**
 * Starts a run for every schedule that is due. A schedule that missed several
 * times while the instance was down runs once, then waits for its next time.
 */
export async function fireDueSchedules(kernel: Kernel, now = new Date()): Promise<number> {
  let fired = 0;
  for (;;) {
    const one = await kernel.db.transaction().execute(async (trx) => {
      const due = await trx
        .selectFrom("trigger_state")
        .innerJoin("resource", "resource.id", "trigger_state.resource_id")
        .select([
          "trigger_state.resource_id",
          "trigger_state.tenant_id",
          "trigger_state.workspace_id",
          "trigger_state.next_fire_at",
          "resource.body",
          "resource.path",
        ])
        .where("trigger_state.type", "=", "schedule")
        .where("trigger_state.enabled", "=", true)
        .where("trigger_state.next_fire_at", "<=", now)
        .orderBy("trigger_state.next_fire_at")
        .limit(1)
        .forUpdate("trigger_state")
        .skipLocked()
        .executeTakeFirst();
      if (!due) return false;
      const body = due.body as unknown as ScheduleBody;
      const fireTime = due.next_fire_at as Date;
      await trx
        .updateTable("trigger_state")
        .set({ next_fire_at: scheduleSource.nextFire?.(body, now) ?? null, last_fired_at: now })
        .where("resource_id", "=", due.resource_id)
        .execute();
      try {
        await startRun(kernel, trx, {
          tenantId: due.tenant_id,
          workspaceId: due.workspace_id,
          script: scheduleSource.script(body),
          input: body.input ?? {},
          trigger: {
            type: "schedule",
            detail: { schedule: due.path, scheduledFor: fireTime.toISOString() },
          },
          startedBy: { type: "trigger", id: null },
          idempotencyKey: `schedule:${due.resource_id}:${fireTime.toISOString()}`,
        });
      } catch (error) {
        // A schedule that cannot start, such as one whose input no longer fits, must not block the rest.
        if (!(error instanceof HttpError)) throw error;
        kernel.log.warn(
          { schedule: due.path, reason: error.message },
          "a schedule could not start its run",
        );
      }
      return true;
    });
    if (!one) return fired;
    fired += 1;
  }
}

/** Starts the run for an incoming webhook request. Returns undefined for an unknown token. */
export async function fireWebhook(
  kernel: Kernel,
  token: string,
  payload: unknown,
  idempotencyKey?: string,
) {
  if (!token.startsWith(WEBHOOK_TOKEN_PREFIX)) return undefined;
  const state = await kernel.db
    .selectFrom("trigger_state")
    .innerJoin("resource", "resource.id", "trigger_state.resource_id")
    .select([
      "trigger_state.tenant_id",
      "trigger_state.workspace_id",
      "trigger_state.enabled",
      "resource.body",
      "resource.path",
    ])
    .where("trigger_state.token_hash", "=", hashToken(token))
    .where("trigger_state.type", "=", "webhook")
    .executeTakeFirst();
  if (!state?.enabled) return undefined;
  const body = state.body as unknown as WebhookBody;
  // Not audited: the run itself records the webhook that started it.
  return kernel.db.transaction().execute((trx) =>
    startRun(kernel, trx, {
      tenantId: state.tenant_id,
      workspaceId: state.workspace_id,
      script: webhookSource.script(body),
      input: webhookSource.toInput?.(body, { headers: {}, body: payload }),
      trigger: { type: "webhook", detail: { trigger: state.path } },
      startedBy: { type: "trigger", id: null },
      idempotencyKey,
    }),
  );
}
