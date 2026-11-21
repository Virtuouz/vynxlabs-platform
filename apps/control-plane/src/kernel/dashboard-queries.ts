import type { DashboardBody, InterfaceBody, PageWidget } from "@volvel/manifest";
import type { Db, Trx } from "./audit.js";
import { resolveResource } from "./resolve.js";

/**
 * What the widgets of an interface or a dashboard name. A data input names a saved query by
 * path, and a path can change: the old one answers for 90 days. A deployed page therefore
 * keeps, for each such input, the key of the query its path named when it was deployed, and
 * an input whose path answers nothing any more runs the query with that key.
 */

/** The kinds of resource that hold pages of widgets. */
export const PAGE_KINDS_HELD = ["interface", "dashboard"] as const;
export type PageResourceKind = (typeof PAGE_KINDS_HELD)[number];
export type PageBody = InterfaceBody | DashboardBody;

/** Every widget of a body, with the page's id before it when the body has pages. */
function widgetsOf(
  kind: PageResourceKind,
  body: PageBody,
): { prefix: string; widget: PageWidget }[] {
  if (kind === "dashboard") {
    return ((body as DashboardBody).widgets ?? []).map((widget) => ({ prefix: "", widget }));
  }
  return ((body as InterfaceBody).pages ?? []).flatMap((page) =>
    (page.widgets ?? []).map((widget) => ({ prefix: `${page.id}/`, widget })),
  );
}

/**
 * The saved-query path each data input of a body's widgets names, by where it is: the
 * widget's id and the input's name, with the page's id first on an interface
 * (`money/by-week/rows`, or `by-week/rows` on a dashboard). A widget's id is only unique on
 * its page.
 */
export function queryPathsOf(kind: PageResourceKind, body: PageBody): Map<string, string> {
  const named = new Map<string, string>();
  for (const { prefix, widget } of widgetsOf(kind, body)) {
    for (const [input, one] of Object.entries(widget.data ?? {})) {
      if ("query" in one.source) named.set(`${prefix}${widget.id}/${input}`, one.source.query);
    }
  }
  return named;
}

/** Where a widget's input is, in the form `queryPathsOf` gives: `page/widget/input`, or `widget/input`. */
export function placeOf(page: string | undefined, widget: string, input: string): string {
  return `${page ? `${page}/` : ""}${widget}/${input}`;
}

/**
 * Writes what each data input of the workspace's interfaces and dashboards names, after a
 * deploy has applied every resource (a page may come before the query it names). An input
 * whose path names a query is recorded with that query's key. One whose path names nothing
 * keeps the record it had for that path, so that it can still be followed; any other record
 * is dropped.
 */
export async function recordWidgetQueries(trx: Trx, workspace: { id: string; tenantId: string }) {
  const pages = await trx
    .selectFrom("resource")
    .select(["id", "key", "kind", "body"])
    .where("workspace_id", "=", workspace.id)
    .where("kind", "in", [...PAGE_KINDS_HELD])
    .execute();
  if (pages.length === 0) return;
  const had = await trx
    .selectFrom("dashboard_widget_query")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .execute();
  const hadOf = new Map(had.map((row) => [`${row.dashboard_id}/${row.widget_id}`, row]));
  const records: {
    dashboard_id: string;
    widget_id: string;
    workspace_id: string;
    tenant_id: string;
    dashboard_key: string;
    path: string;
    query_key: string;
  }[] = [];
  const kept = new Set<string>();
  for (const page of pages) {
    for (const [place, path] of queryPathsOf(
      page.kind as PageResourceKind,
      page.body as unknown as PageBody,
    )) {
      const id = `${page.id}/${place}`;
      const found = await resolveResource(trx, workspace.id, path, { kind: "query" });
      const before = hadOf.get(id);
      if (!found && before?.path === path) {
        kept.add(id);
        continue;
      }
      if (!found) continue;
      if (before?.path === path && before.query_key === found.resource.key) {
        kept.add(id);
        continue;
      }
      records.push({
        dashboard_id: page.id,
        widget_id: place,
        workspace_id: workspace.id,
        tenant_id: workspace.tenantId,
        dashboard_key: page.key,
        path,
        query_key: found.resource.key,
      });
    }
  }
  const stale = had.filter(
    (row) =>
      !kept.has(`${row.dashboard_id}/${row.widget_id}`) &&
      !records.some(
        (one) => one.dashboard_id === row.dashboard_id && one.widget_id === row.widget_id,
      ),
  );
  for (const row of stale) {
    await trx
      .deleteFrom("dashboard_widget_query")
      .where("dashboard_id", "=", row.dashboard_id)
      .where("widget_id", "=", row.widget_id)
      .execute();
  }
  for (const record of records) {
    await trx
      .insertInto("dashboard_widget_query")
      .values(record)
      .onConflict((conflict) =>
        conflict.columns(["dashboard_id", "widget_id"]).doUpdateSet({
          path: record.path,
          query_key: record.query_key,
          dashboard_key: record.dashboard_key,
        }),
      )
      .execute();
  }
}

