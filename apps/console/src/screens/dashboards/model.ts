import type {
  DashboardFilter,
  DashboardWidget,
  DashboardWidgetOptions,
  RelativeRange,
  ValueFormat,
} from "@volvel/manifest";
import { amount } from "../../kit/format.ts";

/**
 * What a dashboard works out in the browser: the dates a range by name stands
 * for, the period before one, a pivot from a result's rows, a chart's
 * description, and a result as a file.
 */

/** What a widget's query gave: the same shape the API answers with. */
export interface Result {
  columns: { name: string; type: string }[];
  rows: unknown[][];
  truncated: boolean;
  tables: string[];
  sql: string;
  /** For a query built from menus: the SQL the platform wrote for it. */
  written?: { sql: string; parameters: unknown[] };
}

export interface DateRange {
  from?: string;
  to?: string;
}

export const RANGE_LABELS: Record<RelativeRange, string> = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  last_12_months: "Last 12 months",
};

const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parse = (text: string) => {
  const [year, month, date] = text.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date);
};
const shifted = (from: Date, days: number) =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);

/** The dates a range by name stands for, as of `today`. Both ends are days that count. */
export function relativeRange(name: RelativeRange, today = new Date()): Required<DateRange> {
  const year = today.getFullYear();
  const month = today.getMonth();
  const back = (days: number) => ({ from: day(shifted(today, -(days - 1))), to: day(today) });
  switch (name) {
    case "today":
      return back(1);
    case "last_7_days":
      return back(7);
    case "last_30_days":
      return back(30);
    case "last_90_days":
      return back(90);
    case "this_month":
      return { from: day(new Date(year, month, 1)), to: day(new Date(year, month + 1, 0)) };
    case "last_month":
      return { from: day(new Date(year, month - 1, 1)), to: day(new Date(year, month, 0)) };
    case "this_quarter": {
      const first = month - (month % 3);
      return { from: day(new Date(year, first, 1)), to: day(new Date(year, first + 3, 0)) };
    }
    case "this_year":
      return { from: day(new Date(year, 0, 1)), to: day(new Date(year, 11, 31)) };
    case "last_12_months":
      return { from: day(new Date(year, month - 11, 1)), to: day(new Date(year, month + 1, 0)) };
  }
}

/** What a filter is set to in the address: a range by name, two dates, or a value. */
export type FilterSetting = string | undefined;

/**
 * A filter's value as its widgets' queries take it. A date range in the
 * address is a name (`last_30_days`) or `from..to`; anything else is its text.
 * Nothing set is the filter's default, and no default narrows nothing.
 */
export function filterValue(
  filter: DashboardFilter,
  setting: FilterSetting,
  today = new Date(),
): unknown {
  const raw = setting ?? filter.default;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (filter.type === "date_range") {
    if (typeof raw === "object") return raw as DateRange;
    const text = String(raw);
    if (text === "all") return undefined;
    if (text in RANGE_LABELS) return relativeRange(text as RelativeRange, today);
    const [from, to] = text.split("..");
    return { ...(from ? { from } : {}), ...(to ? { to } : {}) } satisfies DateRange;
  }
  if (filter.type === "number") {
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  }
  return String(raw);
}

/** The filters as the API takes them: by name, each as its widgets take it, the unset left out. */
export function filterValues(
  filters: DashboardFilter[],
  settings: Record<string, FilterSetting>,
  today = new Date(),
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const filter of filters) {
    const value = filterValue(filter, settings[filter.name], today);
    if (value !== undefined) values[filter.name] = value;
  }
  return values;
}

/** The same length of time, ending the day before a range begins. Nothing for a range with an end missing. */
export function previousRange(range: DateRange | undefined): Required<DateRange> | undefined {
  if (!range?.from || !range.to) return undefined;
  const from = parse(range.from);
  const to = parse(range.to);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return { from: day(shifted(from, -days)), to: day(shifted(from, -1)) };
}

/** A result's rows as objects, by column name. */
export function objects(result: Result): Record<string, unknown>[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((column, index) => [column.name, row[index]])),
  );
}

const numberOf = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
};

/** How a number is written. Anything that is not a number is written as it is. */
export function formatNumber(value: unknown, format?: ValueFormat): string {
  const found = numberOf(value);
  if (found === undefined) return value === null || value === undefined ? "—" : String(value);
  return amount(found, format);
}

/**
 * How a figure stands against the period before: up or down, by how much in
 * a sentence, and the same in a few characters for the mark beside the
 * number. The change is said as a share unless the figure asks for the
 * amount itself or, for a rate, for points.
 */
