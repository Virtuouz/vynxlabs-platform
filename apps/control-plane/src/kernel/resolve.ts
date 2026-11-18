import type { Db, Trx } from "./audit.js";

/** How long the path a renamed resource had keeps answering. */
export const ALIAS_DAYS = 90;

/** A path that answered for a resource that has since been renamed. */
export interface AliasUse {
  /** The path that was asked for. */
  path: string;
  /** The path the resource has now. */
  now: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * How a request names a resource. Today only by its path, or a path it had.
 * A key would be written `~<key>`: `~` is in no path, so the two cannot be
 * confused, and reading one is one more branch here and a lookup by
 * `(workspace_id, key)`, which is indexed.
 */
export function parseRef(ref: string): { by: "path"; path: string } {
  return { by: "path", path: ref };
}

/**
 * The resource a path names: the one that has it, or else the one that had it
 * and was renamed, while that alias lasts. The second is a deprecation: the
 * caller is told, through `noteAlias`, and should move to the new path.
 */
export async function resolveResource(
  db: Db | Trx,
  workspaceId: string,
  ref: string,
  options: { kind?: string | readonly string[] } = {},
) {
  const { path } = parseRef(ref);
  const kinds =
    options.kind === undefined
      ? undefined
      : typeof options.kind === "string"
        ? [options.kind]
        : [...options.kind];
  const live = await db
    .selectFrom("resource")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("path", "=", path)
    .$if(kinds !== undefined, (query) => query.where("kind", "in", kinds as string[]))
    .executeTakeFirst();
  if (live) return { resource: live, via: "path" as const, alias: undefined };
  const alias = await findAlias(db, workspaceId, path, kinds);
  if (!alias) return undefined;
  const resource = await db
    .selectFrom("resource")
    .selectAll()
    .where("id", "=", alias.resource_id)
    .executeTakeFirst();
  if (!resource) return undefined;
  return {
    resource,
    via: "alias" as const,
    alias: {
      path,
      now: resource.path,
      createdAt: alias.created_at,
      expiresAt: alias.expires_at,
    } satisfies AliasUse,
  };
}

/** The alias at a path, if one is there and has not expired. */
export async function findAlias(
  db: Db | Trx,
  workspaceId: string,
  path: string,
  kinds?: readonly string[],
) {
  const alias = await db
    .selectFrom("resource_alias")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("path", "=", path)
    .where("expires_at", ">", new Date())
    .$if(kinds !== undefined, (query) => query.where("kind", "in", kinds as string[]))
    .executeTakeFirst();
  if (!alias) return undefined;
  // When it was last used says whether anything still calls the old path. Noted at most hourly.
  if (!alias.last_used_at || Date.now() - alias.last_used_at.getTime() > 3_600_000) {
    await db
      .updateTable("resource_alias")
      .set({ last_used_at: new Date() })
      .where("workspace_id", "=", workspaceId)
      .where("path", "=", path)
      .execute();
  }
  return alias;
}

/** The paths a resource had and that still answer for it. */
export async function formerPaths(db: Db | Trx, resourceId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("resource_alias")
    .select("path")
    .where("resource_id", "=", resourceId)
    .where("expires_at", ">", new Date())
    .execute();
  return rows.map((row) => row.path);
}

/**
 * The path a resource had now answers for it, until it expires. Whatever alias
 * was at the path it has now is gone: an alias is never a path in use.
 */
export async function leaveAlias(
  trx: Trx,
  resource: { id: string; tenant_id: string; workspace_id: string; kind: string },
  from: string,
  to: string,
) {
  const expires = new Date(Date.now() + ALIAS_DAYS * 86_400_000);
  await trx
    .insertInto("resource_alias")
    .values({
      workspace_id: resource.workspace_id,
      path: from,
      tenant_id: resource.tenant_id,
      resource_id: resource.id,
      kind: resource.kind,
      expires_at: expires,
    })
    .onConflict((conflict) =>
      conflict.columns(["workspace_id", "path"]).doUpdateSet({
        resource_id: resource.id,
        kind: resource.kind,
        created_at: new Date(),
        expires_at: expires,
        last_used_at: null,
      }),
    )
    .execute();
  // Renamed back to a path it had: that path was its own alias, and what called it there
  // still reaches it. Only an alias of another resource is one that stops answering.
  const ended = await trx
    .deleteFrom("resource_alias")
    .where("workspace_id", "=", resource.workspace_id)
    .where("path", "=", to)
    .returning("resource_id")
    .execute();
  return ended.some((alias) => alias.resource_id !== resource.id);
}

/** Removes the alias at a path that a resource now has. Says whether there was one. */
export async function dropAlias(trx: Trx, workspaceId: string, path: string): Promise<boolean> {
  const removed = await trx
    .deleteFrom("resource_alias")
    .where("workspace_id", "=", workspaceId)
    .where("path", "=", path)
    .returning("path")
    .execute();
  return removed.length > 0;
}

/**
 * The headers of an answer that was reached through an alias: that the path is
 * deprecated, when it stops answering, and where the resource is now.
 */
export function aliasHeaders(alias: AliasUse): Record<string, string> {
  return {
    deprecation: `@${Math.floor(alias.createdAt.getTime() / 1000)}`,
    sunset: alias.expiresAt.toUTCString(),
    "vynx-resource-moved": alias.now,
    warning: `299 - "${alias.path} was renamed to ${alias.now}. The old path stops answering on ${alias.expiresAt.toISOString().slice(0, 10)}."`,
  };
}

/** Forgets the aliases that have run out: their paths answer nothing already. */
export async function removeExpiredAliases(kernel: { db: Db }): Promise<void> {
  await kernel.db.deleteFrom("resource_alias").where("expires_at", "<=", new Date()).execute();
}
