import type { ReactNode } from "react";
import { type DataColumn, DataTable, type DataTableProps } from "./DataTable.tsx";
import { MasterDetail } from "./layout.tsx";
import { PageHeader } from "./PageHeader.tsx";

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
  onRetry,
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
  /** What failed: the error itself, so its request ID shows, or a sentence. */
  error?: unknown;
  /** Asks again, offered beside an error. */
  onRetry?: (() => void) | undefined;
  loading?: boolean;
  /** Names the list for screen readers. */
  label?: string;
  /** Anything else the table takes: sort, row actions, checkboxes, density, a footer. */
  table?: Partial<Omit<DataTableProps<Row>, "columns" | "rows" | "rowKey">>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line border-b px-4 py-4 md:px-6">
        <PageHeader title={title} description={description} actions={actions} toolbar={toolbar} />
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
          // An empty list offers what the page offers: making the first one.
          empty={empty.action || !actions ? empty : { ...empty, action: actions }}
          error={error}
          onRetry={onRetry}
          loading={loading}
        />
      </MasterDetail>
    </div>
  );
}
