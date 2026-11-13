import type { ReactNode } from "react";

export interface Column<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  /** Right-align numbers and row actions. */
  align?: "end";
}

export interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Shown instead of the table when there are no rows. */
  empty: ReactNode;
}

export function Table<Row>({ columns, rows, rowKey, empty }: TableProps<Row>) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity but their place, and two may share an empty header
                key={index}
                scope="col"
                className={`border-b border-line px-3 py-2 text-[13px] font-medium text-ink-muted ${
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
            <tr key={rowKey(row)} className="border-b border-line last:border-b-0">
              {columns.map((column, index) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: as for the headers
                  key={index}
                  className={`px-3 py-2 align-middle ${column.align === "end" ? "text-right" : ""}`}
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
