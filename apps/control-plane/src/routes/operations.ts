import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { isId, sql } from "@volvel/db";
import { Type } from "typebox";
import { badRequest, forbidden, notFound } from "../kernel/errors.js";
import { loadBundle } from "../kernel/execution/bundles.js";
import { diagnose } from "../kernel/execution/diagnose.js";
import { bundleFrames, originalPosition } from "../kernel/execution/sourcemap.js";
import {
  flowStateSql,
  type RunState,
  RunStateSchema,
  runStateSql,
} from "../kernel/execution/state.js";
import { access, findWorkspace } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { effectivePolicy } from "../kernel/retention.js";
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
  state: RunStateSchema,
  trigger: Type.String({ description: "What started it: manual, schedule, webhook, event, form…" }),
  attempt: Type.Integer(),
  maxAttempts: Type.Integer(),
  error: NullableString,
  errorSummary: NullableString,
  outputSummary: Type.Union([Type.String(), Type.Null()], {
    description: "A short line of what it produced, with secret-looking values masked.",
  }),
  tags: Type.Array(Type.String()),
  bundleVersion: Type.Integer(),
  createdAt: Time,
  scheduledFor: Type.Union([Time, Type.Null()], {
    description: "When a delayed or scheduled script run was due. Flow runs have none.",
  }),
  wakeAt: Type.Union([Time, Type.Null()], {
    description:
      "When a flow run that is `waiting_time` goes on: its earliest waiting step's time.",
  }),
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
  state: RunState;
  trigger_type: string;
  attempt: number;
  max_attempts: number;
  error: string | null;
  error_summary: string | null;
  output_summary: string | null;
  tags: string[];
  version: number;
  created_at: Date;
  scheduled_for: Date | null;
  wake_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  sort_value: number | null;
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
      filters: {
        from?: Date | undefined;
        to?: Date | undefined;
        target?: string | undefined;
        q?: string | undefined;
        tags?: string[] | undefined;
      },
    ) => {
      const parts = [];
      /** What a search matches: the start of the path, the exact ID or tag, or the error. */
      const matching = (alias: "r" | "f", path: string) => {
        const conditions = [];
        if (filters.q) {
          const q = filters.q;
          const options = [
            sql`${sql.ref(`${alias}.${path}`)} like ${`${q.replace(/[\\%_]/g, "\\$&")}%`}`,
            sql`${q} = any(${sql.ref(`${alias}.tags`)})`,
            sql`${sql.ref(`${alias}.error_summary`)} ilike ${`%${q.replace(/[\\%_]/g, "\\$&")}%`}`,
          ];
          if (isId(q)) options.push(sql`${sql.ref(`${alias}.id`)} = ${q}::uuid`);
          conditions.push(sql`(${sql.join(options, sql` or `)})`);
        }
        for (const tag of filters.tags ?? []) {
          conditions.push(sql`${tag} = any(${sql.ref(`${alias}.tags`)})`);
        }
        return conditions.length > 0 ? sql`and ${sql.join(conditions, sql` and `)}` : sql``;
      };
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
            ${runStateSql("r.status")} as state, r.trigger_type, r.attempt, r.max_attempts, r.error->>'message' as error,
            r.error_summary, r.output_summary, r.tags,
            b.version, r.created_at, r.scheduled_for, null::timestamptz as wake_at, r.started_at,
            r.finished_at
          from run r join bundle b on b.id = r.bundle_id
          where r.workspace_id = ${w} and r.flow_run_id is null and ${window("r.created_at")}
            ${filters.target ? sql`and r.script_path = ${filters.target}` : sql``}
            ${matching("r", "script_path")}
        `);
      if (may.flows)
        parts.push(sql`
          select 'flow' as kind, f.id, f.flow_path as target,
            case when f.status = 'running' and exists (
              select 1 from step_run s where s.flow_run_id = f.id and s.status = 'waiting'
            ) then 'waiting' else f.status::text end as status,
            ${flowStateSql("f")} as state, f.trigger_type, 1 as attempt, 1 as max_attempts, f.error->>'message' as error,
            f.error_summary, f.output_summary, f.tags,
            b.version, f.created_at, null::timestamptz as scheduled_for,
            (select min(s.wake_at) from step_run s
              where s.flow_run_id = f.id and s.status = 'waiting') as wake_at,
            f.created_at as started_at, f.finished_at
          from flow_run f join bundle b on b.id = f.bundle_id
          where f.workspace_id = ${w} and f.parent_flow_run_id is null and ${window("f.created_at")}
            ${filters.target ? sql`and f.flow_path = ${filters.target}` : sql``}
            ${matching("f", "flow_path")}
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
            state: Type.Optional(
              Type.Union([RunStateSchema, Type.Literal("waiting")], {
                description: "Only runs in this state. `waiting` is either kind of waiting.",
              }),
            ),
            kind: Type.Optional(Type.Union([Type.Literal("script"), Type.Literal("flow")])),
            target: Type.Optional(Type.String({ maxLength: 500 })),
            q: Type.Optional(
              Type.String({
                maxLength: 200,
                description:
                  "Finds runs whose path starts with it, whose ID or a tag is it, or whose error contains it.",
              }),
            ),
            tag: Type.Optional(
              Type.Union(
                [Type.String({ maxLength: 64 }), Type.Array(Type.String({ maxLength: 64 }))],
                {
                  description: "Only runs with this tag. Repeat for runs with every one of them.",
                },
              ),
            ),
            from: Type.Optional(Time),
            to: Type.Optional(Time),
            sort: Type.Optional(
              Type.Union([Type.Literal("started"), Type.Literal("duration")], {
                description:
                  "Order by when each run started (or was due, or received), or by how long it took. " +
                  "Newest first when left out.",
              }),
            ),
            dir: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
          }),
          response: {
            200: Type.Object({
              items: Type.Array(Activity),
              nextCursor: NullableString,
              counts: Type.Record(Type.String(), Type.Integer()),
              stateCounts: Type.Record(Type.String(), Type.Integer(), {
                description: "Per state, over the same window and target.",
              }),
              keptDays: Type.Integer({
                description: "How many days runs are kept after they end, in this tenant.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        await findWorkspace(kernel, params.t, params.w);
        const keptDays = (await effectivePolicy(kernel, params.t)).runsDays;
        const may = await readable(ctx, params.t, params.w);
        if (query.kind === "script") may.flows = false;
        if (query.kind === "flow") may.scripts = false;
        const args = pageArgs(query);
        const filters = {
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
          target: query.target,
          q: query.q?.trim() || undefined,
          tags: query.tag === undefined ? undefined : ([] as string[]).concat(query.tag),
        };
        if (!may.scripts && !may.flows) {
          return { items: [], nextCursor: null, counts: {}, stateCounts: {}, keptDays };
        }
        const all = union(params.w, may, filters);
        const descending = (query.dir ?? "desc") === "desc";
        // Runs not yet started sort by when they were due or received; unfinished ones last by duration.
        const sortValue =
          query.sort === "started"
            ? sql`extract(epoch from coalesce(started_at, scheduled_for, created_at))::float8`
            : query.sort === "duration"
              ? sql`coalesce(extract(epoch from finished_at - started_at)::float8, -1)`
              : sql`null::float8`;
        let afterValue: number | undefined;
        let afterId = args.after;
        if (query.sort && args.after) {
          const [value, id] = args.after.split("|");
          afterValue = Number(value);
          afterId = id;
          if (!Number.isFinite(afterValue) || !afterId || !isId(afterId)) {
            throw badRequest("The cursor is not valid.");
          }
        }
        const keyset = !afterId
          ? sql``
          : query.sort
            ? descending
              ? sql`and (sort_value, id) < (${afterValue}::float8, ${afterId}::uuid)`
              : sql`and (sort_value, id) > (${afterValue}::float8, ${afterId}::uuid)`
            : sql`and id < ${afterId}`;
        const order = query.sort
          ? descending
            ? sql`order by sort_value desc, id desc`
            : sql`order by sort_value asc, id asc`
          : sql`order by id desc`;
        const rows = await sql<ActivityRow>`
          select * from (select *, ${sortValue} as sort_value from (${all}) as a) as activity
          where true
            ${query.status ? sql`and status = ${query.status}` : sql``}
            ${
              query.state === "waiting"
                ? sql`and state in ('waiting_approval', 'waiting_time')`
                : query.state
                  ? sql`and state = ${query.state}`
                  : sql``
            }
            ${keyset}
          ${order}
          limit ${args.limit + 1}
        `.execute(db);
        const counted = await sql<{ status: string; n: string }>`
          select status, count(*) as n from (${all}) as activity group by status
        `.execute(db);
        const stateCounted = await sql<{ state: string; n: string }>`
          select state, count(*) as n from (${all}) as activity group by state
        `.execute(db);
        return {
          ...toPage(
            rows.rows,
            args,
            (row) => (query.sort ? `${row.sort_value}|${row.id}` : row.id),
            (row) => ({
              kind: row.kind,
              id: row.id,
              target: row.target,
              status: row.status,
              state: row.state,
              trigger: row.trigger_type,
              attempt: Number(row.attempt),
              maxAttempts: Number(row.max_attempts),
              error: row.error,
              errorSummary: row.error_summary,
              outputSummary: row.output_summary,
              tags: row.tags,
              bundleVersion: Number(row.version),
              createdAt: iso(row.created_at),
              scheduledFor: row.scheduled_for ? iso(row.scheduled_for) : null,
              wakeAt: row.wake_at ? iso(row.wake_at) : null,
              startedAt: row.started_at ? iso(row.started_at) : null,
              finishedAt: row.finished_at ? iso(row.finished_at) : null,
            }),
          ),
          counts: Object.fromEntries(counted.rows.map((row) => [row.status, Number(row.n)])),
          stateCounts: Object.fromEntries(
            stateCounted.rows.map((row) => [row.state, Number(row.n)]),
          ),
          keptDays,
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
                  failed: Type.Boolean({
                    description: "Whether it logged an error, or the run failed on it.",
                  }),
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
        const script = run.resource_id
          ? await db
              .selectFrom("resource")
              .select("body")
              .where("id", "=", run.resource_id)
              .executeTakeFirst()
          : undefined;
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
          const written = loaded?.consoleSources;
          if (bundle && (sources || written)) {
            const own = new Set(sources?.files.map((file) => file.path) ?? []);
            const console = new Set(written?.files.map((file) => file.path) ?? []);
            for (const frame of bundleFrames(run.error.stack, bundle.digest)) {
              // Code written in the console sits after the repository's, with its own map.
              const at =
                written && frame.line > written.line
                  ? originalPosition(written.map, frame.line - written.line, frame.column)
                  : sources
                    ? originalPosition(sources.map, frame.line, frame.column)
                    : undefined;
              if (at && (own.has(at.source) || console.has(at.source))) {
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
            // An error logged in it, or the run's own failure on its last attempt: a script that
            // throws without logging failed all the same.
            failed: Boolean(row.failed) || (run.status === "failed" && row.attempt === run.attempt),
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
          summary: "The TypeScript a script was built from, at a version",
          description:
            "From the active bundle, or the bundle a run ran on (`run`), or a bundle of the " +
            "workspace (`bundle`). A repository script's files come from the bundle's sources, " +
            "when it carries them; a script written in the console is its own one file. `file` " +
            "is the one that defines the script, when it can be told.",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, "*": Type.String({ minLength: 1 }) }),
          querystring: Type.Object({
            run: Type.Optional(Id),
            bundle: Type.Optional(Id),
          }),
          response: {
            200: Type.Object({
              available: Type.Boolean(),
              file: NullableString,
              line: Type.Union([Type.Integer(), Type.Null()]),
              files: Type.Array(Type.Object({ path: Type.String(), content: Type.String() })),
              bundleVersion: Type.Union([Type.Integer(), Type.Null()], {
                description: "The version the source is from.",
              }),
            }),
          },
        },
      },
      async ({ params, query }) => {
        const path = params["*"];
        await findWorkspace(kernel, params.t, params.w);
        const chosen = query.run
          ? (
              await db
                .selectFrom("run")
                .select("bundle_id")
                .where("id", "=", query.run)
                .where("workspace_id", "=", params.w)
                .executeTakeFirst()
            )?.bundle_id
          : query.bundle;
        if ((query.run || query.bundle) && !chosen)
          throw notFound(query.run ? "The run" : "The bundle");
        const active = await db
          .selectFrom("bundle")
          .select(["bundle.id", "bundle.storage_key", "bundle.version"])
          .where("bundle.workspace_id", "=", params.w)
          .where(
            "bundle.id",
            "=",
            chosen ??
              db
                .selectFrom("workspace")
                .select("active_bundle_id")
                .where("id", "=", params.w)
                .$castTo<string>(),
          )
          .executeTakeFirst();
        if (query.bundle && !active) throw notFound("The bundle");
        const loaded = active ? await loadBundle(kernel, active) : undefined;
        const bundleVersion = active ? Number(active.version) : null;
        // A script written in the console carries its code in its own manifest.
        const manifest = loaded?.manifests.find(
          (one) => one.kind === "script" && one.path === path,
        );
        const code = (manifest?.body.source as { code?: unknown } | undefined)?.code;
        if (typeof code === "string") {
          const file = `${path}.script.ts`;
          return {
            available: true,
            file,
            line: 1,
            files: [{ path: file, content: code }],
            bundleVersion,
          };
        }
        const sources = loaded?.sources;
        if (!sources) return { available: false, file: null, line: null, files: [], bundleVersion };
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
        return { available: true, file, line, files: sources.files, bundleVersion };
      },
    );
  };
}
