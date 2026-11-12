import { createHash } from "node:crypto";
import { type Kysely, type PlatformSchema, sql, type Transaction } from "@vynxlabs/db";
import { workspaceSchema } from "../data/apply.js";
import { notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { tenantKey } from "../secrets.js";
import { OWNED_TABLES, type OwnedTable } from "./tables.js";
import { TAR_END, tarEntry } from "./tar.js";

export const EXPORT_FORMAT = "vynxlabs-tenant-export";
export const EXPORT_FORMAT_VERSION = 1;
/** What an export never carries, said in the manifest so that whoever imports it knows what to make again. */
export const NOT_CARRIED = [
  "API keys: create new ones on the instance the tenant moves to.",
  "Worker credentials: create new ones and restart the tenant's own workers with them.",
  "Operator access grants: they belong to the instance the tenant is leaving.",
  "Runs that were queued or in progress: a run belongs to the instance that started it.",
];

export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  coreVersion: string;
  /** The database migration level of the instance that wrote the export. */
  migrationLevel: number;
  exportedAt: string;
  tenant: { id: string; slug: string; name: string; managedWorkers: boolean };
  workspaces: { id: string; slug: string; name: string; type: string }[];
  /** Whether run, flow and event history is included. */
  history: boolean;
  /** Rows per table. Custom tables are named `<workspace id>/<table>`. */
  counts: Record<string, number>;
  /** Runs that were queued or in progress when the export was made. */
  pendingRuns: number;
  notCarried: string[];
  /** Every other file in the archive, with its size and SHA-256. */
  entries: { path: string; bytes: number; sha256: string }[];
}

interface ControlledTransaction extends Transaction<PlatformSchema> {
  rollback(): { execute(): Promise<void> };
}
const snapshot = async (db: Kysely<PlatformSchema>) =>
  (await db
    .startTransaction()
    .setIsolationLevel("repeatable read")
    .setAccessMode("read only")
    .execute()) as unknown as ControlledTransaction;

/** A part of a table is closed and written once it reaches about this size. */
const PART_BYTES = 4 * 1024 * 1024;
const part = (n: number) => String(n).padStart(4, "0");

/**
 * Writes a tenant as one archive, piece by piece, so that a large tenant
 * never has to fit in memory. Everything is read from one snapshot of each
 * database: the export is the tenant as it was at one moment, even while the
 * tenant keeps working.
 *
 * The tenant's secrets stay encrypted under the tenant's key. The key itself
 * travels wrapped with the passphrase.
 */
