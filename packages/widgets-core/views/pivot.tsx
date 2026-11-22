import { formatDay, type SummaryData, type WidgetViewProps } from "@volvel/widgets";
import { formatNumber, labelOf, numberOf, type ValueFormat } from "./format.ts";
import { listensTo, PRESSABLE, press } from "./press.tsx";
import { ScrollsSideways } from "./scrolls.tsx";

interface PivotConfig {
  format?: ValueFormat;
  /** A total at the end of each row. Left out: the older `totals`, else shown. */
  rowTotals?: boolean;
  /** A total at the foot of each column. Left out: the older `totals`, else shown. */
  columnTotals?: boolean;
  /** The older setting, for both together. */
  totals?: boolean;
  /** Cells are shaded by their size. */
  shade?: boolean;
}

/** How much of the accent a cell is washed with, 0 to 1, by where it falls between the smallest and the biggest. */
export function shadeOf(value: number | null, low: number, high: number): number {
  if (value === null) return 0;
  if (high <= low) return value === 0 ? 0 : 0.35;
  return 0.08 + ((value - low) / (high - low)) * 0.5;
}

interface Turned {
  /** The headings across the top: one for each value of the last breakdown. */
  columns: string[];
  rowNames: string[];
  rows: { headers: string[]; cells: (number | null)[]; total: number | null }[];
  totals: { cells: (number | null)[]; total: number | null };
}

/** The first row heading stays in view when the grid is scrolled sideways. */
const STUCK = "sticky left-0 bg-surface";

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
  const rowTotals = (config.rowTotals ?? config.totals) !== false;
  const columnTotals = (config.columnTotals ?? config.totals) !== false;
  const present = turned.rows.flatMap((row) =>
    row.cells.filter((one): one is number => one !== null),
  );
  const low = Math.min(...present);
  const high = Math.max(...present);
  const write = (value: number | null) =>
    value === null ? "" : formatNumber(value, config.format);
  const cell = "rounded-[5px] px-2.5 py-1.5 text-right whitespace-nowrap tabular-nums";
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
    <ScrollsSideways label={`${heading} by ${summary.breakdowns.map((name) => labelOf(summary.columns, name)).join(" and ")}, scrolls sideways`}>
      {/* table-allowed: a pivot heads its rows and its columns alike, which a list of rows does not */}
      <table className="w-full border-separate border-spacing-1 text-body-sm">
        <caption className="sr-only">
          {heading} by{" "}
          {summary.breakdowns.map((name) => labelOf(summary.columns, name)).join(" and ")}
        </caption>
        <thead>
          <tr>
            {turned.rowNames.map((name, at) => (
              <th
                key={name}
                scope="col"
                className={`px-2.5 py-1.5 text-left text-meta font-medium whitespace-nowrap text-ink-muted ${at === 0 ? STUCK : ""}`}
              >
                {labelOf(summary.columns, name)}
              </th>
            ))}
            {turned.columns.map((name) => (
              <th key={name} scope="col" className={`${cell} text-meta font-medium text-ink-muted`}>
                {formatDay(name) ?? name}
              </th>
            ))}
            {rowTotals && turned.columns.length > 1 ? (
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
                  className={`px-2.5 py-1.5 text-left font-normal whitespace-nowrap ${at === 0 ? STUCK : ""}`}
                >
                  {formatDay(header) ?? header}
                </th>
              ))}
              {row.cells.map((value, at) => (
                <td
                  key={turned.columns[at]}
                  data-shade={
                    config.shade && value !== null
                      ? Math.round(shadeOf(value, low, high) * 100)
                      : undefined
                  }
                  style={
                    config.shade && value !== null
                      ? {
                          backgroundColor: `color-mix(in srgb, var(--vx-action) ${Math.round(shadeOf(value, low, high) * 100)}%, transparent)`,
                        }
                      : undefined
                  }
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
              {rowTotals && turned.columns.length > 1 ? (
                <td className={`${cell} font-semibold`}>{write(row.total)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
        {columnTotals ? (
          <tfoot>
            <tr>
              <th
                scope="row"
                colSpan={Math.max(1, turned.rowNames.length)}
                className={`px-2.5 py-1.5 text-left font-semibold ${STUCK}`}
              >
                Total
              </th>
              {turned.totals.cells.map((value, at) => (
                <td
                  key={turned.columns[at]}
                  className="px-2.5 py-1.5 text-right font-semibold tabular-nums"
                >
                  {write(value)}
                </td>
              ))}
              {rowTotals && turned.columns.length > 1 ? (
                <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">
                  {write(turned.totals.total)}
                </td>
              ) : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </ScrollsSideways>
  );
}
