import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { Type } from "typebox";
import { badRequest } from "../kernel/errors.js";
import { readConnection } from "../kernel/execution/bindings.js";
import { queueTask, toTask } from "../kernel/execution/tasks.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, NullableId, NullableString, Time, WorkspaceParams } from "./shared.js";

const Alert = Type.Object({
  kind: Type.Union([Type.Literal("run"), Type.Literal("flow_run")]),
  id: Id,
  name: Type.String({ description: "The script's or the flow's path." }),
  at: Time,
  error: NullableString,
  notified: Type.Union([Type.Boolean(), Type.Null()], {
    description: "True once posted, false when posting failed, null while it is being posted.",
  }),
  notifyError: NullableString,
  handlerRunId: NullableId,
  handlerError: NullableString,
  repeats: Type.Integer({ description: "Failures in the window after it, counted and not sent." }),
});

/** Failure alerts: what was sent, what was counted instead, and where they are set. */
export function alertRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    app.get(
      `${base}/alerts`,
      {
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "Failure alerts sent from this workspace, newest first",
          description:
            "One entry for each alert sent. Failures of the same script or flow within ten " +
            "minutes of one are not sent again; they are counted on it as `repeats`.",
          tags: ["runs"],
          params: WorkspaceParams,
          querystring: Type.Object({
            before: Type.Optional(Type.String({ format: "date-time" })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
          }),
          response: {
            200: Type.Object({ items: Type.Array(Alert), nextBefore: NullableString }),
          },
        },
      },
      async ({ params, query }) => {
        const limit = query.limit ?? 50;
        const before = query.before ? new Date(query.before) : new Date(Date.now() + 60_000);
        const rows = await sql<{
          kind: "run" | "flow_run";
          id: string;
          name: string;
          error: { message?: string } | null;
          alert: Record<string, unknown>;
          at: Date;
        }>`
          select * from (
            select 'run' as kind, id, script_path as name, error, alert,
              (alert->>'alertedAt')::timestamptz as at
            from run where workspace_id = ${params.w} and alert ? 'alertedAt'
            union all
            select 'flow_run' as kind, id, flow_path as name, error, alert,
              (alert->>'alertedAt')::timestamptz as at
            from flow_run where workspace_id = ${params.w} and alert ? 'alertedAt'
          ) as alerted
          where at < ${before}
          order by at desc, id desc
          limit ${limit + 1}
        `.execute(db);
        const page = rows.rows.slice(0, limit);
        const text = (value: unknown) => (typeof value === "string" ? value : null);
        return {
          items: page.map((row) => ({
            kind: row.kind,
            id: row.id,
            name: row.name,
            at: row.at.toISOString(),
            error: row.error?.message ?? null,
            notified: typeof row.alert.notified === "boolean" ? row.alert.notified : null,
            notifyError: text(row.alert.notifyError),
            handlerRunId: text(row.alert.handlerRunId),
            handlerError: text(row.alert.handlerError),
            repeats: Number(row.alert.repeats ?? 0),
          })),
          nextBefore: rows.rows.length > limit ? (page.at(-1)?.at.toISOString() ?? null) : null,
        };
      },
    );

    app.get(
      `${base}/alert-settings`,
      {
        config: { access: access.workspace("resource:read") },
        schema: {
          summary: "Where this workspace's failure alerts are set",
          description:
            "The workspace's default, and each deployed script that sets its own `onFailure`, " +
            "which wins over the default for that script.",
          tags: ["runs"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              default: Type.Object({
                script: Type.Optional(Type.String()),
                notify: Type.Optional(Type.String()),
              }),
              overrides: Type.Array(
                Type.Object({
                  path: Type.String(),
                  ownership: Type.String(),
                  script: Type.Optional(Type.String()),
                  notify: Type.Optional(Type.String()),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const workspace = await db
          .selectFrom("workspace")
          .select("failure_alert")
          .where("id", "=", params.w)
          .executeTakeFirstOrThrow();
        const scripts = await db
          .selectFrom("resource")
          .select(["path", "ownership", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "script")
          .orderBy("path")
          .execute();
        return {
          default: workspace.failure_alert ?? {},
          overrides: scripts.flatMap((script) => {
            const own = (script.body as { onFailure?: { script?: string; notify?: string } })
              .onFailure;
            return own
              ? [
                  {
                    path: script.path,
                    ownership: script.ownership,
                    ...(own.script ? { script: own.script } : {}),
                    ...(own.notify ? { notify: own.notify } : {}),
                  },
                ]
              : [];
          }),
        };
      },
    );

    app.post(
      `${base}/alert-tests`,
      {
        config: { access: access.workspace("connection:write") },
        schema: {
          summary: "Send a test alert through a connection",
          description:
            "One of the workspace's workers posts a sample alert to the connection, as a real " +
            "one would be. Follow the task it returns.",
          tags: ["runs"],
          params: WorkspaceParams,
          body: Type.Object({ connection: Type.String({ maxLength: 255 }) }),
          response: { 202: Type.Object({ id: Id, status: Type.String() }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const bound = await readConnection(kernel, db, {
          tenantId: params.t,
          workspaceId: params.w,
          path: body.connection,
        });
        if (!bound) throw badRequest(`The connection "${body.connection}" is not bound.`);
        const workspace = await db
          .selectFrom("workspace")
          .select("slug")
          .where("id", "=", params.w)
          .executeTakeFirstOrThrow();
        const task = await ctx.mutate(async (trx, audit) => {
          const queued = await queueTask(trx, {
            tenantId: params.t,
            workspaceId: params.w,
            kind: "deliver",
            subject: `test:${body.connection}`,
            request: {
              connection: body.connection,
              payload: {
                text: `Test alert from ${workspace.slug}. Alerts for failed runs will look like this.`,
                run: {
                  id: null,
                  script: "test",
                  attempt: 1,
                  error: "A test",
                  workspace: workspace.slug,
                },
                test: true,
              },
            },
          });
          await audit({
            action: "alert.tested",
            targetType: "connection",
            targetId: body.connection,
            tenantId: params.t,
            workspaceId: params.w,
            details: { taskId: queued.id },
          });
          return queued;
        });
        const shown = toTask(task);
        return reply.code(202).send({ id: shown.id, status: shown.status });
      },
    );
  };
}
