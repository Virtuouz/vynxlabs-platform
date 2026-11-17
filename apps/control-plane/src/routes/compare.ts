import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import { Type } from "typebox";
import { notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, Time } from "./shared.js";

/**
 * What changed since a target last succeeded (phase 15, P3-7). A run that
 * failed is most often failing because something changed: its version, or
 * what it was given. These name the last run of the same script or flow, in
 * the same workspace, before this one, that succeeded, and say whether the
 * version and the input differ.
 */

const Previous = Type.Object({
  run: Type.Union([
    Type.Object({
      id: Id,
      bundleVersion: Type.Union([Type.Integer(), Type.Null()]),
      startedAt: Type.Union([Time, Type.Null()]),
      finishedAt: Type.Union([Time, Type.Null()]),
      durationMs: Type.Union([Type.Integer(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  bundleVersion: Type.Union([Type.Integer(), Type.Null()], {
    description: "This run's version, to set beside the last success's.",
  }),
  versionChanged: Type.Boolean(),
  inputChanged: Type.Union([Type.Boolean(), Type.Null()], {
    description: "Null when it cannot be told: an input too large to be kept inline.",
  }),
});

interface Row {
  id: string;
  version: number | null;
  started: Date | null;
  finished: Date | null;
  same_input: boolean | null;
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export function compareRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  const { db } = kernel;
  return async (app) => {
    const base = "/tenants/:t/workspaces/:w";
    const Params = Type.Object({ t: Id, w: Id, id: Id });

    /** The run, its version, and the last success before it, compared. */
    const answer = async (
      table: "run" | "flow_run",
      workspaceId: string,
      id: string,
    ): Promise<{
      run: {
        id: string;
        bundleVersion: number | null;
        startedAt: string | null;
        finishedAt: string | null;
        durationMs: number | null;
      } | null;
      bundleVersion: number | null;
      versionChanged: boolean;
      inputChanged: boolean | null;
    }> => {
      const path = sql.raw(table === "run" ? "script_path" : "flow_path");
      const startedAt = sql.raw(table === "run" ? "started_at" : "created_at");
      const target = sql.table(table);
      const self = await sql<{ path: string; version: number | null }>`
        select r.${path} as path, b.version
        from ${target} r left join bundle b on b.id = r.bundle_id
        where r.id = ${id}::uuid and r.workspace_id = ${workspaceId}::uuid
      `.execute(db);
      const run = self.rows[0];
      if (!run) throw notFound(table === "run" ? "The run" : "The flow run");
      // The newest success older than this run: ids are time-ordered, and the partial index
      // keeps this to a few rows however long the history.
      const found = await sql<Row>`
        select p.id, b.version, p.${startedAt} as started, p.finished_at as finished,
          (p.input is not distinct from r.input and p.input_ref is not distinct from r.input_ref)
            as same_input,
          (p.input_ref is not null or r.input_ref is not null) as by_ref
        from ${target} p
        join ${target} r on r.id = ${id}::uuid
        left join bundle b on b.id = p.bundle_id
        where p.workspace_id = ${workspaceId}::uuid and p.${path} = ${run.path}
          and p.status = 'succeeded' and p.id < ${id}::uuid
          ${table === "flow_run" ? sql`and p.parent_flow_run_id is null` : sql``}
        order by p.id desc
        limit 1
      `.execute(db);
      const last = found.rows[0] as (Row & { by_ref: boolean }) | undefined;
      if (!last) {
        return { run: null, bundleVersion: run.version, versionChanged: false, inputChanged: null };
      }
      return {
        run: {
          id: last.id,
          bundleVersion: last.version,
          startedAt: iso(last.started),
          finishedAt: iso(last.finished),
          durationMs:
            last.started && last.finished ? last.finished.getTime() - last.started.getTime() : null,
        },
        bundleVersion: run.version,
        versionChanged: last.version !== run.version,
        // An input kept by reference is compared by its reference, which says little.
        inputChanged: last.by_ref ? null : !last.same_input,
      };
    };

    app.get(
      `${base}/runs/:id/previous-success`,
      {
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "The last run of the same script that succeeded, before this one",
          description:
            "For a failed run's page: what changed since the script last worked. `run` is null " +
            "when it has not succeeded before.",
          tags: ["runs"],
          params: Params,
          response: { 200: Previous },
        },
      },
      async ({ params }) => answer("run", params.w, params.id),
    );

    app.get(
      `${base}/flow-runs/:id/previous-success`,
      {
        config: { access: access.workspace("flow_run:read") },
        schema: {
          summary: "The last run of the same flow that succeeded, before this one",
          description:
            "For a failed flow run's page: what changed since the flow last worked. A flow run " +
            "started by another flow's step is not counted. `run` is null when none succeeded.",
          tags: ["flows"],
          params: Params,
          response: { 200: Previous },
        },
      },
      async ({ params }) => answer("flow_run", params.w, params.id),
    );
  };
}
