import { createHash } from "node:crypto";
import { type FileHandle, open } from "node:fs/promises";
import { sql } from "@vynxlabs/db";
import { type Actor, mutate, type Trx } from "../audit.js";
import type { PassphraseWrappedKey } from "../crypto.js";
import { restoreRules, restoreStructure, workspaceSchema } from "../data/apply.js";
import { badRequest, conflict, HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportManifest } from "./export.js";
import { removeStored } from "./remove.js";
import { OWNED_TABLES } from "./tables.js";
import { type TarIndexEntry, tarIndex, tarRead } from "./tar.js";

export interface ImportOptions {
  passphrase: string;
  /** A different slug for the tenant on this instance. Default: the one it had. */
  slug?: string | undefined;
  /** The dedicated database for its custom tables. Default: the platform database. */
  dataLocation?: string | undefined;
}

export interface ImportReport {
  tenant: { id: string; slug: string; name: string; dataLocation: string | null };
  /** Rows loaded per table, as counted afterwards. Equal to the export's own counts, or the import fails. */
  counts: Record<string, number>;
  members: { created: number; linked: number };
  objects: number;
  /** Runs and flow runs that were unfinished in the export, recorded here as cancelled. */
  cancelled: { runs: number; flowRuns: number };
  /** Every workspace arrives with its triggers paused. */
  pausedWorkspaces: number;
  notCarried: string[];
}

const refuse = (detail: string) => new HttpError(400, "import_refused", detail);
const sha256 = (content: Buffer) => createHash("sha256").update(content).digest("hex");

interface ExportedMember {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  image: string | null;
  created_at: string;
  password_hash: string | null;
}

/** An archive on disk that has been checked from end to end. */
interface Checked {
  file: FileHandle;
  manifest: ExportManifest;
  byPath: Map<string, TarIndexEntry>;
}

/**
 * Reads the archive's list of contents and checks every file against it,
 * before anything is written anywhere. A damaged, shortened or altered
 * archive stops here.
 */
async function check(file: FileHandle): Promise<Checked> {
  let index: TarIndexEntry[];
  try {
    index = await tarIndex(file);
  } catch (error) {
    throw refuse(`The export cannot be read. ${(error as Error).message}`);
  }
  const last = index.at(-1);
  if (last?.path !== "manifest.json") {
    throw refuse("The export is incomplete: it does not end with its list of contents.");
  }
  let manifest: ExportManifest;
  try {
    manifest = JSON.parse((await tarRead(file, last)).toString("utf8"));
  } catch {
    throw refuse("The export's list of contents cannot be read.");
  }
  if (manifest.format !== EXPORT_FORMAT) throw refuse("This file is not a tenant export.");
  if (manifest.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw refuse(
      `This export is in format ${manifest.formatVersion}. This instance reads format ${EXPORT_FORMAT_VERSION}.`,
    );
  }
  const byPath = new Map(index.slice(0, -1).map((entry) => [entry.path, entry]));
  if (byPath.size !== manifest.entries.length) {
    throw refuse("The export does not hold exactly the files it lists.");
  }
  for (const listed of manifest.entries) {
    const entry = byPath.get(listed.path);
    if (!entry || entry.size !== listed.bytes) {
      throw refuse(`The export is damaged: ${listed.path} is missing or the wrong size.`);
    }
    if (sha256(await tarRead(file, entry)) !== listed.sha256) {
      throw refuse(`The export is damaged: ${listed.path} is not what was written.`);
    }
  }
  return { file, manifest, byPath };
}

