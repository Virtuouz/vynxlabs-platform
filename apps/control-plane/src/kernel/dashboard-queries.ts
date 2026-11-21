import type { DashboardBody } from "@volvel/manifest";
import type { Db, Trx } from "./audit.js";
import { resolveResource } from "./resolve.js";

/**
 * What a dashboard's widgets name. A widget names a saved query by path, and a path can
 * change: the old one answers for 90 days. A deployed dashboard therefore keeps, for each
 * widget, the key of the query its path named when it was deployed, and a widget whose
 * path answers nothing any more runs the query with that key.
 */

/** The saved-query path each widget of a dashboard names, by the widget's ID. */
export function queryPathsOf(body: DashboardBody): Map<string, string> {
  const named = new Map<string, string>();
  for (const widget of body.widgets ?? []) {
    if (widget.source && "query" in widget.source) named.set(widget.id, widget.source.query);
  }
  return named;
}

/**
 * Writes what each widget of the workspace's dashboards names, after a deploy has applied
 * every resource (a dashboard may come before the query it names). A widget whose path names
 * a query is recorded with that query's key. One whose path names nothing keeps the record it
 * had for that path, so that it can still be followed; any other record is dropped.
 */
export async function recordWidgetQueries(trx: Trx, workspace: { id: string; tenantId: string }) {
  const dashboards = await trx
    .selectFrom("resource")
    .select(["id", "key", "body"])
    .where("workspace_id", "=", workspace.id)
    .where("kind", "=", "dashboard")
    .execute();
  if (dashboards.length === 0) return;
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
  for (const dashboard of dashboards) {
    for (const [widgetId, path] of queryPathsOf(dashboard.body as unknown as DashboardBody)) {
      const id = `${dashboard.id}/${widgetId}`;
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
        dashboard_id: dashboard.id,
        widget_id: widgetId,
        workspace_id: workspace.id,
        tenant_id: workspace.tenantId,
        dashboard_key: dashboard.key,
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
 * The query a widget named at deploy time, found by its key, for a widget whose path
 * answers nothing. `names` is the path the dashboard still has and `now` the path the
 * query has.
 */
export async function followRecordedKey(
  db: Db | Trx,
  workspaceId: string,
  dashboardId: string,
  widgetId: string,
) {
  const record = await db
    .selectFrom("dashboard_widget_query")
    .select(["path", "query_key"])
    .where("dashboard_id", "=", dashboardId)
    .where("widget_id", "=", widgetId)
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

/** A dashboard with a widget that names a path. */
export interface DashboardNaming {
  path: string;
  key: string;
  title: string;
  /** `ui` is made in the console and can be drafted; `code` is the repository's. */
  ownership: "ui" | "code";
  /** Whether what it is now is an open draft. */
  drafted: boolean;
  schemaVersion: number;
  body: DashboardBody;
  /** The widgets that name the path. */
  widgets: string[];
}

/**
 * The dashboards whose widgets name a query path, as they would be deployed now: a draft
 * where there is one, else what is deployed. A dashboard from the repository that has no
 * draft is `code`.
 */
export async function dashboardsNaming(
  db: Db | Trx,
  workspaceId: string,
  path: string,
): Promise<DashboardNaming[]> {
  const deployed = await db
    .selectFrom("resource")
    .select(["key", "path", "title", "body", "ownership", "schema_version"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", "dashboard")
    .execute();
  const drafts = await db
    .selectFrom("resource_draft")
    .select(["key", "path", "title", "body", "deleted", "schema_version"])
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", "dashboard")
    .execute();
  const draftOf = new Map(drafts.map((draft) => [draft.key, draft]));
  const seen = new Set<string>();
  const out: DashboardNaming[] = [];
  const consider = (
    one: {
      key: string;
      path: string;
      title: string | null;
      body: unknown;
      schema_version: number;
    },
    ownership: "ui" | "code",
    drafted: boolean,
  ) => {
    const body = one.body as DashboardBody;
    const widgets = [...queryPathsOf(body)].filter(([, named]) => named === path).map(([id]) => id);
    if (widgets.length === 0) return;
    out.push({
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

/** A dashboard's body with each widget that names `from` naming `to`. */
export function renamedQuery(body: DashboardBody, from: string, to: string): DashboardBody {
  return {
    ...body,
    widgets: body.widgets.map((widget) =>
      widget.source && "query" in widget.source && widget.source.query === from
        ? { ...widget, source: { ...widget.source, query: to } }
        : widget,
    ),
  };
}