/**
 * The query an input named at deploy time, found by its key, for an input whose path
 * answers nothing. `place` is as `queryPathsOf` gives it. `names` is the path the page still
 * has and `now` the path the query has.
 */
export async function followRecordedKey(
  db: Db | Trx,
  workspaceId: string,
  pageId: string,
  place: string,
) {
  const record = await db
    .selectFrom("dashboard_widget_query")
    .select(["path", "query_key"])
    .where("dashboard_id", "=", pageId)
    .where("widget_id", "=", place)
    .executeTakeFirst();
  if (!record) return undefined;
  const resource = await db
    .selectFrom("resource")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("key", "=", record.query_key)
    .where("kind", "=", "query")
    .executeTakeFirst();
  return resource ? { resource, names: record.path, now: resource.path } : undefined;
}

/** An interface or a dashboard with an input that names a path. */
export interface DashboardNaming {
  kind: PageResourceKind;
  path: string;
  key: string;
  title: string;
  /** `ui` is made in the console and can be drafted; `code` is the repository's. */
  ownership: "ui" | "code";
  /** Whether what it is now is an open draft. */
  drafted: boolean;
  schemaVersion: number;
  body: PageBody;
  /** Where in it the path is named, as `queryPathsOf` gives it. */
  widgets: string[];
}

/**
 * The interfaces and dashboards whose widgets name a query path, as they would be deployed
 * now: a draft where there is one, else what is deployed. One from the repository that has
 * no draft is `code`.
 */
export async function dashboardsNaming(
  db: Db | Trx,
  workspaceId: string,
  path: string,
): Promise<DashboardNaming[]> {
  const deployed = await db
    .selectFrom("resource")
    .select(["key", "path", "kind", "title", "body", "ownership", "schema_version"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "in", [...PAGE_KINDS_HELD])
    .execute();
  const drafts = await db
    .selectFrom("resource_draft")
    .select(["key", "path", "kind", "title", "body", "deleted", "schema_version"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "in", [...PAGE_KINDS_HELD])
    .execute();
  const draftOf = new Map(drafts.map((draft) => [draft.key, draft]));
  const seen = new Set<string>();
  const out: DashboardNaming[] = [];
  const consider = (
    one: {
      key: string;
      path: string;
      kind: string;
      title: string | null;
      body: unknown;
      schema_version: number;
    },
    ownership: "ui" | "code",
    drafted: boolean,
  ) => {
    const kind = one.kind as PageResourceKind;
    const body = one.body as PageBody;
    const widgets = [...queryPathsOf(kind, body)]
      .filter(([, named]) => named === path)
      .map(([place]) => place);
    if (widgets.length === 0) return;
    out.push({
      kind,
      path: one.path,
      key: one.key,
      title: one.title || (body as { title?: string }).title || one.path,
      ownership,
      drafted,
      schemaVersion: one.schema_version,
      body,
      widgets,
    });
  };
  for (const row of deployed) {
    seen.add(row.key);
    const draft = draftOf.get(row.key);
    if (draft?.deleted) continue;
    if (draft) consider(draft, "ui", true);
    else consider(row, row.ownership === "code" ? "code" : "ui", false);
  }
  for (const draft of drafts) {
    if (!seen.has(draft.key) && !draft.deleted) consider(draft, "ui", true);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A body with each data input that names the saved query `from` naming `to`. */
export function renamedQuery(
  kind: PageResourceKind,
  body: PageBody,
  from: string,
  to: string,
): PageBody {
  const widget = (one: PageWidget): PageWidget => {
    if (!one.data) return one;
    const data = Object.fromEntries(
      Object.entries(one.data).map(([name, input]) => [
        name,
        "query" in input.source && input.source.query === from
          ? { ...input, source: { ...input.source, query: to } }
          : input,
      ]),
    );
    return { ...one, data };
  };
  if (kind === "dashboard") {
    const dashboard = body as DashboardBody;
    return { ...dashboard, widgets: dashboard.widgets.map(widget) };
  }
  const interfaceBody = body as InterfaceBody;
  return {
    ...interfaceBody,
    pages: interfaceBody.pages.map((page) => ({ ...page, widgets: page.widgets.map(widget) })),
  };
}
