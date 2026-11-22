/**
 * The pivot's drawer (board 15). Data: Measure, Rows and Columns, with a small shaded preview
 * of the grid. Display: its heading, how numbers look, shading, and the totals.
 */
import { DrawerBlock, DrawerGroup } from "@volvel/ui";
import { formatNumber } from "@volvel/widgets";
import { shadeOf } from "@volvel/widgets-core/views";
import { BreakdownRow, MeasureRow } from "../measureControls.tsx";
import {
  ConfigToggle,
  type DrawerData,
  groupsOf,
  NumbersRow,
  type Query,
  queryOf,
  type SectionProps,
  sampleSummary,
  TEMPORAL,
} from "./chartShared.tsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What the heading of a date is on a small grid: "Sep" for a month, else as it is. */
function headingOf(value: unknown, bucket: string | undefined, dated: boolean): string {
  const text = String(value ?? "—");
  if (dated && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const month = MONTHS[Number(text.slice(5, 7)) - 1] ?? text;
    return bucket === "month" || bucket === "quarter"
      ? month
      : `${month} ${Number(text.slice(8, 10))}`;
  }
  return text;
}

/** The grid the pivot draws, small: the first breakdown down the side, the last across, each cell shaded by its size. */
export function PivotPreview({
  query,
  data,
  format,
  shade = false,
}: {
  query: Query;
  data: DrawerData | undefined;
  format?: Parameters<typeof formatNumber>[1];
  /** Whether the cells are shaded by size: it follows the "Shade cells by size" switch. */
  shade?: boolean;
}) {
  const groups = groupsOf(query);
  const summary = data?.summary ?? sampleSummary(query, data?.counts);
  const across = groups.at(-1);
  const down = groups.length > 1 ? groups[0] : undefined;
  const value = summary.values[0] ?? "";
  if (!across || !down) {
    return (
      <p className="m-0 text-body-sm text-ink-muted">Choose rows and columns to see the grid.</p>
    );
  }
  const acrossName = summary.breakdowns.at(-1) ?? "";
  const downName = summary.breakdowns[0] ?? "";
  const dated = across.type !== undefined && TEMPORAL.has(across.type);
  const columns = [...new Set(summary.rows.map((row) => String(row[acrossName])))].slice(0, 4);
  const rows = [...new Set(summary.rows.map((row) => String(row[downName])))].slice(0, 4);
  const cell = (r: string, c: string) =>
    summary.rows
      .filter((row) => String(row[downName]) === r && String(row[acrossName]) === c)
      .reduce<number | null>((sum, row) => (sum ?? 0) + (Number(row[value]) || 0), null);
  const numbers = rows
    .flatMap((r) => columns.map((c) => cell(r, c)))
    .filter((n): n is number => n !== null);
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  return (
    <div
      role="img"
      aria-label={`A grid of ${rows.length} rows and ${columns.length} columns${shade ? ", shaded by size" : ""}`}
      className="grid items-center gap-1 text-meta text-ink-muted"
      style={{ gridTemplateColumns: `minmax(3rem,auto) repeat(${columns.length}, minmax(0,1fr))` }}
    >
      <span />
      {columns.map((c) => (
        <span key={c} className="truncate px-1">
          {headingOf(c, across.bucket, dated)}
        </span>
      ))}
      {rows.map((r) => (
        <div key={r} className="contents">
          <span className="truncate pr-1">{r}</span>
          {columns.map((c) => (
            <span
              key={c}
              className="h-5 truncate rounded-inner px-1 text-right text-tag leading-5 text-ink"
              style={
                shade
                  ? {
                      background: `color-mix(in srgb, var(--color-action) ${Math.round(shadeOf(cell(r, c), low, high) * 100)}%, transparent)`,
                    }
                  : undefined
              }
            >
              {cellWords(cell(r, c), format)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A cell's number, short: 1.2M, 634k, 87, in the pivot's own format. */
const cellWords = (value: number | null, format: Parameters<typeof formatNumber>[1]): string =>
  value === null
    ? ""
    : formatNumber(value, { ...(format ?? { style: "number" }), notation: "compact" });

export function PivotData({ env, data }: SectionProps) {
  const query = queryOf(env, "rows");
  if (!query) return null;
  const groups = query.visual.groupBy ?? [];
  const columnsAt = Math.max(1, groups.length - 1);
  return (
    <DrawerGroup
      label="What to show"
      note="Same questions as a chart, with rows and columns in place of “for each”."
    >
      <MeasureRow env={env} input="rows" at={0} label="Measure" />
      <BreakdownRow env={env} input="rows" at={0} label="Rows" />
      <BreakdownRow env={env} input="rows" at={columnsAt} label="Columns" none="Nothing" />
      <DrawerBlock>
        <PivotPreview
          query={query}
          data={data}
          shade={env.config.shade === true}
          format={env.config.format as Parameters<typeof formatNumber>[1]}
        />
      </DrawerBlock>
    </DrawerGroup>
  );
}

export function PivotDisplay({ env }: SectionProps) {
  const legacy = env.config.totals as boolean | undefined;
  return (
    <DrawerGroup label="Look">
      <NumbersRow env={env} sample={1234} />
      <ConfigToggle env={env} name="shade" label="Shade cells by size" />
      <ConfigToggle
        env={env}
        name="rowTotals"
        label="Total for each row"
        on={(env.config.rowTotals as boolean | undefined) ?? legacy ?? true}
      />
      <ConfigToggle
        env={env}
        name="columnTotals"
        label="Total for each column"
        on={(env.config.columnTotals as boolean | undefined) ?? legacy ?? true}
      />
    </DrawerGroup>
  );
}
