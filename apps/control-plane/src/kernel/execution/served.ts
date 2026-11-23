import type { Db, Trx } from "../audit.js";
import type { Kernel } from "../kernel.js";
import { pathNow } from "../resolve.js";
import { revealSecret } from "../secrets.js";
import { readConnection, readGroupMember } from "./bindings.js";
import { storedTokens } from "./oauth.js";
import { isSecretKey, type Known, maskFor } from "./redact.js";
import { runnable } from "./runs.js";

/** What identifies a run for finding what it was served. */
export interface ServedRun {
  tenant_id: string;
  workspace_id: string;
  bundle_id: string;
  script_path: string;
  trigger_type: string;
  trigger_detail: Record<string, unknown>;
}

/** Values under secret-named keys of a connection's settings. */
function secretSettings(config: unknown, out: string[]) {
  if (Array.isArray(config)) for (const item of config) secretSettings(item, out);
  else if (typeof config === "object" && config !== null) {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === "string" && isSecretKey(key)) out.push(value);
      else secretSettings(value, out);
    }
  }
}

/**
 * The values the worker was given for a run: the secrets and credentials it declared (and, in a
 * flow, was handed), by the same rules the worker routes serve them by. Nothing here is stored:
 * a value is looked up when a text is shown or sent, so a rotated secret is masked as it is now
 * and the one it replaced is masked from lines that were written while it was current.
 * Failing to look one up masks less, never more, and never stops the caller.
 */
export async function servedValues(kernel: Kernel, db: Db | Trx, run: ServedRun): Promise<Known> {
  const values: string[] = [];
  try {
    const bundle = await db
      .selectFrom("bundle")
      .select(["id", "storage_key"])
      .where("id", "=", run.bundle_id)
      .executeTakeFirst();
    const body = bundle ? await runnable(kernel, bundle, run.script_path) : undefined;
    const handed = (run.trigger_type === "flow" ? run.trigger_detail?.grants : undefined) as
      | { connections?: string[] }
      | undefined;
    const secrets = body?.uses.secrets ?? [];
    const connections = [
      ...new Set([...(body?.uses.connections ?? []), ...(handed?.connections ?? [])]),
    ];
    for (const name of secrets) {
      const value = await revealSecret(db, kernel.vault, {
        tenantId: run.tenant_id,
        workspaceId: run.workspace_id,
        name,
      }).catch(() => undefined);
      if (value) values.push(value);
    }
    for (const declared of connections) {
      values.push(
        ...(await connectionValues(kernel, db, run.tenant_id, run.workspace_id, declared)),
      );
    }
    // A connection group's members are read one at a time by key, so any may have been.
    for (const group of body?.uses.connectionGroups ?? []) {
      const now = await pathNow(db, run.workspace_id, group, "connection_group").catch(() => group);
      const members = await db
        .selectFrom("connection_group_member")
        .select("key")
        .where("workspace_id", "=", run.workspace_id)
        .where("group_path", "=", now)
        .limit(1000)
        .execute();
      for (const member of members) {
        const read = await readGroupMember(kernel, db, {
          tenantId: run.tenant_id,
          workspaceId: run.workspace_id,
          group: now,
          key: member.key,
        }).catch(() => undefined);
        if (read?.credential) values.push(read.credential);
      }
    }
  } catch (error) {
    kernel.log.warn({ err: error }, "a run's served values could not all be looked up");
  }
  return maskFor(values);
}

/** The credential, secret settings and tokens of one connection, as the worker is handed them. */
export async function connectionValues(
  kernel: Kernel,
  db: Db | Trx,
  tenantId: string,
  workspaceId: string,
  declared: string,
): Promise<string[]> {
  const values: string[] = [];
  const id = {
    tenantId,
    workspaceId,
    path: await pathNow(db, workspaceId, declared, "connection").catch(() => declared),
  };
  const bound = await readConnection(kernel, db, id).catch(() => undefined);
  if (bound?.credential) values.push(bound.credential);
  if (bound) secretSettings(bound.config, values);
  if (bound?.oauth) values.push(...(await storedTokens(kernel, db, id).catch(() => [])));
  return values;
}

/** What a task was given: the one connection it names. */
export async function taskValues(
  kernel: Kernel,
  db: Db | Trx,
  task: { tenant_id: string; workspace_id: string; request: Record<string, unknown> },
): Promise<Known> {
  const path = task.request.connection;
  if (typeof path !== "string") return [];
  return maskFor(await connectionValues(kernel, db, task.tenant_id, task.workspace_id, path));
}
