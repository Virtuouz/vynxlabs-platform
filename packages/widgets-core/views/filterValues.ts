/**
 * What a page's filters are in a person's words, and the days a named range stands for.
 * Pure, and with no import, so the Search and filter view (a core view may import only the
 * contract and the kit) and what draws pages share one copy.
 */

export type RelativeRange =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "last_12_months";

/** What a range of dates is called, in the words of the filter that offers it. */
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

export interface DateRange {
  from: string;
  to: string;
}

export const isRelative = (value: unknown): value is RelativeRange =>
  typeof value === "string" && Object.hasOwn(RANGE_LABELS, value);

const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shifted = (from: Date, days: number) =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);

/** The days a range by name stands for, as of `today`. Both ends are days that count. */
export function relativeRange(name: RelativeRange, today = new Date()): DateRange {
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

/** A filter's value as the page has it: what was set, or else the filter's default. `undefined` narrows nothing. */
export function valueFor(
  filter: { name: string; default?: unknown },
  values: Readonly<Record<string, unknown>>,
): unknown {
  const set = values[filter.name];
  return set === undefined ? filter.default : set;
}
