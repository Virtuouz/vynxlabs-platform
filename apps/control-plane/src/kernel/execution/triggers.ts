import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { newId, sql } from "@volvel/db";
import type { FlowBody, FlowTrigger, FormTrigger, WebhookVerify } from "@volvel/manifest";
import type { TriggerSource } from "@volvel/sdk";
import { CronExpressionParser } from "cron-parser";
import type { Trx } from "../audit.js";
import { badRequest, conflict, HttpError, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import type { AppliedResource, KindHook } from "../kinds.js";
import { observe } from "../metrics.js";
import { revealSecret } from "../secrets.js";
import { decryptFor, encryptFor } from "./bindings.js";
import { instanceTriggersPaused } from "./control.js";
import { maskFor, redactText, secretStrings } from "./redact.js";
import { type Relay, startRun, TAG_PATTERN } from "./runs.js";

interface ScheduleConfig {
  cron: string;
  timezone?: string;
  input?: Record<string, unknown>;
  /** A trigger source that is run on each tick, and gives back what is new. */
  source?: string | undefined;
  /** `skip` passes over a time while the last run it started is still going. */
  overlap?: "allow" | "skip" | undefined;
}
interface ScheduleBody extends ScheduleConfig {
  script?: string;
  flow?: string;
  enabled?: boolean;
  tags?: string[];
}
type TriggerBody =
  | {
      type: "webhook";
      script: string;
      enabled?: boolean;
      input?: "body" | "request";
      verify?: WebhookVerify;
      source?: string;
      tags?: string[];
    }
  | {
      type: "event";
      script: string;
      event: string;
      filter?: string;
      enabled?: boolean;
      tags?: string[];
    }
  | ({ type: "form"; script: string; enabled?: boolean } & FormTrigger);

/** The built-in trigger sources, written against the SDK's extension interface. */

/**
 * A condition on a `trigger_state` row joined to its `resource`: the trigger is
 * not paused on its own. A workspace's pause is checked separately.
 */
export const notPausedAlone = sql<boolean>`not exists (
  select 1 from trigger_pause p
  where p.workspace_id = trigger_state.workspace_id
    and p.path = resource.path
    and p.node_id = trigger_state.node_id
)`;

/** Whether one trigger is paused on its own, apart from its workspace. */
export async function pausedAlone(
  kernel: Kernel,
  state: { workspace_id: string; path: string; node_id: string },
): Promise<boolean> {
  const found = await kernel.db
    .selectFrom("trigger_pause")
    .select("path")
    .where("workspace_id", "=", state.workspace_id)
    .where("path", "=", state.path)
    .where("node_id", "=", state.node_id)
    .executeTakeFirst();
  return found !== undefined;
}

/** How many refused requests are kept for one trigger. */
const REFUSALS_KEPT = 20;

/** Why a trigger did not start what it was asked to. */
export type RefusalReason =
  | "signature"
  | "body"
  | "paused"
  /** What it was given does not fit what it starts. */
  | "input"
  /** An event's filter could not be worked out. */
  | "filter"
  /** Its source was still looking, so this time was passed over. */
  | "busy"
  /** Its source failed, or its answer could not be passed on. */
  | "error";

/**
 * Keeps a refusal's reason, never the request's body, and only the latest few. Every type of
 * trigger records here, so that one notice shows why a trigger is not starting anything.
 */
export async function recordRefusal(
  kernel: Kernel,
  state: { tenant_id: string; workspace_id: string; path: string; node_id: string },
  reason: RefusalReason,
  problem = "",
) {
  observe.webhookRefused(kernel.metrics, reason);
  await kernel.db
    .insertInto("webhook_refusal")
    .values({
      id: newId(),
      tenant_id: state.tenant_id,
      workspace_id: state.workspace_id,
      path: state.path,
      node_id: state.node_id,
      reason,
      problem: problem.slice(0, 500),
    })
    .execute();
  await sql`
    delete from webhook_refusal where id in (
      select id from webhook_refusal
      where workspace_id = ${state.workspace_id} and path = ${state.path} and node_id = ${state.node_id}
      order by occurred_at desc offset ${REFUSALS_KEPT}
    )
  `.execute(kernel.db);
}

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
/** A form's address ends in a token of its own kind, so that neither opens the other. */
export const FORM_TOKEN_PREFIX = "vxf_";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** One trigger as it should be registered: a trigger resource, or a trigger node of a flow. */
interface Registration {
  node: string;
  type: "schedule" | "webhook" | "event" | "form";
  target: { kind: "script" | "flow"; path: string };
  enabled: boolean;
  schedule?: ScheduleConfig;
  event?: { name: string; filter?: string | undefined };
  webhook?: WebhookConfig;
  form?: FormTrigger;
  /** CEL expressions that tag each run the trigger starts. */
  tags?: string[] | undefined;
  /** What names the start through a rename of its step: its address and its pause follow it. */
  key?: string | undefined;
}

/** What a webhook does with a request, as its trigger said. Kept with the registered trigger. */
export interface WebhookConfig {
  input?: "body" | "request" | undefined;
  verify?: WebhookVerify | undefined;
  /** A trigger source that is handed each request first. */
  source?: string | undefined;
  /** `flow` holds the request open for the flow to answer. */
  respond?: "now" | "flow" | undefined;
}

/** A request to a webhook's address, as it arrived. */
export interface WebhookRequest {
  method: string;
  /** Lower-case names. A header sent twice is joined with a comma. */
  headers: Record<string, string>;
  query: Record<string, string>;
  /** The body exactly as it was sent. A signature is over these bytes. */
  raw: Buffer;
}

/** Headers that carry a credential of the sender's own, and are not handed to a script or stored. */
const NOT_PASSED_ON = new Set(["authorization", "cookie", "proxy-authorization"]);

/**
 * Checks a request's signature. The comparison takes the same time whatever
 * differs, and a request with a timestamp too old is refused, so a captured
 * request cannot be sent again later.
 */
export function signatureProblem(
  verify: WebhookVerify,
  secret: string,
  request: WebhookRequest,
  now = Date.now(),
): string | undefined {
  const sent = request.headers[verify.header.toLowerCase()];
  if (!sent) return `The ${verify.header} header is missing.`;
  let timestamp = "";
  if (verify.timestampHeader) {
    timestamp = request.headers[verify.timestampHeader.toLowerCase()] ?? "";
    const seconds = Number(timestamp);
    if (!timestamp || !Number.isFinite(seconds)) {
      return `The ${verify.timestampHeader} header is missing or is not a time.`;
    }
    if (Math.abs(now / 1000 - seconds) > (verify.toleranceSeconds ?? 300)) {
      return "The request's timestamp is too far from now.";
    }
  }
  const prefix = verify.prefix ?? "";
  if (!sent.startsWith(prefix)) return "The signature does not match.";
  const signed = Buffer.concat(
    (verify.signed ?? "{body}")
      .split(/(\{body\}|\{timestamp\})/)
      .map((part) =>
        part === "{body}" ? request.raw : Buffer.from(part === "{timestamp}" ? timestamp : part),
      ),
  );
  const expected = createHmac(verify.scheme === "hmac-sha1" ? "sha1" : "sha256", secret)
    .update(signed)
    .digest();
  const given = Buffer.from(sent.slice(prefix.length), verify.encoding ?? "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return "The signature does not match.";
  }
  return undefined;
}

/** A request's body as a value: JSON, a form's fields, or text. Throws on JSON that does not parse. */
export function parseWebhookBody(request: WebhookRequest): unknown {
  const type = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (request.raw.length === 0) return {};
  const text = request.raw.toString("utf8");
  if (type === "application/x-www-form-urlencoded") {
    const fields: Record<string, string | string[]> = {};
    for (const [name, value] of new URLSearchParams(text)) {
      const before = fields[name];
      fields[name] =
        before === undefined ? value : Array.isArray(before) ? [...before, value] : [before, value];
    }
    return fields;
  }
  if (type === "application/json" || type.endsWith("+json") || type === "") return JSON.parse(text);
  return text;
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

/** What names a registered start: its key if it was given one, else its step's name. */
const keyOfRow = (row: { node_id: string; config: unknown }): string => {
  const config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
  const key = (config as { key?: unknown } | null)?.key;
  return typeof key === "string" && key ? key : row.node_id;
};

/**
 * A start whose step was renamed keeps its row, its address, its pause and when it last
 * fired, when its key is the one the row has. `existing` is changed to say where each row is.
 */
async function carryRenamed(
  kernel: Kernel,
  trx: Trx,
  resource: AppliedResource,
  wanted: Registration[],
  existing: {
    node_id: string;
    type: string;
    config: unknown;
    token_encrypted: Buffer | null;
  }[],
) {
  const named = new Set(wanted.map((registration) => registration.node));
  const moves: { from: string; to: string; token: Buffer | null; row: { node_id: string } }[] = [];
  for (const registration of wanted) {
    if (existing.some((row) => row.node_id === registration.node && row.type === registration.type))
      continue;
    const identity = registration.key ?? registration.node;
    const row = existing.find(
      (one) =>
        one.type === registration.type &&
        !named.has(one.node_id) &&
        !moves.some((move) => move.from === one.node_id) &&
        keyOfRow(one) === identity,
    );
    if (row)
      moves.push({ from: row.node_id, to: registration.node, token: row.token_encrypted, row });
  }
  if (moves.length === 0) return;
  // Through a name of their own, so that two steps may swap names.
  const away = (from: string) => `~moving~${from}`;
  const pause = (node: string, to: string) =>
    sql`update trigger_pause set node_id = ${to}
        where workspace_id = ${resource.workspaceId} and path = ${resource.path} and node_id = ${node}`.execute(
      trx,
    );
  const refusals = (node: string, to: string) =>
    sql`update webhook_refusal set node_id = ${to}
        where workspace_id = ${resource.workspaceId} and path = ${resource.path} and node_id = ${node}`.execute(
      trx,
    );
  const tokens = new Map<string, Buffer>();
  for (const move of moves) {
    if (!move.token) continue;
    const token = await webhookToken(kernel, {
      resource_id: resource.id,
      node_id: move.from,
      tenant_id: resource.tenantId,
      workspace_id: resource.workspaceId,
      token_encrypted: move.token,
    });
    if (token)
      tokens.set(
        move.to,
        await encryptFor(
          kernel,
          trx,
          resource.tenantId,
          resource.workspaceId,
          `webhook:${resource.id}:${move.to}`,
          token,
        ),
      );
  }
  for (const move of moves) {
    await trx
      .updateTable("trigger_state")
      .set({ node_id: away(move.from) })
      .where("resource_id", "=", resource.id)
      .where("node_id", "=", move.from)
      .execute();
    await pause(move.from, away(move.from));
    await refusals(move.from, away(move.from));
  }
  for (const move of moves) {
    const token = tokens.get(move.to);
    await trx
      .updateTable("trigger_state")
      .set({ node_id: move.to, ...(token ? { token_encrypted: token } : {}) })
      .where("resource_id", "=", resource.id)
      .where("node_id", "=", away(move.from))
      .execute();
    await pause(away(move.from), move.to);
    await refusals(away(move.from), move.to);
    move.row.node_id = move.to;
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
    .select(["node_id", "type", "config", "next_fire_at", "token_encrypted"])
    .where("resource_id", "=", resource.id)
    .execute();
  await carryRenamed(kernel, trx, resource, wanted, existing);
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
    const current = existing.find(
      (row) => row.node_id === registration.node && row.type === registration.type,
    );
    // An edit that leaves the time alone leaves the schedule's place in time alone: what it was
    // holding, such as a firing due while it was paused, and why it last skipped, stay.
    const before = current?.config as
      | { cron?: string; timezone?: string; lastSkippedAt?: string; lastSkipReason?: string }
      | undefined;
    const sameTime =
      registration.schedule !== undefined &&
      current?.next_fire_at != null &&
      before?.cron === registration.schedule.cron &&
      (before.timezone ?? "UTC") === (registration.schedule.timezone ?? "UTC");
    const common = {
      target_kind: registration.target.kind,
      target_path: registration.target.path,
      enabled: registration.enabled,
      // One that is turned off has no next time: it is worked out afresh when it is turned on.
      next_fire_at: registration.schedule
        ? !registration.enabled
          ? null
          : sameTime && current?.next_fire_at
            ? current.next_fire_at
            : firstFire(registration.schedule, field)
        : null,
      event_name: registration.event?.name ?? null,
      filter: registration.event?.filter ?? null,
      config: JSON.stringify({
        ...(registration.schedule ?? registration.webhook ?? registration.form ?? {}),
        ...(registration.tags?.length ? { tags: registration.tags } : {}),
        ...(sameTime && before?.lastSkippedAt
          ? { lastSkippedAt: before.lastSkippedAt, lastSkipReason: before.lastSkipReason }
          : {}),
        ...(registration.key ? { key: registration.key } : {}),
      }),
    };
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
    if (registration.type === "form") {
      token = `${FORM_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
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

/** The form alone, without what says where it sits and what it starts. */
function formOf(body: FormTrigger): FormTrigger {
  return {
    title: body.title,
    fields: body.fields,
    ...(body.description ? { description: body.description } : {}),
    ...(body.submitLabel ? { submitLabel: body.submitLabel } : {}),
    ...(body.success ? { success: body.success } : {}),
    ...(body.access ? { access: body.access } : {}),
  };
}

/** The flow a schedule starts: it must be there, and have a manual trigger to start from. */
async function needFlow(trx: Trx, resource: AppliedResource, flow: string) {
  const found = await trx
    .selectFrom("resource")
    .select("body")
    .where("workspace_id", "=", resource.workspaceId)
    .where("kind", "=", "flow")
    .where("path", "=", flow)
    .executeTakeFirst();
  if (!found) {
    throw badRequest("The schedule refers to a flow that does not exist.", [
      { path: "/body/flow", message: `no flow has the path "${flow}" in this workspace` },
    ]);
  }
  const nodes = (found.body as unknown as FlowBody).nodes ?? {};
  const manual = Object.values(nodes).some(
    (node) => node.type === "trigger" && node.trigger.type === "manual",
  );
  if (!manual) {
    throw badRequest("The schedule's flow cannot be started by a schedule.", [
      {
        path: "/body/flow",
        message: `the flow "${flow}" has no manual trigger, which is what a schedule starts it from`,
      },
    ]);
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
        const target = body.flow
          ? { kind: "flow" as const, path: body.flow }
          : { kind: "script" as const, path: body.script as string };
        if (target.kind === "flow") await needFlow(trx, resource, target.path);
        else await needScript(trx, resource, target.path);
        await register(kernel, trx, resource, [
          {
            node: "",
            type: "schedule",
            target,
            enabled: body.enabled ?? true,
            tags: body.tags,
            schedule: {
              cron: body.cron,
              ...(body.timezone ? { timezone: body.timezone } : {}),
              ...(body.input ? { input: body.input } : {}),
              ...(body.source ? { source: body.source } : {}),
              ...(body.overlap === "skip" ? { overlap: "skip" as const } : {}),
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
            tags: body.type === "form" ? undefined : body.tags,
            ...(body.type === "event" ? { event: { name: body.event, filter: body.filter } } : {}),
            ...(body.type === "webhook"
              ? { webhook: { input: body.input, verify: body.verify, source: body.source } }
              : {}),
            ...(body.type === "form" ? { form: formOf(body) } : {}),
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
            ...(definition.key ? { key: definition.key } : {}),
            type: trigger.type,
            target: { kind: "flow", path: resource.path },
            enabled: true,
            tags: trigger.type === "form" ? undefined : trigger.tags,
            ...(trigger.type === "schedule"
              ? {
                  schedule: {
                    cron: trigger.cron,
                    ...(trigger.timezone ? { timezone: trigger.timezone } : {}),
                    ...(trigger.source ? { source: trigger.source } : {}),
                    // A flow that is still going when its time comes again is passed over
                    // unless it says otherwise: one that takes longer than its interval
                    // would otherwise pile up without end.
                    ...((trigger.overlap ?? "skip") === "skip" ? { overlap: "skip" as const } : {}),
                  },
                }
              : {}),
            ...(trigger.type === "event"
              ? { event: { name: trigger.event, filter: trigger.filter } }
              : {}),
            ...(trigger.type === "form" ? { form: formOf(trigger) } : {}),
            ...(trigger.type === "webhook"
              ? {
                  webhook: {
                    input: trigger.input,
                    verify: trigger.verify,
                    source: trigger.source,
                    respond: trigger.respond,
                  },
                }
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
    tags: await triggerTags(kernel, trx, state, firing.input),
  };
  if (state.target_kind === "flow") {
    const { startFlowRun } = await import("../flows/engine.js");
    const started = await startFlowRun(kernel, trx, {
      ...common,
      flow: state.target_path,
      // A schedule resource is no node of the flow: the flow starts from its manual trigger.
      triggerNode: state.node_id || undefined,
    });
    return { kind: "flow" as const, id: started.flowRun.id };
  }
  const started = await startRun(kernel, trx, { ...common, script: state.target_path });
  return { kind: "script" as const, id: started.run.id };
}

/**
 * The tags a trigger gives the run it starts: each of its expressions worked
 * out over what it was given. One that fails, or gives something that is not a
 * tag, is left out and logged; it never stops the run.
 */
async function triggerTags(
  kernel: Kernel,
  trx: Trx,
  state: TriggerRow,
  input: unknown,
): Promise<string[]> {
  const row = await trx
    .selectFrom("trigger_state")
    .select("config")
    .where("resource_id", "=", state.resource_id)
    .where("node_id", "=", state.node_id)
    .executeTakeFirst();
  const expressions = (row?.config as { tags?: unknown } | undefined)?.tags;
  if (!Array.isArray(expressions)) return [];
  const tags: string[] = [];
  for (const expression of expressions) {
    try {
      const value = await kernel.expressions.evaluate(
        String(expression),
        { trigger: input },
        state.tenant_id,
      );
      const tag = String(value);
      if (TAG_PATTERN.test(tag)) tags.push(tag);
      else kernel.log.warn({ expression, tag }, "a trigger's tag is not a usable tag; left out");
    } catch (error) {
      kernel.log.warn({ err: error, expression }, "a trigger's tag could not be worked out");
    }
  }
  return tags;
}

/** The most runs one answer of a trigger source may start. */
export const MAX_RELAYED = 100;

/** Says on a source's run that what it gave could not be passed on, and tells who is alerted to failed runs. */
async function failSourceRun(kernel: Kernel, runId: string, message: string) {
  const failed = await kernel.db
    .updateTable("run")
    .set({ status: "failed", error: JSON.stringify({ message }) })
    .where("id", "=", runId)
    .where("status", "=", "succeeded")
    .returningAll()
    .executeTakeFirst();
  if (!failed) return;
  const { sendAlerts } = await import("./alerts.js");
  await sendAlerts(kernel, failed).catch((failure) =>
    kernel.log.error({ err: failure, runId }, "failure alert could not be sent"),
  );
}

/**
 * Passes on what a trigger source gave back: starts the trigger's script or
 * flow once for each input, and keeps a polling source's place.
 *
 * A webhook source answers `{ accept: false }` to start nothing, `{ input }`
 * to start one run, or `{ inputs: [...] }` to start several. A polling source
 * answers `{ items: [...], cursor }`.
 *
 * What is given is passed on whole or not at all. An answer that cannot be
 * passed on (more than `MAX_RELAYED`, or items that are no list) fails the
 * source's run, starts nothing and leaves the cursor where it was, so that the
 * next tick is handed the same place. An item that does not fit what it starts
 * is refused alone and recorded on the source's run: the others start, and the
 * cursor moves, because the same item would be refused again. A failure
 * anywhere else undoes the whole answer, cursor included, and fails the run.
 * Each run started has the key `source:<source run>:<position>`, so passing on
 * the same answer twice starts nothing twice.
 */
export async function relaySource(
  kernel: Kernel,
  run: { id: string; script_path: string; trigger_detail: Record<string, unknown> },
  output: unknown,
): Promise<void> {
  const relay = run.trigger_detail.relay as Relay;
  const state = await kernel.db
    .selectFrom("trigger_state")
    .innerJoin("resource", "resource.id", "trigger_state.resource_id")
    .innerJoin("workspace", "workspace.id", "trigger_state.workspace_id")
    .selectAll("trigger_state")
    .select(["resource.path", "workspace.triggers_paused"])
    .where("trigger_state.resource_id", "=", relay.resourceId)
    .where("trigger_state.node_id", "=", relay.node)
    .executeTakeFirst();
  // The trigger was removed or turned off while its source was running: there is nothing left to show it on.
  if (!state?.enabled) return;
  // It was paused: what the source gave is not started, and the pause says so where refusals are shown.
  if (
    state.triggers_paused ||
    (await instanceTriggersPaused(kernel)) ||
    (await pausedAlone(kernel, state))
  ) {
    await recordRefusal(
      kernel,
      state,
      "paused",
      "The trigger was paused while its source was running, so what the source gave was not started.",
    );
    return;
  }
  const fail = async (message: string) => {
    await failSourceRun(kernel, run.id, message);
    await recordRefusal(kernel, state, "error", message);
  };
  const answer = (typeof output === "object" && output !== null ? output : {}) as {
    accept?: unknown;
    input?: unknown;
    inputs?: unknown;
    items?: unknown;
    cursor?: unknown;
  };
  let inputs: unknown[] = [];
  if (relay.mode === "poll") {
    if (!Array.isArray(answer.items)) {
      await fail(
        "The source did not give a list of items. A polling source answers { items: [...], cursor }. Nothing was started, and the cursor stays where it was.",
      );
      return;
    }
    inputs = answer.items;
  } else if (answer.accept === false) inputs = [];
  else if (Array.isArray(answer.inputs)) inputs = answer.inputs;
  else if ("input" in answer) inputs = [answer.input];
  if (inputs.length > MAX_RELAYED) {
    await fail(
      `The source gave ${inputs.length} items, and one tick may start at most ${MAX_RELAYED}. Nothing was started, and the cursor stays where it was. Give fewer items, with the cursor of the last one.`,
    );
    return;
  }
  const label = state.node_id ? `${state.path}#${state.node_id}` : state.path;
  const refused: { index: number; reason: string }[] = [];
  let started: { kind: string; id: string }[];
  try {
    started = await kernel.db.transaction().execute(async (trx) => {
      refused.length = 0;
      if (relay.mode === "poll" && "cursor" in answer) {
        await trx
          .updateTable("trigger_state")
          .set({ cursor: JSON.stringify(answer.cursor ?? null) })
          .where("resource_id", "=", relay.resourceId)
          .where("node_id", "=", relay.node)
          .execute();
      }
      const made: { kind: string; id: string }[] = [];
      for (const [index, input] of inputs.entries()) {
        try {
          made.push(
            await startTarget(kernel, trx, state, {
              input,
              trigger: {
                type: relay.mode === "poll" ? "schedule" : "webhook",
                detail: { trigger: label, source: run.script_path, sourceRun: run.id },
              },
              idempotencyKey: `source:${run.id}:${index}`,
            }),
          );
        } catch (error) {
          // One input that does not fit what it starts must not stop the others.
          if (!(error instanceof HttpError)) throw error;
          refused.push({ index, reason: error.message });
        }
      }
      if (made.length > 0) {
        await trx
          .updateTable("trigger_state")
          .set({ last_fired_at: new Date() })
          .where("resource_id", "=", relay.resourceId)
          .where("node_id", "=", relay.node)
          .execute();
      }
      return made;
    });
  } catch (error) {
    // Nothing was started and the cursor did not move: the next tick is handed the same place.
    await fail(
      `What the source gave could not be passed on: ${(error as Error).message} Nothing was started, and the cursor stays where it was.`,
    );
    throw error;
  }
  const [first] = refused;
  if (first) {
    const said = `${refused.length} of ${inputs.length} could not start a run. The ${ordinal(first.index + 1)}: ${first.reason}`;
    await recordRefusal(
      kernel,
      state,
      "input",
      `${said} Each is kept in the output of the source's run ${run.id}, under "refused", by its place in "items".`,
    );
    // The run's own output names each one, by its place in the list the source gave.
    await kernel.db
      .updateTable("run")
      .set({ output: sql`output || ${JSON.stringify({ refused })}::jsonb` })
      .where("id", "=", run.id)
      .where("output_ref", "is", null)
      .where(sql<boolean>`jsonb_typeof(output) = 'object'`)
      .execute();
    // Told once for the whole pass, through the alert people have set for failed runs.
    const row = await kernel.db
      .selectFrom("run")
      .selectAll()
      .where("id", "=", run.id)
      .executeTakeFirst();
    if (row) {
      const { sendAlerts } = await import("./alerts.js");
      await sendAlerts(kernel, {
        ...row,
        error: {
          message: `${said} They are kept in the output of this run, under "refused". The others were started.`,
        },
      }).catch((failure) =>
        kernel.log.error({ err: failure, runId: run.id }, "failure alert could not be sent"),
      );
    }
  }
  await kickStarted(kernel, started);
}

const ordinal = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

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
  // Paused for the whole instance: every schedule keeps its due time, and fires once on resuming.
  if (await instanceTriggersPaused(kernel)) return 0;
  const backlogLimit = kernel.config.limits.scheduleBacklogLimit;
  let fired = 0;
  for (;;) {
    const last: Passed = {};
    let started: Awaited<ReturnType<typeof fireOneDue>>;
    try {
      started = await fireOneDue(last);
    } catch (error) {
      if (!(error instanceof ScheduleStartFailed)) throw error;
      // The start is rolled back with all it did. The schedule moves on to its next time in
      // a transaction of its own, so that it is not the first due one again at every tick
      // and the schedules behind it still fire.
      kernel.log.error(
        { schedule: error.label, err: error.cause },
        "a schedule could not start its run, and was moved on to its next time",
      );
      await recordRefusal(kernel, error.due, "error", error.message);
      await kernel.db
        .updateTable("trigger_state")
        .set({ next_fire_at: scheduleSource.nextFire?.(error.config, now) ?? null })
        .where("resource_id", "=", error.due.resource_id)
        .where("node_id", "=", error.due.node_id)
        .execute();
      continue;
    }
    if (!started) return fired;
    // "Last fired" is when something started: not a time that was passed over or refused.
    if (started.kind !== "none" && last.which) {
      await kernel.db
        .updateTable("trigger_state")
        .set({ last_fired_at: now })
        .where("resource_id", "=", last.which.resourceId)
        .where("node_id", "=", last.which.nodeId)
        .execute();
    }
    await kickStarted(kernel, [started]);
    fired += 1;
  }

  function fireOneDue(last: Passed) {
    return kernel.db.transaction().execute(async (trx) => {
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
        // A trigger paused on its own keeps its due time too.
        .where(notPausedAlone)
        .where("trigger_state.next_fire_at", "<=", now)
        .orderBy("trigger_state.next_fire_at")
        .limit(1)
        .forUpdate("trigger_state")
        .skipLocked()
        .executeTakeFirst();
      if (!due) return undefined;
      last.which = { resourceId: due.resource_id, nodeId: due.node_id };
      // Schedules registered before flows existed keep their settings on the resource.
      const config = (typeof due.config.cron === "string"
        ? due.config
        : due.body) as unknown as ScheduleConfig;
      const fireTime = due.next_fire_at as Date;
      await trx
        .updateTable("trigger_state")
        .set({ next_fire_at: scheduleSource.nextFire?.(config, now) ?? null })
        .where("resource_id", "=", due.resource_id)
        .where("node_id", "=", due.node_id)
        .execute();
      /** Passes over this time, and says why on the trigger. */
      const skip = async (reason: "overlap" | "backlog") => {
        await trx
          .updateTable("trigger_state")
          .set({
            config: sql`config || jsonb_build_object('lastSkippedAt', ${fireTime.toISOString()}::text, 'lastSkipReason', ${reason}::text)`,
          })
          .where("resource_id", "=", due.resource_id)
          .where("node_id", "=", due.node_id)
          .execute();
        return { kind: "none" as const, id: "" };
      };
      // A workspace whose queue is already long gains nothing from more: the time is passed
      // over, so that a backlog, such as one left by an outage, cannot grow without end.
      if (backlogLimit > 0 && (await queuedAtLeast(trx, due.workspace_id, backlogLimit))) {
        return skip("backlog");
      }
      try {
        const label = due.node_id ? `${due.path}#${due.node_id}` : due.path;
        // "Skip a time while its last run goes" holds for a schedule with a source too: the runs
        // it started carry the schedule's name as the trigger, not as the schedule.
        if (config.source && config.overlap === "skip" && (await stillGoing(trx, due, label))) {
          return skip("overlap");
        }
        if (config.source) {
          const made = await startSourceRun(kernel, trx, due, config, fireTime);
          if (made === "busy") return { kind: "none" as const, id: "" };
          return { kind: "script" as const, id: made.run.id };
        }
        if (config.overlap === "skip" && (await stillGoing(trx, due, label))) {
          return skip("overlap");
        }
        return await startTarget(kernel, trx, due, {
          input: config.input ?? {},
          trigger: {
            type: "schedule",
            detail: {
              trigger: due.node_id ? `${due.path}#${due.node_id}` : due.path,
              scheduledFor: fireTime.toISOString(),
            },
          },
          idempotencyKey: `schedule:${due.resource_id}:${due.node_id}:${fireTime.toISOString()}`,
        });
      } catch (error) {
        // A schedule that cannot start, such as one whose input no longer fits, must not block the rest.
        if (!(error instanceof HttpError)) {
          throw new ScheduleStartFailed(
            error,
            due,
            due.node_id ? `${due.path}#${due.node_id}` : due.path,
            config,
          );
        }
        kernel.log.warn(
          { schedule: due.path, reason: error.message },
          "a schedule could not start its run",
        );
        await recordRefusal(kernel, due, "input", error.message);
        return { kind: "none" as const, id: "" };
      }
    });
  }
}

/**
 * Starts the run of a schedule's source, which finds what is new and hands it on once it ends
 * (`relaySource`). Shared by a time that is due and by Fire now, so that both start the same
 * thing. One at a time: a tick that comes while the last is still looking is passed over, so
 * that two never start from the same place, and says so where refusals are shown.
 */
async function startSourceRun(
  kernel: Kernel,
  trx: Trx,
  state: TriggerRow & { path: string; cursor: unknown },
  config: ScheduleConfig & { source?: string | undefined },
  fireTime: Date,
  manual = false,
) {
  const busy = await sql<{ id: string }>`
    select id from run
    where workspace_id = ${state.workspace_id}
      and status in ('queued', 'running')
      and trigger_detail->'relay'->>'resourceId' = ${state.resource_id}
      and trigger_detail->'relay'->>'node' = ${state.node_id}
    limit 1
  `.execute(trx);
  if (busy.rows.length > 0) {
    // Someone who asked for it is told so, and needs no record of a time passed over.
    if (!manual) {
      await recordRefusal(
        kernel,
        state,
        "busy",
        "The source was still looking from the last tick, so this time was passed over.",
      );
    }
    return "busy" as const;
  }
  return startRun(kernel, trx, {
    tenantId: state.tenant_id,
    workspaceId: state.workspace_id,
    script: config.source as string,
    input: { cursor: state.cursor ?? null, scheduledFor: fireTime.toISOString() },
    trigger: {
      type: "schedule",
      detail: {
        trigger: state.node_id ? `${state.path}#${state.node_id}` : state.path,
        scheduledFor: fireTime.toISOString(),
        ...(manual ? { manual: true } : {}),
      },
    },
    startedBy: { type: "trigger", id: null },
    ...(manual
      ? {}
      : {
          idempotencyKey: `poll:${state.resource_id}:${state.node_id}:${fireTime.toISOString()}`,
        }),
    relay: { resourceId: state.resource_id, node: state.node_id, mode: "poll" },
  });
}

/** The schedule a pass took up, for what is written once its start is done. */
interface Passed {
  which?: { resourceId: string; nodeId: string };
}

/** What went wrong that is not the schedule's own to fix, such as a bundle that cannot be read. */
class ScheduleStartFailed extends Error {
  constructor(
    override readonly cause: unknown,
    readonly due: TriggerRow & { path: string },
    readonly label: string,
    readonly config: ScheduleConfig,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/** Whether a workspace has at least `limit` runs waiting. Counts no further than that. */
async function queuedAtLeast(trx: Trx, workspaceId: string, limit: number): Promise<boolean> {
  const found = await sql<{ n: number }>`
    select count(*)::int as n from (
      select 1 from run where workspace_id = ${workspaceId} and status = 'queued' limit ${limit}
    ) waiting
  `.execute(trx);
  return (found.rows[0]?.n ?? 0) >= limit;
}

/** Whether the last run a schedule started is still queued or going. */
async function stillGoing(trx: Trx, state: TriggerRow, label: string): Promise<boolean> {
  const table = state.target_kind === "flow" ? "flow_run" : "run";
  const going =
    state.target_kind === "flow" ? sql`status = 'running'` : sql`status in ('queued', 'running')`;
  const found = await sql<{ id: string }>`
    select id from ${sql.table(table)}
    where workspace_id = ${state.workspace_id} and trigger_type = 'schedule'
      and coalesce(trigger_detail->>'trigger', trigger_detail->>'schedule') = ${label} and ${going}
    limit 1
  `.execute(trx);
  return found.rows.length > 0;
}

/**
 * Starts one run of a schedule now, as its next time would, without moving
 * that time. The run says it was started by hand.
 */
export async function fireScheduleNow(
  kernel: Kernel,
  trx: Trx,
  workspaceId: string,
  path: string,
  /** A flow's own schedule trigger, by its node. Empty for a schedule resource. */
  node = "",
) {
  const state = await trx
    .selectFrom("trigger_state")
    .innerJoin("resource", "resource.id", "trigger_state.resource_id")
    .selectAll("trigger_state")
    .where("trigger_state.workspace_id", "=", workspaceId)
    .where("trigger_state.type", "=", "schedule")
    .where("trigger_state.node_id", "=", node)
    .where("resource.path", "=", path)
    .executeTakeFirst();
  if (!state) throw notFound(node ? `The schedule ${node} of ${path}` : `The schedule ${path}`);
  // A schedule that is turned off may be fired, to try it. One that is paused may not: the
  // pause says nothing is to start, and a person who paused it is owed that.
  const workspace = await trx
    .selectFrom("workspace")
    .select("triggers_paused")
    .where("id", "=", workspaceId)
    .executeTakeFirst();
  if (await instanceTriggersPaused(kernel, trx))
    throw conflict(
      "Every trigger in this instance is paused, so this schedule cannot be fired now.",
    );
  if (workspace?.triggers_paused)
    throw conflict("This workspace's triggers are paused, so this schedule cannot be fired now.");
  if (await pausedAlone(kernel, { ...state, path }))
    throw conflict("This schedule is paused, so it cannot be fired now. Resume it first.");
  const config = state.config as unknown as ScheduleConfig;
  if (config.source) {
    const made = await startSourceRun(kernel, trx, { ...state, path }, config, new Date(), true);
    if (made === "busy") {
      throw conflict(
        "The source is still looking from the last time. Try again when it has finished.",
      );
    }
    await markFired(trx, state);
    return { kind: "script" as const, id: made.run.id };
  }
  const started = await startTarget(kernel, trx, state, {
    input: config.input ?? {},
    trigger: {
      type: "schedule",
      detail: {
        trigger: node ? `${path}#${node}` : path,
        scheduledFor: new Date().toISOString(),
        manual: true,
      },
    },
  });
  await markFired(trx, state);
  return started;
}

/** Firing a schedule now is a firing: "Last fired" says when, as for its own time. */
async function markFired(trx: Trx, state: { resource_id: string; node_id: string }) {
  await trx
    .updateTable("trigger_state")
    .set({ last_fired_at: new Date() })
    .where("resource_id", "=", state.resource_id)
    .where("node_id", "=", state.node_id)
    .execute();
}

/** The next times a schedule fires, as the scheduler works them out. Throws on a bad cron. */
export function nextFireTimes(cron: string, timezone: string | undefined, count = 5): Date[] {
  if (cron.trim().split(/\s+/).length !== 5) throw new Error("it must have five fields");
  const times: Date[] = [];
  let after = new Date();
  for (let i = 0; i < count; i += 1) {
    const next = scheduleSource.nextFire?.({ cron, ...(timezone ? { timezone } : {}) }, after);
    if (!next) break;
    times.push(next);
    after = next;
  }
  return times;
}

/** A form trigger as its page needs it. Undefined for an address that is no form of this tenant's. */
export async function findForm(kernel: Kernel, tenantId: string, token: string) {
  if (!token.startsWith(FORM_TOKEN_PREFIX)) return undefined;
  const state = await kernel.db
    .selectFrom("trigger_state")
    .innerJoin("resource", "resource.id", "trigger_state.resource_id")
    .innerJoin("workspace", "workspace.id", "trigger_state.workspace_id")
    .selectAll("trigger_state")
    .select(["resource.path", "workspace.triggers_paused"])
    .where("trigger_state.token_hash", "=", hashToken(token))
    .where("trigger_state.type", "=", "form")
    .where("trigger_state.tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!state?.enabled) return undefined;
  const paused =
    state.triggers_paused ||
    (await pausedAlone(kernel, state)) ||
    (await instanceTriggersPaused(kernel));
  return { state, form: state.config as unknown as FormTrigger, paused };
}

/**
 * Starts what a form starts, with what was sent to it. `key` was made with
 * the page, so sending the same page twice starts one run.
 */
export async function submitForm(
  kernel: Kernel,
  found: NonNullable<Awaited<ReturnType<typeof findForm>>>,
  input: Record<string, unknown>,
  by: { type: string; id: string } | undefined,
  key: string | undefined,
) {
  const { state } = found;
  const label = state.node_id ? `${state.path}#${state.node_id}` : state.path;
  const started = await kernel.db.transaction().execute((trx) =>
    startTarget(kernel, trx, state, {
      input,
      trigger: { type: "form", detail: { trigger: label, ...(by ? { submittedBy: by } : {}) } },
      idempotencyKey: key ? `form:${state.resource_id}:${state.node_id}:${key}` : undefined,
    }),
  );
  await kernel.db
    .updateTable("trigger_state")
    .set({ last_fired_at: new Date() })
    .where("resource_id", "=", state.resource_id)
    .where("node_id", "=", state.node_id)
    .execute();
  await kickStarted(kernel, [started]);
  return started;
}

/**
 * Starts the run for an incoming webhook request. Returns undefined for an
 * unknown token, and says so when the workspace is paused, the signature does
 * not check, or the body cannot be read.
 */
export async function fireWebhook(
  kernel: Kernel,
  token: string,
  request: WebhookRequest,
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
  // What holds it, widest first, so the answer says whose pause it is (OPS-37).
  const heldBy = (await instanceTriggersPaused(kernel))
    ? ("instance" as const)
    : state.triggers_paused
      ? ("workspace" as const)
      : (await pausedAlone(kernel, state))
        ? ("trigger" as const)
        : undefined;
  if (heldBy) {
    await recordRefusal(kernel, state, "paused");
    return { refused: "paused" as const, heldBy };
  }
  const config = state.config as WebhookConfig;
  if (config.verify) {
    const secret = await revealSecret(kernel.db, kernel.vault, {
      tenantId: state.tenant_id,
      workspaceId: state.workspace_id,
      name: config.verify.secret,
    });
    // With no secret to check against, nothing can be let through. The sender is told what it is
    // told for a wrong signature; what is kept for the operator says which secret is missing.
    const problem =
      secret === undefined
        ? "The signature does not match."
        : signatureProblem(config.verify, secret, request);
    if (problem) {
      await recordRefusal(
        kernel,
        state,
        "signature",
        secret === undefined
          ? `The secret ${config.verify.secret} is not set in this workspace.`
          : problem,
      );
      return { refused: "signature" as const, problem };
    }
  }
  let body: unknown;
  try {
    body = parseWebhookBody(request);
  } catch {
    await recordRefusal(kernel, state, "body", "The body is not valid JSON.");
    return { refused: "body" as const, problem: "The body is not valid JSON." };
  }
  const headers = Object.fromEntries(
    Object.entries(request.headers).filter(([name]) => !NOT_PASSED_ON.has(name)),
  );
  const label = state.node_id ? `${state.path}#${state.node_id}` : state.path;
  if (config.source) {
    // The source decides, on a worker, whether this request starts anything and with what.
    const source = config.source;
    const started = await kernel.db.transaction().execute(async (trx) => {
      const made = await startRun(kernel, trx, {
        tenantId: state.tenant_id,
        workspaceId: state.workspace_id,
        script: source,
        input: {
          method: request.method,
          headers,
          query: request.query,
          body,
          rawBody: request.raw.toString("utf8"),
        },
        trigger: { type: "webhook", detail: { trigger: label } },
        startedBy: { type: "trigger", id: null },
        idempotencyKey,
        relay: { resourceId: state.resource_id, node: state.node_id, mode: "webhook" },
      });
      return { kind: "script" as const, id: made.run.id };
    });
    return { started };
  }
  const input =
    config.input === "request"
      ? {
          method: request.method,
          headers,
          query: request.query,
          body,
          rawBody: request.raw.toString("utf8"),
        }
      : webhookSource.toInput?.(undefined, { headers, body });
  // Not audited: the run itself records the webhook that started it.
  const started = await kernel.db
    .transaction()
    .execute((trx) =>
      startTarget(kernel, trx, state, {
        input,
        trigger: {
          type: "webhook",
          detail: { trigger: state.node_id ? `${state.path}#${state.node_id}` : state.path },
        },
        idempotencyKey,
      }),
    )
    .catch(async (error) => {
      // A request that does not fit what it starts is answered with why, and kept where refusals are shown.
      // What is kept says why, without a secret of the request that the message quotes.
      if (error instanceof HttpError)
        await recordRefusal(
          kernel,
          state,
          "input",
          redactText(error.message, maskFor(secretStrings(input))),
        );
      throw error;
    });
  await kernel.db
    .updateTable("trigger_state")
    .set({ last_fired_at: new Date() })
    .where("resource_id", "=", state.resource_id)
    .where("node_id", "=", state.node_id)
    .execute();
  await kickStarted(kernel, [started]);
  return { started, awaits: config.respond === "flow" && started.kind === "flow" };
}
