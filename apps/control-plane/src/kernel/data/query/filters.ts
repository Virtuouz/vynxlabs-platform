import { type PageFilter, RELATIVE_RANGES, type RelativeRange } from "@volvel/manifest";
import { badRequest } from "../../errors.js";

/**
 * What whoever looks at a page set its filters to, as the server reads it. A date range is
 * `{ from, to }` (both days included); a choice and a text are strings; a number is a number.
 * A filter that narrows nothing is left out.
 */
export type FilterValues = Record<string, unknown>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether text is a real day, as `YYYY-MM-DD`. */
export const isDay = (text: unknown): text is string =>
  typeof text === "string" &&
  DAY.test(text) &&
  new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const utc = (year: number, month: number, date: number) => new Date(Date.UTC(year, month, date));

/** The day after a day, so that the last day of a range is whole. */
export function dayAfter(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return dayOf(next);
}

/** The day `days` days from a day (before, when negative). */
export function dayShifted(day: string, days: number): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return dayOf(next);
}

/** How many days a range holds, both ends counting. */
export function daysIn(range: { from: string; to: string }): number {
  return (
    (new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) /
      86_400_000 +
    1
  );
}

/** The days a range by name stands for, as of `today` (UTC). Both ends are days that count. */
export function relativeRange(
  name: RelativeRange,
  today = new Date(),
): { from: string; to: string } {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const date = today.getUTCDate();
  const back = (days: number) => ({
    from: dayOf(utc(year, month, date - (days - 1))),
    to: dayOf(today),
  });
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
      return { from: dayOf(utc(year, month, 1)), to: dayOf(utc(year, month + 1, 0)) };
    case "last_month":
      return { from: dayOf(utc(year, month - 1, 1)), to: dayOf(utc(year, month, 0)) };
    case "this_quarter": {
      const first = month - (month % 3);
      return { from: dayOf(utc(year, first, 1)), to: dayOf(utc(year, first + 3, 0)) };
    }
    case "this_year":
      return { from: dayOf(utc(year, 0, 1)), to: dayOf(utc(year, 11, 31)) };
    case "last_12_months":
      return { from: dayOf(utc(year, month - 11, 1)), to: dayOf(utc(year, month + 1, 0)) };
  }
}

/** A range of days as it was set: both ends, or one end, or nothing when it is not a range. */
export function rangeOf(value: unknown): { from?: string; to?: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { from, to } = value as { from?: unknown; to?: unknown };
  const range = {
    ...(isDay(from) ? { from } : {}),
    ...(isDay(to) ? { to } : {}),
  };
  return range.from || range.to ? range : undefined;
}

/** The same length of time, ending the day before a range begins. */
export function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const days = daysIn(range);
  return { from: dayShifted(range.from, -days), to: dayShifted(range.from, -1) };
}

const refuse = (name: string, message: string) =>
  badRequest("The filters are not valid.", [{ path: `/filters/${name}`, message }]);

/** One filter's value as the server reads it, or `undefined` when it narrows nothing. */
function filterValue(filter: PageFilter, raw: unknown, today: Date): unknown {
  if (raw === null || raw === undefined) return undefined;
  const name = filter.name;
  switch (filter.type) {
    case "date_range": {
      if (typeof raw === "string") {
        if (!(RELATIVE_RANGES as readonly string[]).includes(raw)) {
          throw refuse(
            name,
            `"${raw}" is not a range of dates: ${RELATIVE_RANGES.join(", ")}, or { from, to }`,
          );
        }
        return relativeRange(raw as RelativeRange, today);
      }
      if (typeof raw !== "object" || Array.isArray(raw)) {
        throw refuse(name, "is a range by name, or { from, to } with days as YYYY-MM-DD");
      }
      const { from, to } = raw as { from?: unknown; to?: unknown };
      for (const [end, day] of [
        ["from", from],
        ["to", to],
      ] as const) {
        if (day !== undefined && day !== null && !isDay(day)) {
          throw refuse(name, `"${end}" is a day as YYYY-MM-DD`);
        }
      }
      if (isDay(from) && isDay(to) && from > to) {
        throw refuse(name, "the range ends before it begins");
      }
      return rangeOf({ from: from ?? undefined, to: to ?? undefined });
    }
    case "number": {
      const number =
        typeof raw === "number"
          ? raw
          : typeof raw === "string" && raw.trim() !== ""
            ? Number(raw)
            : Number.NaN;
      if (!Number.isFinite(number)) throw refuse(name, "is a number");
      return number;
    }
    case "choice": {
      if (typeof raw !== "string") throw refuse(name, "is one of the choices, as text");
      if (raw === "") return undefined;
      if (filter.choices && filter.choices.length > 0 && !filter.choices.includes(raw)) {
        throw refuse(name, `"${raw}" is not one of its choices`);
      }
      return raw;
    }
    case "text": {
      if (typeof raw !== "string") throw refuse(name, "is text");
      if (raw.length > 200) throw refuse(name, "is at most 200 letters");
      return raw === "" ? undefined : raw;
    }
  }
}

/**
 * The values the page's filters have for this reading: what the browser sent, with a filter
 * it left out taking its default, and `null` meaning it narrows nothing. A name the page has no
 * filter for, or a value the filter's type refuses, is a bad request.
 */
export function resolveFilters(
  filters: readonly PageFilter[],
  given: unknown,
  today = new Date(),
): FilterValues {
  const sent: Record<string, unknown> = {};
  if (given !== undefined) {
    if (typeof given !== "object" || given === null || Array.isArray(given)) {
      throw badRequest("The filters must be an object, by name.");
    }
    for (const [name, value] of Object.entries(given)) {
      if (!filters.some((filter) => filter.name === name)) {
        throw refuse(name, "the page has no such filter");
      }
      sent[name] = value;
    }
  }
  const values: FilterValues = {};
  for (const filter of filters) {
    const raw = filter.name in sent ? sent[filter.name] : filter.default;
    const value = filterValue(filter, raw, today);
    if (value !== undefined) values[filter.name] = value;
  }
  return values;
}
