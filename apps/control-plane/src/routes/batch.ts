import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyRequest } from "fastify";
import { Type } from "typebox";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id } from "./shared.js";

/**
 * Batch actions (phase 15, P3-3): cancel or run again many runs, decide many
 * approvals, pause many triggers, discard many drafts, in one request.
 *
 * Each item is done by the single action's own route, called in-process with
 * the caller's own credentials. So each is checked, done and audited exactly
 * as it would be alone: a batch can do nothing its caller could not do one at
 * a time, and leaves the same record. The answer says what happened to each.
 */

/** The most items one batch does. */
export const MAX_BATCH = 100;

const Result = Type.Object({
  id: Type.String({ description: "The item: a run's ID, a path, or `flowRunId/node`." }),
  ok: Type.Boolean(),
  status: Type.Integer({ description: "What the single action answered." }),
  detail: Type.Optional(Type.String({ description: "Why it was not done." })),
  requestId: Type.Optional(Type.String()),
  runId: Type.Optional(Type.String({ description: "The run started, for run again and retry." })),
});
const Answer = Type.Object({
  results: Type.Array(Result),
  done: Type.Integer(),
  failed: Type.Integer(),
});
const Ids = Type.Array(Id, { minItems: 1, maxItems: MAX_BATCH, uniqueItems: true });
const WorkspaceParams = Type.Object({ t: Id, w: Id });

/** Headers that belong to this request's body, not to the caller: the replay sets its own. */
const OWN = new Set([
  "content-length",
  "content-type",
  "transfer-encoding",
  "connection",
  "expect",
]);

type Outcome = {
  id: string;
  ok: boolean;
  status: number;
  detail?: string;
  requestId?: string;
  runId?: string;
};

