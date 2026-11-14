import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import { Type } from "typebox";
import { forbidden, notFound } from "../kernel/errors.js";
import { loadBundle } from "../kernel/execution/bundles.js";
import { diagnose } from "../kernel/execution/diagnose.js";
import { bundleFrames, originalPosition } from "../kernel/execution/sourcemap.js";
import { access, findWorkspace } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import {
  Id,
  iso,
  NullableString,
  NullableTime,
  pageArgs,
  Time,
  toPage,
  WorkspaceParams,
} from "./shared.js";

const ActivityStatus = Type.Union([
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("waiting"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);
type ActivityStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

const Activity = Type.Object({
  kind: Type.Union([Type.Literal("script"), Type.Literal("flow")]),
  id: Id,
  target: Type.String({ description: "The script's or the flow's path." }),
  status: ActivityStatus,
  trigger: Type.String({ description: "What started it: manual, schedule, webhook, event, form…" }),
  attempt: Type.Integer(),
  maxAttempts: Type.Integer(),
  error: NullableString,
  bundleVersion: Type.Integer(),
  createdAt: Time,
  startedAt: NullableTime,
  finishedAt: NullableTime,
});

const Diagnosis = Type.Object({
  cause: Type.String(),
  next: Type.String(),
  section: Type.Optional(Type.String()),
});

interface ActivityRow {
  kind: "script" | "flow";
  id: string;
  target: string;
  status: ActivityStatus;
  trigger_type: string;
  attempt: number;
  max_attempts: number;
  error: string | null;
  version: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The workspace's operations at a glance: one list of script and flow runs
 * together, counts over a window, and what to do about a failure.
 */
export function operationsRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    /** Which kinds of run the caller may read here. Neither is a refusal. */
    const readable = async (
      ctx: { allowed: (permission: string, at: object) => Promise<boolean> },
      t: string,
      w: string,
    ) => {
      const at = { tenantId: t, workspaceId: w };
      const [scripts, flows] = await Promise.all([
        ctx.allowed("run:read", at),
        ctx.allowed("flow_run:read", at),
      ]);
      if (!scripts && !flows) throw forbidden("run:read");
      return { scripts, flows };
    };

    /** Script runs that are not a step of a flow, and flow runs that are not a step of another. */
    const union = (
      w: string,
      may: { scripts: boolean; flows: boolean },
      filters: { from?: Date | undefined; to?: Date | undefined; target?: string | undefined },
    ) => {
      const parts = [];
      const window = (column: string) =>
        sql.join(
          [
            sql`true`,
            ...(filters.from ? [sql`${sql.ref(column)} >= ${filters.from}`] : []),
            ...(filters.to ? [sql`${sql.ref(column)} < ${filters.to}`] : []),
          ],
          sql` and `,
        );
      if (may.scripts)
        parts.push(sql`
          select 'script' as kind, r.id, r.script_path as target, r.status::text as status,
            r.trigger_type, r.attempt, r.max_attempts, r.error->>'message' as error,
            b.version, r.created_at, r.started_at, r.finished_at
          from run r join bundle b on b.id = r.bundle_id
          where r.workspace_id = ${w} and r.flow_run_id is null and ${window("r.created_at")}
            ${filters.target ? sql`and r.script_path = ${filters.target}` : sql``}
        `);
      if (may.flows)
        parts.push(sql`
          select 'flow' as kind, f.id, f.flow_path as target,
            case when f.status = 'running' and exists (
              select 1 from step_run s where s.flow_run_id = f.id and s.status = 'waiting'
            ) then 'waiting' else f.status::text end as status,
            f.trigger_type, 1 as attempt, 1 as max_attempts, f.error->>'message' as error,
            b.version, f.created_at, f.created_at as started_at, f.finished_at
          from flow_run f join bundle b on b.id = f.bundle_id
          where f.workspace_id = ${w} and f.parent_flow_run_id is null and ${window("f.created_at")}
            ${filters.target ? sql`and f.flow_path = ${filters.target}` : sql``}
        `);
      return sql.join(parts, sql` union all `);
    };

    app.get(
      `${base}/activity`,
      {
        config: { access: access.workspace("workspace:read") },
        schema: {
          summary: "Script and flow runs together, newest first",
          description:
            "Steps of a flow are left out: they are part of their flow's run. A flow run with a " +
            "step waiting for a person is `waiting`. `counts` is per status over the same window " +
            "and target, whatever `status` is asked for. Only the kinds of run the caller may " +
            "read are listed.",
          tags: ["runs"],
          params: WorkspaceParams,
          querystring: Type.Object({
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
            cursor: Type.Optional(Type.String()),
            status: Type.Optional(ActivityStatus),
            kind: Type.Optional(Type.Union([Type.Literal("script"), Type.Literal("flow")])),
            target: Type.Optional(Type.String({ maxLength: 500 })),
            from: Type.Optional(Time),
            to: Type.Optional(Time),
          }),
          response: {
            200: Type.Object({
              items: Type.Array(Activity),
              nextCursor: NullableString,
              counts: Type.Record(Type.String(), Type.Integer()),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        await findWorkspace(kernel, params.t, params.w);
        const may = await readable(ctx, params.t, params.w);
        if (query.kind === "script") may.flows = false;
        if (query.kind === "flow") may.scripts = false;
        const args = pageArgs(query);
        const filters = {
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
          target: query.target,
        };
        if (!may.scripts && !may.flows) return { items: [], nextCursor: null, counts: {} };
        const all = union(params.w, may, filters);
        const rows = await sql<ActivityRow>`
          select * from (${all}) as activity
          where true
            ${query.status ? sql`and status = ${query.status}` : sql``}
            ${args.after ? sql`and id < ${args.after}` : sql``}
          order by id desc
          limit ${args.limit + 1}
        `.execute(db);
        const counted = await sql<{ status: string; n: string }>`
          select status, count(*) as n from (${all}) as activity group by status
        `.execute(db);
        return {
          ...toPage(
            rows.rows,
            args,
            (row) => row.id,
            (row) => ({
              kind: row.kind,
              id: row.id,
              target: row.target,
              status: row.status,
              trigger: row.trigger_type,
              attempt: Number(row.attempt),
              maxAttempts: Number(row.max_attempts),
              error: row.error,
              bundleVersion: Number(row.version),
              createdAt: iso(row.created_at),
              startedAt: row.started_at ? iso(row.started_at) : null,
              finishedAt: row.finished_at ? iso(row.finished_at) : null,
            }),
          ),
          counts: Object.fromEntries(counted.rows.map((row) => [row.status, Number(row.n)])),
        };
      },
    );

    app.get(
      `${base}/run-stats`,
      {
        config: { access: access.workspace("workspace:read") },
        schema: {
          summary: "How runs went over the last hours",
          description:
            "Script and flow runs that finished in each hour of the window, by outcome, with the " +
            "median time a finished run took. Steps of a flow count as their flow.",
          tags: ["runs"],
          params: WorkspaceParams,
          querystring: Type.Object({
            hours: Type.Optional(Type.Integer({ minimum: 1, maximum: 168 })),
          }),
          response: {
            200: Type.Object({
              from: Time,
              to: Time,
              succeeded: Type.Integer(),
              failed: Type.Integer(),
              running: Type.Integer(),
              medianSeconds: Type.Union([Type.Number(), Type.Null()]),
              hours: Type.Array(
                Type.Object({
                  start: Time,
                  succeeded: Type.Integer(),
                  failed: Type.Integer(),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        await findWorkspace(kernel, params.t, params.w);
        const may = await readable(ctx, params.t, params.w);
        const hours = query.hours ?? 24;
        const to = new Date(Math.ceil(Date.now() / HOUR_MS) * HOUR_MS);
        const from = new Date(to.getTime() - hours * HOUR_MS);
        const all = union(params.w, may, { from });
        const buckets = await sql<{ hour: Date; status: string; n: string }>`
          select date_trunc('hour', created_at) as hour, status, count(*) as n
          from (${all}) as activity
          where status in ('succeeded', 'failed')
          group by 1, 2
        `.execute(db);
        const totals = await sql<{ status: string; n: string }>`
          select status, count(*) as n from (${all}) as activity group by status
        `.execute(db);
        const median = await sql<{ seconds: number | null }>`
          select percentile_cont(0.5) within group (
            order by extract(epoch from finished_at - coalesce(started_at, created_at))
          ) as seconds
          from (${all}) as activity
          where finished_at is not null
        `.execute(db);
        const total = (status: string) =>
          Number(totals.rows.find((row) => row.status === status)?.n ?? 0);
        const slots = Array.from({ length: hours }, (_, index) => {
          const start = new Date(from.getTime() + index * HOUR_MS);
          const of = (status: string) =>
            Number(
              buckets.rows.find(
                (row) => new Date(row.hour).getTime() === start.getTime() && row.status === status,
              )?.n ?? 0,
            );
          return { start: iso(start), succeeded: of("succeeded"), failed: of("failed") };
        });
        const seconds = median.rows[0]?.seconds;
        return {
          from: iso(from),
          to: iso(to),
          succeeded: total("succeeded"),
          failed: total("failed"),
          running: total("running") + total("waiting") + total("queued"),
          medianSeconds: seconds === null || seconds === undefined ? null : Number(seconds),
          hours: slots,
        };
      },
    );

    app.get(
      `${base}/runs/:id/insight`,
      {
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "How a run's attempts went, where it ran, and what to do about a failure",
          description:
            "Each attempt's time span and outcome from the run's log, the worker that ran it, " +
            "and for a failed run a suggested next step when the failure has a known shape.",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: {
            200: Type.Object({
              attempts: Type.Array(
                Type.Object({
                  attempt: Type.Integer(),
                  startedAt: Time,
                  endedAt: Time,
                  failed: Type.Boolean({ description: "Whether it logged an error." }),
                }),
              ),
              worker: Type.Union([
                Type.Object({ id: Id, name: Type.String(), pool: NullableString }),
                Type.Null(),
              ]),
              timeoutSeconds: Type.Union([Type.Integer(), Type.Null()]),
              uses: Type.Array(Type.Object({ connection: Type.String(), bound: Type.Boolean() })),
              diagnosis: Type.Union([Diagnosis, Type.Null()]),
              location: Type.Union(
                [
                  Type.Object({
                    file: Type.String(),
                    line: Type.Integer(),
                    column: Type.Integer(),
                  }),
                  Type.Null(),
                ],
                {
                  description:
                    "Where in the repository's TypeScript the failure was thrown, when the bundle carries its sources.",
                },
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const run = await db
          .selectFrom("run")
          .select([
            "id",
            "status",
            "attempt",
            "max_attempts",
            "error",
            "worker_id",
            "resource_id",
            "bundle_id",
            "script_path",
          ])
          .where("id", "=", params.id)
          .where("workspace_id", "=", params.w)
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        if (!run) throw notFound("The run");
        const attempts = await db
          .selectFrom("run_log")
          .select((eb) => [
            "attempt",
            eb.fn.min("logged_at").as("started"),
            eb.fn.max("logged_at").as("ended"),
            sql<boolean>`bool_or(level = 'error')`.as("failed"),
          ])
          .where("run_id", "=", run.id)
          .groupBy("attempt")
          .orderBy("attempt")
          .execute();
        const worker = run.worker_id
          ? await db
              .selectFrom("worker")
              .innerJoin("worker_credential", "worker_credential.id", "worker.credential_id")
              .select(["worker.id", "worker_credential.name", "worker_credential.pool"])
              .where("worker.id", "=", run.worker_id)
              .executeTakeFirst()
          : undefined;
        const script = await db
          .selectFrom("resource")
          .select("body")
          .where("id", "=", run.resource_id)
          .executeTakeFirst();
        const body = (script?.body ?? {}) as {
          timeoutSeconds?: number;
          uses?: { connections?: string[] };
        };
        const connections = body.uses?.connections ?? [];
        const bound = new Set(
          connections.length === 0
            ? []
            : (
                await db
                  .selectFrom("connection_binding")
                  .select("path")
                  .where("workspace_id", "=", params.w)
                  .where("path", "in", connections)
                  .execute()
              ).map((row) => row.path),
        );
        const uses = connections.map((connection) => ({
          connection,
          bound: bound.has(connection),
        }));
        const diagnosis =
          run.status === "failed" && run.error
            ? diagnose({
                message: run.error.message,
                attempt: run.attempt,
                maxAttempts: run.max_attempts,
                timeoutSeconds: body.timeoutSeconds,
                unbound: uses.filter((one) => !one.bound).map((one) => one.connection),
              })
            : undefined;
        let location: { file: string; line: number; column: number } | null = null;
        if (run.status === "failed" && run.error?.stack) {
          const bundle = await db
            .selectFrom("bundle")
            .select(["id", "storage_key", "digest"])
            .where("id", "=", run.bundle_id)
            .executeTakeFirst();
          const loaded = bundle
            ? await loadBundle(kernel, bundle).catch(() => undefined)
            : undefined;
          const sources = loaded?.sources;
          if (bundle && sources) {
            const own = new Set(sources.files.map((file) => file.path));
            for (const frame of bundleFrames(run.error.stack, bundle.digest)) {
              const at = originalPosition(sources.map, frame.line, frame.column);
              if (at && own.has(at.source)) {
                location = { file: at.source, line: at.line, column: at.column };
                break;
              }
            }
          }
        }
        return {
          location,
          attempts: attempts.map((row) => ({
            attempt: row.attempt,
            startedAt: iso(new Date(row.started as unknown as string)),
            endedAt: iso(new Date(row.ended as unknown as string)),
            failed: Boolean(row.failed),
          })),
          worker: worker ? { id: worker.id, name: worker.name, pool: worker.pool } : null,
          timeoutSeconds: body.timeoutSeconds ?? null,
          uses,
          diagnosis: diagnosis ?? null,
        };
      },
    );

    app.get(
      `${base}/script-source/*`,
      {
        config: { access: access.workspace("bundle:read") },
        schema: {
          summary: "The TypeScript a repository script was built from",
          description:
            "From the active bundle, when it carries its sources. `file` is the one that " +
            "defines the script, when it can be told. A script written in the console keeps " +
            "its source on the script itself instead.",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, "*": Type.String({ minLength: 1 }) }),
          response: {
            200: Type.Object({
              available: Type.Boolean(),
              file: NullableString,
              line: Type.Union([Type.Integer(), Type.Null()]),
              files: Type.Array(Type.Object({ path: Type.String(), content: Type.String() })),
            }),
          },
        },
      },
      async ({ params }) => {
        const path = params["*"];
        const active = await db
          .selectFrom("workspace")
          .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
          .select(["bundle.id", "bundle.storage_key"])
          .where("workspace.id", "=", params.w)
          .where("workspace.tenant_id", "=", params.t)
          .executeTakeFirst();
        const sources = active ? (await loadBundle(kernel, active)).sources : undefined;
        if (!sources) return { available: false, file: null, line: null, files: [] };
        // The file whose text names the script's path is the one that defines it.
        const named = new RegExp(`["'\`]${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
        let file: string | null = null;
        let line: number | null = null;
        for (const candidate of sources.files) {
          const lines = candidate.content.split("\n");
          const at = lines.findIndex((text) => named.test(text));
          if (at >= 0) {
            file = candidate.path;
            line = at + 1;
            break;
          }
        }
        return { available: true, file, line, files: sources.files };
      },
    );
  };
}
