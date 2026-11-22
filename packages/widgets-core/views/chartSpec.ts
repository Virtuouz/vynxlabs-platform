import type { SummaryData } from "@volvel/widgets";
import { axisFormat, labelOf, numberOf, type ValueFormat } from "./format.ts";

export interface ChartConfig {
  mark?: "line" | "bar" | "area" | "pie" | "scatter" | "heatmap";
  format?: ValueFormat;
  legend?: "auto" | "shown" | "hidden";
  horizontal?: boolean;
  bars?: "stacked" | "grouped";
  /** Draws the period before. Stored with `compareTo`, which the server reads (see `withCompare`). */
  compare?: boolean;
  compareTo?: string;
  /** A line or an area is drawn smooth. */
  smooth?: boolean;
  /** A line marks each point, and so does an area when this is true. Left out: a line does. */
  points?: boolean;
  /** Values written on the bars. */
  values?: boolean;
  /** The axes are titled. Left out: they are. */
  axisTitles?: boolean;
  /** `theme`, or a named palette. Left out: the theme's. */
  colors?: "theme" | "cool" | "warm" | "mono";
  /** The order of what is along the bottom, when it is not a date. Left out: as it came. */
  order?: "biggest" | "smallest" | "label";
  /** Periods with nothing in them are drawn as zero. */
  fillGaps?: boolean;
  x?: string;
  y?: string;
}

/** The column that carries the period before, point for point, on a compared chart. */
export const BEFORE = "period_before";

const TEMPORAL = new Set(["date", "timestamp"]);

/** The named palettes, as colors both themes can carry. `theme` takes the tokens, which a spec cannot hold. */
export const PALETTES: Record<"cool" | "warm" | "mono", string[]> = {
  cool: ["#38bdf8", "#818cf8", "#2dd4bf", "#a78bfa", "#60a5fa", "#22d3ee"],
  warm: ["#f59e0b", "#f97316", "#ef4444", "#ec4899", "#eab308", "#fb7185"],
  mono: ["#64748b", "#94a3b8", "#475569", "#cbd5e1", "#334155", "#7c8ba1"],
};

/**
 * The comparison a switch stands for. `compare` is what a person sets; the server reads
 * `compareTo`, the page's date filter, so both are kept together. Switching on with no
 * date filter to use leaves it off.
 */
export function withCompare<T extends { compare?: boolean; compareTo?: string }>(
  config: T,
  on: boolean,
  dateFilters: readonly string[],
): T {
  const { compare: _compare, compareTo: _compareTo, ...rest } = config;
  const filter = dateFilters[0];
  return (on && filter !== undefined ? { ...rest, compare: true, compareTo: filter } : rest) as T;
}

/** Whether a configuration compares, as an older page (`compareTo` alone) or a newer one says it. */
export const isComparing = (config: { compare?: boolean; compareTo?: string }): boolean =>
  config.compare !== false && config.compareTo !== undefined;

export type ChartKind = NonNullable<ChartConfig["mark"]> | "bar-sideways";
export type ChartNeed = "a date" | "a split" | "no date" | "a number" | "a group";

/** What a chart is drawn from, as far as its type goes: the columns, and which of them are the breakdowns. */
export interface ChartShape {
  columns: readonly { name: string; type?: string | undefined }[];
  breakdowns: readonly string[];
}

const typeIn = (shape: ChartShape, name: string | undefined) =>
  name === undefined ? undefined : shape.columns.find((column) => column.name === name)?.type;
const NUMERIC = new Set(["number", "integer", "decimal"]);

/**
 * Whether a chart type can work with the data, and what it would need if not. The
 * drawer greys what does not fit and says what it needs.
 */
