import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { newId, type StepStatus, sql } from "@vynxlabs/db";
import {
  type FlowBody,
  type FlowEdge,
  type FlowGrants,
  type FlowNode,
  OTHERWISE,
  reachableFrom,
} from "@vynxlabs/manifest";
import type { Trx } from "../audit.js";
import { badRequest, conflict, HttpError, notFound } from "../errors.js";
import { bundleManifest } from "../execution/bundles.js";
import { cancelRun, startRun, storePayload } from "../execution/runs.js";
import type { Kernel } from "../kernel.js";
import { ExpressionError } from "./expressions.js";

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
 * Starts a flow run in the caller's transaction: one trigger firing. Starting
 * again with the same idempotency key returns the first run.
 */
export async function startFlowRun(kernel: Kernel, trx: Trx, request: StartFlowRun) {
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
  const manifest = bundle ? await bundleManifest(kernel, bundle, "flow", request.flow) : undefined;
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

  const key = request.idempotencyKey ?? randomUUID();
  if (request.idempotencyKey !== undefined) {
    const earlier = await trx
      .selectFrom("flow_run")
      .selectAll()
      .where("workspace_id", "=", request.workspaceId)
      .where("flow_path", "=", request.flow)
      .where("idempotency_key", "=", key)
      .executeTakeFirst();
    if (earlier) return { created: false, flowRun: earlier };
  }

  const resource = await trx
    .selectFrom("resource")
    .select("id")
    .where("workspace_id", "=", request.workspaceId)
    .where("kind", "=", "flow")
    .where("path", "=", request.flow)
    .executeTakeFirst();
  const id = newId();
  const input = await storePayload(kernel, id, "input", request.input ?? {}, "flow-runs");
  const flowRun = await trx
    .insertInto("flow_run")
    .values({
      id,
      tenant_id: request.tenantId,
      workspace_id: request.workspaceId,
      resource_id: resource?.id ?? bundle.id,
      flow_path: request.flow,
      bundle_id: bundle.id,
      trigger_node: triggerNode,
      trigger_type: request.trigger.type,
      trigger_detail: JSON.stringify(request.trigger.detail ?? {}),
      status: "running",
      input: input.inline,
      input_ref: input.ref,
      parent_flow_run_id: request.parent?.flowRunId ?? null,
      parent_node: request.parent?.node ?? null,
      parent_item: request.parent?.item ?? null,
      started_by_type: request.startedBy.type,
      started_by_id: request.startedBy.id,
      idempotency_key: key,
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
  return { created: true, flowRun };
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
    return result;
  });
  // Flow runs started as steps take their own first step now that they are committed.
  for (const child of started) kickFlow(kernel, child);
  if (finished) await afterFlowRun(kernel, finished);
}

