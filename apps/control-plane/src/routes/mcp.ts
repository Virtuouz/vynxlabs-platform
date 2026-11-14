import { setTimeout as sleep } from "node:timers/promises";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { sql } from "@vynxlabs/db";
import type { FlowBody } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { check } from "../kernel/authorize.js";
import { HttpError, notFound } from "../kernel/errors.js";
import { startRun } from "../kernel/execution/runs.js";
import { approversOf, describeApprovers, isApprover } from "../kernel/flows/approvers.js";
import { decideApproval, kickFlow, startFlowRun } from "../kernel/flows/engine.js";
import { access, findWorkspace, type RequestContext, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id } from "./shared.js";

/**
 * The Model Context Protocol over the API, for an agent.
 *
 * An agent connects with a service account's API key and is offered one tool
 * per script and per flow that account may start, with the script's own input
 * schema, and tools to read a run and to decide an approval. Every call goes
 * through the same authorization check and the same audit log as the API
 * route that does the same thing. There is nothing here an API client could
 * not do: this is the API in the shape agents speak.
 */

/** How long a tool call waits for a run to end before it answers with the run's ID. */
const WAIT_MS = 25_000;
/** The most scripts and flows offered as tools. An agent is not helped by more. */
const MAX_TOOLS = 200;

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** What the tool answers, as structured content alongside the text. */
  outputSchema?: Record<string, unknown>;
  call: (input: Record<string, unknown>) => Promise<unknown>;
  /** Whether an answer reports a failure: a run that failed or was canceled. */
  failed?: (answer: unknown) => boolean;
}

/** A tool name from a path: letters, digits and underscores, at most 64 characters. */
export function toolName(prefix: string, path: string): string {
  const name = `${prefix}_${path.replace(/\//g, "__").replace(/-/g, "_")}`;
  return name.length <= 64 ? name : name.slice(0, 64);
}

const objectSchema = (schema: unknown): Record<string, unknown> => {
  const given = (schema ?? {}) as Record<string, unknown>;
  return given.type === "object" ? given : { type: "object", additionalProperties: true };
};

/**
 * A schema as an agent is best given it: without `$schema`, and without a
 * `pattern` that only restates the `format` beside it, which zod writes out as
 * a long regular expression, and without the bounds zod gives every integer,
 * which say only that it is a safe integer. Validation still uses the schema as declared.
 */
export function leanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(leanSchema);
  if (schema === null || typeof schema !== "object") return schema;
  const given = schema as Record<string, unknown>;
  const restated = typeof given.format === "string" && typeof given.pattern === "string";
  return Object.fromEntries(
    Object.entries(given)
      .filter(
        ([key, value]) =>
          !(key === "$schema" && typeof value === "string") &&
          !(key === "pattern" && restated) &&
          !(
            (key === "maximum" || key === "minimum") &&
            Math.abs(value as number) === Number.MAX_SAFE_INTEGER
          ),
      )
      .map(([key, value]) => [key, leanSchema(value)]),
  );
}

/** Whether a schema refers to definitions elsewhere in its document, which do not travel. */
const refers = (schema: unknown): boolean =>
  Array.isArray(schema)
    ? schema.some(refers)
    : schema !== null &&
      typeof schema === "object" &&
      Object.entries(schema).some(([key, value]) => key === "$ref" || refers(value));

/**
 * A name for the idempotency key argument that the tool's own input does not
 * use: `idempotencyKey`, or that with underscores before it.
 */
function keyArgument(schema: Record<string, unknown>): string {
  const taken = Object.keys((schema.properties ?? {}) as Record<string, unknown>);
  let name = "idempotencyKey";
  while (taken.includes(name)) name = `_${name}`;
  return name;
}

/** Adds the idempotency key argument to a tool's input schema. */
function withKey(schema: Record<string, unknown>, name: string): Record<string, unknown> {
  return {
    ...schema,
    properties: {
      ...((schema.properties ?? {}) as Record<string, unknown>),
      [name]: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description:
          "Optional. Calling again with the same key answers with the first run instead of starting another. Use one per request you are carrying out, so a retry cannot do it twice.",
      },
    },
  };
}