export function comparison(
  now: unknown,
  before: unknown,
  how: {
    delta?: "percent" | "absolute" | "points" | undefined;
    format?: ValueFormat | undefined;
  } = {},
): { direction: "up" | "down" | "same"; text: string; short: string } | undefined {
  const current = numberOf(now);
  // A total of no rows is empty, and stands for nothing: none, not an unknown.
  const earlier = before === null ? 0 : numberOf(before);
  if (current === undefined || earlier === undefined) return undefined;
  const difference = current - earlier;
  const direction = difference > 0 ? "up" : "down";
  if (how.delta === "absolute" || how.delta === "points") {
    // A rate is kept as a share of one: 0.882. Its points are that times a hundred.
    const size =
      how.delta === "points" && how.format?.style === "percent"
        ? Math.abs(difference) * 100
        : Math.abs(difference);
    if (size < 0.0005)
      return { direction: "same", text: "The same as the period before", short: "0" };
    const written =
      how.delta === "points"
        ? `${amount(Math.round(size * 10) / 10)} ${size === 1 ? "point" : "points"}`
        : amount(size, how.format);
    return {
      direction,
      text: `${written} ${
        how.delta === "points"
          ? difference > 0
            ? "higher"
            : "lower"
          : difference > 0
            ? "more"
            : "less"
      } than the period before`,
      short: how.delta === "points" ? `${amount(Math.round(size * 10) / 10)} pts` : written,
    };
  }
  if (earlier === 0) {
    return current === 0
      ? { direction: "same", text: "The same as the period before", short: "0%" }
      : { direction, text: "Nothing in the period before", short: "new" };
  }
  const change = difference / Math.abs(earlier);
  if (Math.abs(change) < 0.0005)
    return { direction: "same", text: "The same as the period before", short: "0%" };
  const percent = amount(Math.abs(change), { style: "percent" });
  return {
    direction,
    text: `${percent} ${change > 0 ? "more" : "less"} than the period before`,
    short: percent,
  };
}

/**
 * A figure's number over the time it covers, oldest first, from the rows of
 * its trend: the column it shows, or the first that holds numbers.
 */
export function trendOf(result: Result | undefined, value: string | undefined): number[] {
  if (!result) return [];
  const named = value ? result.columns.findIndex((one) => one.name === value) : -1;
  const at = named >= 0 ? named : result.columns.findIndex((one) => one.type === "number");
  if (at < 0) return [];
  return result.rows
    .map((row) => numberOf(row[at]))
    .filter((one): one is number => one !== undefined);
}

/** What a trend's line shows, in words, for someone who cannot see it. */
export function trendWords(title: string, values: number[], format?: ValueFormat): string {
  if (values.length < 2) return "";
  const say = (value: number) => amount(value, format);
  return `${title} over time: from ${say(values[0] as number)} to ${say(values.at(-1) as number)}, lowest ${say(Math.min(...values))}, highest ${say(Math.max(...values))}`;
}

// ----- Pivot -----

export interface Pivot {
  /** The headings across the top: one for each value, or pair of values, of the column headers. */
  columns: string[];
  /** One row for each value, or set of values, of the row headers. */
  rows: { headers: string[]; cells: (number | null)[]; total: number | null }[];
  /** The totals down each column, and of everything. */
  totals: { cells: (number | null)[]; total: number | null };
  /** The names of the row headers. */
  rowNames: string[];
}

const shown = (value: unknown) => (value === null || value === undefined ? "—" : String(value));

function combine(cell: DashboardWidgetOptions["cell"], values: number[]): number | null {
  if (cell === "count") return values.length;
  if (values.length === 0) return null;
  switch (cell) {
    case "avg":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return values.reduce((sum, value) => sum + value, 0);
  }
}

/**
 * A result's rows turned on their side: some columns head the rows, some head
 * the columns, and each cell is worked out from the rows that fall in it. The
 * headings come in the order the result gave them.
 */
