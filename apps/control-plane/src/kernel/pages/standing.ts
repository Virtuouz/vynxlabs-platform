import type { RequestContext } from "../http.js";
import type { Kernel } from "../kernel.js";

/**
 * What whoever writes a page or a query must hold for what they put in it, whichever door the
 * save comes in by: a console draft, the deploy of drafts, a restored draft, or a resource put.
 * A repository deploy is code review's to gate and is not asked here (decision D25).
 *
 * - SQL typed into a dashboard widget, or a query whose SQL changed: `sql:read`.
 * - A table of a bound data source on a page: `data_source:read` (decision D24). A reader of the
 *   page needs only `data:read`.
 * - A role or a binding: what making one by its own route needs (`role:write`, `binding:write`),
 *   so a resource is no way round it to give oneself access (phase 35, B4).
 */

export interface PageChange {
  kind: string;
  path: string;
  body: unknown;
  deleted?: boolean | undefined;
}

type Found = { sql: boolean; tables: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every data source of a page's widgets and every SQL they hold, wherever the page nests them. */
function sourcesOf(value: unknown, into: Found): void {
  if (Array.isArray(value)) {
    for (const one of value) sourcesOf(one, into);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, one] of Object.entries(value)) {
    if (key === "source" && isObject(one)) {
      if (typeof one.sql === "string") into.sql = true;
      for (const form of [one.visual, one.own]) {
        if (isObject(form) && typeof form.table === "string") into.tables.push(form.table);
      }
    }
    sourcesOf(one, into);
  }
}

/** What a change puts on a page or in a query. A query is `sql` only when its text is not what it was. */
export function usesOf(change: PageChange, before?: unknown): Found {
  const found: Found = { sql: false, tables: [] };
  if (change.deleted) return found;
  if (change.kind === "dashboard" || change.kind === "interface") {
    sourcesOf(change.body, found);
  } else if (change.kind === "query" && isObject(change.body)) {
    const was = isObject(before) ? before.sql : undefined;
    if (change.body.sql !== was) found.sql = true;
  }
  return found;
}

/** What is kept at a path now: its draft, else what is deployed. A deploy compares with what is deployed. */
async function keptAt(
  kernel: Kernel,
  workspaceId: string,
  path: string,
  deployedOnly: boolean,
): Promise<unknown> {
  const draft = deployedOnly
    ? undefined
    : await kernel.db
        .selectFrom("resource_draft")
        .select("body")
        .where("workspace_id", "=", workspaceId)
        .where("path", "=", path)
        .executeTakeFirst();
  if (draft) return draft.body;
  // Exact path on purpose: the path of the change being compared, which is what is there now.
  const deployed = await kernel.db
    .selectFrom("resource")
    .select("body")
    .where("workspace_id", "=", workspaceId)
    .where("path", "=", path)
    .executeTakeFirst();
  return deployed?.body;
}

/**
 * Writing, or removing, a resource of a kind that gives access takes what its own route takes.
 * A role is the tenant's to write; a binding is held at the workspace it is in.
 */
export async function requireAccessKindStanding(
  ctx: RequestContext,
  workspace: { id: string; tenantId: string },
  kinds: Iterable<string | undefined>,
): Promise<void> {
  const wanted = new Set(kinds);
  if (wanted.has("role")) await ctx.authorize("role:write", { tenantId: workspace.tenantId });
  if (wanted.has("binding")) {
    await ctx.authorize("binding:write", {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
    });
  }
}

/** Throws 403 naming the permission the caller lacks. */
export async function requireStanding(
  kernel: Kernel,
  ctx: RequestContext,
  workspace: { id: string; tenantId: string },
  changes: readonly PageChange[],
  options: { deploying?: boolean } = {},
): Promise<void> {
  const at = { tenantId: workspace.tenantId, workspaceId: workspace.id };
  await requireAccessKindStanding(
    ctx,
    workspace,
    changes.map((change) => change.kind),
  );
  let sources: Set<string> | undefined;
  let sql = false;
  let source = false;
  for (const change of changes) {
    const used = usesOf(
      change,
      change.kind === "query" && !change.deleted
        ? await keptAt(kernel, workspace.id, change.path, options.deploying === true)
        : undefined,
    );
    if (used.sql) sql = true;
    if (used.tables.some((table) => table.includes("/")) && !source) {
      sources ??= new Set(
        (
          await kernel.db
            .selectFrom("data_source_binding")
            .select("path")
            .where("workspace_id", "=", workspace.id)
            .execute()
        ).map((row) => row.path),
      );
      source = used.tables.some((table) => sources?.has(table.slice(0, table.lastIndexOf("/"))));
    }
  }
  if (sql) await ctx.authorize("sql:read", at);
  if (source) await ctx.authorize("data_source:read", at);
}
