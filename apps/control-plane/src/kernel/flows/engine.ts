import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { newId, type StepStatus, sql } from "@volvel/db";
import {
  type FlowBody,
  type FlowEdge,
  type FlowGrants,
  type FlowNode,
  keyOf,
  OTHERWISE,
  reachableFrom,
  validateJson,
} from "@volvel/manifest";
import type { Trx } from "../audit.js";
import { badRequest, conflict, HttpError, notFound } from "../errors.js";
import { bundleManifest } from "../execution/bundles.js";
import { redactText, summarize } from "../execution/redact.js";
import {
  alreadyEnded,
  announceCanceled,
  cancelRun,
  MAX_TAGS,
  refuseUnstorable,
  startRun,
  storable,
  storePayload,
  takeCanceled,
} from "../execution/runs.js";
import { inputWords } from "../input-words.js";
import type { Kernel } from "../kernel.js";
import { observe } from "../metrics.js";
import { type AliasUse, formerPaths, resolveResource } from "../resolve.js";
import { traceFlowRun, traceFor } from "../trace.js";
import { expireLinks, mailApprovers } from "./approval-links.js";
import { resolveApprovers } from "./approvers.js";
import { buildContext, type ContextStep, readOutput, tooLargeIn } from "./context.js";
import { ExpressionError } from "./expressions.js";
import { flowKnown } from "./known.js";

/** The most items one foreach will run. More than this belongs in a script. */
export const MAX_FOREACH_ITEMS = 1000;

export interface StartFlowRun {
  tenantId: string;
  workspaceId: string;
  flow: string;
  /** The trigger node that fired. Default: the flow's manual trigger. */
  triggerNode?: string | undefined;
  input: unknown;
  trigger: { type: string; detail?: Record<string, unknown> };
  startedBy: { type: string; id: string | null };
  idempotencyKey?: string | undefined;
  /** Use the flow from this bundle, not the workspace's active one. For sub-flows. */
  bundleId?: string | undefined;
  parent?: { flowRunId: string; node: string; item: string } | undefined;
  /** Tags the flow run starts with, from its trigger or the run it repeats. */
  tags?: string[] | undefined;
  /** The flow run this one retries. With `seed`, what it already did is kept. */
  retryOf?: string | undefined;
  /** Keep what the retried flow run already did, and run only what failed and what follows. */
  seed?: boolean | undefined;
  /**
   * With `seed`: run this node and everything after it again even where it was
   * done, keeping only what comes before it. Testing a flow from one step.
   */
  rerunFrom?: string | undefined;
}

type StepRow = {
  flow_run_id: string;
  node_id: string;
  item_key: string;
  status: StepStatus;
  output_name: string | null;
  output: unknown;
  output_ref: string | null;
  error: { message: string } | null;
  handled: boolean;
  run_id: string | null;
  child_flow_run_id: string | null;
  wake_at: Date | null;
  detail: Record<string, unknown>;
};

const ACTIVE: StepStatus[] = ["running", "waiting"];
const isActive = (step: StepRow) => ACTIVE.includes(step.status);
const stepKey = (node: string, item = "") => `${node}\u0000${item}`;

/**
 * What starting a flow would refuse, found out without starting it: the flow is in the bundle,
 * it has a manual trigger (or the named one), and the input is what that trigger takes. A page's
 * action asks this before its data is saved, and a start asks it again.
 */
export async function checkFlowStart(
  kernel: Kernel,
  trx: Trx | Kernel["db"],
  request: StartFlowRun,
) {
  const workspace = await trx
    .selectFrom("workspace")
    .select(["id", "active_bundle_id"])
    .where("id", "=", request.workspaceId)
    .where("tenant_id", "=", request.tenantId)
    .executeTakeFirst();
  const bundleId = request.bundleId ?? workspace?.active_bundle_id;
  const bundle = bundleId
    ? await trx
        .selectFrom("bundle")
        .select(["id", "storage_key"])
        .where("id", "=", bundleId)
        .where("workspace_id", "=", request.workspaceId)
        .executeTakeFirst()
    : undefined;
  let manifest = bundle ? await bundleManifest(kernel, bundle, "flow", request.flow) : undefined;
  let alias: AliasUse | undefined;
  if (workspace && bundle && !manifest && !request.bundleId) {
    // Asked for by a path it had before it was renamed, it still starts while the alias lasts.
    const found = await resolveResource(trx, request.workspaceId, request.flow, { kind: "flow" });
    if (found?.via === "alias") {
      alias = found.alias;
      request = { ...request, flow: found.resource.path };
      manifest = await bundleManifest(kernel, bundle, "flow", request.flow);
    }
  }
  if (!workspace || !bundle || !manifest) throw notFound(`The flow ${request.flow}`);
  const body = manifest.body as unknown as FlowBody;

  const triggerNode =
    request.triggerNode ??
    Object.entries(body.nodes).find(
      ([, node]) => node.type === "trigger" && node.trigger.type === "manual",
    )?.[0];
  if (!triggerNode || body.nodes[triggerNode]?.type !== "trigger") {
    throw badRequest(
      request.triggerNode
        ? `The flow ${request.flow} has no trigger "${request.triggerNode}".`
        : `The flow ${request.flow} has no manual trigger, so it cannot be started by hand.`,
    );
  }

  // A manual trigger may say what its input must be, as a script's input does.
  const entry = body.nodes[triggerNode];
  if (entry?.type === "trigger" && entry.trigger.type === "manual" && entry.trigger.input) {
    const issues = validateJson(entry.trigger.input, request.input ?? {}, "/input");
    if (issues.length > 0) {
      throw badRequest(`The flow ${request.flow} refused its input. ${inputWords(issues)}`, issues);
    }
  }
  return { request, workspace, bundle, manifest, body, alias, triggerNode };
}

/**
 * Starts a flow run in the caller's transaction: one trigger firing. Starting
 * again with the same idempotency key returns the first run.
 */
