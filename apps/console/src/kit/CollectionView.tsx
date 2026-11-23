import type { ReactNode } from "react";
import { type Needs, useNeeds } from "./Can.tsx";
import { type DataColumn, DataTable, type DataTableProps } from "./DataTable.tsx";
import { MasterDetail } from "./layout.tsx";
import { PageHeader } from "./PageHeader.tsx";

/** "End-user groups" → "end-user-groups": a list's id from its title. */
export const keyOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^([^a-z])/, "x$1")
    .slice(0, 40);

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
  helpKey,
  state,
  needs,
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
  /** The list's id, for its description once read; its title's words by default. */
  helpKey?: string;
  /** Something about the whole list, beside its title: a `HeadNote`. */
  state?: ReactNode;
  /**
   * What changing the list takes. Where this member does not hold it, a line says so under the
   * title, the screen's actions are switched off, and so is the column of row actions (the one
   * with no header, or "Actions"). Reading is not hidden (GOV-37).
   */
  needs?: Needs;
}) {
  const { can, line } = useNeeds(needs);
  const offered =
    can || !actions ? (
      actions
    ) : (
      <fieldset disabled className="contents">
        {actions}
      </fieldset>
    );
  const emptyAction =
    can || !empty.action ? (
      empty.action
    ) : (
      <fieldset disabled className="contents">
        {empty.action}
      </fieldset>
    );
  const shown: CollectionColumn<Row>[] = can
    ? columns
    : columns.map((column) =>
        column.header === "" || column.header === "Actions"
          ? {
              ...column,
              cell: (row: Row) => (
                <fieldset disabled className="contents">
                  {column.cell(row)}
                </fieldset>
              ),
            }
          : column,
      );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line border-b px-4 py-3 md:px-6">
        <PageHeader
          title={title}
          description={description}
          actions={offered}
          toolbar={
            line ? (
              <div className="flex flex-col gap-3">
                {line}
                {toolbar}
              </div>
            ) : (
              toolbar
            )
          }
          helpKey={helpKey ?? keyOf(title)}
          state={state}
          oneRow
        />
      </div>
      <MasterDetail inspector={inspector} side={side}>
        <DataTable
          {...table}
          label={label ?? title}
          columns={shown}
          rows={rows}
          rowKey={rowKey}
          selected={selected}
          {...(onSelect ? { onOpen: onSelect } : {})}
          // An empty list offers what the page offers: making the first one.
          empty={{
            ...(emptyAction || !offered
              ? { ...empty, action: emptyAction }
              : { ...empty, action: offered }),
            // The sentence that was folded into help stays where a first list is made.
            text: empty.text ?? description,
          }}
          error={error}
          onRetry={onRetry}
          loading={loading}
        />
      </MasterDetail>
    </div>
  );
}
