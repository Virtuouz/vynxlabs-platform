import type { Db } from "./audit.js";
import type { Vault } from "./crypto.js";

/** Where a secret of the instance is sealed: what binds its ciphertext to its row. */
export const instanceSecretContext = (name: string) => `instance-secret:${name}`;

/**
 * A secret of the instance, kept sealed in the database and made on first use
 * from `first`. Replicas racing to make it agree on whichever was written first.
 */
export async function instanceSecret(
  db: Db,
  vault: Vault,
  name: string,
  first: () => Buffer,
): Promise<Buffer> {
  const read = () =>
    db.selectFrom("instance_secret").select("sealed").where("name", "=", name).executeTakeFirst();
  // Read first: a database that takes no writes still gives up a secret it already has.
  const known = await read();
  if (known) {
    return Buffer.from(vault.openForInstance(instanceSecretContext(name), known.sealed), "base64");
  }
  await db
    .insertInto("instance_secret")
    .values({
      name,
      sealed: vault.sealForInstance(instanceSecretContext(name), first().toString("base64")),
    })
    .onConflict((oc) => oc.column("name").doNothing())
    .execute();
  const row = await db
    .selectFrom("instance_secret")
    .select("sealed")
    .where("name", "=", name)
    .executeTakeFirstOrThrow();
  return Buffer.from(vault.openForInstance(instanceSecretContext(name), row.sealed), "base64");
}

/**
 * The seed of the restricted data role's password. It starts as the master key
 * the instance had when this was introduced, which is what the password was
 * made from before, so upgrading changes nothing; rotating the master key
 * later does not change it either.
 */
export const DATA_ROLE_SECRET = "data-role";
