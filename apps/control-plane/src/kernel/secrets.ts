import { newId } from "@vynxlabs/db";
import type { Db, Trx } from "./audit.js";
import type { SecretName, Vault } from "./crypto.js";

/** The tenant's data key, created on first use. */
export async function tenantKey(db: Db | Trx, vault: Vault, tenantId: string): Promise<Buffer> {
  const fresh = vault.newTenantKey(tenantId);
  // If two requests race, one insert wins and both read the winner's key.
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
  return vault.unwrapTenantKey(tenantId, row.wrapped_key);
}

/** Stores a secret value, encrypted. Returns whether the secret is new. */
export async function setSecret(trx: Trx, vault: Vault, id: SecretName, value: string) {
  const key = await tenantKey(trx, vault, id.tenantId);
  const ciphertext = vault.encrypt(key, id, value);
  const existing = await trx
    .selectFrom("secret")
    .select("id")
    .where("workspace_id", "=", id.workspaceId)
    .where("name", "=", id.name)
    .executeTakeFirst();
  if (existing) {
    await trx
      .updateTable("secret")
      .set({ ciphertext, updated_at: new Date() })
      .where("id", "=", existing.id)
      .execute();
    return { created: false };
  }
  await trx
    .insertInto("secret")
    .values({
      id: newId(),
      tenant_id: id.tenantId,
      workspace_id: id.workspaceId,
      name: id.name,
      ciphertext,
      updated_at: new Date(),
    })
    .execute();
  return { created: true };
}

/**
 * Decrypts a secret value. No API route calls this: values are for code
 * running in the workspace, from the execution phase onwards.
 */
export async function revealSecret(db: Db | Trx, vault: Vault, id: SecretName) {
  const row = await db
    .selectFrom("secret")
    .select("ciphertext")
    .where("tenant_id", "=", id.tenantId)
    .where("workspace_id", "=", id.workspaceId)
    .where("name", "=", id.name)
    .executeTakeFirst();
  if (!row) return undefined;
  const key = await tenantKey(db, vault, id.tenantId);
  return vault.decrypt(key, id, row.ciphertext);
}
