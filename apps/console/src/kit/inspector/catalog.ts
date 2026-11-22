import { useLoad } from "../../api.ts";
import { type Catalog, EMPTY_CATALOG, type FlowChoice, type ScriptChoice } from "./model.ts";

interface Schema {
  tables: { name: string; columns: { name: string; type: string; references: string | null }[] }[];
  /** Whether whoever is here holds `sql:read`. */
  maySql: boolean;
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
  const catalog: Catalog =
    schema.data || saved.data
      ? {
          root,
          tables: schema.data?.tables ?? EMPTY_CATALOG.tables,
          queries: saved.data?.items ?? [],
          maySql: schema.data?.maySql === true,
        }
      : EMPTY_CATALOG;
  return { catalog, loading: !schema.data && !schema.error, error: schema.error?.message };
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
  const found = useLoad<ColumnValues>(
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
  return useLoad<ColumnCounts>(
    root && table ? `${root}/column-counts?table=${encodeURIComponent(table)}` : null,
  ).data;
}
