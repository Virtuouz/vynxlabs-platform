import { Notice } from "@vynxlabs/ui";
import type { ReactNode } from "react";
import { EmptyCanvas, MasterDetail } from "./layout.tsx";

export interface CollectionColumn<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  /**
   * Which widths show it: 1 always, 2 from a tablet up, 3 on a wide screen.
   * On a phone a row keeps only what says what it is and its state.
   */
  priority?: 1 | 2 | 3;
  align?: "start" | "end";
}

const SHOWN = { 1: "", 2: "hidden sm:table-cell", 3: "hidden lg:table-cell" } as const;

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
        {error ? (
          <div className="p-4 md:px-6">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : loading || rows === undefined ? (
          <p className="m-0 px-4 py-6 text-ink-muted md:px-6">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="p-4 md:p-6">
            <EmptyCanvas title={empty.title} text={empty.text} action={empty.action} />
          </div>
        ) : (
          <table aria-label={label ?? title} className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-canvas">
              <tr className="border-line border-b text-meta text-ink-subtle">
                {columns.map((column, index) => (
                  <th
                    key={column.header}
                    scope="col"
                    className={`px-3 py-2 font-medium ${SHOWN[column.priority ?? 1]} ${
                      column.align === "end" ? "text-right" : ""
                    } ${index === 0 ? "pl-4 md:pl-6" : ""} ${index === columns.length - 1 ? "pr-4 md:pr-6" : ""}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                const on = key === selected;
                return (
                  <tr
                    key={key}
                    aria-selected={onSelect ? on : undefined}
                    tabIndex={onSelect ? 0 : undefined}
                    onClick={onSelect ? () => onSelect(row) : undefined}
                    onKeyDown={
                      onSelect
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelect(row);
                            }
                          }
                        : undefined
                    }
                    className={`border-line border-b align-top ${onSelect ? "cursor-pointer" : ""} ${
                      on ? "bg-selected" : onSelect ? "hover:bg-surface" : ""
                    }`}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.header}
                        className={`px-3 py-2.5 ${SHOWN[column.priority ?? 1]} ${
                          column.align === "end" ? "text-right" : ""
                        } ${index === 0 ? "pl-4 md:pl-6" : ""} ${index === columns.length - 1 ? "pr-4 md:pr-6" : ""}`}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </MasterDetail>
    </div>
  );
}