/** Takes the idempotency key out of a call's arguments, leaving the input for the script or flow. */
function splitKey(
  input: Record<string, unknown>,
  name: string,
): { key: string | undefined; rest: Record<string, unknown> } {
  const { [name]: given, ...rest } = input;
  if (given === undefined) return { key: undefined, rest };
  if (typeof given !== "string" || given.length === 0 || given.length > 200) {
    throw new HttpError(
      400,
      "validation_failed",
      `${name} must be a string of 1 to 200 characters.`,
    );
  }
  return { key: given, rest };
}

const RUN_ENDED_BADLY = ["failed", "cancelled"];
const endedBadly = (answer: unknown) =>
  RUN_ENDED_BADLY.includes(String((answer as { status?: unknown }).status));

/** What a script's tool answers. `output` is the script's declared output. */
const runAnswerSchema = (output: unknown): Record<string, unknown> => {
  const declared = output && !refers(output) ? (leanSchema(output) as object) : {};
  return {
    type: "object",
    properties: {
      runId: { type: "string" },
      script: { type: "string" },
      status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
      output: {
        description:
          "What the script returned, once it succeeded. A large output is stored and referred to.",
        anyOf: [
          declared,
          { type: "object", properties: { stored: { type: "string" } }, required: ["stored"] },
          { type: "null" },
        ],
      },
      error: { type: "string" },
      note: { type: "string" },
    },
    required: ["runId", "script", "status"],
  };
};
const FLOW_ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    flowRunId: { type: "string" },
    flow: { type: "string" },
    status: { type: "string", enum: ["running", "succeeded", "failed", "cancelled"] },
    output: { description: "Each step's output by step, once the flow succeeded." },
    error: { type: "string" },
    note: { type: "string" },
  },
  required: ["flowRunId", "flow", "status"],
};

/** What working out the tools needs of a caller: who they are, and what they may do. */
type Caller = Pick<RequestContext, "principal" | "allowed" | "authorize" | "mutate">;

