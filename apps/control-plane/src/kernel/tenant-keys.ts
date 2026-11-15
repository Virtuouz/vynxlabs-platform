import type { Db, Trx } from "./audit.js";
import type { Vault } from "./crypto.js";

/**
 * The tenant's data key, created on first use. Every secret, connection
 * credential and Git credential of the tenant is sealed with it, and it is
 * sealed with the master key: rotating the master key rewraps this alone.
 */
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
