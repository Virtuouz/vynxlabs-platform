import { newId } from "@volvel/db";
import type { Db, Trx } from "../audit.js";
import type { Kernel } from "../kernel.js";
import { tenantKey } from "../tenant-keys.js";
import { authorizationChanged, sameJson } from "./oauth.js";
import { openRow, sealRow } from "./sealed.js";

export interface BindingName {
  tenantId: string;
  workspaceId: string;
  path: string;
}

export async function encryptFor(
  kernel: Kernel,
  db: Db | Trx,
  tenantId: string,
  workspaceId: string,
  name: string,
  value: string,
) {
  const key = await tenantKey(db, kernel.vault, tenantId);
  return kernel.vault.encrypt(key, { tenantId, workspaceId, name }, value);
}

export async function decryptFor(
  kernel: Kernel,
  db: Db | Trx,
  tenantId: string,
  workspaceId: string,
  name: string,
  ciphertext: Buffer,
) {
  const key = await tenantKey(db, kernel.vault, tenantId);
  return kernel.vault.decrypt(key, { tenantId, workspaceId, name }, ciphertext);
}

/**
 * Binds a connection in a workspace. Leaving `credential` undefined keeps the
 * one already stored. Null removes it.
 */
export async function bindConnection(
  kernel: Kernel,
  trx: Trx,
  id: BindingName,
  config: Record<string, unknown>,
  credential: string | null | undefined,
  /** The kind of connector it is bound as, when known. Kept with the binding. */
  connector?: string | null,
) {
  const existing = await trx
    .selectFrom("connection_binding")
    .select(["id", "config", "credential"])
    .where("workspace_id", "=", id.workspaceId)
    .where("path", "=", id.path)
    .executeTakeFirst();
  const rowId = existing?.id ?? newId();
  const row = { tenantId: id.tenantId, workspaceId: id.workspaceId, rowId, path: id.path };
  // A new address keeps no credential that was given for the old one: whoever may change
  // the connection could otherwise send it somewhere it was not given for.
  const dropped =
    credential === undefined &&
    existing?.credential != null &&
    addressChanged(existing.config, config);
  if (credential === undefined && existing?.credential && !dropped) {
    // Kept as it is, but it has to open: a credential nobody can read is said so now.
    await openRow(kernel, trx, "connection", row, existing.credential);
  }
  const encrypted =
    credential === undefined
      ? dropped
        ? null
        : (existing?.credential ?? null)
      : credential === null
        ? null
        : await sealRow(kernel, trx, "connection", row, credential);
  if (existing) {
    // Tokens an OAuth connection holds belong to the client and scopes they were given
    // for: pointing it at another forgets them.
    const reauthorize = authorizationChanged(existing.config, config) || dropped;
    await trx
      .updateTable("connection_binding")
      .set({
        config: JSON.stringify(config),
        credential: encrypted,
        updated_at: new Date(),
        ...(connector ? { connector } : {}),
        ...(reauthorize ? { oauth_tokens: null, oauth: null } : {}),
      })
      .where("id", "=", existing.id)
      .execute();
    return {
      created: false,
      changed: credential !== undefined || !sameJson(existing.config, config),
      credentialDropped: dropped,
    };
  }
  await trx
    .insertInto("connection_binding")
    .values({
      id: rowId,
      tenant_id: id.tenantId,
      workspace_id: id.workspaceId,
      path: id.path,
      config: JSON.stringify(config),
      credential: encrypted,
      connector: connector ?? null,
      updated_at: new Date(),
    })
    .execute();
  return { created: true, changed: true, credentialDropped: false };
}

export interface MemberName {
  tenantId: string;
  workspaceId: string;
  group: string;
  key: string;
}

/**
 * Adds a member to a connection group, or changes one. Leaving `credential`
 * undefined keeps the one already stored. Null removes it.
 */