export function pivot(result: Result, options: DashboardWidgetOptions): Pivot {
  const data = objects(result);
  const rowNames = options.rows ?? [];
  const columnNames = options.columns ?? [];
  const value = options.value;
  const SEP = "\u0001";
  const rowKeys: string[] = [];
  const columnKeys: string[] = [];
  const cells = new Map<string, number[]>();
  for (const row of data) {
    const rowKey = rowNames.map((name) => shown(row[name])).join(SEP);
    const columnKey = columnNames.map((name) => shown(row[name])).join(" · ");
    if (!rowKeys.includes(rowKey)) rowKeys.push(rowKey);
    if (!columnKeys.includes(columnKey)) columnKeys.push(columnKey);
    const number = value ? numberOf(row[value]) : 1;
    const key = `${rowKey}${SEP}${SEP}${columnKey}`;
    const held = cells.get(key) ?? [];
    if (number !== undefined) held.push(number);
    else if (options.cell === "count") held.push(0);
    cells.set(key, held);
  }
  const at = (rowKey: string, columnKey: string) =>
    cells.get(`${rowKey}${SEP}${SEP}${columnKey}`) ?? [];
  const rows = rowKeys.map((rowKey) => ({
    headers: rowNames.length > 0 ? rowKey.split(SEP) : [],
    cells: columnKeys.map((columnKey) => {
      const values = at(rowKey, columnKey);
      return values.length === 0 && options.cell !== "count" ? null : combine(options.cell, values);
    }),
    total: combine(
      options.cell,
      columnKeys.flatMap((columnKey) => at(rowKey, columnKey)),
    ),
  }));
  return {
    columns: columnKeys,
    rowNames,
    rows,
    totals: {
      cells: columnKeys.map((columnKey) =>
        combine(
          options.cell,
          rowKeys.flatMap((rowKey) => at(rowKey, columnKey)),
        ),
      ),
      total: combine(options.cell, [...cells.values()].flat()),
    },
  };
}

// ----- Charts -----

const TEMPORAL = new Set(["date", "timestamp"]);

/**
 * The Vega-Lite description of a chart: what its widget says to draw, over
 * the columns its result has. Several `y` columns are drawn as one series each.
 */
/** The column a compared chart's rows carry the period before in. */
export const BEFORE = "period_before";

/**
 * A chart's rows with the period before beside each: the first point of the
 * earlier period with the first of this one, and so on, since the two cover
 * the same length of time.
 */
export function withBefore(
  result: Result,
  before: Result | undefined,
  value: string,
): Record<string, unknown>[] {
  const rows = objects(result);
  if (!before) return rows;
  const earlier = objects(before);
  return rows.map((row, at) => ({ ...row, [BEFORE]: earlier[at]?.[value] ?? null }));
}

/** The column a chart measures: the one it names, or the first that holds numbers. */
export function measureOf(widget: DashboardWidget, result: Result): string {
  const y = widget.options?.y;
  const named = Array.isArray(y) ? y[0] : y;
  return (
    (named && result.columns.some((one) => one.name === named) ? named : undefined) ??
    result.columns.find((one) => one.type === "number")?.name ??
    result.columns[1]?.name ??
    ""
  );
}

