import { sql } from "@vynxlabs/db";
import { mutate, SYSTEM } from "./audit.js";
import type { Kernel } from "./kernel.js";

/**
 * Everything sealed directly with a master key. Tenants' secrets, connection
 * credentials and Git credentials are sealed with their tenant's key, which is
 * here: they are never touched by a rotation.
 */
const PLACES = [
  {
    place: "tenant keys",
    table: "tenant_key",
    key: "tenant_id",
    column: "wrapped_key",
    context: (id: string) => `tenant-key:${id}`,
    only: sql`true`,
  },
  {
    place: "database locations",
    table: "database_location",
    key: "name",
    column: "connection_encrypted",
    context: (name: string) => `instance:database-location:${name}`,
    only: sql`true`,
  },
  {
    // A tenant's own provider is sealed with the tenant's key.
    place: "identity providers",
    table: "identity_provider",
    key: "id",
    column: "secrets",
    context: (id: string) => `instance:sso:${id}`,
    only: sql`tenant_id is null and secrets is not null`,
  },
  {
    place: "sign-ins in progress",
    table: "sso_state",
    key: "id",
    column: "secrets",
    context: (id: string) => `instance:sso-state:${id}`,
    only: sql`secrets is not null`,
  },
  {
    place: "instance secrets",
    table: "instance_secret",
    key: "name",
    column: "sealed",
    context: (name: string) => `instance:instance-secret:${name}`,
    only: sql`true`,
  },
] as const;

export type Place = (typeof PLACES)[number]["place"];

/** Rows taken and sealed again in one transaction. */
const BATCH = 200;

export interface RekeyResult {
  /** Values sealed again with the master key, by place. */
  rewrapped: Record<string, number>;
  /** Values already sealed with it. */
  current: Record<string, number>;
  /** Values no key the instance has opens, by place and row. They are left as they are. */
  unopened: { place: Place; id: string }[];
}

/**
 * Seals with the master key everything sealed directly with a master key that
 * is not. Each row is taken for update, opened with whichever key opens it,
 * and written back, a batch per transaction: two replicas doing this at once
 * wait for each other row by row, and the second finds the row done. Stopped
 * halfway, it is run again. With `look`, nothing is written: it says what a
 * pass would do.
 */
export async function rekey(
  kernel: Kernel,
  options: { look?: boolean; batch?: number; afterBatch?: (place: Place) => void } = {},
): Promise<RekeyResult> {
  const result: RekeyResult = { rewrapped: {}, current: {}, unopened: [] };
  const batch = options.batch ?? BATCH;
  for (const { place, table, key, column, context, only } of PLACES) {
    result.rewrapped[place] = 0;
    result.current[place] = 0;
    let after = "";
    for (;;) {
      const done = await kernel.db.transaction().execute(async (trx) => {
        const rows = await sql<{ id: string; sealed: Buffer }>`
          select ${sql.ref(key)}::text as id, ${sql.ref(column)} as sealed
          from ${sql.table(table)}
          where ${only} and ${sql.ref(key)}::text > ${after}
          order by ${sql.ref(key)}::text
          limit ${batch}
          ${options.look ? sql`` : sql`for update`}
        `.execute(trx);
        for (const row of rows.rows) {
          let sealed: Buffer | undefined;
          try {
            sealed = kernel.vault.rewrap(context(row.id), row.sealed);
          } catch {
            result.unopened.push({ place, id: row.id });
            continue;
          }
          if (!sealed) {
            result.current[place] = (result.current[place] ?? 0) + 1;
            continue;
          }
          result.rewrapped[place] = (result.rewrapped[place] ?? 0) + 1;
          if (options.look) continue;
          await sql`
            update ${sql.table(table)} set ${sql.ref(column)} = ${sealed}
            where ${sql.ref(key)}::text = ${row.id}
          `.execute(trx);
        }
        after = rows.rows.at(-1)?.id ?? after;
        return rows.rows.length < batch;
      });
      options.afterBatch?.(place);
      if (done) break;
    }
  }
  const moved = Object.values(result.rewrapped).reduce((sum, n) => sum + n, 0);
  if (!options.look && moved > 0) {
    await mutate(kernel.db, { principal: SYSTEM }, (_trx, audit) =>
      audit({
        action: "instance.rekeyed",
        targetType: "instance",
        details: {
          masterKey: kernel.vault.fingerprints.current,
          rewrapped: result.rewrapped,
          unopened: result.unopened.length,
        },
      }),
    );
  }
  return result;
}

/** Whether a rotation is under way: the instance knows a second key. */
export const rotating = (kernel: Kernel) => kernel.vault.fingerprints.secondary !== null;

/**
 * A pass while a second key is set, said in the log. Run at start and every
 * ten minutes, for values a replica still on the old key sealed in between.
 */
export async function rekeyIfRotating(kernel: Kernel): Promise<RekeyResult | undefined> {
  if (!rotating(kernel)) return undefined;
  const result = await rekey(kernel);
  const moved = Object.values(result.rewrapped).reduce((sum, n) => sum + n, 0);
  const log = {
    rewrapped: result.rewrapped,
    unopened: result.unopened,
    ...kernel.vault.fingerprints,
  };
  if (result.unopened.length > 0) {
    kernel.log.error(
      log,
      "some values are sealed with neither master key and were left as they are",
    );
  } else if (moved > 0) {
    kernel.log.info(log, "values sealed with the secondary master key were sealed again");
  }
  return result;
}
