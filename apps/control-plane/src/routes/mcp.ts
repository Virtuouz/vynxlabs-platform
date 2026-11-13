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
  call: (input: Record<string, unknown>) => Promise<unknown>;
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
      const body = resource.body as { description?: string; input?: unknown };
      tools.push({
        name: toolName("run", resource.path),
        description: `Runs the script ${resource.path}. ${body.description ?? ""}`.trim(),
        inputSchema: objectSchema(body.input),
        call: async (input) => {
          await ctx.authorize("run:write", scope);
          const started = await ctx.mutate(async (trx, audit) => {
            const result = await startRun(kernel, trx, {
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              script: resource.path,
              input,
              trigger: { type: "manual", detail: { via: "mcp" } },
              startedBy: { type: ctx.principal.type, id: ctx.principal.id },
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
      tools.push({
        name: toolName("start", resource.path),
        description:
          `Starts the flow ${resource.path} and waits a short while for it to end. ${body.description ?? ""}`.trim(),
        inputSchema: { type: "object", additionalProperties: true },
        call: async (input) => {
          await ctx.authorize("flow_run:write", scope);
          const started = await ctx.mutate(async (trx, audit) => {
            const result = await startFlowRun(kernel, trx, {
              tenantId: workspace.tenantId,
              workspaceId: workspace.id,
              flow: resource.path,
              input,
              trigger: { type: "manual", detail: { via: "mcp" } },
              startedBy: { type: ctx.principal.type, id: ctx.principal.id },
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
        return {
          approvals: rows.map((row) => ({
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
            "`address` is where an agent connects, with one of the account's API keys.",
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
          tools: tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema: inputSchema as Record<string, unknown>,
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
            "input schema.",
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
          tools: (await load()).map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema: inputSchema as { type: "object" },
          })),
        }));
        server.setRequestHandler(CallToolRequestSchema, async ({ params: call }) => {
          const tool = (await load()).find((one) => one.name === call.name);
          const text = (value: unknown, isError = false) => ({
            content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
            ...(isError ? { isError: true } : {}),
          });
          if (!tool) {
            return text({ error: `There is no tool ${call.name}, or you may not use it.` }, true);
          }
          try {
            return text(await tool.call((call.arguments ?? {}) as Record<string, unknown>));
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
