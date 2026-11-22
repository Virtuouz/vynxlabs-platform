/**
 * Which column groups well, and a number to show a format with: what the measure, breakdown and
 * format editors take from the catalog and the widget's own rows.
 */
import { count } from "../format.ts";
import type { CatalogColumn } from "./model.ts";

export interface Groupability {
  /** Lower groups better: a few values first, then dates, then many, then every row different. */
  rank: number;
  /** What to say beside the column: "3 values", "a date", "412 values", "every row differs". */
  hint: string;
}

const TEMPORAL = new Set(["date", "timestamp"]);

/**
 * How well a column groups, with a hint for it. With the schema's distinct count the order and the
 * hint are about its values; without one they are about its type.
 */
export function groupability(column: CatalogColumn, tableRows?: number): Groupability {
  const temporal = TEMPORAL.has(column.type);
  if (column.name === "id" || column.type === "uuid") return { rank: 9, hint: "every row differs" };
  if (temporal && column.name === "updated_at") return { rank: 6, hint: "a date" };
  // The date a table's own dates are about comes before the one every table has.
  if (temporal) return { rank: column.name === "created_at" ? 2.5 : 2, hint: "a date" };
  const distinct = column.distinct;
  if (distinct !== undefined) {
    if (tableRows !== undefined && tableRows > 1 && distinct >= tableRows)
      return { rank: 9, hint: "every row differs" };
    const hint = column.distinctMore
      ? `${count(distinct)}+ values`
      : `${count(distinct)} ${distinct === 1 ? "value" : "values"}`;
    // Two to twelve values make a good set of groups; many more make a crowd.
    return { rank: distinct <= 1 ? 7 : distinct <= 12 ? 1 : distinct <= 40 ? 3 : 5, hint };
  }
  if (column.type === "enum") return { rank: 1, hint: "a few values" };
  if (column.type === "boolean") return { rank: 1, hint: "yes or no" };
  if (column.references) return { rank: 3, hint: "a link to another record" };
  if (column.type === "text") return { rank: 4, hint: "text" };
  return { rank: 5, hint: "numbers" };
}

/** The columns in the order a person would reach for them to break something down: best first. */
export function columnsByGrouping(
  columns: readonly CatalogColumn[],
  tableRows?: number,
): (CatalogColumn & Groupability)[] {
  return columns
    .map((column, at) => ({ column, at, ...groupability(column, tableRows) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map(({ column, rank, hint }) => ({ ...column, rank, hint }));
}

/** A number from the widget's own rows, to show a format with: the first the named columns hold. */
export function sampleValue(
  rows: readonly unknown[] | undefined,
  names?: readonly string[],
): number | undefined {
  for (const row of rows ?? []) {
    if (typeof row === "number" && Number.isFinite(row)) return row;
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    for (const name of names ?? Object.keys(record)) {
      const value = record[name];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
  }
  return undefined;
}
