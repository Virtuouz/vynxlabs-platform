import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { type FlowBody, PATH_PATTERN } from "@volvel/manifest";
import { Type } from "typebox";
import { badRequest, conflict, HttpError, notFound } from "../kernel/errors.js";
import { cancelFlowRuns } from "../kernel/execution/bulk-cancel.js";
import { bundleManifest, payloadSchemas } from "../kernel/execution/bundles.js";
import { redact } from "../kernel/execution/redact.js";
import { readPayload } from "../kernel/execution/runs.js";
import {
  flowStateSql,
  type RunState,
  RunStateSchema,
  stepState,
} from "../kernel/execution/state.js";
import { kickStarted, webhookToken } from "../kernel/execution/triggers.js";
import {
  approversOf,
  approverTitles,
  describeApprovers,
  isApprover,
  mayDecide,
} from "../kernel/flows/approvers.js";
import { expressionContext } from "../kernel/flows/context.js";
import {
  cancelFlowRun,
  decideApproval,
  keptNodes,
  kickFlow,
  startFlowRun,
} from "../kernel/flows/engine.js";
import { publishEvent } from "../kernel/flows/events.js";
import { ExpressionError } from "../kernel/flows/expressions.js";
import { access, findWorkspace, guestLimit } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { resolveResource } from "../kernel/resolve.js";
import { PageQuery, pageOf } from "../pagination.js";
import {
  AnyObject,
  Id,
  iso,
  isoOrNull,
  NoContent,
  NullableId,
  NullableString,
  NullableTime,
  pageArgs,
  TenantParams,
  Time,
  toPage,
  WorkspaceParams,
} from "./shared.js";

const pathPattern = new RegExp(PATH_PATTERN);
const WildParams = Type.Object({ t: Id, w: Id, "*": Type.String() });
function wildPath(params: { "*": string }): string {
  const path = params["*"];
  if (!pathPattern.test(path) || path.length > 255) throw badRequest("The path is not valid.");
  return path;
}

