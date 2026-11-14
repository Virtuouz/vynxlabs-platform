import { sql } from "@vynxlabs/db";
import type { Db } from "../audit.js";
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
  const checkedAt = new Date();
  await kernel.db
    .insertInto("health_check")
    .values({
      workspace_id: workspaceId,
      tenant_id: tenantId,
      kind: "data_source",
      path,
      ok: problem === null,
      problem,
      latency_ms: latency,
      checked_at: checkedAt,
    })
    .onConflict((c) =>
      c.columns(["workspace_id", "kind", "path"]).doUpdateSet({
        ok: problem === null,
        problem,
        latency_ms: latency,
        checked_at: checkedAt,
      }),
    )
    .execute();
  return { ok: problem === null, problem, latencyMs: latency, checkedAt: checkedAt.toISOString() };
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
  for (const row of due.rows) await checkSource(kernel, row.tenant_id, row.workspace_id, row.path);
  return due.rows.length;
}
