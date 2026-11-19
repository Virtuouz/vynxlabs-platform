import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { sql } from "@volvel/db";
import type { RetentionDays } from "../config.js";
import type { Kernel } from "./kernel.js";

/** How long one tenant's history is kept, in days, each kind already resolved. */
export type Policy = RetentionDays;

/** What one pass removed. */
export interface Pruned {
  runs: number;
  flowRuns: number;
  events: number;
  refusals: number;
  payloads: number;
  tasks: number;
  auditMonths: string[];
}

const TERMINAL = ["succeeded", "failed", "cancelled"];
/** Rows deleted in one statement. Small enough that no statement holds its locks for long. */
const BATCH = 500;
/** One pass stops starting new batches after this long, and the next pass carries on. */
const BUDGET_MS = 30_000;
/** Rows in one exported part of an audit month. */
const AUDIT_PART_ROWS = 50_000;
/** Months of audit partitions made ahead of time. */
const AUDIT_MONTHS_AHEAD = 3;
/** Days a finished task is kept: long enough to read what it found, no longer. */
const TASK_DAYS = 7;
/** The one lock that lets a single replica prune at a time. */
const LOCK = "retention";

/** One tenant's policy: its own days where it set them, the instance's elsewhere. */
export async function effectivePolicy(kernel: Kernel, tenantId: string): Promise<Policy> {
  const row = await kernel.db
    .selectFrom("tenant_retention")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  return resolve(kernel.config.retention, row);
}

function resolve(
  defaults: Policy,
  row:
    | {
        runs_days: number | null;
        events_days: number | null;
        refusals_days: number | null;
        audit_days: number | null;
      }
    | undefined
    | null,
): Policy {
  return {
    runsDays: row?.runs_days ?? defaults.runsDays,
    eventsDays: row?.events_days ?? defaults.eventsDays,
    refusalsDays: row?.refusals_days ?? defaults.refusalsDays,
    auditDays: row?.audit_days ?? defaults.auditDays,
  };
}

/** Every tenant's policy. */
export async function policies(kernel: Kernel): Promise<Map<string, Policy>> {
  const rows = await kernel.db
    .selectFrom("tenant")
    .leftJoin("tenant_retention", "tenant_retention.tenant_id", "tenant.id")
    .select([
      "tenant.id",
      "tenant_retention.runs_days",
      "tenant_retention.events_days",
      "tenant_retention.refusals_days",
      "tenant_retention.audit_days",
    ])
    .execute();
  return new Map(rows.map((row) => [row.id, resolve(kernel.config.retention, row)]));
}

/** Makes the audit log's monthly partitions from `from`'s month through `to`'s. */
export async function ensureAuditPartitions(kernel: Kernel, from: Date, to: Date): Promise<void> {
  const month = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1);
  while (month.getTime() <= last) {
    await sql`select audit_partition(${month.toISOString()}::timestamptz)`.execute(kernel.db);
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
}

/**
 * Removes what is older than each tenant's policy: finished runs and whole
 * finished flow runs with their logs, steps and stored payloads; events; and
 * refused requests. Months of the audit log past every tenant's policy are
 * exported to the object store, then dropped. Only one replica prunes at a
 * time; another that tries is told `busy`.
 */
export async function pruneOnce(
  kernel: Kernel,
  options: { budgetMs?: number; batch?: number } = {},
): Promise<Pruned | "busy"> {
  return kernel.db.connection().execute(async (db) => {
    const locked = await sql<{ locked: boolean }>`
      select pg_try_advisory_lock(hashtext(${LOCK})) as locked
    `.execute(db);
    if (!locked.rows[0]?.locked) return "busy" as const;
    try {
      const deadline = Date.now() + (options.budgetMs ?? BUDGET_MS);
      const batch = options.batch ?? BATCH;
      const pruned: Pruned = {
        runs: 0,
        flowRuns: 0,
        events: 0,
        refusals: 0,
        payloads: 0,
        tasks: 0,
        auditMonths: [],
      };
      const all = await policies(kernel);
      for (const [tenantId, policy] of all) {
        if (Date.now() > deadline) break;
        await pruneTenant(kernel, tenantId, policy, batch, deadline, pruned);
      }
      // Refused SCIM pushes for no tenant in particular follow the instance's policy.
      pruned.refusals += await prune(
        kernel,
        sql`select id from scim_refusal where tenant_id is null
          and occurred_at < now() - make_interval(days => ${kernel.config.retention.refusalsDays})
          order by occurred_at limit ${batch}`,
        "scim_refusal",
        deadline,
      );
      pruned.tasks += await prune(
        kernel,
        sql`select id from task where finished_at < now() - make_interval(days => ${TASK_DAYS})
          order by finished_at limit ${batch}`,
        "task",
        deadline,
      );
      const longest = Math.max(
        kernel.config.retention.auditDays,
        ...[...all.values()].map((policy) => policy.auditDays),
      );
      pruned.auditMonths = await pruneAudit(kernel, longest);
      return pruned;
    } finally {
      await sql`select pg_advisory_unlock(hashtext(${LOCK}))`.execute(db);
    }
  });
}