export async function startFlowRun(kernel: Kernel, trx: Trx, startRequest: StartFlowRun) {
  const { request, bundle, manifest, body, alias, triggerNode } = await checkFlowStart(
    kernel,
    trx,
    startRequest,
  );
  // By the key the bundle gives it: the flow may have been renamed since that bundle.
  const resource = await trx
    .selectFrom("resource")
    .select("id")
    .where("workspace_id", "=", request.workspaceId)
    .where("kind", "=", "flow")
    .where("key", "=", keyOf(manifest))
    .executeTakeFirst();

  const key = request.idempotencyKey ?? randomUUID();
  if (request.idempotencyKey !== undefined) {
    const earlier = await trx
      .selectFrom("flow_run")
      .selectAll()
      .where("workspace_id", "=", request.workspaceId)
      // The same request sent again after the flow was renamed finds its first run.
      .where("flow_path", "in", [
        request.flow,
        ...(resource ? await formerPaths(trx, resource.id) : []),
      ])
      .where("idempotency_key", "=", key)
      .executeTakeFirst();
    if (earlier) return { created: false, flowRun: earlier, alias };
  }

  const id = newId();
  // A flow a step started is part of that step's flow run's trace.
  const above = request.parent
    ? await trx
        .selectFrom("flow_run")
        .select("trace_id")
        .where("id", "=", request.parent.flowRunId)
        .executeTakeFirst()
    : undefined;
  const trace = traceFor(
    request.parent ? { traceId: above?.trace_id ?? null, ...request.parent } : undefined,
  );
  refuseUnstorable(request.input);
  const input = await storePayload(kernel, id, "input", request.input ?? {}, "flow-runs");
  const flowRun = await trx
    .insertInto("flow_run")
    .values({
      id,
      tenant_id: request.tenantId,
      workspace_id: request.workspaceId,
      resource_id: resource?.id ?? null,
      flow_path: request.flow,
      bundle_id: bundle.id,
      trigger_node: triggerNode,
      trigger_type: request.trigger.type,
      trigger_detail: JSON.stringify(storable(request.trigger.detail ?? {})),
      status: "running",
      input: input.inline,
      input_ref: input.ref,
      parent_flow_run_id: request.parent?.flowRunId ?? null,
      parent_node: request.parent?.node ?? null,
      parent_item: request.parent?.item ?? null,
      started_by_type: request.startedBy.type,
      started_by_id: request.startedBy.id,
      ...trace,
      idempotency_key: key,
      tags: [...new Set(request.tags ?? [])].slice(0, MAX_TAGS),
      retry_of: request.retryOf ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  // The trigger is the first step, already done. Its output is what the trigger received.
  await trx
    .insertInto("step_run")
    .values({
      flow_run_id: id,
      node_id: triggerNode,
      status: "succeeded",
      output: input.inline,
      output_ref: input.ref,
      finished_at: new Date(),
    })
    .execute();
  if (request.seed && request.retryOf) {
    await seedRetry(kernel, trx, {
      from: request.retryOf,
      to: id,
      body,
      triggerNode,
      rerunFrom: request.rerunFrom,
    });
  }
  return { created: true, flowRun, alias };
}

/**
 * The nodes of a finished flow run that a retry keeps: done, skipped, or failed
 * with the failure handled, and with everything before them kept too. The rest
 * runs again. The trigger that fired is kept: the retry gets the same input.
 */
export function keptNodes(
  body: FlowBody,
  steps: { node_id: string; item_key: string; status: string; handled: boolean }[],
  triggerNode: string,
): Set<string> {
  const top = new Map(
    steps.filter((step) => step.item_key === "").map((one) => [one.node_id, one]),
  );
  const done = (node: string) => {
    const step = top.get(node);
    return (
      step !== undefined &&
      (step.status === "succeeded" ||
        step.status === "skipped" ||
        (step.status === "failed" && step.handled))
    );
  };
  const kept = new Set([triggerNode]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const node of Object.keys(body.nodes)) {
      if (kept.has(node) || !done(node)) continue;
      // A node before it that never ran sent nothing this way; one that ran must be kept.
      const before = body.edges.filter((edge) => edge.to === node).map((edge) => edge.from);
      if (before.every((from) => kept.has(from) || !top.has(from))) {
        kept.add(node);
        changed = true;
      }
    }
  }
  return kept;
}

/** A node and every node after it, by the flow's edges. */
export function downstreamOf(body: FlowBody, start: string): Set<string> {
  const found = new Set([start]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const edge of body.edges) {
      if (found.has(edge.from) && !found.has(edge.to)) {
        found.add(edge.to);
        changed = true;
      }
    }
  }
  return found;
}

/**
 * Copies what a retried flow run already did into its retry: the steps of every
 * kept node, each with its output in the step itself, and anything stored copied
 * to the retry's own keys. The retry then needs nothing of the run it retries,
 * which may be removed by retention before the retry ends.
 */
async function seedRetry(
  kernel: Kernel,
  trx: Trx,
  {
    from,
    to,
    body,
    triggerNode,
    rerunFrom,
  }: {
    from: string;
    to: string;
    body: FlowBody;
    triggerNode: string;
    rerunFrom?: string | undefined;
  },
) {
  const steps = await trx
    .selectFrom("step_run")
    .selectAll()
    .where("flow_run_id", "=", from)
    .execute();
  const kept = keptNodes(body, steps, triggerNode);
  if (rerunFrom) for (const node of downstreamOf(body, rerunFrom)) kept.delete(node);
  const copyStored = async (ref: string, name: string) => {
    const key = `flow-runs/${to}/${name}.json`;
    await kernel.storage.put(key, await kernel.storage.get(ref), "application/json");
    return key;
  };
  for (const step of steps) {
    if (step.node_id === triggerNode || !kept.has(step.node_id)) continue;
    let output: unknown = step.output;
    let outputRef = step.output_ref;
    if (step.run_id) {
      const run = await trx
        .selectFrom("run")
        .select(["output", "output_ref"])
        .where("id", "=", step.run_id)
        .executeTakeFirst();
      output = run?.output ?? null;
      outputRef = run?.output_ref ?? null;
    } else if (step.child_flow_run_id) {
      const child = await trx
        .selectFrom("flow_run")
        .select(["output", "output_ref"])
        .where("id", "=", step.child_flow_run_id)
        .executeTakeFirst();
      // A large answer is copied to the retry's own key, as a script's is: the retry then
      // needs nothing of the run it retries.
      output = child?.output_ref ? null : (child?.output ?? null);
      outputRef = child?.output_ref ?? null;
    }
    const name = `${step.node_id}${step.item_key ? `-${step.item_key}` : ""}`;
    await trx
      .insertInto("step_run")
      .values({
        flow_run_id: to,
        node_id: step.node_id,
        item_key: step.item_key,
        status: step.status,
        output_name: step.output_name,
        output: output === null || output === undefined ? null : JSON.stringify(output),
        output_ref: outputRef ? await copyStored(outputRef, name) : null,
        error: step.error ? JSON.stringify(step.error) : null,
        handled: step.handled,
        detail: JSON.stringify({
          ...step.detail,
          copiedFrom: {
            flowRunId: from,
            ...(step.run_id ? { runId: step.run_id } : {}),
            ...(step.child_flow_run_id ? { childFlowRunId: step.child_flow_run_id } : {}),
          },
        }),
        decided_by: step.decided_by,
        decided_by_type: step.decided_by_type,
        decided_via: step.decided_via,
        decision_comment: step.decision_comment,
        started_at: step.started_at,
        finished_at: step.finished_at,
      } as never)
      .execute();
  }
}

