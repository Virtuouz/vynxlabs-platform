import { createHash } from "node:crypto";
import { sql } from "@volvel/db";
import { CORE_PREFIX } from "@volvel/manifest";
import type { Db, Trx } from "../audit.js";

/**
 * The basis of a resource owned as files: the content it last had in step with the
 * repository, kept as a hash. A repository deploy that would replace a resource whose content
 * is not its basis, or remove one that never had a basis, would overwrite what was done in
 * the console, and is refused unless it is forced.
 */

/** What of a resource is compared: where it is, who it is, what it is called, what it says. */
interface Content {
  path: string;
  key: string;
  title: string | null;
  body: unknown;
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as object)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, field]) => [key, sorted(field)]),
    );
  }
  return value;
}

/** The hash of a resource's content, as the registry holds it. */
export const contentHash = (content: Content): string =>
  createHash("sha256")
    .update(
      JSON.stringify(
        sorted({ path: content.path, key: content.key, title: content.title, body: content.body }),
      ),
    )
    .digest("hex");

/** What a repository deploy would do to a resource that the console changed or made. */
export interface ConsoleChange {
  path: string;
  change: "changed" | "made";
}

export const consoleChangeMessage = (change: ConsoleChange["change"]) =>
  change === "changed"
    ? "changed in the console since the repository last had it, and this deploy would replace it"
    : "made in the console since the repository last had it, and this deploy would remove it";

/** Whether any resource of the workspace has been in step with a repository. */
export async function hasBasis(trx: Trx, workspaceId: string): Promise<boolean> {
  const found = await trx
    .selectFrom("resource")
    .select("id")
    .where("workspace_id", "=", workspaceId)
    .where("basis_hash", "is not", null)
    .limit(1)
    .executeTakeFirst();
  return found !== undefined;
}

/**
 * Says that these resources, as they are now, are what the repository has: by key, among the
 * ones owned as files. With no keys given, every one of them. `except` keeps the basis of
 * resources that are not in step.
 */
export async function setBasis(
  trx: Db | Trx,
  workspaceId: string,
  options: { keys?: readonly string[] | undefined; except?: ReadonlySet<string> } = {},
): Promise<void> {
  if (options.keys && options.keys.length === 0) return;
  let query = trx
    .selectFrom("resource")
    .select(["id", "key", "path", "title", "body"])
    .where("workspace_id", "=", workspaceId)
    .where("ownership", "=", "ui")
    .where("path", "not like", `${CORE_PREFIX}%`);
  if (options.keys) query = query.where("key", "in", options.keys);
  for (const row of await query.execute()) {
    if (options.except?.has(row.key)) continue;
    await trx
      .updateTable("resource")
      .set({ basis_hash: contentHash(row) })
      .where("id", "=", row.id)
      .execute();
  }
}

/** A promotion carries the basis: what the target holds is in step as far as the source's was. */
export async function carryBasis(trx: Trx, fromWorkspaceId: string, toWorkspaceId: string) {
  await sql`
    update resource t set basis_hash = s.basis_hash
    from resource s
    where s.workspace_id = ${fromWorkspaceId} and t.workspace_id = ${toWorkspaceId}
      and s.key = t.key and s.ownership = 'ui' and t.ownership = 'ui'
      and s.basis_hash is not null
  `.execute(trx);
}

/** What `volvel pull` took, by path and hash as the files route gave them: that is the basis now. */
export async function setBasisTo(
  trx: Trx,
  workspaceId: string,
  taken: readonly { path: string; hash: string }[],
) {
  for (const one of taken) {
    await trx
      .updateTable("resource")
      .set({ basis_hash: one.hash })
      .where("workspace_id", "=", workspaceId)
      .where("path", "=", one.path)
      .where("ownership", "=", "ui")
      .execute();
  }
}