/** Deletes the rows a query selects by `id`, a batch at a time, until none are left or time is up. */
async function prune(
  kernel: Kernel,
  select: ReturnType<typeof sql>,
  table: "event" | "webhook_refusal" | "scim_refusal" | "task",
  deadline: number,
): Promise<number> {
  let total = 0;
  while (Date.now() <= deadline) {
    const result = await sql`delete from ${sql.table(table)} where id in (${select})`.execute(
      kernel.db,
    );
    const count = Number(result.numAffectedRows ?? 0n);
    total += count;
    if (count === 0) break;
  }
  return total;
}

async function pruneTenant(
  kernel: Kernel,
  tenantId: string,
  policy: Policy,
  batch: number,
  deadline: number,
  pruned: Pruned,
) {
  // Script runs that are not part of a flow run. A flow's runs go with their flow.
  while (Date.now() <= deadline) {
    const gone = await sql<{ input_ref: string | null; output_ref: string | null }>`
      delete from run where id in (
        select id from run
        where tenant_id = ${tenantId} and flow_run_id is null
          and finished_at < now() - make_interval(days => ${policy.runsDays})
          and status in (${sql.join(TERMINAL)})
        order by finished_at
        limit ${batch}
      )
      returning input_ref, output_ref
    `.execute(kernel.db);
    pruned.runs += gone.rows.length;
    pruned.payloads += await removeObjects(
      kernel,
      gone.rows.flatMap((row) => [row.input_ref, row.output_ref]),
    );
    if (gone.rows.length < batch) break;
  }

  // Flow runs, each with everything it started, once the whole of it has finished. A tree
  // with anything still going is passed over, and looked at again on the next pass.
  let after: { finishedAt: Date; id: string } | null = null;
  while (Date.now() <= deadline) {
    const roots = await sql<{ id: string; finished_at: Date }>`
      select id, finished_at from flow_run
      where tenant_id = ${tenantId} and parent_flow_run_id is null
        and finished_at < now() - make_interval(days => ${policy.runsDays})
        and status in (${sql.join(TERMINAL)})
        ${after ? sql`and (finished_at, id) > (${after.finishedAt}::timestamptz, ${after.id}::uuid)` : sql``}
      order by finished_at, id
      limit ${batch}
    `.execute(kernel.db);
    if (roots.rows.length === 0) break;
    const lastRoot = roots.rows[roots.rows.length - 1] as { id: string; finished_at: Date };
    after = { finishedAt: lastRoot.finished_at, id: lastRoot.id };
    const removed = await removeFlowTrees(
      kernel,
      roots.rows.map((row) => row.id),
    );
    pruned.flowRuns += removed.flowRuns;
    pruned.runs += removed.runs;
    pruned.payloads += removed.payloads;
    if (roots.rows.length < batch) break;
  }

  pruned.events += await prune(
    kernel,
    sql`select id from event where tenant_id = ${tenantId}
      and occurred_at < now() - make_interval(days => ${policy.eventsDays})
      order by occurred_at limit ${batch}`,
    "event",
    deadline,
  );
  for (const table of ["webhook_refusal", "scim_refusal"] as const) {
    pruned.refusals += await prune(
      kernel,
      sql`select id from ${sql.table(table)} where tenant_id = ${tenantId}
        and occurred_at < now() - make_interval(days => ${policy.refusalsDays})
        order by occurred_at limit ${batch}`,
      table,
      deadline,
    );
  }
}

/** Deletes whole flow-run trees under the given roots, leaving any tree not yet finished. */
async function removeFlowTrees(kernel: Kernel, roots: string[]) {
  const { refs, flowRuns, runs } = await kernel.db.transaction().execute(async (trx) => {
    const tree = await sql<{ id: string }>`
      with recursive tree as (
        select id, id as root from flow_run where id in (${sql.join(roots)})
        union all
        select child.id, tree.root from flow_run child join tree on child.parent_flow_run_id = tree.id
      ),
      unfinished as (
        select tree.root from tree join flow_run f on f.id = tree.id
        where f.status not in (${sql.join(TERMINAL)})
        union
        select tree.root from tree join run r on r.flow_run_id = tree.id
        where r.status not in (${sql.join(TERMINAL)})
      )
      select id from tree where root not in (select root from unfinished)
    `.execute(trx);
    const ids = tree.rows.map((row) => row.id);
    if (ids.length === 0) return { refs: [] as (string | null)[], flowRuns: 0, runs: 0 };
    const list = sql.join(ids);
    const stepRefs = await sql<{ ref: string | null }>`
      select output_ref as ref from step_run where flow_run_id in (${list}) and output_ref is not null
    `.execute(trx);
    const goneRuns = await sql<{ input_ref: string | null; output_ref: string | null }>`
      delete from run where flow_run_id in (${list}) returning input_ref, output_ref
    `.execute(trx);
    // Steps go with their flow run. A child and its parent go in one statement, so the
    // reference between them is checked only once both are gone.
    const goneFlows = await sql<{ input_ref: string | null }>`
      delete from flow_run where id in (${list}) returning input_ref
    `.execute(trx);
    return {
      refs: [
        ...stepRefs.rows.map((row) => row.ref),
        ...goneRuns.rows.flatMap((row) => [row.input_ref, row.output_ref]),
        ...goneFlows.rows.map((row) => row.input_ref),
      ],
      flowRuns: goneFlows.rows.length,
      runs: goneRuns.rows.length,
    };
  });
  // Stored payloads go once the rows that point at them are gone: at worst one is left
  // behind, never a row pointing at nothing.
  return { flowRuns, runs, payloads: await removeObjects(kernel, refs) };
}