/** Does one item through its own route, as the caller. */
async function replay(
  request: FastifyRequest,
  id: string,
  method: "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
): Promise<Outcome> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (!OWN.has(name) && typeof value === "string") headers[name] = value;
  }
  const response = await request.server.inject({
    method,
    url,
    headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
  let answer: { detail?: string; requestId?: string; id?: string } = {};
  try {
    answer = response.body ? JSON.parse(response.body) : {};
  } catch {
    answer = {};
  }
  const ok = response.statusCode < 400;
  const requestId = answer.requestId ?? (response.headers["x-request-id"] as string | undefined);
  return {
    id,
    ok,
    status: response.statusCode,
    ...(!ok && answer.detail ? { detail: answer.detail } : {}),
    ...(!ok && requestId ? { requestId } : {}),
    ...(ok && answer.id ? { runId: answer.id } : {}),
  };
}

/** Each item in turn: one at a time, so a batch is never a burst on the database. */
async function each<T>(items: T[], one: (item: T) => Promise<Outcome>) {
  const results: Outcome[] = [];
  for (const item of items) results.push(await one(item));
  return {
    results,
    done: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  };
}

const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export function batchRoutes(_kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const base = "/tenants/:t/workspaces/:w";
    const root = (params: { t: string; w: string }) =>
      `/api/v1/tenants/${params.t}/workspaces/${params.w}`;

    app.post(
      `${base}/runs/batch`,
      {
        // Each item is checked by its own route: run:write to cancel, run:execute to run again.
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "Cancel, or run again, many script runs",
          description:
            "Up to 100. Each is done by its own route, as the caller, so it is checked and " +
            "audited as it would be alone. The answer says what happened to each.",
          tags: ["runs"],
          params: WorkspaceParams,
          body: Type.Object({
            action: Type.Union([Type.Literal("cancel"), Type.Literal("rerun")]),
            ids: Ids,
          }),
          response: { 200: Answer },
        },
      },
      async (request) => {
        const { params, body } = request;
        // The items changed things, each through the write path, with an audit entry of its own.
        request.ctx.mutated = true;
        return each(body.ids, (id) =>
          body.action === "cancel"
            ? replay(request, id, "POST", `${root(params)}/runs/${id}/cancel`, {})
            : replay(request, id, "POST", `${root(params)}/runs/${id}/rerun`, {}),
        );
      },
    );

    app.post(
      `${base}/flow-runs/batch`,
      {
        config: { access: access.workspace("flow_run:read") },
        schema: {
          summary: "Cancel, or retry, many flow runs",
          description:
            "`retry` runs each again from its failed step; `restart` from the start. Up to 100, " +
            "each through its own route, as the caller.",
          tags: ["flows"],
          params: WorkspaceParams,
          body: Type.Object({
            action: Type.Union([
              Type.Literal("cancel"),
              Type.Literal("retry"),
              Type.Literal("restart"),
            ]),
            ids: Ids,
          }),
          response: { 200: Answer },
        },
      },
      async (request) => {
        const { params, body } = request;
        request.ctx.mutated = true;
        return each(body.ids, (id) =>
          body.action === "cancel"
            ? replay(request, id, "POST", `${root(params)}/flow-runs/${id}/cancel`, {})
            : replay(request, id, "POST", `${root(params)}/flow-runs/${id}/retry`, {
                from: body.action === "retry" ? "failed" : "start",
              }),
        );
      },
    );

    app.post(
      `${base}/trigger-pauses/batch`,
      {
        config: { access: access.workspace("trigger:read") },
        schema: {
          summary: "Pause, or resume, many triggers",
          description: "Up to 100, each through its own route, as the caller. One reason for all.",
          tags: ["runs"],
          params: WorkspaceParams,
          body: Type.Object({
            paused: Type.Boolean(),
            reason: Type.Optional(Type.String({ maxLength: 500 })),
            triggers: Type.Array(
              Type.Object({
                path: Type.String({ minLength: 1, maxLength: 255 }),
                node: Type.Optional(Type.String({ maxLength: 120 })),
              }),
              { minItems: 1, maxItems: MAX_BATCH },
            ),
          }),
          response: { 200: Answer },
        },
      },
      async (request) => {
        const { params, body } = request;
        request.ctx.mutated = true;
        return each(body.triggers, (trigger) => {
          const url = `${root(params)}/trigger-pauses/${enc(trigger.path)}${
            trigger.node ? `?node=${encodeURIComponent(trigger.node)}` : ""
          }`;
          const id = trigger.node ? `${trigger.path}#${trigger.node}` : trigger.path;
          return body.paused
            ? replay(request, id, "PUT", url, body.reason ? { reason: body.reason } : {})
            : replay(request, id, "DELETE", url);
        });
      },
    );

    app.post(
      `${base}/drafts/batch-discard`,
      {
        config: { access: access.workspace("resource:read") },
        schema: {
          summary: "Discard many drafts",
          description: "Up to 100, each through its own route, as the caller.",
          tags: ["authoring"],
          params: WorkspaceParams,
          body: Type.Object({
            paths: Type.Array(Type.String({ minLength: 1, maxLength: 255 }), {
              minItems: 1,
              maxItems: MAX_BATCH,
              uniqueItems: true,
            }),
          }),
          response: { 200: Answer },
        },
      },
      async (request) => {
        const { params, body } = request;
        request.ctx.mutated = true;
        return each(body.paths, (path) =>
          replay(request, path, "DELETE", `${root(params)}/drafts/${enc(path)}`),
        );
      },
    );

    app.post(
      "/tenants/:t/approvals/batch",
      {
        // Who may decide is asked of each approval by its own route.
        config: { access: access.signedInOrKey },
        schema: {
          summary: "Approve, or reject, many waiting approvals",
          description:
            "Up to 100, across the tenant's workspaces, each through its own route, as the " +
            "caller. One comment for all.",
          tags: ["flows"],
          params: Type.Object({ t: Id }),
          body: Type.Object({
            decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
            comment: Type.Optional(Type.String({ maxLength: 2000 })),
            approvals: Type.Array(
              Type.Object({
                workspaceId: Id,
                flowRunId: Id,
                node: Type.String({ minLength: 1, maxLength: 120 }),
              }),
              { minItems: 1, maxItems: MAX_BATCH },
            ),
          }),
          response: { 200: Answer },
        },
      },
      async (request) => {
        const { params, body } = request;
        request.ctx.mutated = true;
        return each(body.approvals, (one) =>
          replay(
            request,
            `${one.flowRunId}/${one.node}`,
            "POST",
            `/api/v1/tenants/${params.t}/workspaces/${one.workspaceId}/flow-runs/${one.flowRunId}/approvals/${encodeURIComponent(one.node)}`,
            { decision: body.decision, ...(body.comment ? { comment: body.comment } : {}) },
          ),
        );
      },
    );
  };
}