export function chartFits(
  kind: ChartKind,
  shape: ChartShape,
): { fits: boolean; needs?: ChartNeed } {
  const first = shape.breakdowns[0];
  const when = typeIn(shape, first);
  const dated = when !== undefined && TEMPORAL.has(when);
  const no = (needs: ChartNeed) => ({ fits: false, needs });
  switch (kind) {
    case "line":
    case "area":
      return dated ? { fits: true } : no("a date");
    case "heatmap":
      return shape.breakdowns.length >= 2 ? { fits: true } : no("a split");
    case "pie":
      if (first === undefined) return no("a group");
      return dated ? no("no date") : { fits: true };
    case "scatter":
      return dated || (when !== undefined && NUMERIC.has(when)) ? { fits: true } : no("a number");
    default:
      return first === undefined ? no("a group") : { fits: true };
  }
}

/** The chart type the answers suggest: along a date, a line; otherwise bars (of one, or colored by a split). */
export function suggestedMark(shape: ChartShape): NonNullable<ChartConfig["mark"]> {
  const when = typeIn(shape, shape.breakdowns[0]);
  return when !== undefined && TEMPORAL.has(when) ? "line" : "bar";
}

const DAY = 86_400_000;

/**
 * Periods the data skips, put back as zero: found from the dates it has (days, weeks,
 * months or quarters, by the smallest step between them), for each series alike.
 */
export function fillGapsIn(
  rows: Record<string, unknown>[],
  x: string,
  measured: readonly string[],
  series?: string,
): Record<string, unknown>[] {
  const stamps = rows.map((row) => Date.parse(String(row[x])));
  if (rows.length < 2 || stamps.some((stamp) => Number.isNaN(stamp))) return rows;
  const distinct = [...new Set(stamps)].sort((a, b) => a - b);
  if (distinct.length < 2) return rows;
  const smallest = Math.min(
    ...distinct.slice(1).map((stamp, at) => stamp - (distinct[at] as number)),
  );
  const months =
    smallest >= 27 * DAY && smallest <= 32 * DAY
      ? 1
      : smallest >= 88 * DAY && smallest <= 93 * DAY
        ? 3
        : 0;
  const days = smallest <= DAY ? 1 : smallest === 7 * DAY ? 7 : 0;
  if (months === 0 && days === 0) return rows;
  const dateOnly = String(rows[0]?.[x]).length === 10;
  const write = (stamp: number) => {
    const iso = new Date(stamp).toISOString();
    return dateOnly ? iso.slice(0, 10) : iso;
  };
  const next = (stamp: number) => {
    if (days > 0) return stamp + days * DAY;
    const at = new Date(stamp);
    return Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, at.getUTCDate());
  };
  const keys = series === undefined ? [undefined] : [...new Set(rows.map((row) => row[series]))];
  const have = new Set(
    rows.map((row, at) => `${series === undefined ? "" : String(row[series])}|${stamps[at]}`),
  );
  const last = distinct.at(-1) as number;
  const out = [...rows];
  for (const key of keys) {
    for (let stamp = distinct[0] as number; stamp <= last; stamp = next(stamp)) {
      if (have.has(`${key === undefined ? "" : String(key)}|${stamp}`)) continue;
      const row: Record<string, unknown> = { [x]: write(stamp) };
      if (series !== undefined) row[series] = key;
      for (const name of measured) row[name] = 0;
      row[BEFORE] = null;
      out.push(row);
    }
  }
  return out.sort((a, b) => Date.parse(String(a[x])) - Date.parse(String(b[x])));
}

/** What is along the bottom, in the order asked: the biggest total first, the smallest, or by name. */
export function orderRows(
  rows: Record<string, unknown>[],
  x: string,
  measured: readonly string[],
  how: "biggest" | "smallest" | "label",
): Record<string, unknown>[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[x]);
    let sum = totals.get(key) ?? 0;
    for (const name of measured) sum += numberOf(row[name]) ?? 0;
    totals.set(key, sum);
  }
  const rank = (row: Record<string, unknown>) => totals.get(String(row[x])) ?? 0;
  return [...rows].sort((a, b) =>
    how === "label"
      ? String(a[x]).localeCompare(String(b[x]))
      : how === "biggest"
        ? rank(b) - rank(a)
        : rank(a) - rank(b),
  );
}

/**
 * What a chart draws: its Vega-Lite spec and the rows, from a summary. The
 * first breakdown goes along the bottom and the second becomes a series each;
 * several values with no second breakdown are a series each too.
 */