/** Moves a flow run on, without waiting for it and without ever throwing. */
export function kickFlow(kernel: Kernel, flowRunId: string): void {
  advance(kernel, flowRunId).catch((error) =>
    kernel.log.error({ err: error, flowRunId }, "a flow run could not be advanced"),
  );
}

interface Finished {
  status: "succeeded" | "failed" | "cancelled";
  flowRun: {
    id: string;
    tenant_id: string;
    workspace_id: string;
    flow_path: string;
    parent_flow_run_id: string | null;
    trigger_detail: Record<string, unknown>;
  };
  error?: { message: string } | undefined;
}

/**
 * Moves a flow run as far as it can go: settles the steps whose work has
 * ended, starts every node that has become ready, and repeats until nothing
 * more can move. It all happens in one transaction under a lock per flow run,
 * so state is saved with each step and two callers cannot advance the same
 * run at once. Safe to call at any time, any number of times.
 */
export async function advance(kernel: Kernel, flowRunId: string): Promise<void> {
  const started: string[] = [];
  const asking: string[] = [];
  let canceled: ReturnType<typeof takeCanceled> = [];
  let canceledFlowRuns: Finished["flowRun"][] = [];
  const finished = await kernel.db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${flowRunId}, 1))`.execute(trx);
    const flowRun = await trx
      .selectFrom("flow_run")
      .selectAll()
      .where("id", "=", flowRunId)
      .executeTakeFirst();
    if (flowRun?.status !== "running") return undefined;
    const bundle = await trx
      .selectFrom("bundle")
      .select(["id", "storage_key"])
      .where("id", "=", flowRun.bundle_id)
      .executeTakeFirstOrThrow();
    const manifest = await bundleManifest(kernel, bundle, "flow", flowRun.flow_path);
    if (!manifest) throw new Error(`The flow ${flowRun.flow_path} is missing from its bundle.`);
    const pass = new Advance(kernel, trx, flowRun, manifest.body as unknown as FlowBody);
    const result = await pass.run();
    started.push(...pass.started);
    asking.push(...pass.asking);
    canceled = takeCanceled(trx);
    canceledFlowRuns = takeCanceledFlows(trx);
    return result;
  });
  await announceCanceled(kernel, canceled);
  await announceCanceledFlows(kernel, canceledFlowRuns);
  // Flow runs started as steps take their own first step now that they are committed.
  for (const child of started) kickFlow(kernel, child);
  // Approvers are told of a step that waits for them once it is committed, and never twice.
  if (asking.length > 0) {
    for (const node of asking) {
      mailApprovers(kernel, flowRunId, node).catch((error) =>
        kernel.log.error({ err: error, flowRunId, node }, "approvers could not be told"),
      );
    }
  }
  if (finished) await afterFlowRun(kernel, finished);
}

/** Says how a flow run ended, however it ended: `platform/flow-run-finished`. */
async function publishFlowRunFinished(
  kernel: Kernel,
  flowRun: Finished["flowRun"],
  status: Finished["status"],
) {
  const { publishPlatformEvent } = await import("./events.js");
  await publishPlatformEvent(kernel, {
    tenantId: flowRun.tenant_id,
    workspaceId: flowRun.workspace_id,
    name: "platform/flow-run-finished",
    payload: { flowRunId: flowRun.id, flow: flowRun.flow_path, status },
    sourceId: flowRun.id,
    depth: Number(flowRun.trigger_detail.depth ?? 0),
  }).catch((error) => kernel.log.error({ err: error }, "a platform event could not be published"));
}

/** The flow runs a transaction canceled, to be announced once it has committed. */
const canceledFlows = new WeakMap<object, Finished["flowRun"][]>();

/** The flow runs this transaction canceled so far, handed over once. */
export function takeCanceledFlows(trx: Trx): Finished["flowRun"][] {
  const flowRuns = canceledFlows.get(trx) ?? [];
  canceledFlows.delete(trx);
  return flowRuns;
}

/** Says that flow runs ended as canceled, as a canceled script run is said to have (`platform/run-finished`). */
export async function announceCanceledFlows(kernel: Kernel, flowRuns: Finished["flowRun"][]) {
  for (const flowRun of flowRuns) await publishFlowRunFinished(kernel, flowRun, "cancelled");
}

async function afterFlowRun(kernel: Kernel, finished: Finished) {
  const { flowRun } = finished;
  if (flowRun.parent_flow_run_id) kickFlow(kernel, flowRun.parent_flow_run_id);
  await publishFlowRunFinished(kernel, flowRun, finished.status);
  // A sub-flow's failure is reported by the flow that started it.
  if (finished.status === "failed" && !flowRun.parent_flow_run_id) {
    const { alertFlowFailure } = await import("../execution/alerts.js");
    await alertFlowFailure(kernel, flowRun, finished.error?.message ?? "The flow failed.").catch(
      (error) =>
        kernel.log.error({ err: error, flowRunId: flowRun.id }, "failure alert could not be sent"),
    );
  }
}

/** The longest answer a respond step may give, as JSON. */
export const MAX_RESPONSE_LENGTH = 256 * 1024;

/** How long a webhook waits for its flow to answer before it says only that the flow started. */
export const RESPONSE_WAIT_MS = 25_000;

export interface FlowResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Waits for a flow run to answer the request that started it. Gives
 * undefined when the run ended with no answer, when the wait ran out, or when
 * whoever asked has gone.
 */
export async function awaitResponse(
  kernel: Kernel,
  flowRunId: string,
  gone: () => boolean,
  waitMs = RESPONSE_WAIT_MS,
): Promise<FlowResponse | undefined> {
  const deadline = Date.now() + waitMs;
  for (let pause = 25; ; pause = Math.min(pause * 2, 250)) {
    const row = await kernel.db
      .selectFrom("flow_run")
      .select(["status", "response"])
      .where("id", "=", flowRunId)
      .executeTakeFirst();
    if (row?.response) return row.response as FlowResponse;
    if (row?.status !== "running" || gone() || Date.now() + pause > deadline) {
      return undefined;
    }
    await sleep(pause);
  }
}

type FlowRunRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  flow_path: string;
  bundle_id: string;
  trigger_node: string;
  trigger_detail: Record<string, unknown>;
  parent_flow_run_id: string | null;
  tags: string[];
  trace_id?: string | null;
  trace_parent?: string | null;
  created_at?: Date;
};

class Advance {
  readonly #kernel: Kernel;
  readonly #trx: Trx;
  readonly #flowRun: FlowRunRow;
  readonly #body: FlowBody;
  /** Only the part of the graph this trigger can reach takes part in the run. */
  readonly #nodes: Set<string>;
  #steps = new Map<string, StepRow>();
  readonly #outputs = new Map<string, unknown>();

  constructor(kernel: Kernel, trx: Trx, flowRun: FlowRunRow, body: FlowBody) {
    this.#kernel = kernel;
    this.#trx = trx;
    this.#flowRun = flowRun;
    this.#body = body;
    this.#nodes = reachableFrom(body, flowRun.trigger_node);
  }

  async run(): Promise<Finished | undefined> {
    await this.#load();
    // Each pass can make more nodes ready. A flow has at most 200 nodes, so this ends.
    for (let pass = 0; pass < 1000; pass++) {
      let moved = false;
      for (const step of [...this.#steps.values()]) {
        if (isActive(step) && (await this.#settle(step))) moved = true;
      }
      const failed = [...this.#steps.values()].find(
        (step) => step.item_key === "" && step.status === "failed" && !step.handled,
      );
      if (failed) {
        if (this.#outgoing(failed.node_id).some((edge) => edge.error)) {
          await this.#update(failed, { handled: true });
          moved = true;
        } else {
          return this.#finish("failed", {
            message: `The step "${failed.node_id}" failed: ${failed.error?.message ?? "no reason was given"}`,
          });
        }
      }
      for (const id of this.#nodes) {
        if (this.#steps.has(stepKey(id))) continue;
        const readiness = this.#readiness(id);
        if (readiness === "ready") {
          await this.#start(id);
          moved = true;
        } else if (readiness === "skip") {
          await this.#insert(id, "", { status: "skipped", finished_at: new Date() });
          moved = true;
        }
      }
      if (!moved) break;
    }
    if ([...this.#steps.values()].some(isActive)) return undefined;
    return this.#finish("succeeded");
  }

  // ----- State -----

  async #load() {
    const rows = await this.#trx
      .selectFrom("step_run")
      .selectAll()
      .where("flow_run_id", "=", this.#flowRun.id)
      .execute();
    this.#steps = new Map(rows.map((row) => [stepKey(row.node_id, row.item_key), row as StepRow]));
  }

  async #insert(
    node: string,
    item: string,
    values: Partial<StepRow> & { status: StepStatus; finished_at?: Date },
  ) {
    const { output, error, detail, ...rest } = values;
    const row = await this.#trx
      .insertInto("step_run")
      .values({
        flow_run_id: this.#flowRun.id,
        node_id: node,
        item_key: item,
        ...rest,
        ...(output !== undefined ? { output: JSON.stringify(storable(output)) } : {}),
        ...(error !== undefined ? { error: error ? JSON.stringify(storable(error)) : null } : {}),
        ...(detail !== undefined ? { detail: JSON.stringify(storable(detail)) } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    this.#steps.set(stepKey(node, item), row as StepRow);
    return row as StepRow;
  }

  async #update(step: StepRow, values: Partial<StepRow>) {
    const { output, error, detail, ...rest } = values;
    const finished =
      values.status && !ACTIVE.includes(values.status) ? { finished_at: new Date() } : {};
    const row = await this.#trx
      .updateTable("step_run")
      .set({
        ...rest,
        ...finished,
        ...(output !== undefined ? { output: JSON.stringify(storable(output)) } : {}),
        ...(error !== undefined ? { error: error ? JSON.stringify(storable(error)) : null } : {}),
        ...(detail !== undefined ? { detail: JSON.stringify(storable(detail)) } : {}),
      })
      .where("flow_run_id", "=", step.flow_run_id)
      .where("node_id", "=", step.node_id)
      .where("item_key", "=", step.item_key)
      .returningAll()
      .executeTakeFirstOrThrow();
    this.#steps.set(stepKey(step.node_id, step.item_key), row as StepRow);
    this.#outputs.delete(stepKey(step.node_id, step.item_key));
    return row as StepRow;
  }

  /** Records a step's result, keeping anything large out of the row. */
  async #succeed(step: StepRow, output: unknown, extra: Partial<StepRow> = {}) {
    const name = `${step.node_id}${step.item_key ? `-${step.item_key}` : ""}`;
    const stored = await storePayload(this.#kernel, this.#flowRun.id, name, output, "flow-runs");
    const row = await this.#trx
      .updateTable("step_run")
      .set({
        status: "succeeded",
        output: stored.inline,
        output_ref: stored.ref,
        finished_at: new Date(),
        ...(extra.output_name !== undefined ? { output_name: extra.output_name } : {}),
      })
      .where("flow_run_id", "=", step.flow_run_id)
      .where("node_id", "=", step.node_id)
      .where("item_key", "=", step.item_key)
      .returningAll()
      .executeTakeFirstOrThrow();
    this.#steps.set(stepKey(step.node_id, step.item_key), row as StepRow);
  }

  #fail(step: StepRow, message: string) {
    return this.#update(step, { status: "failed", error: { message } });
  }

  /** What a finished step produced, read once per run. */
  async #outputOf(step: ContextStep): Promise<unknown> {
    const key = stepKey(step.node_id, step.item_key);
    if (this.#outputs.has(key)) return this.#outputs.get(key);
    const output = await readOutput(this.#trx, step);
    this.#outputs.set(key, output);
    return output;
  }

  // ----- The graph -----

  #outgoing(node: string): FlowEdge[] {
    return this.#body.edges.filter((edge) => edge.from === node && this.#nodes.has(edge.to));
  }

  /** Whether an edge has been followed, can no longer be followed, or is still undecided. */
  #edge(edge: FlowEdge): "taken" | "dead" | "open" {
    if (!this.#nodes.has(edge.from)) return "dead";
    const source = this.#steps.get(stepKey(edge.from));
    if (!source || isActive(source)) return "open";
    if (source.status === "succeeded") {
      if (edge.error) return "dead";
      if (edge.output !== undefined) return source.output_name === edge.output ? "taken" : "dead";
      return "taken";
    }
    if (source.status === "failed") return edge.error ? "taken" : "dead";
    return "dead";
  }

  #readiness(node: string): "ready" | "skip" | "wait" {
    const incoming = this.#body.edges
      .filter((edge) => edge.to === node)
      .map((edge) => this.#edge(edge));
    const taken = incoming.includes("taken");
    const open = incoming.includes("open");
    // A join waits for every path that can still arrive. Any other node starts on the first.
    if (this.#body.nodes[node]?.type === "join") {
      if (open) return "wait";
      return taken ? "ready" : "skip";
    }
    if (taken) return "ready";
    return open ? "wait" : "skip";
  }

  // ----- Expressions -----

  #context(extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return buildContext(
      this.#steps.values(),
      this.#flowRun.trigger_node,
      (step) => this.#outputOf(step),
      extra,
    );
  }

  async #evaluate(
    field: string,
    expression: string,
    extra?: Record<string, unknown>,
  ): Promise<unknown> {
    const context = await this.#context(extra);
    try {
      return await this.#kernel.expressions.evaluate(expression, context);
    } catch (error) {
      if (error instanceof ExpressionError) {
        const large = error.message.startsWith("No such key") ? tooLargeIn(context) : [];
        // The evaluator quotes the value it choked on ("Invalid duration string: …"). What the run
        // was given as a secret is masked here, before the failure is stored, so that every
        // reader of it (the lists, the alerts, the events) shows it masked.
        const said = redactText(
          error.message,
          await flowKnown(this.#kernel, this.#trx, this.#flowRun.id),
        );
        throw new StepFailure(
          `The expression for "${field}" could not be evaluated: ${said}${
            large.length > 0
              ? `. ${large.map((one) => `${one} is too large to use in an expression, so it has no keys here`).join(". ")}. Read it in a script.`
              : ""
          }`,
        );
      }
      throw error;
    }
  }

  // ----- Starting a node -----

  async #start(id: string) {
    const node = this.#body.nodes[id] as FlowNode;
    const step = await this.#insert(id, "", { status: "running" });
    try {
      switch (node.type) {
        case "script": {
          let input: unknown = {};
          if (node.input) input = await this.#evaluate("input", node.input);
          else if (node.inputs) {
            const fields: Record<string, unknown> = {};
            for (const [name, expression] of Object.entries(node.inputs)) {
              fields[name] = await this.#evaluate(`input ${name}`, expression);
            }
            input = fields;
          }
          await this.#startScript(step, node.script, input, node.with);
          break;
        }
        case "set": {
          const output: Record<string, unknown> = {};
          for (const [name, expression] of Object.entries(node.values)) {
            output[name] = await this.#evaluate(name, expression);
          }
          await this.#succeed(step, output);
          break;
        }
        case "branch": {
          let chosen = OTHERWISE;
          for (const item of node.cases) {
            const value = await this.#evaluate(`case ${item.name}`, item.when);
            if (typeof value !== "boolean") {
              throw new StepFailure(
                `The condition for the case "${item.name}" must be true or false, and gave ${JSON.stringify(value)}.`,
              );
            }
            if (value) {
              chosen = item.name;
              break;
            }
          }
          await this.#succeed(step, { case: chosen }, { output_name: chosen });
          break;
        }
        case "join":
          await this.#succeed(step, null);
          break;
        case "delay":
          await this.#update(step, {
            status: "waiting",
            wake_at: new Date(Date.now() + node.seconds * 1000),
          });
          break;
        case "approval": {
          const detail = node.detail ? await this.#evaluate("detail", node.detail) : null;
          const named =
            node.approvers &&
            ((node.approvers.groups?.length ?? 0) > 0 || (node.approvers.roles?.length ?? 0) > 0)
              ? node.approvers
              : undefined;
          // Who the approvers are is settled now, by ID: the group can be renamed while the
          // step waits, and whoever was in it when it was asked is still who decides.
          const resolved = named
            ? await resolveApprovers(
                this.#trx,
                {
                  tenantId: this.#flowRun.tenant_id,
                  workspaceId: this.#flowRun.workspace_id,
                },
                named,
              )
            : undefined;
          await this.#update(step, {
            status: "waiting",
            detail: {
              title: node.title,
              detail,
              // Where it is listed while it waits: its workspace always, the tenant when it says so.
              ...(node.surface === "tenant" ? { surface: "tenant" } : {}),
              ...(named && resolved
                ? {
                    approvers: named,
                    approverIds: {
                      groups: resolved.groups,
                      roles: resolved.roles,
                      ...(resolved.unknown.length > 0 ? { later: resolved.later } : {}),
                    },
                  }
                : {}),
            },
            wake_at: node.timeoutSeconds ? new Date(Date.now() + node.timeoutSeconds * 1000) : null,
          });
          this.#asking.push(step.node_id);
          break;
        }
        case "subflow": {
          const input = node.input ? await this.#evaluate("input", node.input) : {};
          await this.#startChildFlow(step, await this.#flowOf(node), input);
          break;
        }
        case "foreach": {
          const items = await this.#evaluate("items", node.items);
          if (!Array.isArray(items)) {
            throw new StepFailure(
              `"items" must give a list, and gave ${JSON.stringify(items)?.slice(0, 80)}.`,
            );
          }
          if (items.length > MAX_FOREACH_ITEMS) {
            throw new StepFailure(
              `A foreach runs at most ${MAX_FOREACH_ITEMS} items, and "items" gave ${items.length}. Process a list this long inside a script.`,
            );
          }
          const waiting = await this.#update(step, { status: "waiting", detail: { items } });
          await this.#settleForeach(waiting);
          break;
        }
        case "respond": {
          const body = node.body ? await this.#evaluate("body", node.body) : null;
          const headers: Record<string, string> = {};
          for (const [name, expression] of Object.entries(node.headers ?? {})) {
            const value = await this.#evaluate(`header ${name}`, expression);
            if (typeof value !== "string" || /[\r\n]/.test(value)) {
              throw new StepFailure(`The header "${name}" must be one line of text.`);
            }
            headers[name.toLowerCase()] = value;
          }
          const answer = JSON.stringify(storable({ status: node.status ?? 200, headers, body }));
          if (answer.length > MAX_RESPONSE_LENGTH) {
            throw new StepFailure(
              `The answer is longer than ${MAX_RESPONSE_LENGTH} characters. Answer with less, and let the caller fetch the rest.`,
            );
          }
          // The first answer is the answer. Whoever holds the request open finds it here.
          const first = await this.#trx
            .updateTable("flow_run")
            .set({ response: answer })
            .where("id", "=", this.#flowRun.id)
            .where("response", "is", null)
            .executeTakeFirst();
          await this.#succeed(step, {
            status: node.status ?? 200,
            answered: Number(first.numUpdatedRows) > 0,
          });
          break;
        }
        case "fail": {
          const message = await this.#evaluate("message", node.message);
          await this.#fail(step, typeof message === "string" ? message : JSON.stringify(message));
          break;
        }
        case "trigger":
          await this.#update(step, { status: "skipped" });
          break;
      }
    } catch (error) {
      if (!(error instanceof StepFailure)) throw error;
      await this.#fail(this.#steps.get(stepKey(id)) as StepRow, error.message);
    }
  }

  async #startScript(step: StepRow, script: string, input: unknown, grants?: FlowGrants) {
    try {
      const started = await startRun(this.#kernel, this.#trx, {
        tenantId: this.#flowRun.tenant_id,
        workspaceId: this.#flowRun.workspace_id,
        script,
        input,
        trigger: {
          type: "flow",
          detail: {
            flowRunId: this.#flowRun.id,
            flow: this.#flowRun.flow_path,
            node: step.node_id,
            depth: Number(this.#flowRun.trigger_detail.depth ?? 0),
            // What the step hands the script. The worker's routes honor it for this run alone.
            ...(grants ? { grants } : {}),
          },
        },
        startedBy: { type: "flow", id: null },
        // Starting the same step twice gives the same run.
        idempotencyKey: `flow:${this.#flowRun.id}:${step.node_id}:${step.item_key}`,
        bundleId: this.#flowRun.bundle_id,
        step: { flowRunId: this.#flowRun.id, node: step.node_id, item: step.item_key },
        // A step's run carries its flow run's tags, so a search by tag finds both.
        tags: this.#flowRun.tags,
      });
      await this.#update(step, { status: "running", run_id: started.run.id });
    } catch (error) {
      // Input that does not fit the script, or a script that is not there, fails the step.
      if (!(error instanceof HttpError)) throw error;
      const reasons = (error.issues ?? [])
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ");
      throw new StepFailure(`${error.message}${reasons ? ` ${reasons}` : ""}`);
    }
  }

  /**
   * The flow a step starts: the one it names, or the one its expression chooses
   * from the list written beside it. The list is what makes a flow chosen by
   * data safe to allow: everything on it was checked when the bundle was built.
   */
  async #flowOf(
    node: { flow?: string; flowFrom?: string; allow?: string[] },
    extra?: Record<string, unknown>,
  ): Promise<string> {
    if (node.flow !== undefined) return node.flow;
    const chosen = await this.#evaluate("flowFrom", node.flowFrom as string, extra);
    const allowed = node.allow ?? [];
    if (typeof chosen !== "string" || !allowed.includes(chosen)) {
      throw new StepFailure(
        `"flowFrom" gave ${JSON.stringify(chosen)?.slice(0, 80)}, which is not a flow this step may start. It may start: ${allowed.join(", ")}.`,
      );
    }
    return chosen;
  }

  async #startChildFlow(step: StepRow, flow: string, input: unknown) {
    const depth = Number(this.#flowRun.trigger_detail.depth ?? 0) + 1;
    if (depth > MAX_FLOW_DEPTH) {
      throw new StepFailure(
        `Flows started by flows are ${MAX_FLOW_DEPTH} deep here, which is the limit. A flow may be starting itself through another.`,
      );
    }
    try {
      const started = await startFlowRun(this.#kernel, this.#trx, {
        tenantId: this.#flowRun.tenant_id,
        workspaceId: this.#flowRun.workspace_id,
        flow,
        input,
        trigger: {
          type: "flow",
          detail: {
            flowRunId: this.#flowRun.id,
            node: step.node_id,
            depth,
          },
        },
        startedBy: { type: "flow", id: null },
        idempotencyKey: `flow:${this.#flowRun.id}:${step.node_id}:${step.item_key}`,
        bundleId: this.#flowRun.bundle_id,
        parent: { flowRunId: this.#flowRun.id, node: step.node_id, item: step.item_key },
        tags: this.#flowRun.tags,
      });
      await this.#update(step, { status: "waiting", child_flow_run_id: started.flowRun.id });
      this.#children.push(started.flowRun.id);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      throw new StepFailure(error.message);
    }
  }

  /** Flow runs started during this pass. They take their first step once this transaction commits. */
  readonly #children: string[] = [];
  /** Approval steps that began to wait in this pass: their approvers are told after it commits. */
  readonly #asking: string[] = [];

  // ----- Settling a step whose work may have ended -----

  async #settle(step: StepRow): Promise<boolean> {
    const node = this.#body.nodes[step.node_id] as FlowNode;
    if (step.run_id) {
      const run = await this.#trx
        .selectFrom("run")
        .select(["status", "error"])
        .where("id", "=", step.run_id)
        .executeTakeFirst();
      if (run?.status === "succeeded") {
        await this.#update(step, { status: "succeeded" });
        return true;
      }
      if (run?.status === "failed" || run?.status === "cancelled" || !run) {
        await this.#fail(
          step,
          run?.status === "cancelled"
            ? "The step's run was canceled."
            : (run?.error?.message ?? "The step's run failed."),
        );
        return true;
      }
      return false;
    }
    if (step.child_flow_run_id) {
      const child = await this.#trx
        .selectFrom("flow_run")
        .select(["status", "error"])
        .where("id", "=", step.child_flow_run_id)
        .executeTakeFirst();
      if (child?.status === "succeeded") {
        await this.#update(step, { status: "succeeded" });
        return true;
      }
      if (child && child.status !== "running") {
        await this.#fail(step, child.error?.message ?? `The flow it started was ${child.status}.`);
        return true;
      }
      return false;
    }
    if (step.item_key !== "") return false;
    if (node.type === "foreach") return this.#settleForeach(step);
    if (step.wake_at && step.wake_at <= new Date()) {
      if (node.type === "delay") await this.#succeed(step, null);
      else await this.#fail(step, "Nobody decided before the approval timed out.");
      return true;
    }
    return false;
  }

  /** Starts the next items of a foreach, and finishes it when every item is done. */
  async #settleForeach(step: StepRow): Promise<boolean> {
    const node = this.#body.nodes[step.node_id] as Extract<FlowNode, { type: "foreach" }>;
    const items = (step.detail.items ?? []) as unknown[];
    const itemSteps = () =>
      [...this.#steps.values()].filter(
        (candidate) => candidate.node_id === step.node_id && candidate.item_key !== "",
      );
    let moved = false;

    const carryOn = node.continueOnError === true;
    const failed = carryOn ? undefined : itemSteps().find((item) => item.status === "failed");
    if (failed) {
      for (const item of itemSteps().filter(isActive)) await this.#cancelStep(item);
      await this.#fail(
        step,
        `Item ${failed.item_key} failed: ${failed.error?.message ?? "no reason was given"}`,
      );
      return true;
    }

    const limit = node.concurrency ?? 1;
    let next = itemSteps().length;
    while (next < items.length && itemSteps().filter(isActive).length < limit) {
      const index = next++;
      const item = await this.#insert(step.node_id, String(index), { status: "running" });
      moved = true;
      try {
        const scope = { item: items[index], index };
        const input = node.input ? await this.#evaluate("input", node.input, scope) : items[index];
        if (node.script) await this.#startScript(item, node.script, input, node.with);
        else await this.#startChildFlow(item, await this.#flowOf(node, scope), input);
      } catch (error) {
        if (!(error instanceof StepFailure)) throw error;
        await this.#fail(item, error.message);
        if (!carryOn) return this.#settleForeach(step);
      }
    }

    const done = itemSteps();
    const ended = (item: StepRow) =>
      item.status === "succeeded" || (carryOn && item.status === "failed");
    if (done.length === items.length && done.every(ended)) {
      const ordered = done.sort((a, b) => Number(a.item_key) - Number(b.item_key));
      const outputs = [];
      for (const item of ordered) {
        outputs.push(
          item.status === "failed"
            ? { error: { message: item.error?.message ?? "No reason was given." } }
            : await this.#outputOf(item),
        );
      }
      await this.#succeed(step, outputs);
      return true;
    }
    return moved;
  }

  // ----- Ending -----

  async #cancelStep(step: StepRow) {
    if (step.run_id) {
      await cancelRun(this.#kernel, this.#trx, this.#flowRun.workspace_id, step.run_id).catch(
        (error) => {
          // Already ended: nothing to cancel.
          if (!(error instanceof HttpError)) throw error;
        },
      );
    }
    if (step.child_flow_run_id)
      await cancelFlowTree(this.#kernel, this.#trx, step.child_flow_run_id);
    await this.#update(step, { status: "cancelled" });
  }

  async #finish(
    status: "succeeded" | "failed" | "cancelled",
    error?: { message: string },
  ): Promise<Finished> {
    for (const step of [...this.#steps.values()].filter(isActive)) await this.#cancelStep(step);
    // A flow's output is what its last steps produced: the nodes nothing leads on from. A step
    // that went well has no use for an error path, so one with only that after it is last too.
    const output: Record<string, unknown> = {};
    if (status === "succeeded") {
      for (const step of this.#steps.values()) {
        if (
          step.item_key === "" &&
          step.status === "succeeded" &&
          this.#outgoing(step.node_id).every((edge) => edge.error)
        ) {
          output[step.node_id] = await this.#outputOf(step);
        }
      }
    }
    const stored = await storePayload(
      this.#kernel,
      this.#flowRun.id,
      "output",
      output,
      "flow-runs",
    );
    await this.#trx
      .updateTable("flow_run")
      .set({
        status,
        output: stored.inline ?? JSON.stringify({ stored: stored.ref }),
        output_ref: stored.ref,
        output_summary: summarize(output),
        error: error ? JSON.stringify(storable(error)) : null,
        finished_at: new Date(),
      })
      .where("id", "=", this.#flowRun.id)
      .execute();
    observe.flowRunEnded(this.#kernel.metrics, status);
    traceFlowRun(this.#kernel, this.#flowRun, this.#steps.values(), status, error?.message);
    return { status, flowRun: this.#flowRun, error };
  }

  /** Flow runs this pass started, to be advanced after the transaction commits. */
  get started(): string[] {
    return this.#children;
  }

  get asking(): string[] {
    return this.#asking;
  }
}

/** A step that failed for a reason its author can fix. It fails the step, not the engine. */
/** How deep flows may start flows. The same number as for events that start runs that publish events. */
const MAX_FLOW_DEPTH = 10;

class StepFailure extends Error {}

/** Cancels a flow run and everything it started, in the caller's transaction. */
async function cancelFlowTree(kernel: Kernel, trx: Trx, flowRunId: string): Promise<void> {
  const flowRun = await trx
    .updateTable("flow_run")
    .set({ status: "cancelled", finished_at: new Date() })
    .where("id", "=", flowRunId)
    .where("status", "=", "running")
    .returningAll()
    .executeTakeFirst();
  if (!flowRun) return;
  canceledFlows.set(trx, [...(canceledFlows.get(trx) ?? []), flowRun]);
  observe.flowRunEnded(kernel.metrics, "cancelled");
  const active = await trx
    .selectFrom("step_run")
    .select(["node_id", "item_key", "run_id", "child_flow_run_id"])
    .where("flow_run_id", "=", flowRunId)
    .where("status", "in", ACTIVE)
    .execute();
  for (const step of active) {
    if (step.run_id) {
      await cancelRun(kernel, trx, flowRun.workspace_id, step.run_id).catch((error) => {
        if (!(error instanceof HttpError)) throw error;
      });
    }
    if (step.child_flow_run_id) await cancelFlowTree(kernel, trx, step.child_flow_run_id);
  }
  await trx
    .updateTable("step_run")
    .set({ status: "cancelled", finished_at: new Date() })
    .where("flow_run_id", "=", flowRunId)
    .where("status", "in", ACTIVE)
    .execute();
  if (kernel.telemetry.tracing) {
    const steps = await trx
      .selectFrom("step_run")
      .select(["node_id", "item_key", "status", "started_at", "finished_at"])
      .where("flow_run_id", "=", flowRunId)
      .execute();
    traceFlowRun(kernel, flowRun, steps, "cancelled");
  }
}

/** Cancels a flow run that is in progress, with its running steps. */
export async function cancelFlowRun(
  kernel: Kernel,
  trx: Trx,
  workspaceId: string,
  flowRunId: string,
) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${flowRunId}, 1))`.execute(trx);
  const flowRun = await trx
    .selectFrom("flow_run")
    .selectAll()
    .where("id", "=", flowRunId)
    .where("workspace_id", "=", workspaceId)
    .executeTakeFirst();
  if (!flowRun) throw notFound("The flow run");
  if (flowRun.status !== "running")
    throw conflict(alreadyEnded("flow run", flowRun.status));
  await cancelFlowTree(kernel, trx, flowRunId);
  return flowRun;
}

/** Who a decision is kept as: a member or a service account. Anyone else leaves no one. */
export function deciderOf(principal: {
  type: string;
  id: string | null;
}): { type: string; id: string } | null {
  return (principal.type === "member" || principal.type === "service_account") && principal.id
    ? { type: principal.type, id: principal.id }
    : null;
}

/** Records a person's decision on a waiting approval step. */
export async function decideApproval(
  trx: Trx,
  request: {
    workspaceId: string;
    flowRunId: string;
    node: string;
    approve: boolean;
    comment?: string | undefined;
    /** Who decided, by type and ID: a member, or a service account. */
    decidedBy: { type: string; id: string } | null;
    /** Where it was decided, kept on the step so a list can say so without searching the audit. */
    via: "console" | "api" | "mcp" | "app" | "email";
  },
) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${request.flowRunId}, 1))`.execute(trx);
  const step = await trx
    .selectFrom("step_run")
    .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
    .select([
      "step_run.status",
      "step_run.detail",
      "flow_run.flow_path",
      "flow_run.status as flow_status",
    ])
    .where("step_run.flow_run_id", "=", request.flowRunId)
    .where("step_run.node_id", "=", request.node)
    .where("step_run.item_key", "=", "")
    .where("flow_run.workspace_id", "=", request.workspaceId)
    .executeTakeFirst();
  if (!step || typeof step.detail.title !== "string") throw notFound("The approval");
  if (step.status !== "waiting" || step.flow_status !== "running") {
    throw conflict("This approval is no longer waiting for a decision.");
  }
  // Every route asks, not the mail page alone: the flow and its people read the reason.
  if (!request.approve && !request.comment?.trim()) {
    throw badRequest("Say why it is rejected: the flow and its people read it.", [
      { path: "/comment", message: "is needed" },
    ]);
  }
  await trx
    .updateTable("step_run")
    .set({
      status: request.approve ? "succeeded" : "failed",
      output: JSON.stringify({
        approved: request.approve,
        comment: request.comment ?? null,
        ...(request.via === "app" ? { via: request.via } : {}),
      }),
      error: request.approve
        ? null
        : JSON.stringify({ message: `Rejected${request.comment ? `: ${request.comment}` : "."}` }),
      decided_by: request.decidedBy?.id ?? null,
      decided_by_type: request.decidedBy?.type ?? null,
      decided_via: request.via,
      decision_comment: request.comment ?? null,
      wake_at: null,
      finished_at: new Date(),
    })
    .where("flow_run_id", "=", request.flowRunId)
    .where("node_id", "=", request.node)
    .where("item_key", "=", "")
    .execute();
  // However it was decided, the links mailed for it stop working.
  await expireLinks(trx, request.flowRunId, request.node);
  return { flow: step.flow_path, title: step.detail.title };
}

/**
 * Advances every flow run that has something to do: one that has just
 * started, one whose step's work has ended, one whose wait is over. This is
 * what makes a flow run survive a restart: whatever was in progress when the
 * control plane stopped is found here when it starts again.
 */
export async function advanceDueFlows(kernel: Kernel): Promise<number> {
  const due = await sql<{ id: string }>`
    select f.id from flow_run f
    where f.status = 'running' and (
      not exists (
        select 1 from step_run s where s.flow_run_id = f.id and s.status in ('running', 'waiting')
      )
      or exists (
        select 1 from step_run s join run r on r.id = s.run_id
        where s.flow_run_id = f.id and s.status = 'running' and r.status in ('succeeded', 'failed', 'cancelled')
      )
      or exists (
        select 1 from step_run s join flow_run c on c.id = s.child_flow_run_id
        where s.flow_run_id = f.id and s.status in ('running', 'waiting') and c.status <> 'running'
      )
      or exists (
        select 1 from step_run s
        where s.flow_run_id = f.id and s.status = 'waiting' and s.wake_at <= now()
      )
    )
    order by f.id
    limit 200
  `.execute(kernel.db);
  for (const { id } of due.rows) {
    await advance(kernel, id).then(
      () => stuck.delete(id),
      async (error) => {
        kernel.log.error({ err: error, flowRunId: id }, "a flow run could not be advanced");
        // One that fails every time would hold a place in each sweep for ever, and the
        // sweep takes the oldest first: after a few tries it is failed, and says why.
        const tries = (stuck.get(id) ?? 0) + 1;
        stuck.set(id, tries);
        if (tries >= MAX_ADVANCE_TRIES) {
          stuck.delete(id);
          await failStuck(kernel, id, error).catch((inner) =>
            kernel.log.error({ err: inner, flowRunId: id }, "a stuck flow run could not be failed"),
          );
        }
      },
    );
  }
  return due.rows.length;
}

/** How many sweeps may fail to move a flow run before it is failed. */
const MAX_ADVANCE_TRIES = 3;
/** Flow runs the sweep could not move, and how many times in a row. */
const stuck = new Map<string, number>();

async function failStuck(kernel: Kernel, flowRunId: string, cause: unknown) {
  const message =
    `The flow could not go on: ${cause instanceof Error ? cause.message : String(cause)}`.slice(
      0,
      500,
    );
  await kernel.db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${flowRunId}, 1))`.execute(trx);
    await trx
      .updateTable("step_run")
      .set({ status: "cancelled", finished_at: new Date() })
      .where("flow_run_id", "=", flowRunId)
      .where("status", "in", ACTIVE)
      .execute();
    await trx
      .updateTable("flow_run")
      .set({
        status: "failed",
        error: JSON.stringify({ message: storable(message) }),
        finished_at: new Date(),
      })
      .where("id", "=", flowRunId)
      .where("status", "=", "running")
      .execute();
  });
}
