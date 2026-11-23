import { useEffect, useState } from "react";
import { api, useLoad, useLoadOf } from "../../api.ts";
import {
  type Catalog,
  type CatalogTable,
  EMPTY_CATALOG,
  type FlowChoice,
  type ScriptChoice,
} from "./model.ts";

interface Schema {
  tables: {
    name: string;
    columns: {
      name: string;
      type: string;
      references: string | null;
      required?: boolean;
      default?: unknown;
      /** What the column holds, as its table's definition says (what is owed, in cents). */
      description?: string;
      /** A choice column's values, with the labels the table's definition gives them. */
      values?: { value: string; label?: string; color?: string }[];
    }[];
  }[];
  /** Whether whoever is here holds `sql:read`. */
  maySql: boolean;
}

/** A name a page can write in a table's path: the data source's tables with a space or a capital are left out. */
const PAGE_NAME = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * The tables of the data sources bound here, each as `<source>/<table>`, for whoever may read
 * data sources: someone who may not is offered none, and nothing says so (their pages cannot
 * name one, and the server would refuse the save).
 */
function useSourceTables(root: string): CatalogTable[] {
  const bound = useLoad<{ items: { path: string; bound: boolean }[] }>(
    `${root}/data-source-bindings`,
  );
  const paths = (bound.data?.items ?? []).filter((one) => one.bound).map((one) => one.path);
  const key = paths.join("\n");
  const [found, setFound] = useState<CatalogTable[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the list of paths
  useEffect(() => {
    if (paths.length === 0) {
      setFound([]);
      return;
    }
    let current = true;
    Promise.all(
      paths.map((path) =>
        api
          .get<{
            items: { name: string; columns: { name: string; type: string; required: boolean }[] }[];
          }>(`${root}/data-source-tables/${path}`)
          .then((read) =>
            read.items
              .filter((table) => PAGE_NAME.test(table.name))
              .map((table) => ({
                name: `${path}/${table.name}`,
                columns: table.columns.map((column) => ({
                  name: column.name,
                  type: column.type,
                  references: null,
                  required: column.required,
                })),
              })),
          )
          // A source that cannot be reached offers nothing: the page still says where it reads from.
          .catch(() => []),
      ),
    ).then((all) => current && setFound(all.flat()));
    return () => {
      current = false;
    };
  }, [root, key]);
  return found;
}

/**
 * What a widget in this workspace can ask questions of, as far as the reader
 * may read it: the tables and their columns, the saved queries, and whether
 * SQL may be written. Read once for the whole editor.
 */
export function useCatalog(root: string): {
  catalog: Catalog;
  loading: boolean;
  error: string | undefined;
} {
  const schema = useLoad<Schema>(`${root}/queries/schema`);
  const saved = useLoad<{ items: { path: string; description: string }[] }>(`${root}/queries`);
  const sources = useSourceTables(root);
  const catalog: Catalog =
    schema.data || saved.data
      ? {
          root,
          sources,
          tables: schema.data?.tables ?? EMPTY_CATALOG.tables,
          queries: saved.data?.items ?? [],
          maySql: schema.data?.maySql === true,
        }
      : EMPTY_CATALOG;
  return {
    catalog,
    loading: !schema.data && !schema.error,
    // Either read failing is said: a catalog that is empty because it could not be read is not one that has nothing.
    error: (schema.error ?? saved.error)?.message,
  };
}

/**
 * What an action can start and who it can name, read once for the editor: the
 * workspace's flows that can be run by hand, its scripts, and the tenant's groups
 * of members. Pass them to `Inspector` as `flows`, `scripts` and `groups`.
 */
export function useActionLists(root: string): {
  flows: FlowChoice[];
  /** The workflows with an approval step, which an Approvals widget may ask of. */
  approvals: { path: string; title: string | null }[];
  /** Every flow, with whether it has an approval step: for checking what an Approvals widget names. */
  everyFlow: { path: string; title: string | null; asks: boolean }[];
  scripts: ScriptChoice[];
  groups: string[];
} {
  const flows = useLoad<{
    items: (FlowChoice & {
      triggers: string[];
      title?: string | null;
      approvals?: unknown[];
    })[];
  }>(`${root}/flows`);
  const scripts = useLoad<{ items: ScriptChoice[] }>(`${root}/scripts`);
  const groups = useLoad<{ items: { name: string }[] }>(
    `${root.split("/workspaces/")[0] ?? ""}/groups?limit=200`,
  );
  return {
    flows: (flows.data?.items ?? []).filter((one) => one.triggers.includes("manual")),
    approvals: (flows.data?.items ?? [])
      .filter((one) => (one.approvals ?? []).length > 0)
      .map((one) => ({ path: one.path, title: one.title ?? null })),
    everyFlow: (flows.data?.items ?? []).map((one) => ({
      path: one.path,
      title: one.title ?? null,
      asks: (one.approvals ?? []).length > 0,
    })),
    scripts: scripts.data?.items ?? [],
    groups: (groups.data?.items ?? []).map((one) => one.name),
  };
}

/** What `column-values` gives. */
export interface ColumnValues {
  values: { value: string; count: number }[];
  distinct: number;
  more?: true;
  rows: number;
  empty: number;
  sampled?: true;
}

/** What `column-counts` gives. */
export interface ColumnCounts {
  rows: number;
  columns: Record<string, number | null>;
  more?: string[];
  sampled?: true;
}

/** The kinds of column whose values may be listed: the server refuses json, files and lists of choices. */
const LISTABLE = new Set(["enum", "boolean", "text", "string"]);

/**
 * The values a column holds with how many rows have each, for the condition editor's checked
 * list. Nothing is asked for a column that cannot be listed, or a table the workspace does not
 * own (the server says 404 and the editor is left with typing). Counts of a sampled read are
 * not exact: a sampled list is not offered.
 */
export function useColumnValues(
  root: string | undefined,
  table: string | undefined,
  column: { name: string; type: string } | undefined,
): { value: string; count?: number }[] | undefined {
  const listable = root && table && column && LISTABLE.has(column.type);
  const found = useLoadOf<ColumnValues>(
    listable
      ? `${root}/column-values?table=${encodeURIComponent(table)}&column=${encodeURIComponent(column.name)}`
      : null,
  );
  const data = found.data;
  if (!data || data.sampled || data.more || data.values.length === 0) return undefined;
  // A text column with many values is typed into, not ticked.
  if (column?.type === "text" && data.values.length > 12) return undefined;
  return data.values;
}

/** How many different values each column of a table has, and how many rows it has: `undefined` while it is read, or when it cannot be. */
export function useColumnCounts(
  root: string | undefined,
  table: string | undefined,
): ColumnCounts | undefined {
  return useLoadOf<ColumnCounts>(
    root && table ? `${root}/column-counts?table=${encodeURIComponent(table)}` : null,
  ).data;
}
