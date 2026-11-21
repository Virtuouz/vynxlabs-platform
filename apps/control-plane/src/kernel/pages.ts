import {
  checkDashboard,
  checkInterface,
  type DashboardBody,
  type InterfaceBody,
  type TableBody,
} from "@volvel/manifest";
import type { Kernel } from "./kernel.js";

/**
 * Pages of widgets as the workspace stands now: what their shape cannot show, checked against
 * the tables that are really there, those made in the console included. A draft with problems
 * is still saved, because a page is built a step at a time. It cannot be shown properly until
 * they are gone, and the builder says so.
 */

/** The workspace's active tables and their columns, by path, in the form a page is checked against. */
export async function workspaceTables(
  kernel: Kernel,
  workspace: { id: string; tenantId: string },
): Promise<Map<string, TableBody>> {
  const data = (await kernel.data.forTenant(workspace.tenantId)).owner;
  const rows = await data
    .selectFrom("data_table")
    .innerJoin("data_column", "data_column.table_id", "data_table.id")
    .select([
      "data_table.name as table",
      "data_column.name as column",
      "data_column.type",
      "data_column.reference_table",
    ])
    .where("data_table.workspace_id", "=", workspace.id)
    .where("data_table.tenant_id", "=", workspace.tenantId)
    .where("data_table.status", "=", "active")
    .where("data_column.status", "=", "active")
    .execute();
  const tables = new Map<string, TableBody>();
  for (const row of rows) {
    const table = tables.get(row.table) ?? { columns: {} };
    table.columns[row.column] = {
      type: row.type as TableBody["columns"][string]["type"],
      ...(row.reference_table ? { references: row.reference_table } : {}),
    };
    tables.set(row.table, table);
  }
  // A table with no columns of its own yet is still a table.
  const empty = await data
    .selectFrom("data_table")
    .select("name")
    .where("workspace_id", "=", workspace.id)
    .where("tenant_id", "=", workspace.tenantId)
    .where("status", "=", "active")
    .execute();
  for (const table of empty) if (!tables.has(table.name)) tables.set(table.name, { columns: {} });
  return tables;
}

type Problems = { path: string; message: string }[];

/** What is wrong with an interface as the workspace stands now. */
export async function interfaceProblems(
  kernel: Kernel,
  workspace: { id: string; tenantId: string },
  body: InterfaceBody,
): Promise<Problems> {
  const tables = await workspaceTables(kernel, workspace);
  const sources = await sourcePaths(kernel, workspace);
  return [
    ...checkInterface(body, (path) => tables.get(path)),
    ...missingTables(body, tables, sources),
  ];
}

/** What is wrong with a dashboard as the workspace stands now. */
export async function dashboardProblems(
  kernel: Kernel,
  workspace: { id: string; tenantId: string },
  body: DashboardBody,
): Promise<Problems> {
  const tables = await workspaceTables(kernel, workspace);
  const sources = await sourcePaths(kernel, workspace);
  return [
    ...checkDashboard(body, (path) => tables.get(path)),
    ...missingTables(body, tables, sources),
  ];
}

/** The paths of the workspace's bound data sources: `<source>/<table>` reads a table there. */
async function sourcePaths(
  kernel: Kernel,
  workspace: { id: string; tenantId: string },
): Promise<Set<string>> {
  const bound = await kernel.db
    .selectFrom("data_source_binding")
    .select("path")
    .where("workspace_id", "=", workspace.id)
    .execute();
  return new Set(bound.map((row) => row.path));
}

/** A table a data input reads from menus that the workspace does not have, and no bound source holds. */
function missingTables(
  body: InterfaceBody | DashboardBody,
  tables: Map<string, TableBody>,
  sources: Set<string>,
): Problems {
  const inSource = (path: string) => {
    const at = path.lastIndexOf("/");
    return at > 0 && sources.has(path.slice(0, at));
  };
  const problems: Problems = [];
  const check = (widgets: DashboardBody["widgets"], at: string) =>
    widgets.forEach((widget, index) => {
      for (const [name, input] of Object.entries(widget.data ?? {})) {
        const table = "visual" in input.source ? input.source.visual.table : undefined;
        if (table !== undefined && !tables.has(table) && !inSource(table)) {
          problems.push({
            path: `${at}/widgets/${index}/data/${name}/source/visual/table`,
            message: `there is no table "${table}" in this workspace`,
          });
        }
      }
    });
  if ("pages" in body)
    body.pages.forEach((page, index) => {
      check(page.widgets, `/body/pages/${index}`);
    });
  else check(body.widgets, "/body");
  return problems;
}
