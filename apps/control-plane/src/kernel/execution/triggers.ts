import { createHash, randomBytes } from "node:crypto";
import type { FlowBody, FlowTrigger } from "@vynxlabs/manifest";
import type { TriggerSource } from "@vynxlabs/sdk";
import { CronExpressionParser } from "cron-parser";
import type { Trx } from "../audit.js";
import { badRequest, HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import type { AppliedResource, KindHook } from "../kinds.js";
import { decryptFor, encryptFor } from "./bindings.js";
import { startRun } from "./runs.js";

interface ScheduleConfig {
  cron: string;
  timezone?: string;
  input?: Record<string, unknown>;
}
interface ScheduleBody extends ScheduleConfig {
  script: string;
  enabled?: boolean;
}
type TriggerBody =
  | { type: "webhook"; script: string; enabled?: boolean }
  | { type: "event"; script: string; event: string; filter?: string; enabled?: boolean };

/** The built-in trigger sources, written against the SDK's extension interface. */
export const scheduleSource: TriggerSource<ScheduleConfig> = {
  type: "schedule",
  script: () => "",
  nextFire(config, after) {
    const expression = CronExpressionParser.parse(config.cron, {
      currentDate: after,
      tz: config.timezone ?? "UTC",
    });
    return expression.next().toDate();
  },
};

export const webhookSource: TriggerSource<unknown> = {
  type: "webhook",
  script: () => "",
  toInput: (_body, request) => request.body ?? {},
};

export const eventSource: TriggerSource<unknown> = {
  type: "event",
  script: () => "",
  toInput: (_body, request) => request.body ?? {},
};

export const manualSource: TriggerSource<unknown> = { type: "manual", script: () => "" };

export const WEBHOOK_TOKEN_PREFIX = "vxh_";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** One trigger as it should be registered: a trigger resource, or a trigger node of a flow. */
interface Registration {
  node: string;
  type: "schedule" | "webhook" | "event";
  target: { kind: "script" | "flow"; path: string };
  enabled: boolean;
  schedule?: ScheduleConfig;
  event?: { name: string; filter?: string | undefined };
}

function firstFire(schedule: ScheduleConfig, field: string): Date | null {
  try {
    if (schedule.cron.trim().split(/\s+/).length !== 5) throw new Error("it must have five fields");
    return scheduleSource.nextFire?.(schedule, new Date()) ?? null;
  } catch (error) {
    throw badRequest("The schedule is not valid.", [
      {
        path: field,
        message: `"${schedule.cron}" is not a usable cron expression: ${(error as Error).message}`,
      },
    ]);
  }
}

/**
 * Makes a resource's registered triggers match what its manifest says. A
 * webhook keeps its address for as long as its trigger exists.
 */
async function register(
  kernel: Kernel,
  trx: Trx,
  resource: AppliedResource,
  wanted: Registration[],
) {
  const existing = await trx
    .selectFrom("trigger_state")
    .select(["node_id", "type"])
    .where("resource_id", "=", resource.id)
    .execute();
  const keep = new Set(wanted.map((registration) => registration.node));
  for (const row of existing) {
    const still = wanted.find((registration) => registration.node === row.node_id);
    if (!keep.has(row.node_id) || still?.type !== row.type) {
      await trx
        .deleteFrom("trigger_state")
        .where("resource_id", "=", resource.id)
        .where("node_id", "=", row.node_id)
        .execute();
    }
  }

  for (const registration of wanted) {
    const field = registration.node
      ? `/body/nodes/${registration.node}/trigger/cron`
      : "/body/cron";
    const common = {
      target_kind: registration.target.kind,
      target_path: registration.target.path,
      enabled: registration.enabled,
      next_fire_at: registration.schedule ? firstFire(registration.schedule, field) : null,
      event_name: registration.event?.name ?? null,
      filter: registration.event?.filter ?? null,
      config: JSON.stringify(registration.schedule ?? {}),
    };
    const current = existing.find(
      (row) => row.node_id === registration.node && row.type === registration.type,
    );
    if (current) {
      await trx
        .updateTable("trigger_state")
        .set(common)
        .where("resource_id", "=", resource.id)
        .where("node_id", "=", registration.node)
        .execute();
      continue;
    }
    let token: string | undefined;
    if (registration.type === "webhook") {
      token = `${WEBHOOK_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    }
    await trx
      .insertInto("trigger_state")
      .values({
        resource_id: resource.id,
        node_id: registration.node,
        tenant_id: resource.tenantId,
        workspace_id: resource.workspaceId,
        type: registration.type,
        last_fired_at: null,
        token_hash: token ? hashToken(token) : null,
        token_encrypted: token
          ? await encryptFor(
              kernel,
              trx,
              resource.tenantId,
              resource.workspaceId,
              `webhook:${resource.id}:${registration.node}`,
              token,
            )
          : null,
        ...common,
      })
      .execute();
  }
}

async function needScript(trx: Trx, resource: AppliedResource, script: string) {
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

export function registerExecutionHooks(kernel: Kernel) {
  const hooks: Record<string, KindHook> = {
    schedule: {
      async apply(trx, resource) {
        const body = resource.body as unknown as ScheduleBody;
        await needScript(trx, resource, body.script);
        await register(kernel, trx, resource, [
          {
            node: "",
            type: "schedule",
            target: { kind: "script", path: body.script },
            enabled: body.enabled ?? true,
            schedule: {
              cron: body.cron,
              ...(body.timezone ? { timezone: body.timezone } : {}),
              ...(body.input ? { input: body.input } : {}),
            },
          },
        ]);
      },
    },
    trigger: {
      async apply(trx, resource) {
        const body = resource.body as unknown as TriggerBody;
        await needScript(trx, resource, body.script);
        await register(kernel, trx, resource, [
          {
            node: "",
            type: body.type,
            target: { kind: "script", path: body.script },
            enabled: body.enabled ?? true,
            ...(body.type === "event" ? { event: { name: body.event, filter: body.filter } } : {}),
          },
        ]);
      },
    },
    flow: {
      // A flow's trigger nodes are registered like any other trigger, one per node.
      async apply(trx, resource) {
        const body = resource.body as unknown as FlowBody;
        const wanted: Registration[] = [];
        for (const [node, definition] of Object.entries(body.nodes)) {
          if (definition.type !== "trigger" || definition.trigger.type === "manual") continue;
          const trigger: Exclude<FlowTrigger, { type: "manual" }> = definition.trigger;
          wanted.push({
            node,
            type: trigger.type,
            target: { kind: "flow", path: resource.path },
            enabled: true,
            ...(trigger.type === "schedule"
              ? {
                  schedule: {
                    cron: trigger.cron,
                    ...(trigger.timezone ? { timezone: trigger.timezone } : {}),
                  },
                }
              : {}),
            ...(trigger.type === "event"
              ? { event: { name: trigger.event, filter: trigger.filter } }
              : {}),
          });
        }
        await register(kernel, trx, resource, wanted);
      },
    },
  };
  for (const [kind, hook] of Object.entries(hooks)) kernel.hooks.set(kind, hook);
}

export interface TriggerRow {
  resource_id: string;
  node_id: string;
  tenant_id: string;
  workspace_id: string;
  target_kind: "script" | "flow";
  target_path: string;
}

export interface Firing {
  input: unknown;
  trigger: { type: string; detail?: Record<string, unknown> };
  idempotencyKey?: string | undefined;
}

/** Starts what a trigger points at: a run of its script, or a run of its flow from its node. */
export async function startTarget(kernel: Kernel, trx: Trx, state: TriggerRow, firing: Firing) {
  const common = {
    tenantId: state.tenant_id,
    workspaceId: state.workspace_id,
    input: firing.input,
    trigger: firing.trigger,
    startedBy: { type: "trigger", id: null },
    idempotencyKey: firing.idempotencyKey,
  };
  if (state.target_kind === "flow") {
    const { startFlowRun } = await import("../flows/engine.js");
    const started = await startFlowRun(kernel, trx, {
      ...common,
      flow: state.target_path,
      triggerNode: state.node_id,
    });
    return { kind: "flow" as const, id: started.flowRun.id };
  }
  const started = await startRun(kernel, trx, { ...common, script: state.target_path });
  return { kind: "script" as const, id: started.run.id };
}

/** Lets the flow runs a trigger just started take their first step. Call after the transaction commits. */
export async function kickStarted(kernel: Kernel, started: { kind: string; id: string }[]) {
  const flows = started.filter((item) => item.kind === "flow");
  if (flows.length === 0) return;
  const { kickFlow } = await import("../flows/engine.js");
  for (const flow of flows) kickFlow(kernel, flow.id);
}

/** A webhook's token, for showing its address to someone allowed to see it. */
export function webhookToken(
  kernel: Kernel,
  state: {
    resource_id: string;
    node_id: string;
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
    `webhook:${state.resource_id}:${state.node_id}`,
    state.token_encrypted,
  ).catch(() =>
    // Tokens issued before triggers could belong to flows were stored under the shorter name.
    decryptFor(
      kernel,
      kernel.db,
      state.tenant_id,
      state.workspace_id,
      `webhook:${state.resource_id}`,
      state.token_encrypted as Buffer,
    ),
  );
}

/**
 * Starts a run for every schedule that is due. A schedule that missed several
 * times while the instance was down runs once, then waits for its next time.
 */
export async function fireDueSchedules(kernel: Kernel, now = new Date()): Promise<number> {
  let fired = 0;
  for (;;) {
    const started = await kernel.db.transaction().execute(async (trx) => {
      const due = await trx
        .selectFrom("trigger_state")
        .innerJoin("resource", "resource.id", "trigger_state.resource_id")
        .innerJoin("workspace", "workspace.id", "trigger_state.workspace_id")
        .selectAll("trigger_state")
        .select(["resource.body", "resource.path"])
        .where("trigger_state.type", "=", "schedule")
        .where("trigger_state.enabled", "=", true)
        // A paused workspace keeps its due time. It fires once when resumed.
        .where("workspace.triggers_paused", "=", false)
        .where("trigger_state.next_fire_at", "<=", now)
        .orderBy("trigger_state.next_fire_at")
        .limit(1)
        .forUpdate("trigger_state")
        .skipLocked()
        .executeTakeFirst();
      if (!due) return undefined;
      // Schedules registered before flows existed keep their settings on the resource.
      const config = (typeof due.config.cron === "string"
        ? due.config
        : due.body) as unknown as ScheduleConfig;
      const fireTime = due.next_fire_at as Date;
      await trx
        .updateTable("trigger_state")
        .set({ next_fire_at: scheduleSource.nextFire?.(config, now) ?? null, last_fired_at: now })
        .where("resource_id", "=", due.resource_id)
        .where("node_id", "=", due.node_id)
        .execute();
      try {
        return await startTarget(kernel, trx, due, {
          input: config.input ?? {},
          trigger: {
            type: "schedule",
            detail: {
              schedule: due.node_id ? `${due.path}#${due.node_id}` : due.path,
              scheduledFor: fireTime.toISOString(),
            },
          },
          idempotencyKey: `schedule:${due.resource_id}:${due.node_id}:${fireTime.toISOString()}`,
        });
      } catch (error) {
        // A schedule that cannot start, such as one whose input no longer fits, must not block the rest.
        if (!(error instanceof HttpError)) throw error;
        kernel.log.warn(
          { schedule: due.path, reason: error.message },
          "a schedule could not start its run",
        );
        return { kind: "none" as const, id: "" };
      }
    });
    if (!started) return fired;
    await kickStarted(kernel, [started]);
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
    .innerJoin("workspace", "workspace.id", "trigger_state.workspace_id")
    .selectAll("trigger_state")
    .select(["resource.path", "workspace.triggers_paused"])
    .where("trigger_state.token_hash", "=", hashToken(token))
    .where("trigger_state.type", "=", "webhook")
    .executeTakeFirst();
  if (!state?.enabled) return undefined;
  if (state.triggers_paused) return "paused" as const;
  // Not audited: the run itself records the webhook that started it.
  const started = await kernel.db.transaction().execute((trx) =>
    startTarget(kernel, trx, state, {
      input: webhookSource.toInput?.(undefined, { headers: {}, body: payload }),
      trigger: {
        type: "webhook",
        detail: { trigger: state.node_id ? `${state.path}#${state.node_id}` : state.path },
      },
      idempotencyKey,
    }),
  );
  await kickStarted(kernel, [started]);
  return started;
}
