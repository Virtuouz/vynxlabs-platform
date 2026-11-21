import type { SummaryData, WidgetViewProps } from "@volvel/widgets";
import { formatNumber, labelOf, numberOf, type ValueFormat } from "./format.ts";
import { listensTo, PRESSABLE, press } from "./press.tsx";

interface PivotConfig {
  format?: ValueFormat;
  totals?: boolean;
}

interface Turned {
  /** The headings across the top: one for each value of the last breakdown. */
  columns: string[];
  rowNames: string[];
  rows: { headers: string[]; cells: (number | null)[]; total: number | null }[];
  totals: { cells: (number | null)[]; total: number | null };
}

const SEPARATOR = "\u0001";
const shown = (value: unknown) => (value === null || value === undefined ? "—" : String(value));
const sum = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0));

/**
 * A summary turned on its side: every breakdown but the last heads the rows,
 * the last heads the columns, and each cell is the value of the group that
 * falls in it. The headings come in the order the rows came.
 */
export function turn(data: SummaryData): Turned {
  const value = data.values[0] ?? "";
  const across = data.breakdowns.at(-1) ?? "";
  const rowNames = data.breakdowns.slice(0, -1);
  const rowKeys: string[] = [];
  const columns: string[] = [];
  const cells = new Map<string, number>();
  for (const row of data.rows) {
    const rowKey = rowNames.map((name) => shown(row[name])).join(SEPARATOR);
    const column = shown(row[across]);
    if (!rowKeys.includes(rowKey)) rowKeys.push(rowKey);
    if (!columns.includes(column)) columns.push(column);
    const number = numberOf(row[value]);
    if (number !== undefined) {
      const key = `${rowKey}${SEPARATOR}${SEPARATOR}${column}`;
      cells.set(key, (cells.get(key) ?? 0) + number);
    }
  }
  const at = (rowKey: string, column: string) =>
    cells.get(`${rowKey}${SEPARATOR}${SEPARATOR}${column}`);
  const present = (values: (number | undefined)[]) =>
    values.filter((one): one is number => one !== undefined);
  return {
    columns,
    rowNames,
    rows: rowKeys.map((rowKey) => ({
      headers: rowNames.length > 0 ? rowKey.split(SEPARATOR) : [],
      cells: columns.map((column) => at(rowKey, column) ?? null),
      total: sum(present(columns.map((column) => at(rowKey, column)))),
    })),
    totals: {
      cells: columns.map((column) => sum(present(rowKeys.map((rowKey) => at(rowKey, column))))),
      total: sum([...cells.values()]),
    },
  };
}

/** A value across two breakdowns, as a grid, with totals along the edges. */
export function PivotView(props: WidgetViewProps<PivotConfig>) {
  const { config, data, emit } = props;
  const pressable = listensTo(props, "cellClick");
  const summary = data.rows;
  if (summary?.shape !== "summary") return null;
  const turned = turn(summary);
  const totals = config.totals !== false;
  const write = (value: number | null) =>
    value === null ? "" : formatNumber(value, config.format);
  const cell = "border-b border-line px-3 py-2 text-right tabular-nums";
  const heading = labelOf(summary.columns, summary.values[0] ?? "");
  const across = summary.breakdowns.at(-1) ?? "";
  const say = (headers: string[], column?: string) => {
    const group: Record<string, unknown> = {};
    turned.rowNames.forEach((name, at) => {
      group[name] = headers[at];
    });
    if (column !== undefined) group[across] = column;
    return { group };
  };
  return (
    <div className="overflow-auto">
      {/* table-allowed: a pivot heads its rows and its columns alike, which a list of rows does not */}
      <table className="w-full border-separate border-spacing-0 text-body-sm">
        <caption className="sr-only">
          {heading} by{" "}
          {summary.breakdowns.map((name) => labelOf(summary.columns, name)).join(" and ")}
        </caption>
        <thead>
          <tr>
            {turned.rowNames.map((name) => (
              <th
                key={name}
                scope="col"
                className="border-b border-line px-3 py-2 text-left font-medium text-ink-muted"
              >
                {labelOf(summary.columns, name)}
              </th>
            ))}
            {turned.columns.map((name) => (
              <th key={name} scope="col" className={`${cell} font-medium text-ink-muted`}>
                {name}
              </th>
            ))}
            {totals && turned.columns.length > 1 ? (
              <th scope="col" className={`${cell} font-semibold`}>
                Total
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {turned.rows.map((row) => (
            <tr key={row.headers.join(SEPARATOR)}>
              {row.headers.map((header, at) => (
                <th
                  key={turned.rowNames[at]}
                  scope="row"
                  className="border-b border-line px-3 py-2 text-left font-normal"
                >
                  {header}
                </th>
              ))}
              {row.cells.map((value, at) => (
                <td
                  key={turned.columns[at]}
                  className={`${cell} ${pressable && value !== null ? PRESSABLE : ""}`}
                  // biome-ignore lint/a11y/useKeyWithClickEvents: only a cell something listens to is pressed, and that one takes Enter
                  {...press(
                    pressable && value !== null,
                    value === null
                      ? undefined
                      : () => emit("cellClick", say(row.headers, turned.columns[at])),
                  )}
                >
                  {write(value)}
                </td>
              ))}
              {totals && turned.columns.length > 1 ? (
                <td className={`${cell} font-semibold`}>{write(row.total)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot>
            <tr>
              <th
                scope="row"
                colSpan={Math.max(1, turned.rowNames.length)}
                className="px-3 py-2 text-left font-semibold"
              >
                Total
              </th>
              {turned.totals.cells.map((value, at) => (
                <td
                  key={turned.columns[at]}
                  className="px-3 py-2 text-right font-semibold tabular-nums"
                >
                  {write(value)}
                </td>
              ))}
              {turned.columns.length > 1 ? (
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {write(turned.totals.total)}
                </td>
              ) : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