export function chartFor(
  config: ChartConfig,
  data: SummaryData,
): { spec: object; rows: Record<string, unknown>[]; description: string } {
  const mark = config.mark ?? "bar";
  const typeOf = (name: string) => data.columns.find((column) => column.name === name)?.type;
  const title = (name: string) => labelOf(data.columns, name);
  const x =
    config.x && data.columns.some((c) => c.name === config.x)
      ? config.x
      : (data.breakdowns[0] ?? "");
  const others = data.breakdowns.filter((name) => name !== x);
  const series = others[0];
  const measured =
    config.y && data.columns.some((c) => c.name === config.y) ? [config.y] : [...data.values];
  const y = measured[0] ?? "";
  const axis = config.format ? axisFormat(config.format) : undefined;
  const compared =
    data.previous !== undefined &&
    config.compare !== false &&
    (mark === "line" || mark === "area" || mark === "bar");
  const temporal = TEMPORAL.has(typeOf(x) ?? "");
  // Several values and no second breakdown: folded into one series each, named by the value.
  const several = measured.length > 1 && !series;

  let rows = data.rows.map((row, at) => {
    const copy: Record<string, unknown> = { ...row };
    for (const name of measured) {
      const value = numberOf(row[name]);
      if (value !== undefined) copy[name] = value / (axis?.divide ?? 1);
    }
    if (compared) {
      const before = numberOf(data.previous?.[at]?.[y]);
      copy[BEFORE] = before === undefined ? null : before / (axis?.divide ?? 1);
    }
    return copy;
  });
  if (temporal && config.fillGaps && mark !== "scatter" && mark !== "heatmap") {
    rows = fillGapsIn(rows, x, measured, several ? undefined : series);
  } else if (!temporal && config.order && (mark === "bar" || mark === "pie")) {
    rows = orderRows(rows, x, measured, config.order);
  }

  const palette = config.colors && config.colors !== "theme" ? PALETTES[config.colors] : undefined;
  const scale = palette ? { scale: { range: palette } } : {};
  const named = config.axisTitles !== false;
  const yTitle = axis?.note ? `${title(y)} (${axis.note})` : title(y);
  const valueAxis = axis ? { format: axis.format } : {};
  // A few periods are each named, by the day they begin: not ticked on hours the data does not have.
  const few = temporal && rows.length <= 12 && mark !== "scatter";
  const dayAxis = { labelOverlap: true, format: "%b %-d" };
  const legend = config.legend === "hidden" ? { legend: null } : {};
  const description = `${mark} chart of ${measured.map(title).join(", ")} by ${[x, ...others].map(title).join(" and ")}`;
  const xEncoding = {
    field: x,
    type:
      mark === "scatter"
        ? typeOf(x) === "number" || typeOf(x) === "integer"
          ? "quantitative"
          : temporal
            ? "temporal"
            : "nominal"
        : few
          ? "ordinal"
          : temporal
            ? "temporal"
            : "nominal",
    title: named ? title(x) : null,
    ...(few
      ? {
          sort: null,
          axis: {
            labelAngle: 0,
            labelOverlap: true,
            labelExpr: "utcFormat(toDate(datum.value), '%b %-d')",
          },
        }
      : temporal
        ? { axis: dayAxis }
        : typeOf(x) === "number"
          ? {}
          : { sort: null, axis: { labelAngle: 0, labelOverlap: true } }),
  };

  if (mark === "heatmap") {
    const down = series ?? "";
    return {
      description,
      rows,
      spec: {
        mark: { type: "rect", tooltip: true },
        encoding: {
          x: {
            field: x,
            type: "ordinal",
            title: named ? title(x) : null,
            sort: null,
            axis: { labelAngle: 0 },
          },
          y: { field: down, type: "ordinal", title: named ? title(down) : null, sort: null },
          color: {
            field: y,
            type: "quantitative",
            title: title(y),
            ...(config.legend === "hidden"
              ? { legend: null }
              : axis
                ? { legend: { format: axis.format } }
                : {}),
          },
        },
      },
    };
  }
  if (mark === "pie") {
    return {
      description,
      rows,
      spec: {
        mark: { type: "arc", tooltip: true },
        encoding: {
          theta: {
            field: y,
            type: "quantitative",
            stack: true,
            ...(axis ? { format: axis.format } : {}),
          },
          color: { field: x, type: "nominal", title: title(x), ...scale, ...legend },
        },
      },
    };
  }
  if (mark === "scatter") {
    return {
      description,
      rows,
      spec: {
        mark: {
          type: "point",
          tooltip: true,
          filled: true,
          ...(palette && !series ? { color: palette[0] } : {}),
        },
        encoding: {
          x: xEncoding,
          y: { field: y, type: "quantitative", title: named ? yTitle : null, axis: valueAxis },
          ...(series
            ? {
                color: {
                  field: series,
                  type: "nominal",
                  title: title(series),
                  ...scale,
                  ...legend,
                },
              }
            : {}),
        },
      },
    };
  }

  const colour = several ? "series" : series;
  const value = several ? "value" : y;
  const grouped = mark === "bar" && colour && config.bars === "grouped";
  const drawing = mark === "line" || mark === "area";
  const base = {
    mark: {
      type: mark,
      tooltip: true,
      ...(drawing ? { interpolate: config.smooth ? "monotone" : "linear" } : {}),
      // A line has always marked its points; an area does when it is asked to, and is filled under its line.
      ...(mark === "line" ? { point: config.points !== false } : {}),
      ...(mark === "area" ? { line: true, opacity: 0.3, point: config.points === true } : {}),
      ...(palette && !colour ? { color: palette[0] } : {}),
    },
    encoding: {
      x: xEncoding,
      y: {
        field: value,
        type: "quantitative",
        title: several || !named ? (named ? "" : null) : yTitle,
        axis: valueAxis,
        ...(mark === "bar" && colour ? { stack: grouped ? null : true } : {}),
      },
      ...(colour
        ? {
            color: {
              field: colour,
              type: "nominal",
              title: several ? "" : title(colour),
              ...scale,
              ...legend,
            },
          }
        : {}),
      ...(grouped ? { xOffset: { field: colour, type: "nominal" } } : {}),
    },
    ...(several ? { transform: [{ fold: measured, as: ["series", "value"] }] } : {}),
  };
  const lying = mark === "bar" && config.horizontal === true;
  const drawn = lying
    ? (() => {
        const { x: across, y: up, xOffset, ...rest } = base.encoding as Record<string, unknown>;
        return {
          ...base,
          encoding: {
            ...rest,
            y: { ...(across as object), axis: { labelOverlap: true } },
            x: up,
            ...(xOffset ? { yOffset: xOffset } : {}),
          },
        };
      })()
    : base;

  const layers: object[] = [drawn];
  if (compared && !lying) {
    // The period before, point for point, on the same scale.
    layers.push({
      mark: {
        type: "line",
        strokeDash: [4, 4],
        tooltip: true,
        color: "currentColor",
        opacity: 0.6,
        ...(config.smooth ? { interpolate: "monotone" } : {}),
      },
      encoding: {
        x: xEncoding,
        y: { field: BEFORE, type: "quantitative", title: null },
      },
    });
  }
  if (config.values && mark === "bar") {
    // The value on each bar: above it, beside it when it lies down, inside its part of a stack.
    const { color: _color, ...place } = drawn.encoding as Record<string, unknown>;
    layers.push({
      mark: {
        type: "text",
        fontSize: 11,
        ...(colour
          ? { baseline: "middle" }
          : lying
            ? { align: "left", dx: 4 }
            : { baseline: "bottom", dy: -4 }),
      },
      encoding: {
        ...place,
        text: { field: value, type: "quantitative", format: axis?.format ?? ",~f" },
      },
      ...(several ? { transform: [{ fold: measured, as: ["series", "value"] }] } : {}),
    });
  }
  return { description, rows, spec: layers.length === 1 ? drawn : { layer: layers } };
}
