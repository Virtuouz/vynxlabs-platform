import { useLoad } from "../../../api.ts";
import { type TableInfo, tableInfo, tableOf } from "../../../screens/builder/records.ts";
import type { Env } from "../controls.tsx";
import { columnOptions } from "../controls.tsx";
import { type ColumnFacts, factsOf } from "./columnModel.ts";

export type Row = Record<string, unknown> & { id?: string };

/** What a drawer section may be given in place of loading: the table's definition and some rows. */
export interface TableSource {
  /** The instance's API root, to load the table's definition and its first rows from. */
  root?: string | undefined;
  /** The table as a form knows it: its columns' types and choice values. */
  info?: TableInfo | undefined;
  /** The rows to draw a sample with: the first is the sample row. */
  rows?: readonly Row[] | undefined;
}

/** The widget's table, its definition and a few rows, as given or as loaded. */
export function useTableData(env: Env, source: TableSource) {
  const table = tableOf(env.widget);
  const root = source.root;
  const loadedInfo = useLoad<Parameters<typeof tableInfo>[1]>(
    root && table && !source.info ? `${root}/tables/${table}` : null,
  );
  const loadedRows = useLoad<{ items: Row[] }>(
    root && table && !source.rows ? `${root}/rows/${table}?limit=25` : null,
  );
  const info =
    source.info ?? (table && loadedInfo.data ? tableInfo(table, loadedInfo.data) : undefined);
  const rows = source.rows ?? loadedRows.data?.items ?? [];
  const names = columnOptions(env, "rows").map((one) => one.value);
  const facts: ColumnFacts[] = factsOf(names, env.catalog, table, info, rows);
  return { table, names, facts, rows, info };
}
