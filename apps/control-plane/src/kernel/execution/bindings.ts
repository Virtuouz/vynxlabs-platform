import { newId } from "@vynxlabs/db";
import type { Db, Trx } from "../audit.js";
import type { Kernel } from "../kernel.js";

export interface BindingName {
  tenantId: string;
  workspaceId: string;
  path: string;
}

/** A connection's credential is encrypted with the tenant's key, like any secret. */
const credentialName = (id: BindingName) => ({
  tenantId: id.tenantId,
  workspaceId: id.workspaceId,
  name: `connection:${id.path}`,
});

async function tenantKey(db: Db | Trx, kernel: Kernel, tenantId: string): Promise<Buffer> {
  const fresh = kernel.vault.newTenantKey(tenantId);
  await db
    .insertInto("tenant_key")
    .values({ tenant_id: tenantId, wrapped_key: fresh.wrapped })
    .onConflict((oc) => oc.column("tenant_id").doNothing())
    .execute();
  const row = await db
    .selectFrom("tenant_key")
    .select("wrapped_key")
    .where("tenant_id", "=", tenantId)
    .executeTakeFirstOrThrow();
  return kernel.vault.unwrapTenantKey(tenantId, row.wrapped_key);
}

export async function encryptFor(
  kernel: Kernel,
  db: Db | Trx,
  tenantId: string,
  workspaceId: string,
  name: string,
  value: string,
) {
  const key = await tenantKey(db, kernel, tenantId);
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
  const key = await tenantKey(db, kernel, tenantId);
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
) {
  const existing = await trx
    .selectFrom("connection_binding")
    .select(["id", "credential"])
    .where("workspace_id", "=", id.workspaceId)
    .where("path", "=", id.path)
    .executeTakeFirst();
  const name = credentialName(id);
  const encrypted =
    credential === undefined
      ? (existing?.credential ?? null)
      : credential === null
        ? null
        : await encryptFor(kernel, trx, name.tenantId, name.workspaceId, name.name, credential);
  if (existing) {
    await trx
      .updateTable("connection_binding")
      .set({ config: JSON.stringify(config), credential: encrypted, updated_at: new Date() })
      .where("id", "=", existing.id)
      .execute();
    return { created: false };
  }
  await trx
    .insertInto("connection_binding")
    .values({
      id: newId(),
      tenant_id: id.tenantId,
      workspace_id: id.workspaceId,
      path: id.path,
      config: JSON.stringify(config),
      credential: encrypted,
      updated_at: new Date(),
    })
    .execute();
  return { created: true };
}

/** A bound connection with its credential decrypted. For workers and alerts only. */
export async function readConnection(kernel: Kernel, db: Db | Trx, id: BindingName) {
  const row = await db
    .selectFrom("connection_binding")
    .select(["config", "credential"])
    .where("workspace_id", "=", id.workspaceId)
    .where("tenant_id", "=", id.tenantId)
    .where("path", "=", id.path)
    .executeTakeFirst();
  if (!row) return undefined;
  const name = credentialName(id);
  return {
    config: row.config,
    credential: row.credential
      ? await decryptFor(kernel, db, name.tenantId, name.workspaceId, name.name, row.credential)
      : undefined,
  };
}