export function chartSpec(
  widget: DashboardWidget,
  result: Result,
  /** The rows carry the period before, to be drawn as a dashed line. */
  compared = false,
): object {
  const options = widget.options ?? {};
  const names = result.columns.map((column) => column.name);
  const typeOf = (name: string) => result.columns.find((column) => column.name === name)?.type;
  const x = options.x ?? names[0] ?? "";
  const ys = (Array.isArray(options.y) ? options.y : options.y ? [options.y] : []).filter((name) =>
    names.includes(name),
  );
  const measured =
    ys.length > 0 ? ys : names.filter((name) => typeOf(name) === "number").slice(0, 1);
  const y = measured[0] ?? names[1] ?? "";
  const mark = options.mark ?? "bar";
  const temporal = TEMPORAL.has(typeOf(x) ?? "");
  const axisFormat = options.format?.style === "percent" ? { format: ".0%" } : {};
  const xEncoding = {
    field: x,
    type: mark === "scatter" ? "quantitative" : temporal ? "temporal" : "nominal",
    title: x,
    ...(temporal || mark === "scatter"
      ? {}
      : { sort: null, axis: { labelAngle: 0, labelOverlap: true } }),
  };

  if (mark === "heatmap") {
    // A square for each pair, shaded by how much: weekdays down the side, hours along the bottom.
    const down = typeof options.y === "string" ? options.y : (names[1] ?? "");
    const shade = options.value ?? names.find((name) => typeOf(name) === "number") ?? "";
    return {
      mark: { type: "rect", tooltip: true },
      encoding: {
        x: { field: x, type: "ordinal", title: x, sort: null, axis: { labelAngle: 0 } },
        y: { field: down, type: "ordinal", title: down, sort: null },
        color: { field: shade, type: "quantitative", title: shade },
      },
    };
  }
  if (mark === "pie") {
    return {
      mark: { type: "arc", tooltip: true },
      encoding: {
        theta: { field: y, type: "quantitative", stack: true },
        color: { field: x, type: "nominal", title: x },
      },
    };
  }
  if (mark === "scatter") {
    return {
      mark: { type: "point", tooltip: true, filled: true },
      encoding: {
        x: xEncoding,
        y: { field: y, type: "quantitative", title: y, axis: axisFormat },
        ...(options.series ? { color: { field: options.series, type: "nominal" } } : {}),
      },
    };
  }

  // Several columns up the side: folded into one series for each, named by the column.
  const several = measured.length > 1;
  const series = several ? "series" : options.series;
  const value = several ? "value" : y;
  const base = {
    mark: {
      type: mark,
      tooltip: true,
      ...(mark === "line" ? { point: true } : {}),
    },
    encoding: {
      x: xEncoding,
      y: {
        field: value,
        type: "quantitative",
        title: several ? "" : y,
        axis: axisFormat,
        ...(mark === "bar" && series && options.bars !== "grouped" ? { stack: true } : {}),
        ...(mark === "bar" && series && options.bars === "grouped" ? { stack: null } : {}),
      },
      ...(series
        ? { color: { field: series, type: "nominal", title: several ? "" : series } }
        : {}),
      ...(mark === "bar" && series && options.bars === "grouped"
        ? { xOffset: { field: series, type: "nominal" } }
        : {}),
    },
    ...(several ? { transform: [{ fold: measured, as: ["series", "value"] }] } : {}),
  };
  if (mark === "bar" && options.horizontal) {
    // Lying down: what is measured runs along the bottom, and each bar has its name beside it.
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
  }
  if (compared && (mark === "line" || mark === "area" || mark === "bar")) {
    // The period before, point for point, on the same scale.
    return {
      layer: [
        base,
        {
          mark: {
            type: "line",
            strokeDash: [4, 4],
            tooltip: true,
            color: "currentColor",
            opacity: 0.6,
          },
          encoding: {
            x: xEncoding,
            y: { field: BEFORE, type: "quantitative", title: "The period before" },
          },
        },
      ],
    };
  }
  // A column drawn as a line over the bars, with a scale of its own.
  if (mark === "bar" && options.line && names.includes(options.line)) {
    return {
      layer: [
        base,
        {
          mark: { type: "line", point: true, tooltip: true, color: "currentColor" },
          encoding: {
            x: xEncoding,
            y: { field: options.line, type: "quantitative", title: options.line },
          },
        },
      ],
      resolve: { scale: { y: "independent" } },
    };
  }
  return base;
}

// ----- Files -----

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Text a spreadsheet would read as a formula starts with an apostrophe.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** A result as CSV, with a line of column names first. */
export function toCsv(result: Result): string {
  return [
    result.columns.map((column) => csvCell(column.name)).join(","),
    ...result.rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
}

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Files gathered into one, as a zip keeps them: stored as they are, not pressed smaller. */
function zip(files: { name: string; text: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    directory.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const xml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // What XML 1.0 has no way to write.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: these are the characters to take out
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** A column's letters in a spreadsheet: A, B … Z, AA. */
const letters = (index: number): string => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
};

/**
 * A result as a spreadsheet file (.xlsx): one sheet, the column names in bold
 * on its first row, numbers as numbers and everything else as text. Written
 * here, with no library: the format is a zip of a few small XML files.
 */
export function toXlsx(result: Result, sheet = "Result"): Uint8Array {
  const cell = (value: unknown, column: number, row: number, bold = false) => {
    const ref = `${letters(column)}${row}`;
    if (value === null || value === undefined) return "";
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}"><v>${value}</v></c>`;
    }
    if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  };
  const rows = [
    `<row r="1">${result.columns.map((column, index) => cell(column.name, index, 1, true)).join("")}</row>`,
    ...result.rows.map(
      (row, at) =>
        `<row r="${at + 2}">${row.map((value, index) => cell(value, index, at + 2)).join("")}</row>`,
    ),
  ];
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rels = "http://schemas.openxmlformats.org/package/2006/relationships";
  const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return zip([
    {
      name: "[Content_Types].xml",
      text: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      text: `${head}<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      text: `${head}<workbook xmlns="${main}" xmlns:r="${office}"><sheets><sheet name="${xml(sheet.slice(0, 31).replace(/[[\]:*?/\\]/g, " "))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: `${head}<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${office}/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      text: `${head}<styleSheet xmlns="${main}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      text: `${head}<worksheet xmlns="${main}"><sheetData>${rows.join("")}</sheetData></worksheet>`,
    },
  ]);
}

/** Hands the browser a file to keep. */
export function download(name: string, content: string | Uint8Array, type: string) {
  const blob = new Blob([content as BlobPart], { type });
  const address = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = address;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(address);
}
