import { SURFACE } from "@volvel/ui";
import { choiceWords, type SummaryData } from "@volvel/widgets";
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
  /** The axes are titled. Left out: they are not (the boards draw none until it is asked for). */
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

/**
 * The named palettes, as colors both themes can carry. `theme` takes the tokens, which a spec cannot hold.
 * In each, neighbours differ in hue, not only in lightness.
 */
export const PALETTES: Record<"cool" | "warm" | "mono", string[]> = {
  cool: ["#38bdf8", "#a78bfa", "#2dd4bf", "#818cf8", "#34d399", "#60a5fa"],
  warm: ["#f59e0b", "#ef4444", "#eab308", "#ec4899", "#f97316", "#a16207"],
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

/** A point marked on a line: a ring in the line's color, filled with what the chart is on. */
const RING = { filled: false, fill: SURFACE, strokeWidth: 2 } as const;

/**
 * How the values up the side are written once they are big: short, as the boards draw them
 * ("$40k", not "$40,000"). A percentage, and a figure under a thousand, are written as they are.
 */
export function shortAxisFormat(format: string | undefined, biggest: number): string | undefined {
  if (format?.endsWith("%")) return format;
  if (biggest < 1000) return format;
  return (format?.startsWith("$") ? "$" : "") + ".3~s";
}

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
  /**
   * How big the chart is drawn, when it is known, and how wide a text is on it: bars and labels
   * are sized by it, and a label is tilted or cut short only when it is measured not to fit.
   */
  room: { width?: number; height?: number; measure?: (text: string) => number } = {},
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
  // A series, and a category that is a choice, are named as people read them ("No show"), by the
  // choice's own label. The rows keep the stored value, which is what a click on a mark gives.
  const infoOf = (name: string | undefined) => data.columns.find((c) => c.name === name);
  const nameField = (name: string | undefined, always: boolean): string | undefined => {
    if (name === undefined || TEMPORAL.has(typeOf(name) ?? "") || typeOf(name) === "number") {
      return name;
    }
    const info = infoOf(name);
    if (!always && info?.type !== "enum") return name;
    const field = `${name}_label`;
    for (const row of rows) {
      const value = row[name];
      if (value !== null && value !== undefined) row[field] = choiceWords(info, value);
    }
    return field;
  };
  if (temporal && config.fillGaps && mark !== "scatter" && mark !== "heatmap") {
    rows = fillGapsIn(rows, x, measured, several ? undefined : series);
  } else if (!temporal && config.order && (mark === "bar" || mark === "pie")) {
    rows = orderRows(rows, x, measured, config.order);
  }

  const xField = nameField(x, false) ?? x;
  const seriesField = nameField(series, true);
  const palette = config.colors && config.colors !== "theme" ? PALETTES[config.colors] : undefined;
  const scale = palette ? { scale: { range: palette } } : {};
  const named = config.axisTitles === true;
  const yTitle = axis?.note ? `${title(y)} (${axis.note})` : title(y);
  // The values up the side are written short ("$40k"), as the boards draw them.
  const biggest = Math.max(
    0,
    ...rows.flatMap((row) => measured.map((name) => Math.abs(numberOf(row[name]) ?? 0))),
  );
  const shortFormat = shortAxisFormat(axis?.format, biggest);
  const valueAxis = {
    ...(shortFormat ? { format: shortFormat } : {}),
    grid: true,
    tickCount: config.horizontal === true ? 3 : 4,
  };
  // What is along the bottom, as it fits: tilted or cut short, never one name over the next.
  const count = new Set(rows.map((row) => String(row[x]))).size;
  const plot = Math.max(120, (room.width ?? 560) - 46);
  const band = plot / Math.max(1, count);
  const wide = room.measure ?? ((text: string) => text.length * 5.6);
  const longest = Math.max(
    0,
    ...rows.map((row) => wide(String(row[xField] ?? "").replace(/_/g, " "))),
  );
  const tilted = !temporal && typeOf(x) !== "number" && count > 1 && longest > band * 0.98;
  // A group of rows that have nothing there is "None": no one is to read "null".
  const words = "!isValid(datum.value) ? 'None' : replace(datum.label, regexp('_', 'g'), ' ')";
  const categoryAxis = {
    labelAngle: tilted ? -45 : 0,
    ...(tilted ? { labelAlign: "right", labelBaseline: "top" } : {}),
    // A category is never left out: a name that does not fit is tilted, or cut short.
    labelOverlap: typeOf(x) === "number" ? ("greedy" as const) : false,
    labelLimit: tilted
      ? Math.min(110, Math.max(54, Math.floor(band * 2.4)))
      : Math.max(48, Math.floor(band)),
    labelExpr: words,
    grid: false,
  };
  // Where a bar is, and how much room there is round it: not fatter than a bar of the boards.
  const lyingBars = mark === "bar" && config.horizontal === true;
  const across = lyingBars ? Math.max(60, (room.height ?? 260) - 40) / Math.max(1, count) : band;
  const spacing = lyingBars
    ? Math.min(0.8, Math.max(0.35, 1 - 24 / across))
    : Math.min(0.75, Math.max(0.3, 1 - 56 / band));
  // Periods are each named, by the day they begin: not ticked on hours the data does not have.
  // Bars over time are always so, or they have no room between them.
  const few = temporal && (rows.length <= 12 || mark === "bar") && mark !== "scatter";
  const dayAxis = { labelOverlap: "parity", format: "%b %-d", grid: false };
  const legend =
    config.legend === "hidden" ? { legend: null } : { legend: { title: null, labelExpr: words } };
  const description = `${mark} chart of ${measured.map(title).join(", ")} by ${[x, ...others].map(title).join(" and ")}`;
  const xEncoding = {
    field: xField,
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
    ...(mark === "bar" && (few || !temporal)
      ? { scale: { paddingInner: spacing, paddingOuter: spacing / 2 } }
      : {}),
    ...(few
      ? {
          sort: null,
          axis: {
            labelAngle: 0,
            labelOverlap: "parity",
            grid: false,
            labelExpr:
              "!isValid(datum.value) ? 'No date' : utcFormat(toDate(datum.value), '%b %-d')",
          },
        }
      : temporal
        ? { axis: dayAxis }
        : typeOf(x) === "number"
          ? { axis: { grid: false } }
          : { sort: null, axis: categoryAxis }),
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
            field: xField,
            type: "ordinal",
            title: named ? title(x) : null,
            sort: null,
            axis: { labelAngle: 0, grid: false },
          },
          y: {
            field: nameField(series, true) ?? down,
            type: "ordinal",
            title: named ? title(down) : null,
            sort: null,
            axis: { grid: false },
          },
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
          color: {
            field: xField,
            type: "nominal",
            title: title(x),
            ...scale,
            // Beside the pie where there is room, under it where there is not.
            ...(config.legend === "hidden"
              ? legend
              : {
                  legend: {
                    ...legend.legend,
                    ...((room.width ?? 600) < 420
                      ? {
                          orient: "bottom",
                          direction: "horizontal",
                          columns: (room.width ?? 600) < 300 ? 2 : 3,
                        }
                      : { orient: "right", direction: "vertical" }),
                  },
                }),
          },
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
                  field: seriesField,
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

  const lone =
    rows.length === 1 && (mark === "line" || mark === "area")
      ? (numberOf(rows[0]?.[y]) ?? 0)
      : undefined;
  const colour = several ? "series" : seriesField;
  const value = several ? "value" : y;
  const grouped = mark === "bar" && colour && config.bars === "grouped";
  const drawing = mark === "line" || mark === "area";
  const base = {
    mark: {
      type: mark,
      tooltip: true,
      ...(drawing ? { interpolate: config.smooth ? "monotone" : "linear" } : {}),
      // A line has always marked its points; an area does when it is asked to, and is filled under its line.
      ...(mark === "line"
        ? { point: config.points === false ? false : { ...RING, size: 44 } }
        : {}),
      ...(mark === "area"
        ? { line: true, point: config.points === true ? { ...RING, size: 44 } : false }
        : {}),
      ...(palette && !colour ? { color: palette[0] } : {}),
    },
    encoding: {
      x: xEncoding,
      y: {
        field: value,
        type: "quantitative",
        title: several || !named ? (named ? "" : null) : yTitle,
        axis: valueAxis,
        // One point alone has nothing to be measured against: the scale gives it room.
        ...(lone && lone !== 0
          ? { scale: { domain: lone > 0 ? [0, lone * 1.4] : [lone * 1.4, 0] } }
          : {}),
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
  const lying = lyingBars;
  const drawn = lying
    ? (() => {
        const { x: across, y: up, xOffset, ...rest } = base.encoding as Record<string, unknown>;
        return {
          ...base,
          encoding: {
            ...rest,
            y: {
              ...(across as object),
              axis: { labelOverlap: "greedy", grid: false, labelLimit: 130, labelExpr: words },
            },
            x: up,
            ...(xOffset ? { yOffset: xOffset } : {}),
          },
        };
      })()
    : base;

  const layers: object[] = [];
  if (mark === "line" && !colour && !lying) {
    // A soft area under a single line, as the boards draw it.
    const { color: _own, ...place } = drawn.encoding as Record<string, unknown>;
    layers.push({
      mark: {
        type: "area",
        interactive: false,
        fillOpacity: 0.08,
        line: false,
        interpolate: config.smooth ? "monotone" : "linear",
        ...(palette ? { color: palette[0] } : {}),
      },
      encoding: place,
      ...(several ? { transform: [{ fold: measured, as: ["series", "value"] }] } : {}),
    });
  }
  layers.push(drawn);
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
  // The figures on the bars are written only where they fit: a bar narrower than its figure has none.
  const seriesCount = grouped ? new Set(rows.map((row) => String(row[colour ?? ""]))).size : 1;
  const barPx = lying ? 99 : (band / Math.max(1, seriesCount)) * (1 - spacing);
  const figure = wide(`${axis ? "$" : ""}${Math.round(biggest).toLocaleString("en-US")}`) + 4;
  if (config.values && mark === "bar" && barPx >= figure) {
    // The value on each bar: above it, beside it when it lies down, inside its part of a stack.
    const { color: _color, ...place } = drawn.encoding as Record<string, unknown>;
    layers.push({
      mark: {
        type: "text",
        fontSize: 10,
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
