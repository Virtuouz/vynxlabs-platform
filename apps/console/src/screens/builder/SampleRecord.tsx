import { displayGuess, type Page } from "@volvel/manifest";
import { SelectField } from "@volvel/ui";
import { useLoad } from "../../api.ts";
import type { Catalog } from "../../kit/inspector/model.ts";
import { manyOf, type TableInfo, tableInfo } from "./records.ts";

type Row = Record<string, unknown> & { id: string };

/** How many rows are offered to preview with. */
const OFFERED = 25;

/** A table's definition, as a form and the suggestions need it. */
export function useTableInfo(root: string, table: string | undefined): TableInfo | undefined {
  const found = useLoad<Parameters<typeof tableInfo>[1]>(table ? `${root}/tables/${table}` : null);
  return table && found.data ? tableInfo(table, found.data) : undefined;
}

/**
 * The rows a page that opens on a record is drawn with while building: the
 * first row of its table, or the one chosen. A record page, a side sheet or a
 * modal on a table is drawn from a sample, since nothing opened it.
 */
export function useSampleRecords(
  root: string,
  page: Page | undefined,
  catalog: Catalog,
  chosen: string | undefined,
) {
  const table = page?.kind && page.kind !== "page" ? page.record?.table : undefined;
  const rows = useLoad<{ items: Row[] }>(table ? `${root}/rows/${table}?limit=${OFFERED}` : null);
  const columns = catalog.tables.find((one) => one.name === table)?.columns ?? [];
  // A record is named as the page names it: by its Record detail's heading (an invoice's
  // number), else by the column that names a row of its table.
  const heading = page?.widgets
    .map((widget) => widget.config?.heading)
    .find(
      (one): one is string =>
        typeof one === "string" && columns.some((column) => column.name === one),
    );
  const named =
    heading ?? displayGuess(columns.map((column) => ({ name: column.name, type: column.type })));
  const label = (row: Row): string => {
    const value = named ? row[named] : undefined;
    return typeof value === "string" && value !== "" ? value : String(row.id);
  };
  const items = rows.data?.items ?? [];
  const current = items.find((row) => row.id === chosen) ?? items[0];
  return {
    table,
    loading: table !== undefined && !rows.data && !rows.error,
    items: items.map((row) => ({ id: row.id, label: label(row) })),
    /** The id the page is drawn with, if the table has a row. */
    record: current?.id,
    name: current ? label(current) : undefined,
  };
}

/**
 * "Preview of Invoice detail for INV-9339", and a way to choose another row.
 * What the page shows is read for that row, so the fields and the actions are
 * seen as a person will see them.
 */
export function SampleBar({
  page,
  sample,
  onChoose,
}: {
  page: Page;
  sample: ReturnType<typeof useSampleRecords>;
  onChoose: (id: string) => void;
}) {
  if (!sample.table) return null;
  if (sample.loading) {
    return (
      <p className="m-0 mb-3 text-body-sm text-ink-muted">Finding a record to preview with…</p>
    );
  }
  if (!sample.record) {
    return (
      <p className="m-0 mb-3 text-body-sm text-ink-muted">
        {manyOf(sample.table)} has no rows yet, so there is no record to preview {page.title} with.
        Add a row in Data, or choose another table.
      </p>
    );
  }
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <p className="m-0 text-body-sm text-ink-muted">
        Preview of <strong className="font-medium text-ink">{page.title}</strong> for{" "}
        <strong className="font-medium text-ink">{sample.name}</strong>
      </p>
      {sample.items.length > 1 ? (
        <div className="w-60 max-w-full">
          <SelectField
            label="Preview with another record"
            name="sample-record"
            value={sample.record}
            options={sample.items.map((one) => ({ value: one.id, label: one.label }))}
            onChange={onChoose}
          />
        </div>
      ) : null}
    </div>
  );
}
