import { operatorsAmong } from "../administer.js";
import { grants } from "../authorize.js";
import type { Kernel } from "../kernel.js";

/**
 * How this instance starts managed workers:
 * - `host`: a worker host on a network of its own starts them, as their own user.
 * - `isolated`: as another user, who cannot read the control plane's environment or signal it.
 * - `shared`: as the control plane's own user, because the operator chose so.
 * - `unable`: another user was asked for and could not be had. Tenants whose code
 *   is written by anyone outside the operator get no managed worker.
 * - `off`: this process starts none.
 */
export type WorkerUserMode = "host" | "isolated" | "shared" | "unable" | "off";

let mode: WorkerUserMode = "off";

export function workerUserMode(): WorkerUserMode {
  return mode;
}

export function setWorkerUserMode(next: WorkerUserMode) {
  mode = next;
}

/**
 * Whether anyone outside the operator may write the tenant's code: a service
 * account, or a member, or a member of a group, who holds no instance-wide role.
 * Any binding in the tenant whose role grants `code:write`, wildcards included, counts.
 */
export async function hasOutsideCodeWriters(kernel: Kernel, tenantId: string): Promise<boolean> {
  const { db } = kernel;
  const bindings = await db
    .selectFrom("binding as b")
    .innerJoin("role as r", "r.id", "b.role_id")
    .select(["b.principal_type", "b.principal_id", "r.permissions"])
    .where("b.tenant_id", "=", tenantId)
    .execute();
  const writers = bindings.filter((binding) => grants(binding.permissions, "code:write"));
  if (writers.length === 0) return false;

  const members = new Set<string>();
  for (const writer of writers) {
    if (writer.principal_type === "member" && writer.principal_id) {
      members.add(writer.principal_id);
    } else if (writer.principal_type === "group" && writer.principal_id) {
      const inGroup = await db
        .selectFrom("group_member")
        .select("member_id")
        .where("group_id", "=", writer.principal_id)
        .execute();
      for (const one of inGroup) members.add(one.member_id);
    } else {
      // A service account, or anyone at all: never the operator.
      return true;
    }
  }
  if (members.size === 0) return false;
  // Only an enabled operator admin is the operator: any other role bound at the instance is not.
  const held = new Set(await operatorsAmong(db, [...members]));
  return [...members].some((member) => !held.has(member));
}