/** The numbered parts of one table, in order. */
function parts(checked: Checked, prefix: string): TarIndexEntry[] {
  return [...checked.byPath.values()]
    .filter((entry) => entry.path.startsWith(`${prefix}.`) && entry.path.endsWith(".jsonl"))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Brings an exported tenant into this instance as a new tenant. Either all of
 * it arrives or none of it does.
 */
export async function importTenant(
  kernel: Kernel,
  actor: Actor,
  archivePath: string,
  options: ImportOptions,
): Promise<ImportReport> {
  const file = await open(archivePath, "r");
  const written: string[] = [];
  try {
    const checked = await check(file);
    const { manifest } = checked;
    const level = await kernel.migrationLevel();
    if (manifest.migrationLevel !== level) {
      throw refuse(
        `This export was made at database level ${manifest.migrationLevel} (core ${manifest.coreVersion}). ` +
          `This instance is at level ${level} (core ${kernel.version}). Bring both instances to the same version, then export again.`,
      );
    }
    const tenantId = manifest.tenant.id;
    const slug = options.slug ?? manifest.tenant.slug;
    const location = options.dataLocation ?? null;

    const read = async (path: string) => {
      const entry = checked.byPath.get(path);
      if (!entry) throw refuse(`The export is missing ${path}.`);
      return tarRead(file, entry);
    };
    let wrappedKey: Buffer | null = null;
    const exportedKey = JSON.parse(
      (await read("key.json")).toString("utf8"),
    ) as PassphraseWrappedKey | null;
    if (exportedKey) {
      try {
        wrappedKey = kernel.vault.importTenantKey(tenantId, exportedKey, options.passphrase);
      } catch {
        throw refuse("The passphrase does not open this export.");
      }
    }

    const existing = await kernel.db
      .selectFrom("tenant")
      .select(["id", "slug"])
      .where((eb) => eb.or([eb("id", "=", tenantId), eb("slug", "=", slug)]))
      .executeTakeFirst();
    if (existing) {
      throw conflict(
        existing.id === tenantId
          ? "This tenant is already on this instance. Delete it here first if it should be replaced."
          : `Another tenant here already uses the slug "${slug}". Import with a different slug.`,
      );
    }
    if (location !== null) {
      const known = await kernel.db
        .selectFrom("database_location")
        .select("name")
        .where("name", "=", location)
        .executeTakeFirst();
      if (!known) throw badRequest(`No database location is registered as "${location}".`);
    }

    // Members are matched by email. Someone already here keeps their account and password,
    // and everything in the export that names them is rewritten to name the account here.
    const members: ExportedMember[] = [];
    for (const entry of parts(checked, "members")) {
      for (const line of (await tarRead(file, entry)).toString("utf8").split("\n")) {
        if (line) members.push(JSON.parse(line));
      }
    }
    const here =
      members.length === 0
        ? []
        : await kernel.db
            .selectFrom("member")
            .select(["id", "email"])
            .where(
              "email",
              "in",
              members.map((member) => member.email),
            )
            .execute();
    const renamed = new Map<string, string>();
    for (const member of members) {
      const found = here.find((candidate) => candidate.email === member.email);
      if (found && found.id !== member.id) renamed.set(member.id, found.id);
    }
    const known = new Set(here.map((member) => member.email));
    const rewrite = (text: string) => {
      let result = text;
      // IDs are unique everywhere, so replacing one wherever it appears is exact.
      for (const [from, to] of renamed) result = result.replaceAll(from, to);
      return result;
    };

    /** Loads one table's parts with the database's own JSON-to-row conversion. */
    async function load(
      db: Trx,
      prefix: string,
      target: ReturnType<typeof sql.id>,
      change?: (row: Record<string, unknown>) => void,
      /** For records that may already be here, from an earlier stay of the same tenant. */
      skipExisting = false,
    ) {
      for (const entry of parts(checked, prefix)) {
        const lines = rewrite((await tarRead(file, entry)).toString("utf8"))
          .split("\n")
          .filter(Boolean);
        for (let start = 0; start < lines.length; start += 500) {
          let batch = lines.slice(start, start + 500);
          if (change) {
            batch = batch.map((line) => {
              const row = JSON.parse(line);
              change(row);
              return JSON.stringify(row);
            });
          }
          // Numbers the database would hand out itself are kept as they were.
          await sql`
            insert into ${target} overriding system value
            select (jsonb_populate_record(null::${target}, e)).*
            from jsonb_array_elements(${`[${batch.join(",")}]`}::jsonb) as e
            ${skipExisting ? sql`on conflict do nothing` : sql``}
          `.execute(db);
        }
      }
    }

    const report = await mutate(kernel.db, actor, async (trx, audit) => {
      await trx
        .insertInto("tenant")
        .values({
          id: tenantId,
          slug,
          name: manifest.tenant.name,
          data_location: JSON.stringify(
            location === null ? { kind: "shared" } : { kind: "dedicated", ref: location },
          ),
        })
        .execute();
      if (wrappedKey) {
        await trx
          .insertInto("tenant_key")
          .values({ tenant_id: tenantId, wrapped_key: wrappedKey })
          .execute();
      }

      let created = 0;
      for (const member of members) {
        if (known.has(member.email)) continue;
        await trx
          .insertInto("member")
          .values({
            id: member.id,
            name: member.name,
            email: member.email,
            email_verified: member.email_verified,
            image: member.image,
            created_at: member.created_at,
            updated_at: new Date(),
          })
          .execute();
        if (member.password_hash) {
          await sql`
            insert into member_account (id, member_id, account_id, provider_id, password)
            values (gen_random_uuid(), ${member.id}, ${member.id}, 'credential', ${member.password_hash})
          `.execute(trx);
        }
        created += 1;
      }

      // Workspaces point at each other and at their bundles, which are not loaded yet.
      const links: { id: string; active: string | null; linked: string | null }[] = [];
      for (const entry of OWNED_TABLES) {
        if (entry.export === "never") continue;
        await load(
          trx,
          `platform/${entry.table}`,
          sql.table(entry.table) as never,
          entry.table === "workspace"
            ? (row) => {
                links.push({
                  id: row.id as string,
                  active: row.active_bundle_id as string | null,
                  linked: row.linked_workspace_id as string | null,
                });
                row.active_bundle_id = null;
                row.linked_workspace_id = null;
                // The instance it came from may still be running. Two must not both act.
                row.triggers_paused = true;
              }
            : undefined,
          // An instance keeps a tenant's audit entries when the tenant is deleted. If the
          // tenant comes back, the entries it brings that are already here are the same ones.
          entry.keep === true,
        );
      }
      for (const link of links) {
        await trx
          .updateTable("workspace")
          .set({ active_bundle_id: link.active, linked_workspace_id: link.linked })
          .where("id", "=", link.id)
          .execute();
      }

      // Counters the database keeps for itself move past every number that just arrived.
      const counters = await sql<{ table: string; column: string }>`
        select table_name as "table", column_name as "column" from information_schema.columns
        where table_schema = 'public' and is_identity = 'YES'
      `.execute(trx);
      for (const counter of counters.rows) {
        if (!OWNED_TABLES.some((entry) => entry.table === counter.table)) continue;
        await sql`
          select setval(
            pg_get_serial_sequence(${counter.table}, ${counter.column}),
            greatest(
              nextval(pg_get_serial_sequence(${counter.table}, ${counter.column})),
              (select coalesce(max(${sql.ref(counter.column)}), 0) from ${sql.table(counter.table)})
            )
          )
        `.execute(trx);
      }

      // History is a record here, not work to resume: whatever was unfinished is closed.
      const note = JSON.stringify({
        message: "This was unfinished when the tenant was exported, and was not carried over.",
      });
      const runs = await sql`
        update run set status = 'cancelled', error = ${note}::jsonb, finished_at = now()
        where tenant_id = ${tenantId} and status in ('queued', 'running')
      `.execute(trx);
      await sql`
        update step_run set status = 'cancelled', finished_at = now()
        where status in ('running', 'waiting')
          and flow_run_id in (select id from flow_run where tenant_id = ${tenantId})
      `.execute(trx);
      const flowRuns = await sql`
        update flow_run set status = 'cancelled', finished_at = now()
        where tenant_id = ${tenantId} and status = 'running'
      `.execute(trx);

      // Custom tables: their catalog, then each table as the catalog describes it, then its rows.
      const { db: data, store } = await kernel.data.withinLocation(trx, location);
      await load(data, "data/catalog/data_table", sql.table("data_table") as never);
      await load(data, "data/catalog/data_column", sql.table("data_column") as never);
      const indexes = new Map<string, Map<string, string[][]>>();
      const definitions = await trx
        .selectFrom("resource")
        .select(["workspace_id", "path", "body"])
        .where("tenant_id", "=", tenantId)
        .where("kind", "=", "table")
        .execute();
      for (const definition of definitions) {
        const ofWorkspace = indexes.get(definition.workspace_id) ?? new Map();
        ofWorkspace.set(
          definition.path,
          (definition.body as { indexes?: string[][] }).indexes ?? [],
        );
        indexes.set(definition.workspace_id, ofWorkspace);
      }
      for (const workspace of manifest.workspaces) {
        const catalog = await restoreStructure(data, store.role, workspace.id);
        for (const table of catalog) {
          await load(
            data,
            `data/${workspace.id}/${table.physicalName}`,
            sql.id(workspaceSchema(workspace.id), table.physicalName),
          );
        }
        if (catalog.length > 0) {
          await restoreRules(
            data,
            store.role,
            workspace.id,
            indexes.get(workspace.id) ?? new Map(),
          );
        }
      }

      // Bundles, files and large payloads go to this instance's object store under the same keys.
      let objects = 0;
      for (const entry of checked.byPath.values()) {
        if (!entry.path.startsWith("objects/")) continue;
        const key = entry.path.slice("objects/".length);
        await kernel.storage.put(key, await tarRead(file, entry), "application/octet-stream");
        written.push(key);
        objects += 1;
      }

      // Count what arrived, and hold it against what the export says it holds.
      const counts: Record<string, number> = {};
      const count = async (db: Trx, name: string, query: ReturnType<typeof sql>) => {
        const result = await sql<{
          n: string;
        }>`select count(*) as n from (${query}) as counted`.execute(db);
        counts[name] = Number(result.rows[0]?.n ?? 0);
      };
      for (const entry of OWNED_TABLES) {
        if (!(entry.table in manifest.counts)) continue;
        await count(
          trx,
          entry.table,
          sql`select 1 from ${sql.table(entry.table)} as t where ${entry.ofTenant(tenantId)}`,
        );
      }
      await count(data, "data_table", sql`select 1 from data_table where tenant_id = ${tenantId}`);
      await count(
        data,
        "data_column",
        sql`select 1 from data_column where table_id in (select id from data_table where tenant_id = ${tenantId})`,
      );
      const tables = await data
        .selectFrom("data_table")
        .select(["workspace_id", "physical_name"])
        .where("tenant_id", "=", tenantId)
        .execute();
      for (const table of tables) {
        await count(
          data,
          `${table.workspace_id}/${table.physical_name}`,
          sql`select 1 from ${sql.id(workspaceSchema(table.workspace_id), table.physical_name)}`,
        );
      }
      counts.member = members.length;
      const kept = new Set<string>(
        OWNED_TABLES.filter((entry) => entry.keep).map((entry) => entry.table),
      );
      for (const [name, expected] of Object.entries(manifest.counts)) {
        // Of what is never deleted there may be more here than the export brought, never less.
        const arrived = kept.has(name)
          ? (counts[name] ?? 0) >= expected
          : counts[name] === expected;
        if (!arrived) {
          throw new HttpError(
            500,
            "import_incomplete",
            `The import was undone: ${name} should have ${expected} rows and has ${counts[name] ?? 0}.`,
          );
        }
      }

      const result: ImportReport = {
        tenant: { id: tenantId, slug, name: manifest.tenant.name, dataLocation: location },
        counts,
        members: { created, linked: members.length - created },
        objects,
        cancelled: {
          runs: Number(runs.numAffectedRows ?? 0n),
          flowRuns: Number(flowRuns.numAffectedRows ?? 0n),
        },
        pausedWorkspaces: links.length,
        notCarried: manifest.notCarried,
      };
      await audit({
        action: "tenant.imported",
        targetType: "tenant",
        targetId: tenantId,
        tenantId,
        details: {
          slug,
          dataLocation: location,
          exportedAt: manifest.exportedAt,
          fromCoreVersion: manifest.coreVersion,
          history: manifest.history,
          members: result.members,
          objects,
          rows: Object.values(counts).reduce((sum, n) => sum + n, 0),
        },
      });
      return result;
    });
    kernel.data.forgetTenant(tenantId);
    return report;
  } catch (error) {
    // Nothing was committed, so what reached the object store belongs to nothing.
    await removeStored(kernel, written);
    throw error;
  } finally {
    await file.close();
  }
}