async function removeObjects(kernel: Kernel, refs: (string | null)[]): Promise<number> {
  let removed = 0;
  for (const ref of refs) {
    if (!ref) continue;
    try {
      await kernel.storage.remove(ref);
      removed += 1;
    } catch (error) {
      kernel.log.warn({ err: error, ref }, "a pruned run's stored payload could not be removed");
    }
  }
  return removed;
}

/** The object-store folder of one month of the audit log. */
export const auditExportFolder = (year: number, month: number) =>
  `audit/${year}-${String(month).padStart(2, "0")}`;

/**
 * Keeps the audit log's partitions ahead of time, and exports then drops every
 * month whose end is older than `keepDays`. A month is dropped only when what
 * was exported matches what it holds.
 */
async function pruneAudit(kernel: Kernel, keepDays: number): Promise<string[]> {
  const now = new Date();
  await ensureAuditPartitions(
    kernel,
    now,
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + AUDIT_MONTHS_AHEAD, 1)),
  );
  const partitions = await sql<{ name: string }>`
    select c.relname as name from pg_inherits i join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'audit_entry'::regclass and c.relname ~ '^audit_entry_y[0-9]{4}m[0-9]{2}$'
    order by c.relname
  `.execute(kernel.db);
  const cutoff = Date.now() - keepDays * 86_400_000;
  const dropped: string[] = [];
  for (const { name } of partitions.rows) {
    const year = Number(name.slice(13, 17));
    const month = Number(name.slice(18, 20));
    const ends = Date.UTC(year, month, 1);
    if (ends > cutoff) continue;
    try {
      await exportAndDrop(kernel, name, year, month);
      dropped.push(`${year}-${String(month).padStart(2, "0")}`);
    } catch (error) {
      kernel.log.error(
        { err: error, partition: name },
        "an audit month could not be exported, and is kept",
      );
    }
  }
  return dropped;
}

async function exportAndDrop(kernel: Kernel, name: string, year: number, month: number) {
  const folder = auditExportFolder(year, month);
  const parts: { key: string; rows: number; sha256: string }[] = [];
  let total = 0;
  let after: string | null = null;
  for (;;) {
    const page = await sql<{ id: string; row: unknown }>`
      select id, to_jsonb(t) as row from ${sql.table(name)} as t
      ${after ? sql`where id > ${after}::uuid` : sql``}
      order by id
      limit ${AUDIT_PART_ROWS}
    `.execute(kernel.db);
    if (page.rows.length === 0) break;
    const body = gzipSync(
      Buffer.from(`${page.rows.map((one) => JSON.stringify(one.row)).join("\n")}\n`, "utf8"),
    );
    const key = `${folder}/part-${String(parts.length + 1).padStart(4, "0")}.jsonl.gz`;
    await kernel.storage.put(key, body, "application/gzip");
    parts.push({
      key,
      rows: page.rows.length,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
    total += page.rows.length;
    after = (page.rows[page.rows.length - 1] as { id: string }).id;
    if (page.rows.length < AUDIT_PART_ROWS) break;
  }
  await kernel.storage.put(
    `${folder}/manifest.json`,
    JSON.stringify(
      {
        partition: name,
        month: `${year}-${String(month).padStart(2, "0")}`,
        rows: total,
        parts,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "application/json",
  );
  await kernel.db.transaction().execute(async (trx) => {
    // Nothing more may arrive while it is checked and dropped.
    await sql`lock table ${sql.table(name)} in access exclusive mode`.execute(trx);
    const counted = await sql<{ n: string }>`select count(*) as n from ${sql.table(name)}`.execute(
      trx,
    );
    if (Number(counted.rows[0]?.n ?? 0) !== total) {
      throw new Error(`${name} changed while it was exported; it is kept for the next pass.`);
    }
    await sql`alter table audit_entry detach partition ${sql.table(name)}`.execute(trx);
    await sql`drop table ${sql.table(name)}`.execute(trx);
  });
  kernel.log.info({ partition: name, rows: total, folder }, "exported and dropped an audit month");
}