async function afterFlowRun(kernel: Kernel, finished: Finished) {
  const { flowRun } = finished;
  if (flowRun.parent_flow_run_id) kickFlow(kernel, flowRun.parent_flow_run_id);
  const { publishPlatformEvent } = await import("./events.js");
  await publishPlatformEvent(kernel, {
    tenantId: flowRun.tenant_id,
    workspaceId: flowRun.workspace_id,
    name: "platform/flow-run-finished",
    payload: { flowRunId: flowRun.id, flow: flowRun.flow_path, status: finished.status },
    sourceId: flowRun.id,
    depth: Number(flowRun.trigger_detail.depth ?? 0),
  }).catch((error) => kernel.log.error({ err: error }, "a platform event could not be published"));
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
        ...(output !== undefined ? { output: JSON.stringify(output) } : {}),
        ...(error !== undefined ? { error: error ? JSON.stringify(error) : null } : {}),
        ...(detail !== undefined ? { detail: JSON.stringify(detail) } : {}),
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
        ...(output !== undefined ? { output: JSON.stringify(output) } : {}),
        ...(error !== undefined ? { error: error ? JSON.stringify(error) : null } : {}),
        ...(detail !== undefined ? { detail: JSON.stringify(detail) } : {}),
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

  /** What a finished step produced. Something too large to hold in a row is not loaded. */
  async #outputOf(step: StepRow): Promise<unknown> {
    const key = stepKey(step.node_id, step.item_key);
    if (this.#outputs.has(key)) return this.#outputs.get(key);
    let output: unknown;
    const tooLarge = (ref: string) => ({
      stored: ref,
      note: "This output is too large to use in an expression. Read it in a script.",
    });
    if (step.run_id) {
      const run = await this.#trx
        .selectFrom("run")
        .select(["output", "output_ref"])
        .where("id", "=", step.run_id)
        .executeTakeFirst();
      output = run?.output_ref ? tooLarge(run.output_ref) : (run?.output ?? null);
    } else if (step.child_flow_run_id) {
      const child = await this.#trx
        .selectFrom("flow_run")
        .select("output")
        .where("id", "=", step.child_flow_run_id)
        .executeTakeFirst();
      output = child?.output ?? null;
    } else {
      output = step.output_ref ? tooLarge(step.output_ref) : (step.output ?? null);
    }
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

  async #context(extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const steps: Record<string, unknown> = {};
    for (const step of this.#steps.values()) {
      if (step.item_key !== "") continue;
      if (step.status === "succeeded") steps[step.node_id] = { output: await this.#outputOf(step) };
      else if (step.status === "failed")
        steps[step.node_id] = { error: step.error ?? { message: "" } };
    }
    const trigger = this.#steps.get(stepKey(this.#flowRun.trigger_node));
    return { trigger: trigger ? await this.#outputOf(trigger) : {}, steps, ...extra };
  }

  async #evaluate(
    field: string,
    expression: string,
    extra?: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await this.#kernel.expressions.evaluate(expression, await this.#context(extra));
    } catch (error) {
      if (error instanceof ExpressionError) {
        throw new StepFailure(
          `The expression for "${field}" could not be evaluated: ${error.message}`,
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
          await this.#update(step, {
            status: "waiting",
            detail: { title: node.title, detail },
            wake_at: node.timeoutSeconds ? new Date(Date.now() + node.timeoutSeconds * 1000) : null,
          });
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
          const answer = JSON.stringify({ status: node.status ?? 200, headers, body });
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
            // What the step hands the script. The worker's routes honour it for this run alone.
            ...(grants ? { grants } : {}),
          },
        },
        startedBy: { type: "flow", id: null },
        // Starting the same step twice gives the same run.
        idempotencyKey: `flow:${this.#flowRun.id}:${step.node_id}:${step.item_key}`,
        bundleId: this.#flowRun.bundle_id,
        step: { flowRunId: this.#flowRun.id, node: step.node_id, item: step.item_key },
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
            ? "The step's run was cancelled."
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

    const failed = itemSteps().find((item) => item.status === "failed");
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
        return this.#settleForeach(step);
      }
    }

    const done = itemSteps();
    if (done.length === items.length && done.every((item) => item.status === "succeeded")) {
      const ordered = done.sort((a, b) => Number(a.item_key) - Number(b.item_key));
      const outputs = [];
      for (const item of ordered) outputs.push(await this.#outputOf(item));
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
    // A flow's output is what its last steps produced: the nodes nothing leads on from.
    const output: Record<string, unknown> = {};
    if (status === "succeeded") {
      for (const step of this.#steps.values()) {
        if (
          step.item_key === "" &&
          step.status === "succeeded" &&
          this.#outgoing(step.node_id).length === 0
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
        error: error ? JSON.stringify(error) : null,
        finished_at: new Date(),
      })
      .where("id", "=", this.#flowRun.id)
      .execute();
    return { status, flowRun: this.#flowRun, error };
  }

  /** Flow runs this pass started, to be advanced after the transaction commits. */
  get started(): string[] {
    return this.#children;
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
    .returning(["id", "workspace_id"])
    .executeTakeFirst();
  if (!flowRun) return;
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
    throw conflict(
      `The flow run already ${flowRun.status === "succeeded" ? "succeeded" : flowRun.status}.`,
    );
  await cancelFlowTree(kernel, trx, flowRunId);
  return flowRun;
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
    memberId: string | null;
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
  await trx
    .updateTable("step_run")
    .set({
      status: request.approve ? "succeeded" : "failed",
      output: JSON.stringify({ approved: request.approve, comment: request.comment ?? null }),
      error: request.approve
        ? null
        : JSON.stringify({ message: `Rejected${request.comment ? `: ${request.comment}` : "."}` }),
      decided_by: request.memberId,
      decision_comment: request.comment ?? null,
      wake_at: null,
      finished_at: new Date(),
    })
    .where("flow_run_id", "=", request.flowRunId)
    .where("node_id", "=", request.node)
    .where("item_key", "=", "")
    .execute();
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
    await advance(kernel, id).catch((error) =>
      kernel.log.error({ err: error, flowRunId: id }, "a flow run could not be advanced"),
    );
  }
  return due.rows.length;
}
