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
  scripts: ScriptChoice[];
  groups: string[];
} {
  const flows = useLoad<{ items: (FlowChoice & { triggers: string[] })[] }>(`${root}/flows`);
  const scripts = useLoad<{ items: ScriptChoice[] }>(`${root}/scripts`);
  const groups = useLoad<{ items: { name: string }[] }>(
    `${root.split("/workspaces/")[0] ?? ""}/groups?limit=200`,
  );
  return {
    flows: (flows.data?.items ?? []).filter((one) => one.triggers.includes("manual")),
    scripts: scripts.data?.items ?? [],
    groups: (groups.data?.items ?? []).map((one) => one.name),
  };
}
