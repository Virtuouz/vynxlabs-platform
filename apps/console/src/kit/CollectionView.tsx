import type { ReactNode } from "react";
import { type DataColumn, DataTable, type DataTableProps } from "./DataTable.tsx";
import { MasterDetail } from "./layout.tsx";

/** A column of a collection: the same shape as `DataTable`'s. */
export type CollectionColumn<Row> = DataColumn<Row>;

/**
 * A collection that fills the work area: a heading with the screen's one primary
 * action, a toolbar of filters, a list whose rows open an inspector beside it,
 * and the inspector itself. The list scrolls on its own, so choosing a row never
 * loses the place.
 */
export function CollectionView<Row>({
  title,
  description,
  actions,
  toolbar,
  columns,
  rows,
  rowKey,
  selected,
  onSelect,
  inspector,
  side,
  empty,
  error,
  loading,
  label,
  table,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  columns: CollectionColumn<Row>[];
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  selected?: string | undefined;
  onSelect?: (row: Row) => void;
  inspector?: ReactNode;
  side?: ReactNode;
  empty: { title: string; text?: ReactNode; action?: ReactNode };
  error?: string | undefined;
  loading?: boolean;
  /** Names the list for screen readers. */
  label?: string;
  /** Anything else the table takes: sort, row actions, checkboxes, density, a footer. */
  table?: Partial<Omit<DataTableProps<Row>, "columns" | "rows" | "rowKey">>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-line border-b px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="m-0 text-display">{title}</h1>
            {description ? <p className="m-0 max-w-[75ch] text-ink-muted">{description}</p> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {toolbar}
      </div>
      <MasterDetail inspector={inspector} side={side}>
        <DataTable
          {...table}
          label={label ?? title}
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          selected={selected}
          {...(onSelect ? { onOpen: onSelect } : {})}
          empty={empty}
          error={error}
          loading={loading}
        />
      </MasterDetail>
    </div>
  );
}
