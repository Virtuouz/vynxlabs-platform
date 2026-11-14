import type { ValueFormat } from "@vynxlabs/manifest";

/** A number from a row: totals can come back as text, from the database's exact numbers. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * A value written as its format says, in US English: `$1,234.56`, `12.5%`,
 * `1,204`. Undefined for a value that is not a number, which is then shown
 * as it is.
 */
export function formatValue(value: unknown, format: ValueFormat | undefined): string | undefined {
  if (!format) return undefined;
  const found = numberOf(value);
  if (found === undefined) return undefined;
  const scaled = format.minorUnits ? found / 100 : found;
  const options: Intl.NumberFormatOptions =
    format.style === "currency"
      ? { style: "currency", currency: format.currency ?? "USD" }
      : format.style === "percent"
        ? { style: "percent", maximumFractionDigits: 1 }
        : { maximumFractionDigits: 2 };
  if (format.decimals !== undefined) {
    options.minimumFractionDigits = format.decimals;
    options.maximumFractionDigits = format.decimals;
  }
  try {
    return new Intl.NumberFormat("en-US", options).format(scaled);
  } catch {
    // A currency code the browser does not know: the number, and the code after it.
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(scaled)} ${format.currency ?? ""}`.trim();
  }
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