async function toolsFor(kernel: Kernel, ctx: Caller, workspace: WorkspaceRef): Promise<Tool[]> {
  const { db } = kernel;
  const target = { tenantId: workspace.tenantId, workspaceId: workspace.id };
  const tools: Tool[] = [];
  const resources = await db
    .selectFrom("resource")
    .select(["id", "kind", "path", "body"])
    .where("workspace_id", "=", workspace.id)
    .where("kind", "in", ["script", "flow"])
    .orderBy("path")
    .execute();

  const ended = async <Row extends { status: string }>(read: () => Promise<Row>): Promise<Row> => {
    const deadline = Date.now() + WAIT_MS;
    let pause = 150;
    for (;;) {
      const row = await read();
      if (!["queued", "running"].includes(row.status) || Date.now() > deadline) return row;
      await sleep(pause);
      pause = Math.min(pause * 1.5, 1500);
    }
  };
  const readRun = async (id: string) => {
    const run = await db
      .selectFrom("run")
      .select(["id", "script_path", "status", "output", "output_ref", "error", "started_by_id"])
      .where("id", "=", id)
      .where("workspace_id", "=", workspace.id)
      .executeTakeFirst();
    if (!run) throw new HttpError(404, "not_found", "The run was not found.");
    return run;
  };
  const readFlowRun = async (id: string) => {
    const run = await db
      .selectFrom("flow_run")
      .select(["id", "flow_path", "status", "output", "error", "started_by_id"])
      .where("id", "=", id)
      .where("workspace_id", "=", workspace.id)
      .executeTakeFirst();
    if (!run) throw new HttpError(404, "not_found", "The flow run was not found.");
    return run;
  };
  const showRun = (run: Awaited<ReturnType<typeof readRun>>) => ({
    runId: run.id,
    script: run.script_path,
    status: run.status,
    ...(run.status === "succeeded"
      ? { output: run.output_ref ? { stored: run.output_ref } : (run.output ?? null) }
      : {}),
    ...(run.error ? { error: run.error.message } : {}),
    ...(["queued", "running"].includes(run.status)
      ? { note: "Still running. Call get_run with this runId to see how it ends." }
      : {}),
  });
  const showFlowRun = (run: Awaited<ReturnType<typeof readFlowRun>>) => ({
    flowRunId: run.id,
    flow: run.flow_path,
    status: run.status,
    ...(run.status === "succeeded" ? { output: run.output ?? null } : {}),
    ...(run.error ? { error: (run.error as { message: string }).message } : {}),
    ...(run.status === "running"
      ? {
          note: "Still running. It may be waiting for an approval or a delay. Call get_flow_run with this flowRunId later.",
        }
      : {}),
  });

  for (const resource of resources) {
    if (tools.length >= MAX_TOOLS) break;
    const scope = { ...target, resourceId: resource.id };
    if (resource.kind === "script") {
      if (!(await ctx.allowed("run:write", scope))) continue;
      const body = resource.body as { description?: string; input?: unknown; output?: unknown };
      const declared = objectSchema(body.input);
      const keyName = keyArgument(declared);
      tools.push({
        name: toolName("run", resource.path),
        description:
          `Runs the script ${resource.path}. ${body.description ?? ""} Waits a short while for it to end. Pass ${keyName} to make a retry safe.`
            .replace(/\s+/g, " ")
            .trim(),
        inputSchema: withKey(leanSchema(declared) as Record<string, unknown>, keyName),
        outputSchema: runAnswerSchema(body.output),
        failed: endedBadly,
        call: async (args) => {
          await ctx.authorize("run:write", scope);
          const { key, rest: input } = splitKey(args, keyName);
          const idempotencyKey = key ? `mcp:${ctx.principal.id}:${key}` : undefined;
          // A repeat with the same key answers with the first run and changes nothing.
          const earlier = idempotencyKey
            ? await db
                .selectFrom("run")
                .select("id")
                .where("workspace_id", "=", workspace.id)
                .where("script_path", "=", resource.path)
                .where("idempotency_key", "=", idempotencyKey)
                .executeTakeFirst()
            : undefined;
          if (earlier) return showRun(await ended(() => readRun(earlier.id)));
          const started = await ctx.mutate(async (trx, audit) => {
            const result = await startRun(kernel, trx, {
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              script: resource.path,
              input,
              trigger: { type: "manual", detail: { via: "mcp" } },
              startedBy: { type: ctx.principal.type, id: ctx.principal.id },
              ...(idempotencyKey ? { idempotencyKey } : {}),
            });
            await audit({
              action: "run.started",
              targetType: "run",
              targetId: result.run.id,
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              details: { script: resource.path, via: "mcp" },
            });
            return result;
          });
          return showRun(await ended(() => readRun(started.run.id)));
        },
      });
    } else {
      const body = resource.body as unknown as FlowBody & { description?: string };
      const manual = Object.values(body.nodes ?? {}).some(
        (node) => node.type === "trigger" && node.trigger.type === "manual",
      );
      if (!manual || !(await ctx.allowed("flow_run:write", scope))) continue;
      // The manual trigger may declare what it takes. The first one is the one started.
      const first = Object.values(body.nodes ?? {}).find(
        (node) => node.type === "trigger" && node.trigger.type === "manual",
      ) as { trigger: { input?: unknown } } | undefined;
      const declared = first?.trigger.input
        ? objectSchema(first.trigger.input)
        : { type: "object", additionalProperties: true };
      const keyName = keyArgument(declared);
      tools.push({
        name: toolName("start", resource.path),
        description:
          `Starts the flow ${resource.path} and waits a short while for it to end. ${body.description ?? ""} Pass ${keyName} to make a retry safe.`
            .replace(/\s+/g, " ")
            .trim(),
        inputSchema: withKey(leanSchema(declared) as Record<string, unknown>, keyName),
        outputSchema: FLOW_ANSWER_SCHEMA,
        failed: endedBadly,
        call: async (args) => {
          await ctx.authorize("flow_run:write", scope);
          const { key, rest: input } = splitKey(args, keyName);
          const idempotencyKey = key ? `mcp:${ctx.principal.id}:${key}` : undefined;
          const earlier = idempotencyKey
            ? await db
                .selectFrom("flow_run")
                .select("id")
                .where("workspace_id", "=", workspace.id)
                .where("flow_path", "=", resource.path)
                .where("idempotency_key", "=", idempotencyKey)
                .executeTakeFirst()
            : undefined;
          if (earlier) return showFlowRun(await ended(() => readFlowRun(earlier.id)));
          const started = await ctx.mutate(async (trx, audit) => {
            const result = await startFlowRun(kernel, trx, {
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              flow: resource.path,
              input,
              trigger: { type: "manual", detail: { via: "mcp" } },
              startedBy: { type: ctx.principal.type, id: ctx.principal.id },
              ...(idempotencyKey ? { idempotencyKey } : {}),
            });
            await audit({
              action: "flow_run.started",
              targetType: "flow_run",
              targetId: result.flowRun.id,
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              details: { flow: resource.path, via: "mcp" },
            });
            return result;
          });
          kickFlow(kernel, started.flowRun.id);
          return showFlowRun(await ended(() => readFlowRun(started.flowRun.id)));
        },
      });
    }
  }

  const mine = (startedById: string | null) =>
    ctx.principal.id !== null && startedById === ctx.principal.id;
  tools.push({
    name: "get_run",
    description: "Reads a run of a script: its status, and its output or error once it has ended.",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string", description: "The runId a run tool returned." } },
      required: ["runId"],
      additionalProperties: false,
    },
    call: async (input) => {
      const run = await readRun(String(input.runId));
      if (!mine(run.started_by_id)) await ctx.authorize("run:read", target);
      return showRun(run);
    },
  });
  tools.push({
    name: "get_flow_run",
    description:
      "Reads a flow run: its status, and its output or error once it has ended. A flow can wait a long time for an approval.",
    inputSchema: {
      type: "object",
      properties: { flowRunId: { type: "string" } },
      required: ["flowRunId"],
      additionalProperties: false,
    },
    call: async (input) => {
      const run = await readFlowRun(String(input.flowRunId));
      if (!mine(run.started_by_id)) await ctx.authorize("flow_run:read", target);
      return showFlowRun(run);
    },
  });

  if (await ctx.allowed("approval:read", target)) {
    tools.push({
      name: "list_approvals",
      description: "Lists what is waiting for a person's approval in this workspace.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      call: async () => {
        const rows = await db
          .selectFrom("step_run")
          .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
          .select([
            "step_run.flow_run_id",
            "step_run.node_id",
            "step_run.detail",
            "step_run.started_at",
            "flow_run.flow_path",
          ])
          .where("flow_run.workspace_id", "=", workspace.id)
          .where("flow_run.status", "=", "running")
          .where("step_run.status", "=", "waiting")
          .where(sql<boolean>`step_run.detail ? 'title'`)
          .orderBy("step_run.started_at")
          .limit(100)
          .execute();
        // A step that names its approvers is shown only to them, as in the console.
        const memberId = ctx.principal.type === "member" ? ctx.principal.id : null;
        const mine = [];
        for (const row of rows) {
          const named = approversOf(row.detail as Record<string, unknown>);
          if (named && !(await isApprover(db, target, memberId, named))) continue;
          mine.push(row);
        }
        return {
          approvals: mine.map((row) => ({
            flowRunId: row.flow_run_id,
            node: row.node_id,
            flow: row.flow_path,
            title: (row.detail as { title?: string }).title,
            detail: (row.detail as { detail?: unknown }).detail ?? null,
            waitingSince: row.started_at.toISOString(),
          })),
        };
      },
    });
  }
  if (await ctx.allowed("approval:write", target)) {
    tools.push({
      name: "decide_approval",
      description:
        "Approves or rejects a waiting approval. Approving lets the flow go on. Rejecting fails the step. Give a comment that says why.",
      inputSchema: {
        type: "object",
        properties: {
          flowRunId: { type: "string" },
          node: { type: "string" },
          decision: { enum: ["approve", "reject"] },
          comment: { type: "string", maxLength: 2000 },
        },
        required: ["flowRunId", "node", "decision"],
        additionalProperties: false,
      },
      call: async (input) => {
        await ctx.authorize("approval:write", target);
        const flowRunId = String(input.flowRunId);
        const approve = input.decision === "approve";
        const comment = typeof input.comment === "string" ? input.comment : undefined;
        // The step's approvers are checked here as the API route checks them.
        const waiting = await db
          .selectFrom("step_run")
          .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
          .select("step_run.detail")
          .where("step_run.flow_run_id", "=", flowRunId)
          .where("step_run.node_id", "=", String(input.node))
          .where("step_run.item_key", "=", "")
          .where("flow_run.workspace_id", "=", workspace.id)
          .executeTakeFirst();
        const named = waiting ? approversOf(waiting.detail as Record<string, unknown>) : undefined;
        const memberId = ctx.principal.type === "member" ? ctx.principal.id : null;
        if (!(await isApprover(db, target, memberId, named))) {
          throw new HttpError(
            403,
            "not_an_approver",
            `Only ${describeApprovers(named)} may decide this approval.`,
          );
        }
        const decided = await ctx.mutate(async (trx, audit) => {
          const result = await decideApproval(trx, {
            workspaceId: workspace.id,
            flowRunId,
            node: String(input.node),
            approve,
            comment,
            memberId: ctx.principal.type === "member" ? ctx.principal.id : null,
          });
          await audit({
            action: approve ? "approval.approved" : "approval.rejected",
            targetType: "flow_run",
            targetId: flowRunId,
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            details: {
              flow: result.flow,
              node: String(input.node),
              title: result.title,
              comment: comment ?? null,
              via: "mcp",
            },
          });
          return result;
        });
        kickFlow(kernel, flowRunId);
        return {
          decided: approve ? "approved" : "rejected",
          flow: decided.flow,
          title: decided.title,
        };
      },
    });
  }
  return tools;
}