const FlowRunStatus = Type.Union([
  Type.Literal("running"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);
const ErrorShape = Type.Union([Type.Object({ message: Type.String() }), Type.Null()]);

const FlowRun = Type.Object({
  id: Id,
  flow: Type.String(),
  status: FlowRunStatus,
  state: RunStateSchema,
  trigger: AnyObject,
  triggerNode: Type.String(),
  startedBy: Type.Object({ type: Type.String(), id: NullableId }),
  bundleId: Id,
  bundleVersion: Type.Integer(),
  error: ErrorShape,
  errorSummary: NullableString,
  tags: Type.Array(Type.String()),
  retryOf: Type.Union([Id, Type.Null()], { description: "The flow run this one retries." }),
  parentFlowRunId: NullableId,
  traceId: Type.Union([Type.String(), Type.Null()], {
    description: "The trace the flow run and every run it starts are part of.",
  }),
  createdAt: Time,
  finishedAt: NullableTime,
});
interface FlowRunRow {
  id: string;
  flow_path: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  state: RunState;
  trigger_type: string;
  trigger_detail: Record<string, unknown>;
  trigger_node: string;
  started_by_type: string;
  started_by_id: string | null;
  bundle_id: string;
  bundle_version: number;
  error: { message: string } | null;
  error_summary: string | null;
  tags: string[];
  retry_of: string | null;
  parent_flow_run_id: string | null;
  trace_id?: string | null;
  created_at: Date;
  finished_at: Date | null;
}
const toFlowRun = (row: FlowRunRow) => ({
  id: row.id,
  flow: row.flow_path,
  status: row.status,
  state: row.state,
  trigger: { type: row.trigger_type, ...row.trigger_detail },
  triggerNode: row.trigger_node,
  startedBy: { type: row.started_by_type, id: row.started_by_id },
  bundleId: row.bundle_id,
  bundleVersion: row.bundle_version,
  error: row.error ? { message: row.error.message } : null,
  errorSummary: row.error_summary,
  tags: row.tags,
  retryOf: row.retry_of,
  parentFlowRunId: row.parent_flow_run_id,
  traceId: row.trace_id ?? null,
  createdAt: iso(row.created_at),
  finishedAt: isoOrNull(row.finished_at),
});

const Step = Type.Object({
  node: Type.String(),
  item: Type.String({ description: "Empty, or the item's index for one item of a foreach." }),
  status: Type.String(),
  state: RunStateSchema,
  outputName: NullableString,
  input: Type.Unknown({
    description:
      "What the step was given: a code step's input, a sub-flow's, a foreach's items, an approval's detail. Secret-looking values are masked.",
  }),
  output: Type.Unknown(),
  error: ErrorShape,
  handled: Type.Boolean({ description: "True when the step failed and its error path was taken." }),
  runId: NullableId,
  childFlowRunId: NullableId,
  wakeAt: NullableTime,
  detail: AnyObject,
  copiedFrom: Type.Union(
    [
      Type.Object({
        flowRunId: Id,
        runId: Type.Optional(Id),
        childFlowRunId: Type.Optional(Id),
      }),
      Type.Null(),
    ],
    { description: "For a step a retry kept: the flow run, and the run, it was done in." },
  ),
  startedAt: Time,
  pickedUpAt: Type.Union([Time, Type.Null()], {
    description:
      "For a step that runs a script: when a worker took it. The time before that was spent waiting for a worker.",
  }),
  finishedAt: NullableTime,
});

/** JSON with object keys in order, so two equal values always read the same. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

interface StepInputRow {
  run_id: string | null;
  run_script: string | null;
  run_input: unknown;
  run_input_ref: string | null;
  child_flow_run_id: string | null;
  child_input: unknown;
  child_input_ref: string | null;
  detail: unknown;
}

/** What a step was given, from wherever its kind keeps it, masked. */
function stepInput(
  step: StepInputRow,
  schemaOf: (script: string) => Record<string, unknown> | undefined,
): unknown {
  if (step.run_id) {
    if (step.run_input_ref) return { stored: step.run_input_ref };
    return redact(step.run_input ?? null, step.run_script ? schemaOf(step.run_script) : undefined);
  }
  if (step.child_flow_run_id) {
    return step.child_input_ref
      ? { stored: step.child_input_ref }
      : redact(step.child_input ?? null);
  }
  const detail = (step.detail ?? null) as { items?: unknown; detail?: unknown } | null;
  if (detail && "items" in detail) return redact(detail.items);
  if (detail && "detail" in detail) return redact(detail.detail);
  return null;
}

const Approval = Type.Object({
  flowRunId: Id,
  workspaceId: Id,
  flow: Type.String(),
  node: Type.String(),
  title: Type.String(),
  detail: Type.Unknown(),
  waitingSince: Time,
  timesOutAt: NullableTime,
  approvers: Type.Union([
    Type.Object({
      groups: Type.Array(Type.String()),
      roles: Type.Array(Type.String()),
      text: Type.String({ description: "Who may decide, in words." }),
    }),
    Type.Null(),
  ]),
});

const DecidedApproval = Type.Object({
  flowRunId: Id,
  workspaceId: Id,
  flow: Type.String(),
  node: Type.String(),
  title: Type.String(),
  approved: Type.Boolean(),
  comment: NullableString,
  decidedBy: Type.Union([Type.Object({ id: Id, label: Type.String() }), Type.Null()]),
  decidedAt: NullableTime,
  via: Type.Union([Type.Literal("console"), Type.Literal("email")], {
    description: "Where it was decided: the console or the API, or a link in the mail.",
  }),
  waitedSeconds: Type.Union([Type.Number(), Type.Null()]),
});

const Position = Type.Object({ x: Type.Number(), y: Type.Number() });

export function flowRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    // ----- What an expression gives, against a run that happened -----

    app.get(
      `${base}/expressions/value`,
      {
        config: {
          access: access.workspace("flow_run:read"),
          rateLimit: { max: 240, timeWindow: "1 minute" },
        },
        schema: {
          summary: "What an expression gives against a flow run",
          description:
            "For the flow editor: the expression is worked out against what a run of the flow " +
            "had when it ended, `trigger`, `steps` and `now`, as a step's would be, in the same " +
            "sandbox and with the same limits. Name the run, or the flow to use its newest run. " +
            "With `items`, the expression is one of a foreach's, and sees the first item.",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id }),
          querystring: Type.Object({
            expression: Type.String({ minLength: 1, maxLength: 4000 }),
            flowRun: Type.Optional(Id),
            flow: Type.Optional(Type.String({ maxLength: 255 })),
            items: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
          }),
          response: {
            200: Type.Object({
              value: Type.Optional(Type.Unknown()),
              error: Type.Optional(Type.String()),
              note: Type.Optional(Type.String()),
              flowRun: Type.Union([
                Type.Object({ id: Id, createdAt: Time, state: RunStateSchema }),
                Type.Null(),
              ]),
            }),
          },
        },
      },
      async ({ params, query }) => {
        const said = (error: unknown) => {
          if (error instanceof ExpressionError) return error.message;
          throw error;
        };
        try {
          await kernel.expressions.check(query.expression);
        } catch (error) {
          return { error: said(error), flowRun: null };
        }
        let found = db
          .selectFrom("flow_run")
          .select(["id", "trigger_node", "created_at"])
          .select(flowStateSql("flow_run").as("state"))
          .where("workspace_id", "=", params.w);
        if (query.flowRun) found = found.where("id", "=", query.flowRun);
        else if (query.flow) found = found.where("flow_path", "=", query.flow);
        else throw badRequest("Name a flow run, or a flow to use its newest run.");
        const run = await found.orderBy("created_at", "desc").limit(1).executeTakeFirst();
        if (!run) {
          if (query.flowRun) throw notFound("The flow run");
          return { note: "Run a test to see its value.", flowRun: null };
        }
        const shown = { id: run.id, createdAt: iso(run.created_at), state: run.state as RunState };
        let extra: Record<string, unknown> = {};
        let note: string | undefined;
        try {
          if (query.items) {
            const items = await kernel.expressions.evaluate(
              query.items,
              await expressionContext(db, run),
            );
            if (!Array.isArray(items) || items.length === 0) {
              return {
                note: "Its items gave no list to take the first of.",
                flowRun: shown,
              };
            }
            extra = { item: items[0], index: 0 };
            note = "For the first item.";
          }
          const value = await kernel.expressions.evaluate(
            query.expression,
            await expressionContext(db, run, extra),
          );
          return { value, ...(note ? { note } : {}), flowRun: shown };
        } catch (error) {
          return { error: said(error), flowRun: shown };
        }
      },
    );

    // ----- Flows -----

    app.get(
      `${base}/flows`,
      {
        config: { access: access.workspace("flow:read") },
        schema: {
          summary: "Flows deployed to a workspace, each with its latest run",
          tags: ["flows"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  description: Type.String(),
                  nodeCount: Type.Integer(),
                  triggers: Type.Array(Type.String()),
                  manualInput: Type.Union([AnyObject, Type.Null()], {
                    description:
                      "What the flow's manual trigger takes, as JSON Schema. Null when it has no " +
                      "manual trigger, or one that says nothing of its input.",
                  }),
                  lastRun: Type.Union([
                    Type.Object({
                      id: Id,
                      status: FlowRunStatus,
                      state: RunStateSchema,
                      createdAt: Time,
                    }),
                    Type.Null(),
                  ]),
                  version: Type.Union([Type.Integer(), Type.Null()], {
                    description: "The deployed version; null for a flow that is only a draft.",
                  }),
                  draft: Type.Union(
                    [Type.Literal("changed"), Type.Literal("removed"), Type.Null()],
                    {
                      description: "Whether a draft changes or removes it, waiting to be deployed.",
                    },
                  ),
                  ownership: Type.String({
                    description:
                      "`code` for the repository, `ui` for the console. A flow the repository " +
                      "manages is changed and removed there.",
                  }),
                  starts: Type.Array(
                    Type.Object({
                      type: Type.String(),
                      detail: NullableString,
                    }),
                    {
                      description:
                        "Each trigger with what it listens for: an event's name, a schedule.",
                    },
                  ),
                  runs: Type.Object({
                    lastDay: Type.Integer(),
                    failedLastDay: Type.Integer(),
                    waiting: Type.Integer(),
                  }),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const flows = await db
          .selectFrom("resource")
          .select(["path", "body", "ownership"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "flow")
          .orderBy("path")
          .execute();
        const latest = await sql<{
          flow_path: string;
          id: string;
          status: FlowRunRow["status"];
          state: RunState;
          created_at: Date;
        }>`
          select distinct on (f.flow_path) f.flow_path, f.id, f.status,
            ${flowStateSql("f")} as state, f.created_at
          from flow_run f where f.workspace_id = ${params.w} and f.parent_flow_run_id is null
          order by f.flow_path, f.id desc
        `.execute(db);
        const byFlow = new Map(latest.rows.map((row) => [row.flow_path, row]));
        const versions = new Map(
          (
            await db
              .selectFrom("resource")
              .select(["path", "version"])
              .where("workspace_id", "=", params.w)
              .where("kind", "=", "flow")
              .execute()
          ).map((row) => [row.path, row.version]),
        );
        const drafts = await db
          .selectFrom("resource_draft")
          .select(["path", "body", "deleted"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "flow")
          .execute();
        const counts = await sql<{
          flow_path: string;
          day: string;
          failed: string;
          waiting: string;
        }>`
          select flow_path,
            count(*) filter (where created_at > now() - interval '24 hours') as day,
            count(*) filter (where created_at > now() - interval '24 hours' and status = 'failed') as failed,
            count(*) filter (where status = 'running' and exists (
              select 1 from step_run s where s.flow_run_id = flow_run.id and s.status = 'waiting'
            )) as waiting
          from flow_run where workspace_id = ${params.w} and parent_flow_run_id is null
          group by flow_path
        `.execute(db);
        const countOf = new Map(counts.rows.map((row) => [row.flow_path, row]));
        const describe = (
          path: string,
          body: FlowBody,
          version: number | null,
          ownership: string,
        ) => {
          const last = byFlow.get(path);
          const count = countOf.get(path);
          const draft = drafts.find((one) => one.path === path);
          return {
            path,
            description: body.description ?? "",
            nodeCount: Object.keys(body.nodes ?? {}).length,
            triggers: Object.values(body.nodes ?? {})
              .flatMap((node) => (node.type === "trigger" ? [node.trigger.type] : []))
              .sort(),
            manualInput:
              Object.values(body.nodes ?? {}).flatMap((node) =>
                node.type === "trigger" && node.trigger.type === "manual" && node.trigger.input
                  ? [node.trigger.input as Record<string, unknown>]
                  : [],
              )[0] ?? null,
            lastRun: last
              ? {
                  id: last.id,
                  status: last.status,
                  state: last.state,
                  createdAt: iso(last.created_at),
                }
              : null,
            version,
            draft: draft ? (draft.deleted ? ("removed" as const) : ("changed" as const)) : null,
            ownership,
            starts: Object.values(body.nodes ?? {}).flatMap((node) => {
              if (node.type !== "trigger") return [];
              const trigger = node.trigger as { type: string; event?: string; cron?: string };
              return [{ type: trigger.type, detail: trigger.event ?? trigger.cron ?? null }];
            }),
            runs: {
              lastDay: Number(count?.day ?? 0),
              failedLastDay: Number(count?.failed ?? 0),
              waiting: Number(count?.waiting ?? 0),
            },
          };
        };
        const deployed = flows.map((flow) =>
          describe(
            flow.path,
            flow.body as unknown as FlowBody,
            versions.get(flow.path) ?? null,
            flow.ownership,
          ),
        );
        // A flow drawn in the console and not yet deployed is listed too, as a draft.
        const onlyDrafts = drafts
          .filter((draft) => !draft.deleted && !versions.has(draft.path))
          .map((draft) => describe(draft.path, draft.body as unknown as FlowBody, null, "ui"));
        return {
          items: [...deployed, ...onlyDrafts].sort((a, b) => a.path.localeCompare(b.path)),
        };
      },
    );

    app.get(
      `${base}/flows/*`,
      {
        config: { access: access.workspace("flow:read") },
        schema: {
          summary: "One flow: its graph, where its nodes are drawn, and its triggers",
          description: "A webhook's address is included only for callers who hold `trigger:write`.",
          tags: ["flows"],
          params: WildParams,
          response: {
            200: Type.Object({
              path: Type.String(),
              version: Type.Integer(),
              description: Type.String(),
              nodes: AnyObject,
              edges: Type.Array(AnyObject),
              layout: Type.Record(Type.String(), Position),
              triggers: Type.Array(
                Type.Object({
                  node: Type.String(),
                  type: Type.String(),
                  nextFireAt: NullableTime,
                  url: NullableString,
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const path = wildPath(params);
        const flow = await db
          .selectFrom("resource")
          .select(["id", "body", "version"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "flow")
          .where("path", "=", path)
          .executeTakeFirst();
        if (!flow) throw notFound("The flow");
        const body = flow.body as unknown as FlowBody;
        const layout = await db
          .selectFrom("flow_layout")
          .select("positions")
          .where("resource_id", "=", flow.id)
          .executeTakeFirst();
        const states = await db
          .selectFrom("trigger_state")
          .selectAll()
          .where("resource_id", "=", flow.id)
          .execute();
        const mayAddress = await ctx.allowed("trigger:write", {
          tenantId: params.t,
          workspaceId: params.w,
        });
        return {
          path,
          version: flow.version,
          description: body.description ?? "",
          nodes: body.nodes as unknown as Record<string, unknown>,
          edges: body.edges as unknown as Record<string, unknown>[],
          // A flow drawn in the console carries its layout in its body. Others keep it apart.
          layout: {
            ...((body.layout as Record<string, { x: number; y: number }> | undefined) ?? {}),
            ...(layout?.positions ?? {}),
          },
          triggers: await Promise.all(
            states.map(async (state) => {
              const token =
                mayAddress && state.type === "webhook"
                  ? await webhookToken(kernel, state)
                  : undefined;
              return {
                node: state.node_id,
                type: state.type,
                nextFireAt: isoOrNull(state.next_fire_at),
                url: token ? `${kernel.config.publicUrl}/api/v1/hooks/${token}` : null,
              };
            }),
          ),
        };
      },
    );

    app.put(
      `${base}/flow-layouts/*`,
      {
        config: { access: access.workspace("flow:write") },
        schema: {
          summary: "Save where a flow's nodes are drawn",
          description:
            "Positions are not part of the flow. Saving them changes no version and no behavior.",
          tags: ["flows"],
          params: WildParams,
          body: Type.Object({ positions: Type.Record(Type.String(), Position) }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath(params);
        await ctx.mutate(async (trx, audit) => {
          const flow = await trx
            .selectFrom("resource")
            .select(["id", "body"])
            .where("workspace_id", "=", params.w)
            .where("kind", "=", "flow")
            .where("path", "=", path)
            .executeTakeFirst();
          if (!flow) throw notFound("The flow");
          // Positions for nodes the flow no longer has are dropped.
          const nodes = (flow.body as unknown as FlowBody).nodes;
          const positions = JSON.stringify(
            Object.fromEntries(Object.entries(body.positions).filter(([node]) => node in nodes)),
          );
          await trx
            .insertInto("flow_layout")
            .values({ resource_id: flow.id, positions, updated_at: new Date() })
            .onConflict((oc) =>
              oc.column("resource_id").doUpdateSet({ positions, updated_at: new Date() }),
            )
            .execute();
          await audit({
            action: "flow.layout_saved",
            targetType: "flow",
            targetId: flow.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: { path },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Flow runs -----

    const flowRuns = (workspaceId: string, from: typeof db = db) =>
      from
        .selectFrom("flow_run")
        .innerJoin("bundle", "bundle.id", "flow_run.bundle_id")
        .selectAll("flow_run")
        .select("bundle.version as bundle_version")
        .select(flowStateSql("flow_run").as("state"))
        .where("flow_run.workspace_id", "=", workspaceId);

    app.get(
      `${base}/flow-runs`,
      {
        config: { access: access.workspace("flow_run:read") },
        schema: {
          summary: "Flow runs in a workspace, newest first",
          description: "Runs started as a step of another flow are left out unless `all` is set.",
          tags: ["flows"],
          params: WorkspaceParams,
          querystring: Type.Object({
            ...PageQuery.properties,
            flow: Type.Optional(Type.String()),
            status: Type.Optional(FlowRunStatus),
            all: Type.Optional(Type.Boolean()),
          }),
          response: { 200: pageOf(FlowRun) },
        },
      },
      async ({ params, query }) => {
        const args = pageArgs(query);
        let select = flowRuns(params.w);
        if (query.flow) {
          // The runs of the flow that has this path now, under whatever path it had then.
          const path = query.flow;
          const flow = await db
            .selectFrom("resource")
            .select("id")
            .where("workspace_id", "=", params.w)
            .where("kind", "=", "flow")
            .where("path", "=", path)
            .executeTakeFirst();
          select = select.where((eb) =>
            flow
              ? eb.or([
                  eb("flow_run.resource_id", "=", flow.id),
                  eb("flow_run.flow_path", "=", path),
                ])
              : eb("flow_run.flow_path", "=", path),
          );
        }
        if (query.status) select = select.where("flow_run.status", "=", query.status);
        if (!query.all) select = select.where("flow_run.parent_flow_run_id", "is", null);
        if (args.after) select = select.where("flow_run.id", "<", args.after);
        const rows = await select
          .orderBy("flow_run.id", "desc")
          .limit(args.limit + 1)
          .execute();
        return toPage(rows, args, (row) => row.id, toFlowRun);
      },
    );

    app.post(
      `${base}/flow-runs`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Start a flow from its manual trigger",
          description:
            "Needs `flow_run:write` at the workspace or at the flow itself, which is how an " +
            "app's users are let start one flow and no other.",
          tags: ["flows"],
          params: WorkspaceParams,
          body: Type.Object({
            flow: Type.String(),
            input: Type.Optional(Type.Unknown()),
            idempotencyKey: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          }),
          response: { 200: FlowRun, 201: FlowRun },
        },
      },
      async ({ ctx, params, body }, reply) => {
        await findWorkspace(kernel, params.t, params.w);
        // By its path, or by one it had before it was renamed.
        const target = (await resolveResource(db, params.w, body.flow, { kind: "flow" }))?.resource;
        await ctx.authorize("flow_run:write", {
          tenantId: params.t,
          workspaceId: params.w,
          resourceId: target?.id,
        });
        const started = await ctx.mutate(async (trx, audit) => {
          const result = await startFlowRun(kernel, trx, {
            tenantId: params.t,
            workspaceId: params.w,
            flow: body.flow,
            input: body.input ?? {},
            trigger: { type: "manual" },
            startedBy: { type: ctx.principal.type, id: ctx.principal.id },
            idempotencyKey: body.idempotencyKey,
          });
          await audit({
            action: "flow_run.started",
            targetType: "flow_run",
            targetId: result.flowRun.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: { flow: body.flow, repeated: !result.created },
          });
          return result;
        });
        kickFlow(kernel, started.flowRun.id);
        const row = await flowRuns(params.w)
          .where("flow_run.id", "=", started.flowRun.id)
          .executeTakeFirstOrThrow();
        ctx.moved = started.alias;
        return reply.code(started.created ? 201 : 200).send(toFlowRun(row));
      },
    );

    // ----- Retrying a flow run -----

    /** A finished flow run, with what a retry of it would keep and run again. */
    const retryPlanOf = async (workspaceId: string, id: string) => {
      const row = await flowRuns(workspaceId).where("flow_run.id", "=", id).executeTakeFirst();
      if (!row) throw notFound("The flow run");
      const bundle = await db
        .selectFrom("bundle")
        .select(["id", "storage_key"])
        .where("id", "=", row.bundle_id)
        .executeTakeFirstOrThrow();
      const manifest = await bundleManifest(kernel, bundle, "flow", row.flow_path);
      if (!manifest) throw notFound(`The flow ${row.flow_path}`);
      const body = manifest.body as unknown as FlowBody;
      const steps = await db
        .selectFrom("step_run")
        .leftJoin("member", "member.id", "step_run.decided_by")
        .selectAll("step_run")
        .select(["member.email as decided_by_email", "member.name as decided_by_name"])
        .where("step_run.flow_run_id", "=", id)
        .execute();
      const kept = keptNodes(body, steps, row.trigger_node);
      const nodes = Object.keys(body.nodes).filter(
        (node) => node !== row.trigger_node && body.nodes[node]?.type !== "trigger",
      );
      return {
        row,
        body,
        plan: {
          kept: nodes.filter((node) => kept.has(node)),
          again: nodes.filter((node) => !kept.has(node)),
          approvalsKept: steps
            .filter(
              (step) =>
                step.item_key === "" &&
                kept.has(step.node_id) &&
                step.status === "succeeded" &&
                "title" in step.detail,
            )
            .map((step) => ({
              node: step.node_id,
              decidedBy: step.decided_by_name ?? step.decided_by_email ?? null,
            })),
        },
      };
    };
    /**
     * The version a retry runs on: the run's own, the workspace's active one, or a
     * bundle named outright, so a promotion in between cannot change which.
     */
    const retryTarget = async (
      workspaceId: string,
      row: { bundle_id: string; flow_path: string },
      spec: string | undefined,
    ) => {
      const bundleId =
        spec === undefined || spec === "original"
          ? row.bundle_id
          : spec === "active"
            ? (
                await db
                  .selectFrom("workspace")
                  .select("active_bundle_id")
                  .where("id", "=", workspaceId)
                  .executeTakeFirst()
              )?.active_bundle_id
            : spec;
      const bundle = bundleId
        ? await db
            .selectFrom("bundle")
            .select(["id", "storage_key", "version"])
            .where("id", "=", bundleId)
            .where("workspace_id", "=", workspaceId)
            .executeTakeFirst()
        : undefined;
      if (!bundle) throw notFound("The version to retry on");
      const manifest = await bundleManifest(kernel, bundle, "flow", row.flow_path);
      if (!manifest) throw conflict(`Version ${bundle.version} has no flow ${row.flow_path}.`);
      return {
        bundleId: bundle.id,
        version: Number(bundle.version),
        body: manifest.body as unknown as FlowBody,
      };
    };
    /** The kept steps that a version draws differently: retrying from them would not be the same. */
    const changedKept = (kept: string[], from: FlowBody, to: FlowBody) =>
      kept.filter(
        (node) =>
          stableJson(from.nodes[node] ?? null) !== stableJson(to.nodes[node] ?? null) ||
          stableJson(from.edges.filter((edge) => edge.to === node)) !==
            stableJson(to.edges.filter((edge) => edge.to === node)),
      );

    const RetryPlan = Type.Object({
      bundleVersion: Type.Integer({ description: "The version the retry would run on." }),
      changed: Type.Array(Type.String(), {
        description:
          "Kept steps that are different, or gone, in that version. A retry from the failed step " +
          "is refused while any is.",
      }),
      kept: Type.Array(Type.String(), { description: "Nodes whose steps are kept as they were." }),
      again: Type.Array(Type.String(), {
        description: "Nodes that run again, or for the first time.",
      }),
      approvalsKept: Type.Array(Type.Object({ node: Type.String(), decidedBy: NullableString }), {
        description: "Approvals already granted, which are not asked again.",
      }),
    });

    app.get(
      `${base}/flow-runs/:id/definition`,
      {
        config: { access: access.workspace("flow_run:read") },
        schema: {
          summary: "The flow as it was when this run started",
          description:
            "The graph of the flow at the run's own version, so a run is drawn as it ran even " +
            "after the flow has changed. `changed` says whether the deployed flow differs now. " +
            "Positions are the run's version's own, with the flow's current ones for nodes it lacks.",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: {
            200: Type.Object({
              path: Type.String(),
              bundleVersion: Type.Integer(),
              nodes: AnyObject,
              edges: Type.Array(AnyObject),
              layout: Type.Record(Type.String(), Position),
              changed: Type.Boolean(),
            }),
          },
        },
      },
      async ({ params }) => {
        await findWorkspace(kernel, params.t, params.w);
        const row = await flowRuns(params.w)
          .where("flow_run.id", "=", params.id)
          .executeTakeFirst();
        if (!row) throw notFound("The flow run");
        const bundle = await db
          .selectFrom("bundle")
          .select(["id", "storage_key"])
          .where("id", "=", row.bundle_id)
          .executeTakeFirstOrThrow();
        const manifest = await bundleManifest(kernel, bundle, "flow", row.flow_path);
        if (!manifest) throw notFound(`The flow ${row.flow_path} at version ${row.bundle_version}`);
        const body = manifest.body as unknown as FlowBody;
        const current = await db
          .selectFrom("resource")
          .select(["id", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "flow")
          .where("path", "=", row.flow_path)
          .executeTakeFirst();
        const positions = current
          ? (
              await db
                .selectFrom("flow_layout")
                .select("positions")
                .where("resource_id", "=", current.id)
                .executeTakeFirst()
            )?.positions
          : undefined;
        // Changed when the active version's flow is drawn differently from the run's.
        const active = await db
          .selectFrom("workspace")
          .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
          .select(["bundle.id", "bundle.storage_key"])
          .where("workspace.id", "=", params.w)
          .executeTakeFirst();
        const now =
          active && active.id !== bundle.id
            ? await bundleManifest(kernel, active, "flow", row.flow_path)
            : manifest;
        const shape = (one: { body: Record<string, unknown> } | undefined) =>
          one ? stableJson({ nodes: one.body.nodes, edges: one.body.edges }) : "";
        return {
          path: row.flow_path,
          bundleVersion: row.bundle_version,
          nodes: body.nodes as unknown as Record<string, unknown>,
          edges: body.edges as unknown as Record<string, unknown>[],
          layout: {
            ...(positions ?? {}),
            ...((body.layout as Record<string, { x: number; y: number }> | undefined) ?? {}),
          },
          changed: shape(now) !== shape(manifest),
        };
      },
    );

    app.get(
      `${base}/flow-runs/:id/retry-plan`,
      {
        config: { access: access.workspace("flow_run:read") },
        schema: {
          summary: "What retrying a flow run from its failed step would keep and run again",
          description:
            "A step is kept when it succeeded, was skipped, or failed with its failure " +
            "handled, and every step before it is kept too. Granted approvals are kept; " +
            "pending or rejected ones are asked again.",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          querystring: Type.Object({
            bundle: Type.Optional(
              Type.String({
                description:
                  "`original` (the default), `active`, or a bundle's ID: the version to retry on.",
              }),
            ),
          }),
          response: { 200: RetryPlan },
        },
      },
      async ({ params, query }) => {
        await findWorkspace(kernel, params.t, params.w);
        const { row, body, plan } = await retryPlanOf(params.w, params.id);
        const target = await retryTarget(params.w, row, query.bundle);
        return {
          ...plan,
          bundleVersion: target.version,
          changed: changedKept(plan.kept, body, target.body),
        };
      },
    );

    app.post(
      `${base}/flow-runs/:id/retry`,
      {
        config: { access: access.workspace("flow_run:write") },
        schema: {
          summary: "Run a finished flow run again, from its failed step or from the start",
          description:
            "From the failed step (`from: failed`), the steps a retry keeps are copied into a " +
            "new flow run on the same version and with the same input, and only the rest " +
            "runs. From the start, it runs whole, with the input given or the same one, on " +
            "the version it ran or the active one. The new flow run names the one it retries.",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          body: Type.Object({
            from: Type.Union([Type.Literal("failed"), Type.Literal("start")]),
            input: Type.Optional(Type.Unknown()),
            bundle: Type.Optional(Type.Union([Type.Literal("original"), Type.Literal("active")])),
            bundleId: Type.Optional(Id),
          }),
          response: { 201: FlowRun },
        },
      },
      async ({ ctx, params, body }, reply) => {
        await findWorkspace(kernel, params.t, params.w);
        const { row, body: ranOn, plan } = await retryPlanOf(params.w, params.id);
        if (row.status === "running") {
          throw new HttpError(409, "conflict", "The flow run has not ended. Cancel it first.");
        }
        if (row.parent_flow_run_id) {
          throw new HttpError(
            409,
            "conflict",
            "This flow run was started by another flow. Retry the flow that started it.",
          );
        }
        const fromFailed = body.from === "failed";
        if (fromFailed && row.status === "succeeded") {
          throw new HttpError(409, "conflict", "The flow run succeeded: nothing failed to retry.");
        }
        if (fromFailed && body.input !== undefined) {
          throw new HttpError(
            409,
            "conflict",
            "A retry from the failed step keeps what was done, so it runs with the same input. " +
              "Retry from the start to change it.",
          );
        }
        // On another version, such as the fix just promoted, what is kept must still be the same.
        const target = await retryTarget(params.w, row, body.bundleId ?? body.bundle);
        if (fromFailed && target.bundleId !== row.bundle_id) {
          const changed = changedKept(plan.kept, ranOn, target.body);
          if (changed.length > 0) {
            throw new HttpError(
              409,
              "conflict",
              `Version ${target.version} changes steps this retry would keep (${changed.join(", ")}). Retry from the start.`,
            );
          }
        }
        const input =
          body.input !== undefined
            ? body.input
            : await readPayload(kernel, row.input, row.input_ref);
        const started = await ctx.mutate(async (trx, audit) => {
          const result = await startFlowRun(kernel, trx, {
            tenantId: params.t,
            workspaceId: params.w,
            flow: row.flow_path,
            triggerNode: row.trigger_node,
            input,
            trigger: { type: "retry", detail: { of: row.id, from: body.from } },
            startedBy: { type: ctx.principal.type, id: ctx.principal.id },
            bundleId: target.bundleId,
            tags: row.tags,
            retryOf: row.id,
            seed: fromFailed,
          });
          await audit({
            action: "flow_run.retried",
            targetType: "flow_run",
            targetId: result.flowRun.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: {
              flow: row.flow_path,
              of: row.id,
              from: body.from,
              bundle:
                target.bundleId === row.bundle_id
                  ? "original"
                  : body.bundleId
                    ? target.bundleId
                    : "active",
            },
          });
          return result;
        });
        kickFlow(kernel, started.flowRun.id);
        const created = await flowRuns(params.w)
          .where("flow_run.id", "=", started.flowRun.id)
          .executeTakeFirstOrThrow();
        return reply.code(201).send(toFlowRun(created));
      },
    );

    app.get(
      `${base}/flow-runs/:id`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "One flow run, with every step",
          description:
            "Needs `flow_run:read` in the workspace. Whoever started a flow run may always " +
            "read how it ended and what it gave, without its steps: what each step produced " +
            "is the flow's own business.",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: {
            200: Type.Object({
              ...FlowRun.properties,
              input: Type.Unknown(),
              output: Type.Unknown(),
              steps: Type.Array(Step),
              retries: Type.Array(Type.Object({ id: Id, state: RunStateSchema, createdAt: Time }), {
                description: "Flow runs that retried this one, newest first.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        await findWorkspace(kernel, params.t, params.w);
        const mayReadAll = await ctx.allowed("flow_run:read", {
          tenantId: params.t,
          workspaceId: params.w,
        });
        const row = await flowRuns(params.w)
          .where("flow_run.id", "=", params.id)
          .executeTakeFirst();
        const own =
          row !== undefined &&
          ctx.principal.id !== null &&
          row.started_by_id === ctx.principal.id &&
          row.started_by_type === ctx.principal.type;
        // To someone who may not read flow runs, one that is not theirs does not exist.
        if (!mayReadAll && !own) {
          await ctx.authorize("flow_run:read", { tenantId: params.t, workspaceId: params.w });
        }
        if (!row) throw notFound("The flow run");
        if (!mayReadAll) {
          return {
            ...toFlowRun(row),
            input: redact(row.input_ref ? { stored: row.input_ref } : (row.input ?? null)),
            output: redact(row.output ?? null),
            steps: [],
            retries: [],
          };
        }
        // The run, whose state is worked out from its steps, and the steps are read from one
        // snapshot: read apart, a step that began to wait between the two reads would show
        // as waiting for approval under a run that says it is only running.
        const { run, steps, retries } = await db
          .transaction()
          .setIsolationLevel("repeatable read")
          .setAccessMode("read only")
          .execute(async (trx) => ({
            run:
              (await flowRuns(params.w, trx)
                .where("flow_run.id", "=", params.id)
                .executeTakeFirst()) ?? row,
            steps: await trx
              .selectFrom("step_run")
              .leftJoin("run", "run.id", "step_run.run_id")
              .leftJoin("flow_run as child", "child.id", "step_run.child_flow_run_id")
              .selectAll("step_run")
              .select([
                "run.output as run_output",
                "run.output_ref as run_output_ref",
                "run.started_at as run_started_at",
                "run.script_path as run_script",
                "run.input as run_input",
                "run.input_ref as run_input_ref",
                "child.input as child_input",
                "child.input_ref as child_input_ref",
              ])
              .where("step_run.flow_run_id", "=", params.id)
              .orderBy("step_run.started_at")
              .orderBy("step_run.node_id")
              .execute(),
            retries: await flowRuns(params.w, trx)
              .where("flow_run.retry_of", "=", params.id)
              .orderBy("flow_run.id", "desc")
              .limit(20)
              .execute(),
          }));
        // A code step's output is masked by its script's schema; everything else by its keys.
        const scriptSchemas = new Map<string, Awaited<ReturnType<typeof payloadSchemas>>>();
        for (const script of new Set(
          steps.flatMap((step) => (step.run_script ? [step.run_script] : [])),
        )) {
          scriptSchemas.set(script, await payloadSchemas(kernel, run.bundle_id, script));
        }
        return {
          ...toFlowRun(run),
          input: redact(run.input_ref ? { stored: run.input_ref } : (run.input ?? null)),
          output: redact(run.output ?? null),
          retries: retries.map((one) => ({
            id: one.id,
            state: one.state,
            createdAt: iso(one.created_at),
          })),
          steps: steps.map((step) => ({
            node: step.node_id,
            item: step.item_key,
            status: step.status,
            state: stepState(step),
            outputName: step.output_name,
            // What the step was given: a code step's run input, a sub-flow's input, the items
            // of a foreach, the detail an approval showed. Masked as payloads are.
            input: stepInput(step, (script) => scriptSchemas.get(script)?.input),
            // A code step's output is its run's. Something large is named, not sent.
            output: step.run_id
              ? step.run_output_ref
                ? { stored: step.run_output_ref }
                : redact(
                    step.run_output ?? null,
                    step.run_script ? scriptSchemas.get(step.run_script)?.output : undefined,
                  )
              : step.output_ref
                ? { stored: step.output_ref }
                : redact(step.output ?? null),
            error: step.error ? { message: step.error.message } : null,
            handled: step.handled,
            runId: step.run_id,
            childFlowRunId: step.child_flow_run_id,
            wakeAt: isoOrNull(step.wake_at),
            // A foreach keeps its items here. They are shown through its item steps instead.
            detail: redact(
              Object.fromEntries(
                Object.entries(step.detail).filter(
                  ([name]) => name !== "items" && name !== "copiedFrom",
                ),
              ),
            ) as Record<string, unknown>,
            copiedFrom:
              (step.detail.copiedFrom as
                | { flowRunId: string; runId?: string; childFlowRunId?: string }
                | undefined) ?? null,
            startedAt: iso(step.started_at),
            pickedUpAt: isoOrNull(step.run_started_at),
            finishedAt: isoOrNull(step.finished_at),
          })),
        };
      },
    );

    app.post(
      `${base}/flow-runs/:id/cancel`,
      {
        config: { access: access.workspace("flow_run:write") },
        schema: {
          summary: "Cancel a flow run and the steps it has in progress",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: { 200: FlowRun },
        },
      },
      async ({ ctx, params }) => {
        const cancelled = await ctx.mutate(async (trx, audit) => {
          const flowRun = await cancelFlowRun(kernel, trx, params.w, params.id);
          await audit({
            action: "flow_run.cancelled",
            targetType: "flow_run",
            targetId: params.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: { flow: flowRun.flow_path },
          });
          return flowRun;
        });
        // A canceled sub-flow lets the flow that started it move on.
        if (cancelled.parent_flow_run_id) kickFlow(kernel, cancelled.parent_flow_run_id);
        return toFlowRun(
          await flowRuns(params.w).where("flow_run.id", "=", params.id).executeTakeFirstOrThrow(),
        );
      },
    );

    app.post(
      `${base}/flow-runs/cancel`,
      {
        config: { access: access.workspace("flow_run:write") },
        schema: {
          summary: "Cancel a workspace's flow runs in progress, in bulk",
          description:
            "With the steps they have going, and their sub-flows. Up to 10,000 at a time: " +
            "`more` says there are others.",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id }),
          body: Type.Object({ olderThanSeconds: Type.Optional(Type.Integer({ minimum: 1 })) }),
          response: { 200: Type.Object({ cancelled: Type.Integer(), more: Type.Boolean() }) },
        },
      },
      async ({ ctx, params, body }) => {
        const result = await cancelFlowRuns(kernel, {
          workspaceId: params.w,
          olderThanSeconds: body.olderThanSeconds,
        });
        await ctx.mutate(async (_trx, audit) => {
          await audit({
            action: "flow_run.bulk_cancelled",
            targetType: "workspace",
            targetId: params.w,
            tenantId: params.t,
            workspaceId: params.w,
            details: { ...body, ...result },
          });
        });
        return result;
      },
    );

    // ----- Approvals -----

    /** A step that said its approval is listed for the tenant as well as its workspace. */
    const SURFACED = sql<boolean>`step_run.detail ->> 'surface' = 'tenant'`;
    const pending = (tenantId: string) =>
      db
        .selectFrom("step_run")
        .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
        .select([
          "step_run.flow_run_id",
          "step_run.node_id",
          "step_run.detail",
          "step_run.started_at",
          "step_run.wake_at",
          "flow_run.flow_path",
          "flow_run.workspace_id",
        ])
        .where("flow_run.tenant_id", "=", tenantId)
        .where("flow_run.status", "=", "running")
        .where("step_run.status", "=", "waiting")
        .where(sql<boolean>`step_run.detail ? 'title'`)
        .orderBy("step_run.started_at");
    type PendingRow = Awaited<ReturnType<ReturnType<typeof pending>["execute"]>>[number];
    const toApproval = async (row: PendingRow) => ({
      flowRunId: row.flow_run_id,
      workspaceId: row.workspace_id,
      flow: row.flow_path,
      node: row.node_id,
      title: String(row.detail.title),
      detail: redact(row.detail.detail ?? null),
      waitingSince: iso(row.started_at),
      timesOutAt: isoOrNull(row.wake_at),
      approvers: await (async () => {
        const named = approversOf(row.detail);
        return named
          ? {
              groups: named.groups ?? [],
              roles: named.roles ?? [],
              text: describeApprovers(named, await approverTitles(db, named)) ?? "",
            }
          : null;
      })(),
    });

    /** Approvals someone decided, newest first. One that timed out with nobody deciding is left out. */
    const decided = (tenantId: string) =>
      db
        .selectFrom("step_run")
        .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
        .leftJoin("member", "member.id", "step_run.decided_by")
        .select([
          "step_run.flow_run_id",
          "step_run.node_id",
          "step_run.detail",
          "step_run.status",
          "step_run.decided_by",
          "step_run.decision_comment",
          "step_run.started_at",
          "step_run.finished_at",
          "flow_run.flow_path",
          "flow_run.workspace_id",
          "member.email",
          "member.name",
          sql<boolean>`exists (
            select 1 from approval_link l
            where l.flow_run_id = step_run.flow_run_id and l.node_id = step_run.node_id
              and l.decided_at is not null
          )`.as("by_link"),
        ])
        .where("flow_run.tenant_id", "=", tenantId)
        .where("step_run.decided_by", "is not", null)
        .where(sql<boolean>`step_run.detail ? 'title'`)
        .orderBy("step_run.finished_at", "desc")
        .limit(100);
    type DecidedRow = Awaited<ReturnType<ReturnType<typeof decided>["execute"]>>[number];
    const toDecided = (row: DecidedRow) => ({
      flowRunId: row.flow_run_id,
      workspaceId: row.workspace_id,
      flow: row.flow_path,
      node: row.node_id,
      title: String(row.detail.title),
      approved: row.status === "succeeded",
      comment: row.decision_comment,
      decidedBy: row.decided_by
        ? { id: row.decided_by, label: row.email ?? row.name ?? "A member" }
        : null,
      decidedAt: isoOrNull(row.finished_at),
      via: row.by_link ? ("email" as const) : ("console" as const),
      waitedSeconds: row.finished_at
        ? Math.round((row.finished_at.getTime() - row.started_at.getTime()) / 1000)
        : null,
    });

    app.get(
      "/tenants/:t/approvals/decided",
      {
        config: { access: access.custom },
        schema: {
          summary: "Approvals surfaced to the tenant and decided, newest first",
          description:
            "The last hundred whose step said `surface: tenant`, from the workspaces where the " +
            "caller may read approvals. A workspace lists every one of its own.",
          tags: ["flows"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(DecidedApproval) }) },
        },
      },
      async ({ ctx, params }) => {
        const rows = await decided(params.t).where(SURFACED).execute();
        const allowed = new Map<string, boolean>();
        const items = [];
        for (const row of rows) {
          if (!allowed.has(row.workspace_id)) {
            allowed.set(
              row.workspace_id,
              await ctx.allowed("approval:read", {
                tenantId: params.t,
                workspaceId: row.workspace_id,
              }),
            );
          }
          if (allowed.get(row.workspace_id)) items.push(toDecided(row));
        }
        if (items.length === 0) await ctx.authorize("approval:read", { tenantId: params.t });
        return { items };
      },
    );

    app.get(
      `${base}/approvals`,
      {
        config: { access: access.workspace("approval:read") },
        schema: {
          summary: "Approvals waiting for a decision in a workspace",
          description:
            "Every approval of the workspace, whether or not its step surfaces it to the " +
            "tenant. With `mine=true`, only those the caller may decide: they hold " +
            "`approval:write` here and are among the step's approvers, if it names any.",
          tags: ["flows"],
          params: WorkspaceParams,
          querystring: Type.Object({ mine: Type.Optional(Type.Boolean()) }),
          response: { 200: Type.Object({ items: Type.Array(Approval) }) },
        },
      },
      async ({ ctx, params, query }) => {
        const rows = await pending(params.t)
          .where("flow_run.workspace_id", "=", params.w)
          .execute();
        if (!query.mine) return { items: await Promise.all(rows.map(toApproval)) };
        const at = { tenantId: params.t, workspaceId: params.w };
        const items = [];
        for (const row of rows) {
          // A step that names its approvers is shown only to them.
          if (await mayDecide(db, ctx, at, row.detail)) items.push(await toApproval(row));
        }
        return { items };
      },
    );

    app.get(
      `${base}/approvals/decided`,
      {
        config: { access: access.workspace("approval:read") },
        schema: {
          summary: "Approvals decided in a workspace, newest first",
          description: "The last hundred.",
          tags: ["flows"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(DecidedApproval) }) },
        },
      },
      async ({ params }) => {
        const rows = await decided(params.t)
          .where("flow_run.workspace_id", "=", params.w)
          .execute();
        return { items: rows.map(toDecided) };
      },
    );

    app.get(
      "/tenants/:t/approvals",
      {
        config: { access: access.custom },
        schema: {
          summary: "Approvals surfaced to the tenant that the caller may decide",
          description:
            "Those whose step said `surface: tenant`, from every workspace. An approval that " +
            "says nothing is listed in its workspace only.",
          tags: ["flows"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Approval) }) },
        },
      },
      async ({ ctx, params }) => {
        const rows = await pending(params.t).where(SURFACED).execute();
        const allowed = new Map<string, boolean>();
        const items = [];
        const memberId = ctx.principal.type === "member" ? ctx.principal.id : null;
        for (const row of rows) {
          if (!allowed.has(row.workspace_id)) {
            allowed.set(
              row.workspace_id,
              await ctx.allowed("approval:write", {
                tenantId: params.t,
                workspaceId: row.workspace_id,
              }),
            );
          }
          if (!allowed.get(row.workspace_id)) continue;
          // A step that names its approvers is shown only to them.
          const named = approversOf(row.detail);
          if (
            named &&
            !(await isApprover(
              db,
              { tenantId: params.t, workspaceId: row.workspace_id },
              memberId,
              named,
            ))
          )
            continue;
          items.push(await toApproval(row));
        }
        // With nothing to show, answer exactly as the permission check would.
        if (items.length === 0) await ctx.authorize("approval:read", { tenantId: params.t });
        return { items };
      },
    );

    app.post(
      `${base}/flow-runs/:id/approvals/:node`,
      {
        config: { access: access.workspace("approval:write") },
        schema: {
          summary: "Approve or reject a waiting approval step",
          description: "Approving lets the flow continue. Rejecting fails the step.",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id, id: Id, node: Type.String() }),
          body: Type.Object({
            decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
            comment: Type.Optional(Type.String({ maxLength: 2000 })),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const waiting = await db
          .selectFrom("step_run")
          .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
          .select("step_run.detail")
          .where("step_run.flow_run_id", "=", params.id)
          .where("step_run.node_id", "=", params.node)
          .where("step_run.item_key", "=", "")
          .where("flow_run.workspace_id", "=", params.w)
          .executeTakeFirst();
        const named = waiting ? approversOf(waiting.detail) : undefined;
        if (
          !(await isApprover(
            db,
            { tenantId: params.t, workspaceId: params.w },
            ctx.principal.type === "member" ? ctx.principal.id : null,
            named,
          ))
        ) {
          throw new HttpError(
            403,
            "not_an_approver",
            `Only ${describeApprovers(named, await approverTitles(db, named))} may decide this approval.`,
          );
        }
        await ctx.mutate(async (trx, audit) => {
          const decided = await decideApproval(trx, {
            workspaceId: params.w,
            flowRunId: params.id,
            node: params.node,
            approve: body.decision === "approve",
            comment: body.comment,
            memberId: ctx.principal.type === "member" ? ctx.principal.id : null,
          });
          await audit({
            action: body.decision === "approve" ? "approval.approved" : "approval.rejected",
            targetType: "flow_run",
            targetId: params.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: {
              flow: decided.flow,
              node: params.node,
              title: decided.title,
              comment: body.comment ?? null,
            },
          });
        });
        kickFlow(kernel, params.id);
        return reply.code(204).send(null);
      },
    );

    // ----- Events -----

    const Event = Type.Object({
      id: Id,
      name: Type.String(),
      payload: AnyObject,
      source: Type.Object({ type: Type.String(), id: NullableId }),
      occurredAt: Time,
      publishedBy: Type.Union([Type.Object({ run: Id, script: Type.String() }), Type.Null()]),
      started: Type.Array(
        Type.Object({
          kind: Type.Union([Type.Literal("script"), Type.Literal("flow")]),
          id: Id,
          target: Type.String(),
          status: Type.String(),
        }),
      ),
      listeners: Type.Integer({
        description: "How many deployed triggers here listen for an event of this name.",
      }),
    });

    app.get(
      `${base}/events`,
      {
        config: { access: access.workspace("event:read") },
        schema: {
          summary: "Events published in a workspace, newest first",
          tags: ["events"],
          params: WorkspaceParams,
          querystring: Type.Object({
            ...PageQuery.properties,
            name: Type.Optional(Type.String()),
            run: Type.Optional(Id),
            id: Type.Optional(Id),
          }),
          response: { 200: pageOf(Event) },
        },
      },
      async ({ params, query }) => {
        const args = pageArgs(query);
        let select = db.selectFrom("event").selectAll().where("workspace_id", "=", params.w);
        if (query.name) select = select.where("name", "=", query.name);
        // One event by its ID: a link to one that the page does not reach.
        if (query.id) select = select.where("id", "=", query.id);
        // What one script run published.
        if (query.run)
          select = select.where("source_type", "=", "script").where("source_id", "=", query.run);
        if (args.after) select = select.where("id", "<", args.after);
        const rows = await select
          .orderBy("id", "desc")
          .limit(args.limit + 1)
          .execute();
        const ids = rows.map((row) => row.id);
        const publishers = rows
          .filter((row) => row.source_type === "script" && row.source_id)
          .map((row) => row.source_id as string);
        const scripts =
          publishers.length === 0
            ? []
            : await db
                .selectFrom("run")
                .select(["id", "script_path"])
                .where("id", "in", publishers)
                .execute();
        const started =
          ids.length === 0
            ? []
            : (
                await sql<{
                  event: string;
                  kind: "script" | "flow";
                  id: string;
                  target: string;
                  status: string;
                }>`
                  select trigger_detail->>'eventId' as event, 'script' as kind, id, script_path as target, status::text as status
                  from run where workspace_id = ${params.w} and trigger_detail ? 'eventId'
                    and trigger_detail->>'eventId' in (${sql.join(ids)}) and flow_run_id is null
                  union all
                  select trigger_detail->>'eventId', 'flow', id, flow_path, status::text
                  from flow_run where workspace_id = ${params.w} and trigger_detail ? 'eventId'
                    and trigger_detail->>'eventId' in (${sql.join(ids)})
                `.execute(db)
              ).rows;
        const names = [...new Set(rows.map((row) => row.name))];
        const listening =
          names.length === 0
            ? []
            : await db
                .selectFrom("trigger_state")
                .select((eb) => ["event_name", eb.fn.countAll<string>().as("n")])
                .where("workspace_id", "=", params.w)
                .where("type", "=", "event")
                .where("event_name", "in", names)
                .groupBy("event_name")
                .execute();
        return toPage(
          rows,
          args,
          (row) => row.id,
          (row) => {
            const script =
              row.source_type === "script"
                ? scripts.find((one) => one.id === row.source_id)
                : undefined;
            return {
              id: row.id,
              name: row.name,
              payload: row.payload,
              source: { type: row.source_type, id: row.source_id },
              occurredAt: iso(row.occurred_at),
              publishedBy: script ? { run: script.id, script: script.script_path } : null,
              started: started
                .filter((one) => one.event === row.id)
                .map(({ kind, id, target, status }) => ({ kind, id, target, status })),
              listeners: Number(listening.find((one) => one.event_name === row.name)?.n ?? 0),
            };
          },
        );
      },
    );

    app.post(
      `${base}/events`,
      {
        config: { access: access.workspace("event:write") },
        schema: {
          summary: "Publish an event",
          description:
            "The payload must match the event's schema. Every subscriber is started in the same " +
            "transaction that stores the event.",
          tags: ["events"],
          params: WorkspaceParams,
          body: Type.Object({ name: Type.String({ pattern: PATH_PATTERN }), payload: AnyObject }),
          response: { 201: Type.Object({ id: Id, started: Type.Integer() }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        if (body.name.startsWith("platform/")) {
          throw badRequest("Events under platform/ are published by the platform itself.");
        }
        const published = await ctx.mutate(async (trx, audit) => {
          const result = await publishEvent(kernel, trx, {
            tenantId: params.t,
            workspaceId: params.w,
            name: body.name,
            payload: body.payload,
            source: { type: "api", id: ctx.principal.id },
          });
          await audit({
            action: "event.published",
            targetType: "event",
            targetId: result.event.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: { name: body.name, started: result.started.length },
          });
          return result;
        });
        await kickStarted(kernel, published.started);
        return reply.code(201).send({ id: published.event.id, started: published.started.length });
      },
    );
  };
}
