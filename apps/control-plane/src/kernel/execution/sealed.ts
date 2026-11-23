import { sql } from "@volvel/db";
import type { Db, Trx } from "../audit.js";
import { HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { tenantKey } from "../tenant-keys.js";

/**
 * What a binding keeps sealed (a connection's credential, its OAuth tokens, a
 * group member's credential, a data source's password) is sealed under the ID of
 * its row, which no rename changes. Until phase 29 each was sealed under its
 * resource's path, so a rename made it unreadable. A row sealed that way is
 * still opened here, under the path it has or the ones its resource had, and is
 * sealed again under its ID the moment it opens.
 */
export type SealedKind =
  | "connection"
  | "connection-oauth"
  | "connection-group-member"
  | "data-source";

interface Where {
  table: "connection_binding" | "connection_group_member" | "data_source_binding";
  column: "credential" | "oauth_tokens";
}

const WHERE: Record<SealedKind, Where> = {
  connection: { table: "connection_binding", column: "credential" },
  "connection-oauth": { table: "connection_binding", column: "oauth_tokens" },
  "connection-group-member": { table: "connection_group_member", column: "credential" },
  "data-source": { table: "data_source_binding", column: "credential" },
};

/** The name a row's sealed value is bound to. */
export const sealedName = (kind: SealedKind, rowId: string) => `${kind}-row:${rowId}`;

/** The name it had before: the resource's path. A group member's is its group's path and its key. */
function legacyName(kind: SealedKind, path: string, key?: string) {
  return kind === "connection-group-member" ? `connection-group:${path}:${key}` : `${kind}:${path}`;
}

/** Every path the resource at `path` has had, the one it has first. */
async function pathsOf(db: Db | Trx, workspaceId: string, path: string): Promise<string[]> {
  const found = await sql<{ path: string }>`
    select distinct v.path from resource_version v
    where v.workspace_id = ${workspaceId}
      and v.resource_id in (
        select r.id from resource r where r.workspace_id = ${workspaceId} and r.path = ${path}
        union
        select a.resource_id from resource_alias a where a.workspace_id = ${workspaceId} and a.path = ${path}
      )
    union
    select a.path from resource_alias a
    where a.workspace_id = ${workspaceId}
      and a.resource_id in (select r.id from resource r where r.workspace_id = ${workspaceId} and r.path = ${path})
  `
    .execute(db)
    .then((result) => result.rows.map((row) => row.path))
    .catch(() => [] as string[]);
  return [path, ...found.filter((one) => one !== path)];
}

export interface SealedRow {
  tenantId: string;
  workspaceId: string;
  /** The ID of the binding row, or the member row. */
  rowId: string;
  /** The resource's path: a group's, for a member. */
  path: string;
  /** A member's key. */
  key?: string;
}

/** A credential that no name opens: said in words, with who can fix it. */
const unreadable = (what: string) =>
  new HttpError(
    422,
    "connection_unusable",
    `The stored ${what} cannot be read. Someone with connection:write has to enter it again.`,
  );

export async function sealRow(
  kernel: Kernel,
  db: Db | Trx,
  kind: SealedKind,
  row: SealedRow,
  value: string,
): Promise<Buffer> {
  const key = await tenantKey(db, kernel.vault, row.tenantId);
  return kernel.vault.encrypt(
    key,
    { tenantId: row.tenantId, workspaceId: row.workspaceId, name: sealedName(kind, row.rowId) },
    value,
  );
}

/**
 * Opens what a row keeps sealed. If it only opens under a name from before, it
 * is sealed again under the row's ID, where the row is. `what` is for the words
 * when nothing opens it.
 */
export async function openRow(
  kernel: Kernel,
  db: Db | Trx,
  kind: SealedKind,
  row: SealedRow,
  ciphertext: Buffer,
  what = "credential",
): Promise<string> {
  const key = await tenantKey(db, kernel.vault, row.tenantId);
  const at = (name: string) => ({
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    name,
  });
  try {
    return kernel.vault.decrypt(key, at(sealedName(kind, row.rowId)), ciphertext);
  } catch {
    // Sealed before: under a path.
  }
  const paths = await pathsOf(db, row.workspaceId, row.path);
  for (const path of paths) {
    let value: string;
    try {
      value = kernel.vault.decrypt(key, at(legacyName(kind, path, row.key)), ciphertext);
    } catch {
      continue;
    }
    try {
      const where = WHERE[kind];
      const sealed = await sealRow(kernel, db, kind, row, value);
      await sql`update ${sql.table(where.table)} set ${sql.ref(where.column)} = ${sealed} where id = ${row.rowId} and ${sql.ref(where.column)} = ${ciphertext}`.execute(
        db,
      );
    } catch {
      // Read-only for now: it opens the same way next time.
    }
    return value;
  }
  throw unreadable(what);
}
