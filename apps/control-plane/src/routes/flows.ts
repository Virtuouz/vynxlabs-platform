import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import { type FlowBody, PATH_PATTERN } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { badRequest, notFound } from "../kernel/errors.js";
import { kickStarted, webhookToken } from "../kernel/execution/triggers.js";
import { cancelFlowRun, decideApproval, kickFlow, startFlowRun } from "../kernel/flows/engine.js";
import { publishEvent } from "../kernel/flows/events.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
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
  trigger: AnyObject,
  triggerNode: Type.String(),
  startedBy: Type.Object({ type: Type.String(), id: NullableId }),
  bundleId: Id,
  bundleVersion: Type.Integer(),
  error: ErrorShape,
  parentFlowRunId: NullableId,
  createdAt: Time,
  finishedAt: NullableTime,
});
interface FlowRunRow {
  id: string;
  flow_path: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  trigger_type: string;
  trigger_detail: Record<string, unknown>;
  trigger_node: string;
  started_by_type: string;
  started_by_id: string | null;
  bundle_id: string;
  bundle_version: number;
  error: { message: string } | null;
  parent_flow_run_id: string | null;
  created_at: Date;
  finished_at: Date | null;
}
const toFlowRun = (row: FlowRunRow) => ({
  id: row.id,
  flow: row.flow_path,
  status: row.status,
  trigger: { type: row.trigger_type, ...row.trigger_detail },
  triggerNode: row.trigger_node,
  startedBy: { type: row.started_by_type, id: row.started_by_id },
  bundleId: row.bundle_id,
  bundleVersion: row.bundle_version,
  error: row.error ? { message: row.error.message } : null,
  parentFlowRunId: row.parent_flow_run_id,
  createdAt: iso(row.created_at),
  finishedAt: isoOrNull(row.finished_at),
});

const Step = Type.Object({
  node: Type.String(),
  item: Type.String({ description: "Empty, or the item's index for one item of a foreach." }),
  status: Type.String(),
  outputName: NullableString,
  output: Type.Unknown(),
  error: ErrorShape,
  handled: Type.Boolean({ description: "True when the step failed and its error path was taken." }),
  runId: NullableId,
  childFlowRunId: NullableId,
  wakeAt: NullableTime,
  detail: AnyObject,
  startedAt: Time,
  finishedAt: NullableTime,
});

const Approval = Type.Object({
  flowRunId: Id,
  workspaceId: Id,
  flow: Type.String(),
  node: Type.String(),
  title: Type.String(),
  detail: Type.Unknown(),
  waitingSince: Time,
  timesOutAt: NullableTime,
});

const Position = Type.Object({ x: Type.Number(), y: Type.Number() });

