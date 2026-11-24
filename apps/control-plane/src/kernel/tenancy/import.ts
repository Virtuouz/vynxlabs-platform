import { createHash } from "node:crypto";
import { type FileHandle, open } from "node:fs/promises";
import { isId, sql } from "@volvel/db";
import { COLUMN_TYPES } from "@volvel/manifest";
import { type Actor, mutate, type Trx } from "../audit.js";
import type { PassphraseWrappedKey } from "../crypto.js";
import { restoreRules, restoreStructure, workspaceSchema } from "../data/apply.js";
import { badRequest, conflict, HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { INSTANCE_ONLY_ROLE } from "../kinds.js";
import { EXPORT_FORMAT, EXPORT_FORMATS_READ, type ExportManifest, manifestText } from "./export.js";
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
  /** Runs and flow runs that were unfinished in the export, recorded here as canceled. */
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
  /** Format 1: the hash as it was. */
  password_hash?: string | null;
  /** Format 2: the hash sealed under the tenant's key, or null when it was left out. */
  password_sealed?: string | null;
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
  if (!EXPORT_FORMATS_READ.includes(manifest.formatVersion)) {
    throw refuse(
      `This export is in format ${manifest.formatVersion}. This instance reads formats ${EXPORT_FORMATS_READ.join(" and ")}.`,
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
  checkLayout(manifest, [...byPath.keys()]);
  return { file, manifest, byPath };
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PART = /\.\d{4}\.jsonl$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const unsafeKey = (key: string) =>
  key === "" ||
  key.split("/").some((segment) => segment === "" || segment === "." || segment === "..");

/**
 * Holds the archive to the files this format has. The list of contents is the archive's
 * own word, and in format 1 nothing signs it, so a file it lists is not a file to trust:
 * a table this format does not export, a workspace the manifest does not name, or an
 * object key that leaves the store's folders is refused before anything is read as rows.
 */
function checkLayout(manifest: ExportManifest, paths: string[]) {
  const tenant = manifest.tenant;
  if (
    !tenant ||
    !isId(String(tenant.id)) ||
    typeof tenant.slug !== "string" ||
    !SLUG.test(tenant.slug) ||
    typeof tenant.name !== "string"
  ) {
    throw refuse("The export's list of contents does not name a valid tenant.");
  }
  if (
    !Array.isArray(manifest.workspaces) ||
    manifest.workspaces.some((one) => !isId(String(one?.id)))
  ) {
    throw refuse("The export's list of contents names a workspace that is not valid.");
  }
  const workspaces = new Set(manifest.workspaces.map((one) => one.id));
  const tables = new Set(
    OWNED_TABLES.filter(
      (entry) => entry.export === "always" || (entry.export === "history" && manifest.history),
    ).map((entry) => entry.table as string),
  );
  for (const path of paths) {
    if (path === "key.json") continue;
    if (path.startsWith("objects/")) {
      if (unsafeKey(path.slice("objects/".length))) {
        throw refuse(`The export holds an object with a name that is not allowed: ${path}.`);
      }
      continue;
    }
    if (PART.test(path)) {
      const base = path.replace(PART, "");
      if (base === "members" || base === "data/catalog/data_table") continue;
      if (base === "data/catalog/data_column") continue;
      if (base.startsWith("platform/") && tables.has(base.slice("platform/".length))) continue;
      const custom = /^data\/([^/]+)\/([^/]+)$/.exec(base);
      if (custom && workspaces.has(custom[1] as string) && IDENTIFIER.test(custom[2] as string)) {
        continue;
      }
    }
    throw refuse(`The export holds a file that this format does not have: ${path}.`);
  }
}

/**
 * Format 2 signs the list of contents under the tenant's key, which only the passphrase
 * opens. Returns true when the signature is right, false for a format that has none, and
 * refuses a signature that is wrong or missing.
 */
function authenticate(kernel: Kernel, manifest: ExportManifest, wrappedKey: Buffer): boolean {
  if (manifest.formatVersion < 2) return false;
  const given = manifest.authentication;
  if (
    given?.alg !== "hmac-sha256" ||
    !kernel.vault.manifestMacMatches(
      manifest.tenant.id,
      wrappedKey,
      manifestText(manifest),
      given.mac,
    )
  ) {
    throw refuse(
      "The export's list of contents was not signed with this export's key, or was changed after it was. It is not imported.",
    );
  }
  return true;
}

/** The numbered parts of one table, in order. */
function parts(checked: Checked, prefix: string): TarIndexEntry[] {
  return [...checked.byPath.values()]
    .filter((entry) => entry.path.startsWith(`${prefix}.`) && entry.path.endsWith(".jsonl"))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

export interface ImportInspection {
  /** Why the file cannot be imported at all: damaged, not an export, another format. */
  problem: string | null;
  tenant: { id: string; slug: string; name: string } | null;
  exportedAt: string | null;
  coreVersion: string | null;
  migrationLevel: number | null;
  /** Whether this instance is at the database level the export was made at. */
  levelMatches: boolean;
  history: boolean;
  workspaces: { name: string; type: string }[];
  rows: number;
  members: number;
  pendingRuns: number;
  notCarried: string[];
  /** Null when no passphrase was given to try. */
  passphraseOk: boolean | null;
  formatVersion: number | null;
  /**
   * Whether the list of contents is signed under the export's key and the signature is right.
   * False for a format with no signature: such a file is held to the tenant's own rows and files,
   * but nobody vouches for it. Null until a passphrase is given to check a signed one.
   */
  authenticated: boolean | null;
  tenantPresent: boolean;
  slugTaken: boolean;
}

/**
 * What an export holds and whether it can come in here, read without writing
 * anything: its contents and version, whether a passphrase opens it, and
 * whether its tenant or slug is taken.
 */
export async function inspectImport(
  kernel: Kernel,
  archivePath: string,
  options: { passphrase?: string | undefined; slug?: string | undefined } = {},
): Promise<ImportInspection> {
  const empty: ImportInspection = {
    problem: null,
    tenant: null,
    exportedAt: null,
    coreVersion: null,
    migrationLevel: null,
    levelMatches: false,
    history: false,
    workspaces: [],
    rows: 0,
    members: 0,
    pendingRuns: 0,
    notCarried: [],
    passphraseOk: null,
    formatVersion: null,
    authenticated: null,
    tenantPresent: false,
    slugTaken: false,
  };
  const file = await open(archivePath, "r");
  try {
    let checked: Checked;
    try {
      checked = await check(file);
    } catch (error) {
      return { ...empty, problem: (error as Error).message };
    }
    const { manifest } = checked;
    let passphraseOk: boolean | null = null;
    let authenticated: boolean | null = manifest.formatVersion < 2 ? false : null;
    let problem: string | null = null;
    if (options.passphrase) {
      const entry = checked.byPath.get("key.json");
      const exported = entry
        ? (JSON.parse((await tarRead(file, entry)).toString("utf8")) as PassphraseWrappedKey | null)
        : null;
      try {
        if (!exported) throw new Error("no key");
        const wrapped = kernel.vault.importTenantKey(
          manifest.tenant.id,
          exported,
          options.passphrase,
        );
        passphraseOk = true;
        try {
          authenticated = authenticate(kernel, manifest, wrapped);
        } catch (error) {
          authenticated = false;
          problem = (error as Error).message;
        }
      } catch {
        passphraseOk = false;
      }
    }
    const slug = options.slug ?? manifest.tenant.slug;
    const present = await kernel.db
      .selectFrom("tenant")
      .select(["id", "slug"])
      .where((eb) => eb.or([eb("id", "=", manifest.tenant.id), eb("slug", "=", slug)]))
      .execute();
    return {
      problem,
      tenant: { id: manifest.tenant.id, slug: manifest.tenant.slug, name: manifest.tenant.name },
      exportedAt: manifest.exportedAt,
      coreVersion: manifest.coreVersion,
      migrationLevel: manifest.migrationLevel,
      levelMatches: manifest.migrationLevel === (await kernel.migrationLevel()),
      history: manifest.history,
      workspaces: manifest.workspaces.map((one) => ({ name: one.name, type: one.type })),
      rows: Object.values(manifest.counts).reduce((sum, n) => sum + n, 0),
      members: manifest.counts.member ?? 0,
      pendingRuns: manifest.pendingRuns,
      notCarried: manifest.notCarried,
      passphraseOk,
      formatVersion: manifest.formatVersion,
      authenticated,
      tenantPresent: present.some((one) => one.id === manifest.tenant.id),
      slugTaken: present.some((one) => one.slug === slug && one.id !== manifest.tenant.id),
    };
  } finally {
    await file.close();
  }
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
    const exportedKey = JSON.parse(
      (await read("key.json")).toString("utf8"),
    ) as PassphraseWrappedKey | null;
    if (!exportedKey) throw refuse("The export has no key, so it cannot be checked or used.");
    let wrappedKey: Buffer;
    try {
      wrappedKey = kernel.vault.importTenantKey(tenantId, exportedKey, options.passphrase);
    } catch {
      throw refuse("The passphrase does not open this export.");
    }
    authenticate(kernel, manifest, wrappedKey);

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

    // Members are matched by ID first, then by email. Someone already here keeps their account
    // and password, and everything in the export that names them is rewritten to name the
    // account here.
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
            .where((eb) =>
              eb.or([
                eb(
                  "id",
                  "in",
                  members.map((member) => member.id),
                ),
                eb(
                  "email",
                  "in",
                  members.map((member) => member.email),
                ),
              ]),
            )
            .execute();
    const renamed = new Map<string, string>();
    const known = new Set<string>();
    for (const member of members) {
      const byId = here.find((candidate) => candidate.id === member.id);
      const byEmail = here.find((candidate) => candidate.email === member.email);
      if (byId && byEmail && byId.id !== byEmail.id) {
        throw conflict(
          `The member ${member.email} in this export is one account here (${byId.email}) and another by email (${byEmail.id}). Change one of their emails here, then import again.`,
        );
      }
      const found = byId ?? byEmail;
      if (!found) continue;
      known.add(member.id);
      if (found.id !== member.id) renamed.set(member.id, found.id);
    }
    const rewrite = (text: string) => {
      let result = text;
      // IDs are unique everywhere, so replacing one wherever it appears is exact.
      for (const [from, to] of renamed) result = result.replaceAll(from, to);
      return result;
    };

    // What the archive may say about whose a row is. The list of contents is not trusted, so
    // every row is held to this tenant and its workspaces, however the file was made.
    const memberIds = new Set(members.map((member) => rewrite(member.id)));
    const workspaceIds = new Set(manifest.workspaces.map((one) => one.id));
    const seen = new Map<string, Set<string>>();
    const seenIds = (table: string) => seen.get(table) ?? new Set<string>();
    const REMEMBERED = new Set([
      "workspace",
      "bundle",
      "principal_group",
      "resource",
      "flow_run",
      "run",
      "end_user_group",
      "scim_group",
      "member_dashboard",
      "data_table",
    ]);
    // Tables with no tenant of their own are held to a parent that was loaded before them.
    const PARENTS: Record<string, [column: string, parent: string]> = {
      group_member: ["group_id", "principal_group"],
      flow_layout: ["resource_id", "resource"],
      step_run: ["flow_run_id", "flow_run"],
      run_log: ["run_id", "run"],
      end_user_group_member: ["group_id", "end_user_group"],
      scim_group_member: ["group_id", "scim_group"],
      dashboard_share: ["dashboard_id", "member_dashboard"],
    };
    const owning = await sql<{ table: string; column: string }>`
      select table_name as "table", column_name as "column" from information_schema.columns
      where table_schema = 'public' and column_name in ('tenant_id', 'workspace_id')
    `.execute(kernel.db);
    const hasColumn = (table: string, column: string) =>
      owning.rows.some((one) => one.table === table && one.column === column);
    /** The object keys the loaded rows name. Only these may be in the archive. */
    const named = new Set<string>();
    const validate = (table: string, row: Record<string, unknown>) => {
      const wrong = (what: string) => refuse(`The export is refused: ${table} holds ${what}.`);
      if (hasColumn(table, "tenant_id") && row.tenant_id !== tenantId) {
        throw wrong("a row that is not this tenant's own, or is of the instance");
      }
      if (row.scope_type === "instance") throw wrong("a row of the whole instance");
      if (
        hasColumn(table, "workspace_id") &&
        row.workspace_id != null &&
        !seenIds("workspace").has(String(row.workspace_id))
      ) {
        throw wrong("a row of a workspace that is not in this export");
      }
      const parent = PARENTS[table];
      if (parent && !seenIds(parent[1]).has(String(row[parent[0]]))) {
        throw wrong("a row of something that is not in this export");
      }
      if (table === "workspace") {
        if (!workspaceIds.has(String(row.id))) throw wrong("a workspace the list does not name");
        if (row.linked_workspace_id != null && !workspaceIds.has(String(row.linked_workspace_id))) {
          throw wrong("a link to a workspace that is not in this export");
        }
      }
      if (table === "tenant_member" && !memberIds.has(String(row.member_id))) {
        throw wrong("a member the export does not list");
      }
      if (REMEMBERED.has(table) && typeof row.id === "string") {
        const ids = seen.get(table) ?? new Set<string>();
        ids.add(row.id);
        seen.set(table, ids);
      }
      for (const column of OWNED_TABLES.find((entry) => entry.table === table)?.stored ?? []) {
        const key = row[column];
        if (key == null) continue;
        if (typeof key !== "string" || unsafeKey(key)) throw wrong("a stored file with a bad name");
        named.add(key);
      }
    };

    /** Loads one table's parts with the database's own JSON-to-row conversion. */
    async function load(
      db: Trx,
      prefix: string,
      target: ReturnType<typeof sql.id>,
      change?: (row: Record<string, unknown>) => void,
      /** For records that may already be here, from an earlier stay of the same tenant. */
      skipExisting = false,
      /** Runs before each batch is inserted, with the batch's rows. */
      beforeBatch?: (rows: Record<string, unknown>[]) => Promise<void>,
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
          if (beforeBatch) await beforeBatch(batch.map((line) => JSON.parse(line)));
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
      // Every run, flow run and step loaded here would announce itself to the browsers.
      // Nobody is watching a tenant that does not exist yet.
      await sql`set local vx.quiet = 'on'`.execute(trx);
      await trx
        .insertInto("tenant")
        .values({
          id: tenantId,
          slug,
          name: manifest.tenant.name,
          managed_workers: manifest.tenant.managedWorkers ?? true,
          data_location: JSON.stringify(
            location === null ? { kind: "shared" } : { kind: "dedicated", ref: location },
          ),
        })
        .execute();
      await trx
        .insertInto("tenant_key")
        .values({ tenant_id: tenantId, wrapped_key: wrappedKey })
        .execute();

      let created = 0;
      for (const member of members) {
        if (known.has(member.id)) continue;
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
        const hash =
          member.password_hash ??
          (member.password_sealed
            ? kernel.vault.decrypt(
                kernel.vault.unwrapTenantKey(tenantId, wrappedKey),
                { tenantId, workspaceId: "members", name: member.id },
                Buffer.from(member.password_sealed, "base64"),
              )
            : null);
        if (hash) {
          await sql`
            insert into member_account (id, member_id, account_id, provider_id, password)
            values (gen_random_uuid(), ${member.id}, ${member.id}, 'credential', ${hash})
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
                validate(entry.table, row);
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
            : (row) => validate(entry.table, row),
          // An instance keeps a tenant's audit entries when the tenant is deleted. If the
          // tenant comes back, the entries it brings that are already here are the same ones.
          entry.keep === true,
          // The audit log is kept a month to a partition: each month the entries bring needs
          // its own, or they would sit apart and never age out.
          entry.table === "audit_entry"
            ? async (rows) => {
                const months = new Set(
                  rows
                    .map((row) => new Date(String(row.occurred_at)))
                    .filter((at) => !Number.isNaN(at.getTime()))
                    .map((at) => at.toISOString().slice(0, 7)),
                );
                for (const month of months) {
                  await sql`select audit_partition(${`${month}-01T00:00:00Z`}::timestamptz)`.execute(
                    trx,
                  );
                }
              }
            : undefined,
        );
      }
      // Nothing here may point at another tenant's rows: a role is this tenant's own or one
      // every tenant has, and what a binding or a link names is in this export.
      const stray = await sql<{ what: string }>`
        select 'a binding names a role that is not of this tenant or built in' as what
        from binding b where b.tenant_id = ${tenantId}
          and not exists (
            select 1 from role r where r.id = b.role_id
              and (r.tenant_id = ${tenantId} or (r.tenant_id is null and r.name <> ${INSTANCE_ONLY_ROLE}))
          )
        union all
        select 'a binding names a resource that is not in this export' from binding b
          where b.tenant_id = ${tenantId}
            and ((b.resource_id is not null
                  and not exists (select 1 from resource r where r.id = b.resource_id and r.tenant_id = ${tenantId}))
              or (b.source_resource_id is not null
                  and not exists (select 1 from resource r where r.id = b.source_resource_id and r.tenant_id = ${tenantId})))
        limit 1
      `.execute(trx);
      if (stray.rows[0]) throw refuse(`The export is refused: ${stray.rows[0].what}.`);
      for (const link of links) {
        if (link.active !== null && !seenIds("bundle").has(link.active)) {
          throw refuse("The export is refused: a workspace names a bundle that is not in it.");
        }
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
      const tableKeys = new Set<string>();
      await load(data, "data/catalog/data_table", sql.table("data_table") as never, (row) => {
        validate("data_table", row);
        if (typeof row.physical_name !== "string" || !IDENTIFIER.test(row.physical_name)) {
          throw refuse("The export is refused: a custom table has a name that is not allowed.");
        }
        tableKeys.add(`${row.workspace_id}/${row.physical_name}`);
      });
      await load(data, "data/catalog/data_column", sql.table("data_column") as never, (row) => {
        if (
          !seenIds("data_table").has(String(row.table_id)) ||
          typeof row.physical_name !== "string" ||
          !IDENTIFIER.test(row.physical_name) ||
          !(COLUMN_TYPES as readonly string[]).includes(String(row.type))
        ) {
          throw refuse("The export is refused: a custom column is not one of a table in it.");
        }
      });
      for (const path of checked.byPath.keys()) {
        const custom = /^data\/([^/]+)\/([^/]+)\.\d{4}\.jsonl$/.exec(path);
        if (custom && custom[1] !== "catalog" && !tableKeys.has(`${custom[1]}/${custom[2]}`)) {
          throw refuse(`The export is refused: ${path} is a table its catalog does not have.`);
        }
      }
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
      // Only what the loaded rows name comes in, and nothing that is stored already is
      // replaced or, if the import fails, removed: that belongs to someone else.
      const incoming = [...checked.byPath.values()].filter((entry) =>
        entry.path.startsWith("objects/"),
      );
      const offered = new Set(incoming.map((entry) => entry.path.slice("objects/".length)));
      for (const key of offered) {
        if (!named.has(key)) {
          throw refuse(`The export is refused: the object ${key} is not named by any row in it.`);
        }
      }
      for (const key of named) {
        if (!offered.has(key)) {
          throw refuse(`The export is refused: a row names the object ${key}, which is not in it.`);
        }
      }
      const fresh: [string, Buffer][] = [];
      for (const entry of incoming) {
        const key = entry.path.slice("objects/".length);
        const content = await tarRead(file, entry);
        const stored = await kernel.storage.get(key).catch(() => null);
        if (stored === null) fresh.push([key, content]);
        else if (!stored.equals(content)) {
          throw refuse(
            `The export is refused: the object ${key} is already stored here with other content.`,
          );
        }
      }
      const objects = incoming.length;
      for (const [key, content] of fresh) {
        written.push(key);
        await kernel.storage.put(key, content, "application/octet-stream");
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
        // The report counts what the file brought. A table that is never deleted may hold older
        // rows of the same tenant (its audit entries, when it was here before), which the file did
        // not bring: the same file would otherwise report more rows the second time it is imported.
        if (kept.has(name)) counts[name] = expected;
      }

      // The tenant came from another instance, which may still be pushing to the same
      // branches. Sync stays off here until someone looks at the repository's settings.
      await trx
        .updateTable("git_repository")
        .set({ paused: true })
        .where("tenant_id", "=", tenantId)
        .execute();

      // A provider was told the addresses of the instance the tenant came from, and a
      // domain was proved to that instance. Both are confirmed again here.
      await trx
        .updateTable("identity_provider")
        .set({ paused: true })
        .where("tenant_id", "=", tenantId)
        .execute();
      await trx
        .updateTable("identity_domain")
        .set({ verified_at: null, checked_at: null, check_error: null })
        .where("tenant_id", "=", tenantId)
        .execute();

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