export async function* exportTenant(
  kernel: Kernel,
  tenantId: string,
  options: { passphrase: string; history: boolean },
): AsyncGenerator<Buffer> {
  const store = await kernel.data.forTenant(tenantId);
  const trx = await snapshot(kernel.db);
  // For a tenant on the platform database this is a second snapshot of it, taken a moment later.
  const data = await snapshot(store.owner);
  const entries: ExportManifest["entries"] = [];
  const counts: Record<string, number> = {};
  let cursors = 0;

  function* write(path: string, content: Buffer) {
    entries.push({
      path,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    yield* tarEntry(path, content);
  }

  /** Streams a query's rows as numbered JSON Lines files. The query must select one text column, `line`. */
  async function* rows(
    db: Transaction<PlatformSchema>,
    prefix: string,
    countAs: string,
    query: ReturnType<typeof sql>,
  ) {
    const cursor = sql.raw(`export_cursor_${++cursors}`);
    await sql`declare ${cursor} no scroll cursor for ${query}`.execute(db);
    let lines: string[] = [];
    let bytes = 0;
    let parts = 0;
    counts[countAs] = 0;
    for (;;) {
      const fetched = await sql<{ line: string }>`fetch 500 from ${cursor}`.execute(db);
      for (const { line } of fetched.rows) {
        lines.push(line);
        bytes += line.length + 1;
      }
      counts[countAs] += fetched.rows.length;
      const last = fetched.rows.length === 0;
      if (lines.length > 0 && (bytes >= PART_BYTES || last)) {
        yield* write(`${prefix}.${part(++parts)}.jsonl`, Buffer.from(`${lines.join("\n")}\n`));
        lines = [];
        bytes = 0;
      }
      if (last) break;
    }
    await sql`close ${cursor}`.execute(db);
  }

  const table = (entry: OwnedTable) =>
    sql`select to_jsonb(t)::text as line from ${sql.table(entry.table)} as t
        where ${entry.ofTenant(tenantId)}
        order by ${sql.join(entry.key.map((column) => sql.ref(`t.${column}`)))}`;

  try {
    const tenant = await trx
      .selectFrom("tenant")
      .select(["id", "slug", "name", "managed_workers"])
      .where("id", "=", tenantId)
      .executeTakeFirst();
    if (!tenant) throw notFound("The tenant");

    // The key first: without it nothing else in the archive can be used. A tenant that
    // never stored a secret is given its key now, so that every export has one and an
    // import can always tell a right passphrase from a wrong one.
    await tenantKey(kernel.db, kernel.vault, tenantId);
    const key = await kernel.db
      .selectFrom("tenant_key")
      .select("wrapped_key")
      .where("tenant_id", "=", tenantId)
      .executeTakeFirstOrThrow();
    yield* write(
      "key.json",
      Buffer.from(
        JSON.stringify(kernel.vault.exportTenantKey(tenantId, key.wrapped_key, options.passphrase)),
      ),
    );

    // The tenant's members, with the password hash each signs in with. They belong to
    // the instance, so they travel as a list of their own and are matched by email on arrival.
    yield* rows(
      trx,
      "members",
      "member",
      sql`select jsonb_build_object(
            'id', m.id, 'name', m.name, 'email', m.email, 'email_verified', m.email_verified,
            'image', m.image, 'created_at', m.created_at,
            'password_hash', (select a.password from member_account a
                              where a.member_id = m.id and a.provider_id = 'credential' limit 1)
          )::text as line
          from member m
          where m.id in (select member_id from tenant_member where tenant_id = ${tenantId})
          order by m.id`,
    );

    for (const entry of OWNED_TABLES) {
      if (entry.export === "never" || (entry.export === "history" && !options.history)) continue;
      yield* rows(trx, `platform/${entry.table}`, entry.table, table(entry));
    }

    // The catalog of custom tables, then every table's rows: retired tables and columns too.
    yield* rows(
      data,
      "data/catalog/data_table",
      "data_table",
      sql`select to_jsonb(t)::text as line from data_table t where t.tenant_id = ${tenantId} order by t.id`,
    );
    yield* rows(
      data,
      "data/catalog/data_column",
      "data_column",
      sql`select to_jsonb(c)::text as line from data_column c
          where c.table_id in (select id from data_table where tenant_id = ${tenantId}) order by c.id`,
    );
    const customTables = await data
      .selectFrom("data_table")
      .select(["workspace_id", "physical_name"])
      .where("tenant_id", "=", tenantId)
      .orderBy("workspace_id")
      .orderBy("physical_name")
      .execute();
    for (const custom of customTables) {
      const name = `${custom.workspace_id}/${custom.physical_name}`;
      yield* rows(
        data,
        `data/${name}`,
        name,
        sql`select to_jsonb(t)::text as line
            from ${sql.id(workspaceSchema(custom.workspace_id), custom.physical_name)} as t order by t.id`,
      );
    }

    // What the rows point at in the object store: bundles, files, and large payloads.
    for (const entry of OWNED_TABLES) {
      if (entry.export === "never" || (entry.export === "history" && !options.history)) continue;
      for (const column of entry.stored ?? []) {
        const found = await sql<{ key: string }>`
          select distinct ${sql.ref(`t.${column}`)} as key from ${sql.table(entry.table)} as t
          where ${entry.ofTenant(tenantId)} and ${sql.ref(`t.${column}`)} is not null order by 1
        `.execute(trx);
        for (const { key: stored } of found.rows) {
          yield* write(`objects/${stored}`, await kernel.storage.get(stored));
        }
      }
    }

    const pending = await trx
      .selectFrom("run")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("tenant_id", "=", tenantId)
      .where("status", "in", ["queued", "running"])
      .executeTakeFirstOrThrow();
    const workspaces = await trx
      .selectFrom("workspace")
      .select(["id", "slug", "name", "type"])
      .where("tenant_id", "=", tenantId)
      .orderBy("id")
      .execute();
    const manifest: ExportManifest = {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      coreVersion: kernel.version,
      migrationLevel: await kernel.migrationLevel(),
      exportedAt: new Date().toISOString(),
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        managedWorkers: tenant.managed_workers,
      },
      workspaces,
      history: options.history,
      counts,
      pendingRuns: Number(pending.n),
      notCarried: NOT_CARRIED,
      entries,
    };
    // Last, because it lists everything before it. An archive without it is incomplete.
    yield* tarEntry("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
    yield TAR_END;
  } finally {
    await data
      .rollback()
      .execute()
      .catch(() => {});
    await trx
      .rollback()
      .execute()
      .catch(() => {});
  }
}
