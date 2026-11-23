import { sql } from "@volvel/db";
import type { Db, Trx } from "../audit.js";
import type { Kernel } from "../kernel.js";
import { openSource, sourceFailure } from "./sources.js";

/** How long a check may wait for an answer. */
const CHECK_TIMEOUT_MS = 5000;
/** How often every bound source is checked. */
export const HEALTH_EVERY_MS = 10 * 60 * 1000;

export interface HealthResult {
  ok: boolean;
  problem: string | null;
  latencyMs: number | null;
  checkedAt: string;
}

/**
 * Reaches one bound data source with the smallest question there is, and keeps
 * the answer. Never throws: an unreachable source is a result, not an error.
 */
export async function checkSource(
  kernel: Kernel,
  tenantId: string,
  workspaceId: string,
  path: string,
): Promise<HealthResult> {
  const started = Date.now();
  let problem: string | null = null;
  try {
    const source = await openSource(kernel, kernel.db as Db, tenantId, workspaceId, path);
    await Promise.race([
      sql`select 1`.execute(source.db),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("It did not answer within 5 seconds.")),
          CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (error) {
    const said = sourceFailure(path, error) as { message?: string; detail?: string };
    problem = (said.detail ?? said.message ?? "It could not be reached.").slice(0, 500);
  }
  const latency = problem ? null : Date.now() - started;
  return recordHealth(kernel.db as Db, {
    tenantId,
    workspaceId,
    kind: "data_source",
    path,
    problem,
    latencyMs: latency,
  });
}

/**
 * Keeps what the last check of a data source or connection found, in place of
 * what the one before found.
 */
export async function recordHealth(
  db: Db,
  check: {
    tenantId: string;
    workspaceId: string;
    kind: "data_source" | "connection";
    path: string;
    /** Null when it was reached. */
    problem: string | null;
    latencyMs: number | null;
  },
): Promise<HealthResult> {
  const checkedAt = new Date();
  const problem = check.problem?.slice(0, 500) ?? null;
  const values = {
    ok: problem === null,
    problem,
    latency_ms: problem === null ? check.latencyMs : null,
    checked_at: checkedAt,
  };
  await db
    .insertInto("health_check")
    .values({
      workspace_id: check.workspaceId,
      tenant_id: check.tenantId,
      kind: check.kind,
      path: check.path,
      ...values,
    })
    .onConflict((c) => c.columns(["workspace_id", "kind", "path"]).doUpdateSet(values))
    .execute();
  return {
    ok: values.ok,
    problem,
    latencyMs: values.latency_ms,
    checkedAt: checkedAt.toISOString(),
  };
}

/** Forgets what was found about a connection, which no longer says anything about it. */
export async function forgetHealth(db: Db | Trx, workspaceId: string, path: string): Promise<void> {
  await db
    .deleteFrom("health_check")
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", "connection")
    .where("path", "=", path)
    .execute();
}

/**
 * Checks every bound data source whose last check is older than the interval,
 * a few at a time. Safe on every replica: a source checked twice is harmless.
 */
export async function checkDueSources(kernel: Kernel, limit = 10): Promise<number> {
  const due = await sql<{ tenant_id: string; workspace_id: string; path: string }>`
    select b.tenant_id, b.workspace_id, b.path
    from data_source_binding b
    left join health_check h
      on h.workspace_id = b.workspace_id and h.kind = 'data_source' and h.path = b.path
    where h.checked_at is null or h.checked_at < now() - make_interval(secs => ${HEALTH_EVERY_MS / 1000})
    order by h.checked_at nulls first
    limit ${limit}
  `.execute(kernel.db);
  // Together: a source that never answers holds only its own check, not the other nine.
  await Promise.allSettled(
    due.rows.map((row) => checkSource(kernel, row.tenant_id, row.workspace_id, row.path)),
  );
  return due.rows.length;
}