export function flowRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

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
                  lastRun: Type.Union([
                    Type.Object({ id: Id, status: FlowRunStatus, createdAt: Time }),
                    Type.Null(),
                  ]),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const flows = await db
          .selectFrom("resource")
          .select(["path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "flow")
          .orderBy("path")
          .execute();
        const latest = await sql<{
          flow_path: string;
          id: string;
          status: FlowRunRow["status"];
          created_at: Date;
        }>`
          select distinct on (flow_path) flow_path, id, status, created_at
          from flow_run where workspace_id = ${params.w} and parent_flow_run_id is null
          order by flow_path, id desc
        `.execute(db);
        const byFlow = new Map(latest.rows.map((row) => [row.flow_path, row]));
        return {
          items: flows.map((flow) => {
            const body = flow.body as unknown as FlowBody;
            const last = byFlow.get(flow.path);
            return {
              path: flow.path,
              description: body.description ?? "",
              nodeCount: Object.keys(body.nodes).length,
              triggers: Object.values(body.nodes)
                .flatMap((node) => (node.type === "trigger" ? [node.trigger.type] : []))
                .sort(),
              lastRun: last
                ? { id: last.id, status: last.status, createdAt: iso(last.created_at) }
                : null,
            };
          }),
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
          layout: layout?.positions ?? {},
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
            "Positions are not part of the flow. Saving them changes no version and no behaviour.",
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

    const flowRuns = (workspaceId: string) =>
      db
        .selectFrom("flow_run")
        .innerJoin("bundle", "bundle.id", "flow_run.bundle_id")
        .selectAll("flow_run")
        .select("bundle.version as bundle_version")
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
        if (query.flow) select = select.where("flow_run.flow_path", "=", query.flow);
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
        config: { access: access.workspace("flow_run:write") },
        schema: {
          summary: "Start a flow from its manual trigger",
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
        return reply.code(started.created ? 201 : 200).send(toFlowRun(row));
      },
    );

    app.get(
      `${base}/flow-runs/:id`,
      {
        config: { access: access.workspace("flow_run:read") },
        schema: {
          summary: "One flow run, with every step",
          tags: ["flows"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: {
            200: Type.Object({
              ...FlowRun.properties,
              input: Type.Unknown(),
              output: Type.Unknown(),
              steps: Type.Array(Step),
            }),
          },
        },
      },
      async ({ params }) => {
        const row = await flowRuns(params.w)
          .where("flow_run.id", "=", params.id)
          .executeTakeFirst();
        if (!row) throw notFound("The flow run");
        const steps = await db
          .selectFrom("step_run")
          .leftJoin("run", "run.id", "step_run.run_id")
          .selectAll("step_run")
          .select(["run.output as run_output", "run.output_ref as run_output_ref"])
          .where("step_run.flow_run_id", "=", params.id)
          .orderBy("step_run.started_at")
          .orderBy("step_run.node_id")
          .execute();
        return {
          ...toFlowRun(row),
          input: row.input_ref ? { stored: row.input_ref } : (row.input ?? null),
          output: row.output ?? null,
          steps: steps.map((step) => ({
            node: step.node_id,
            item: step.item_key,
            status: step.status,
            outputName: step.output_name,
            // A code step's output is its run's. Something large is named, not sent.
            output: step.run_id
              ? step.run_output_ref
                ? { stored: step.run_output_ref }
                : (step.run_output ?? null)
              : step.output_ref
                ? { stored: step.output_ref }
                : (step.output ?? null),
            error: step.error ? { message: step.error.message } : null,
            handled: step.handled,
            runId: step.run_id,
            childFlowRunId: step.child_flow_run_id,
            wakeAt: isoOrNull(step.wake_at),
            // A foreach keeps its items here. They are shown through its item steps instead.
            detail: Object.fromEntries(
              Object.entries(step.detail).filter(([name]) => name !== "items"),
            ),
            startedAt: iso(step.started_at),
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
        // A cancelled sub-flow lets the flow that started it move on.
        if (cancelled.parent_flow_run_id) kickFlow(kernel, cancelled.parent_flow_run_id);
        return toFlowRun(
          await flowRuns(params.w).where("flow_run.id", "=", params.id).executeTakeFirstOrThrow(),
        );
      },
    );

    // ----- Approvals -----

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
    const toApproval = (row: PendingRow) => ({
      flowRunId: row.flow_run_id,
      workspaceId: row.workspace_id,
      flow: row.flow_path,
      node: row.node_id,
      title: String(row.detail.title),
      detail: row.detail.detail ?? null,
      waitingSince: iso(row.started_at),
      timesOutAt: isoOrNull(row.wake_at),
    });

    app.get(
      `${base}/approvals`,
      {
        config: { access: access.workspace("approval:read") },
        schema: {
          summary: "Approvals waiting for a decision in a workspace",
          tags: ["flows"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(Approval) }) },
        },
      },
      async ({ params }) => {
        const rows = await pending(params.t)
          .where("flow_run.workspace_id", "=", params.w)
          .execute();
        return { items: rows.map(toApproval) };
      },
    );

    app.get(
      "/tenants/:t/approvals",
      {
        config: { access: access.custom },
        schema: {
          summary: "Approvals the caller may decide, across the tenant's workspaces",
          tags: ["flows"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Approval) }) },
        },
      },
      async ({ ctx, params }) => {
        const rows = await pending(params.t).execute();
        const allowed = new Map<string, boolean>();
        const items = [];
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
          if (allowed.get(row.workspace_id)) items.push(toApproval(row));
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
    });

    app.get(
      `${base}/events`,
      {
        config: { access: access.workspace("event:read") },
        schema: {
          summary: "Events published in a workspace, newest first",
          tags: ["events"],
          params: WorkspaceParams,
          querystring: Type.Object({ ...PageQuery.properties, name: Type.Optional(Type.String()) }),
          response: { 200: pageOf(Event) },
        },
      },
      async ({ params, query }) => {
        const args = pageArgs(query);
        let select = db.selectFrom("event").selectAll().where("workspace_id", "=", params.w);
        if (query.name) select = select.where("name", "=", query.name);
        if (args.after) select = select.where("id", "<", args.after);
        const rows = await select
          .orderBy("id", "desc")
          .limit(args.limit + 1)
          .execute();
        return toPage(
          rows,
          args,
          (row) => row.id,
          (row) => ({
            id: row.id,
            name: row.name,
            payload: row.payload,
            source: { type: row.source_type, id: row.source_id },
            occurredAt: iso(row.occurred_at),
          }),
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
