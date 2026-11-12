import type { ComponentChildren } from "preact";

export interface Column<Row> {
  header: string;
  cell: (row: Row) => ComponentChildren;
  /** Right-align numbers and row actions. */
  align?: "end";
}

export interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Shown instead of the table when there are no rows. */
  empty: ComponentChildren;
}

export function Table<Row>({ columns, rows, rowKey, empty }: TableProps<Row>) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div class="overflow-x-auto rounded-panel border border-line bg-surface">
      <table class="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                class={`border-b border-line px-3 py-2 text-[13px] font-medium text-ink-muted ${
                  column.align === "end" ? "text-right" : ""
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} class="border-b border-line last:border-b-0">
              {columns.map((column) => (
                <td
                  key={column.header}
                  class={`px-3 py-2 align-middle ${column.align === "end" ? "text-right" : ""}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