export async function bindGroupMember(
  kernel: Kernel,
  trx: Trx,
  id: MemberName,
  member: { label?: string | undefined; config: Record<string, unknown> },
  credential: string | null | undefined,
) {
  const existing = await trx
    .selectFrom("connection_group_member")
    .select(["id", "credential", "label", "config"])
    .where("workspace_id", "=", id.workspaceId)
    .where("group_path", "=", id.group)
    .where("key", "=", id.key)
    .executeTakeFirst();
  const rowId = existing?.id ?? newId();
  const row = {
    tenantId: id.tenantId,
    workspaceId: id.workspaceId,
    rowId,
    path: id.group,
    key: id.key,
  };
  const dropped =
    credential === undefined &&
    existing?.credential != null &&
    addressChanged(existing.config, member.config);
  if (credential === undefined && existing?.credential && !dropped) {
    await openRow(kernel, trx, "connection-group-member", row, existing.credential);
  }
  const encrypted =
    credential === undefined
      ? dropped
        ? null
        : (existing?.credential ?? null)
      : credential === null
        ? null
        : await sealRow(kernel, trx, "connection-group-member", row, credential);
  const values = {
    label: member.label ?? existing?.label ?? "",
    config: JSON.stringify(member.config),
    credential: encrypted,
    updated_at: new Date(),
  };
  if (existing) {
    await trx
      .updateTable("connection_group_member")
      .set(values)
      .where("id", "=", existing.id)
      .execute();
    return { created: false, credentialDropped: dropped };
  }
  await trx
    .insertInto("connection_group_member")
    .values({
      id: rowId,
      tenant_id: id.tenantId,
      workspace_id: id.workspaceId,
      group_path: id.group,
      key: id.key,
      ...values,
    })
    .execute();
  return { created: true, credentialDropped: false };
}

/** A group member with its credential decrypted. For workers only. */
export async function readGroupMember(kernel: Kernel, db: Db | Trx, id: MemberName) {
  const row = await db
    .selectFrom("connection_group_member")
    .select(["id", "config", "credential", "label"])
    .where("workspace_id", "=", id.workspaceId)
    .where("tenant_id", "=", id.tenantId)
    .where("group_path", "=", id.group)
    .where("key", "=", id.key)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    label: row.label,
    config: row.config,
    credential: row.credential
      ? await openRow(
          kernel,
          db,
          "connection-group-member",
          {
            tenantId: id.tenantId,
            workspaceId: id.workspaceId,
            rowId: row.id,
            path: id.group,
            key: id.key,
          },
          row.credential,
        )
      : undefined,
  };
}

/** A bound connection with its credential decrypted. For workers and alerts only. */
export async function readConnection(kernel: Kernel, db: Db | Trx, id: BindingName) {
  const row = await db
    .selectFrom("connection_binding")
    .select(["id", "config", "credential", "oauth"])
    .where("workspace_id", "=", id.workspaceId)
    .where("tenant_id", "=", id.tenantId)
    .where("path", "=", id.path)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    config: row.config,
    oauth: row.oauth,
    credential: row.credential
      ? await openRow(
          kernel,
          db,
          "connection",
          { tenantId: id.tenantId, workspaceId: id.workspaceId, rowId: row.id, path: id.path },
          row.credential,
        )
      : undefined,
  };
}

/** The settings that say where a credential is sent. */
const ADDRESS_FIELDS = ["baseUrl", "url", "endpoint", "tokenUrl", "authorizeUrl", "host", "port"];

/** A web address as the place it names: scheme, host and port. Anything else as it is written. */
function placeOf(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value ?? null);
  try {
    return new URL(value).origin;
  } catch {
    return value.trim().toLowerCase();
  }
}

/**
 * Whether new settings send to another place than the old ones: another origin, host or port, or
 * another token address. A path on the same origin is the same place.
 */
export function addressChanged(before: unknown, after: unknown): boolean {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  return ADDRESS_FIELDS.some((field) => {
    // A token or authorization address is checked whole: its path is the provider's.
    const whole = field === "tokenUrl" || field === "authorizeUrl";
    const same = whole ? sameJson(a[field], b[field]) : placeOf(a[field]) === placeOf(b[field]);
    return !same;
  });
}
