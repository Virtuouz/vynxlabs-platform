import type { ColumnInfo, SummaryData } from "@volvel/widgets";

/** How a number is written, as a widget's `format` setting says. */
export interface ValueFormat {
  style: "number" | "currency" | "percent";
  currency?: string;
  /** Money kept in cents. */
  minorUnits?: boolean;
  decimals?: number;
}

/** A number from a value: totals can arrive as text, from the database's exact numbers. */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** `12.5%`, `$1,234.56`, `1,204`. Undefined for a value that is not a number. */
export function formatValue(value: unknown, format: ValueFormat | undefined): string | undefined {
  const found = numberOf(value);
  if (found === undefined) return undefined;
  const scaled = format?.minorUnits ? found / 100 : found;
  const options: Intl.NumberFormatOptions =
    format?.style === "currency"
      ? { style: "currency", currency: format.currency ?? "USD" }
      : format?.style === "percent"
        ? { style: "percent", maximumFractionDigits: 1 }
        : { maximumFractionDigits: 2 };
  if (format?.decimals !== undefined) {
    options.minimumFractionDigits = format.decimals;
    options.maximumFractionDigits = format.decimals;
  }
  try {
    return new Intl.NumberFormat("en-US", options).format(scaled);
  } catch {
    // A currency code the browser does not know: the number, and the code after it.
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(scaled)} ${format?.currency ?? ""}`.trim();
  }
}

/** A number as a person reads it; anything else as it is, and nothing as a dash. */
export function formatNumber(value: unknown, format?: ValueFormat): string {
  const written = formatValue(value, format);
  if (written !== undefined) return written;
  return value === null || value === undefined ? "—" : String(value);
}

/**
 * How a chart writes the values up its side: a d3 format string, what the
 * values are divided by first, and words for the axis title when the format
 * string cannot say it, such as a currency other than dollars.
 */
export function axisFormat(format: ValueFormat): { format: string; divide: number; note?: string } {
  const divide = format.minorUnits ? 100 : 1;
  const places = format.decimals;
  if (format.style === "percent") return { format: `.${places ?? 0}%`, divide };
  if (format.style === "currency") {
    const code = format.currency ?? "USD";
    const pattern = places === undefined ? ",~f" : `,.${places}f`;
    return code === "USD"
      ? { format: `$${pattern}`, divide }
      : { format: pattern, divide, note: code };
  }
  return { format: places === undefined ? ",~f" : `,.${places}f`, divide };
}

/**
 * How a figure stands against the period before: up or down, by how much in a
 * sentence, and the same in a few characters for the mark beside the number.
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
    if (size < 0.0005) {
      return { direction: "same", text: "The same as the period before", short: "0" };
    }
    const points = formatNumber(Math.round(size * 10) / 10);
    const written =
      how.delta === "points"
        ? `${points} ${size === 1 ? "point" : "points"}`
        : formatNumber(size, how.format);
    const words = how.delta === "points" ? ["higher", "lower"] : ["more", "less"];
    return {
      direction,
      text: `${written} ${difference > 0 ? words[0] : words[1]} than the period before`,
      short: how.delta === "points" ? `${points} pts` : written,
    };
  }
  if (earlier === 0) {
    return current === 0
      ? { direction: "same", text: "The same as the period before", short: "0%" }
      : { direction, text: "Nothing in the period before", short: "new" };
  }
  const change = difference / Math.abs(earlier);
  if (Math.abs(change) < 0.0005) {
    return { direction: "same", text: "The same as the period before", short: "0%" };
  }
  const percent = formatNumber(Math.abs(change), { style: "percent" });
  return {
    direction,
    text: `${percent} ${change > 0 ? "more" : "less"} than the period before`,
    short: percent,
  };
}

/** What a trend's line shows, in words, for someone who cannot see it. */
export function trendWords(title: string, values: number[], format?: ValueFormat): string {
  if (values.length < 2) return "";
  const say = (value: number) => formatNumber(value, format);
  return `${title} over time: from ${say(values[0] as number)} to ${say(values.at(-1) as number)}, lowest ${say(Math.min(...values))}, highest ${say(Math.max(...values))}`;
}

/** A column's label, or its name made readable. */
export function labelOf(columns: readonly ColumnInfo[], name: string): string {
  const found = columns.find((column) => column.name === name)?.label;
  if (found) return found;
  const spaced = name.replace(/[_.]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const typeOfColumn = (columns: readonly ColumnInfo[], name: string): string | undefined =>
  columns.find((column) => column.name === name)?.type;

/** A summary's trend, which the data endpoint adds for a stat whose `trendBy` is set. */
export function trendOf(data: SummaryData): number[] {
  const trend = (data as SummaryData & { trend?: { at: unknown; value: unknown }[] }).trend;
  return (trend ?? [])
    .map((point) => numberOf(point.value))
    .filter((one): one is number => one !== undefined);
}