export function mcpRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/tenants/:t/service-accounts/:id/tools",
      {
        config: { access: access.tenant("service_account:read") },
        schema: {
          summary: "The tools an agent is offered with a service account's key",
          description:
            "What `tools/list` would answer over the Model Context Protocol in one workspace, " +
            "worked out for the service account and not for the caller. Nothing is run. " +
            "`address` is where an agent connects, with one of the account's API keys. " +
            "Connecting needs `workspace:read` in the workspace: an account bound only to " +
            "single scripts or flows is refused, and `reachable` is false.",
          tags: ["agents"],
          params: Type.Object({ t: Id, id: Id }),
          querystring: Type.Object({ workspace: Id }),
          response: {
            200: Type.Object({
              address: Type.String(),
              reachable: Type.Boolean({
                description:
                  "Whether the account may see the workspace at all. Without that an agent is refused.",
              }),
              tools: Type.Array(
                Type.Object({
                  name: Type.String(),
                  description: Type.String(),
                  inputSchema: Type.Object({}, { additionalProperties: true }),
                  outputSchema: Type.Optional(Type.Object({}, { additionalProperties: true })),
                }),
              ),
            }),
          },
        },
      },
      async ({ params, query }) => {
        const account = await kernel.db
          .selectFrom("service_account")
          .select(["id", "name"])
          .where("id", "=", params.id)
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        if (!account) throw notFound("The service account");
        const workspace = await findWorkspace(kernel, params.t, query.workspace);
        const principal = {
          type: "service_account" as const,
          id: account.id,
          name: account.name,
          tenantId: params.t,
        };
        const allowed = async (permission: string, target: Parameters<typeof check>[3]) =>
          (await check(kernel.db, principal, permission, target)).allowed;
        const never = async (): Promise<never> => {
          throw new Error("A tool is not run from its listing.");
        };
        const reachable = await allowed("workspace:read", {
          tenantId: params.t,
          workspaceId: workspace.id,
        });
        const tools = reachable
          ? await toolsFor(
              kernel,
              { principal, allowed, authorize: never, mutate: never },
              workspace,
            )
          : [];
        return {
          address: `${kernel.config.publicUrl}/api/v1/tenants/${params.t}/workspaces/${workspace.id}/mcp`,
          reachable,
          tools: tools.map(({ name, description, inputSchema, outputSchema }) => ({
            name,
            description,
            inputSchema: inputSchema as Record<string, unknown>,
            ...(outputSchema ? { outputSchema } : {}),
          })),
        };
      },
    );

    app.post(
      "/tenants/:t/workspaces/:w/mcp",
      {
        config: { access: access.custom },
        schema: {
          summary: "The Model Context Protocol, for an agent",
          description:
            "Streamable HTTP, with no session: each request stands alone. Authenticate with an " +
            "API key, usually a service account's. The tools offered are the scripts and flows " +
            "the caller may start, with `get_run`, `get_flow_run`, and the approval tools when " +
            "the caller may read and decide approvals. A script's tool takes the script's own " +
            "input schema, and a flow's tool the input its manual trigger declares. The caller " +
            "needs `workspace:read` in the workspace to connect at all; roles bound only to " +
            "single scripts or flows are not enough on their own.",
          tags: ["agents"],
          params: Type.Object({ t: Id, w: Id }),
          body: Type.Unknown(),
          response: {
            200: Type.Unknown({
              description: "A JSON-RPC answer, as the Model Context Protocol defines it.",
            }),
          },
        },
      },
      async (request, reply) => {
        const { ctx, params } = request;
        const workspace = await findWorkspace(kernel, params.t, params.w);
        if (ctx.principal.type === "anonymous") {
          throw new HttpError(
            401,
            "unauthenticated",
            "Send an API key to use this workspace's tools.",
          );
        }
        // Someone with nothing in this workspace is told nothing about it.
        await ctx.authorize("workspace:read", { tenantId: params.t, workspaceId: params.w });

        const server = new Server(
          { name: `platform:${workspace.slug}`, version: kernel.version },
          { capabilities: { tools: {} } },
        );
        // Tools are worked out per request, from what the caller may do now.
        let tools: Tool[] | undefined;
        const load = async () => {
          tools ??= await toolsFor(kernel, ctx, workspace);
          return tools;
        };
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
          tools: (await load()).map(({ name, description, inputSchema, outputSchema }) => ({
            name,
            description,
            inputSchema: inputSchema as { type: "object" },
            ...(outputSchema ? { outputSchema: outputSchema as { type: "object" } } : {}),
          })),
        }));
        server.setRequestHandler(CallToolRequestSchema, async ({ params: call }) => {
          const tool = (await load()).find((one) => one.name === call.name);
          const text = (value: unknown, isError = false, structured = false) => ({
            content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
            ...(structured ? { structuredContent: value as Record<string, unknown> } : {}),
            ...(isError ? { isError: true } : {}),
          });
          if (!tool) {
            return text({ error: `There is no tool ${call.name}, or you may not use it.` }, true);
          }
          try {
            const answer = await tool.call((call.arguments ?? {}) as Record<string, unknown>);
            // A run that failed is the tool's failure, though the call itself went through.
            return text(answer, tool.failed?.(answer) ?? false, Boolean(tool.outputSchema));
          } catch (error) {
            // A refusal is the tool's answer, for the agent to read, not a protocol failure.
            if (error instanceof HttpError && error.statusCode < 500) {
              return text(
                {
                  error: error.message,
                  ...(error.issues?.length ? { problems: error.issues } : {}),
                },
                true,
              );
            }
            throw error;
          }
        });

        // No session: the library asks for that to be said with an explicit `undefined`,
        // which its own types do not allow under this project's settings.
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
        reply.hijack();
        reply.raw.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
      },
    );
  };
}
