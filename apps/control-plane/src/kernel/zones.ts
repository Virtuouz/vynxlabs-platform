/** Whether text is the name of a time zone, such as Europe/Berlin or UTC (not an offset, which Postgres reads the other way round). */
export function isTimeZone(name: string): boolean {
  if (/^[+-]/.test(name)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** The day it is now in a time zone, as `YYYY-MM-DD`: the reader's day, not UTC's. */
export function dayIn(zone: string | undefined, at: Date = new Date()): string {
  if (zone === undefined || !isTimeZone(zone)) return at.toISOString().slice(0, 10);
  // "en-CA" writes a day as year-month-day.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * "Today" as the page's relative ranges count it: a date at midnight UTC whose day is the reader's
 * day, so that the days counted back from it are the reader's days.
 */
export function todayIn(zone: string | undefined, at: Date = new Date()): Date {
  return new Date(`${dayIn(zone, at)}T00:00:00Z`);
}

/** The moment a day begins in a time zone, as ISO 8601 in UTC: a time is kept with its zone. */
export function startOfDayIn(day: string, zone: string | undefined): string {
  const utc = Date.parse(`${day}T00:00:00Z`);
  if (zone === undefined || !isTimeZone(zone)) return new Date(utc).toISOString();
  // The zone's offset at that moment, found by asking what the zone's clock says then, and once more
  // for the moment that gives (a day when the clocks change has two offsets).
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((one) => one.type === type)?.value);
    return (
      Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
      ) - instant
    );
  };
  const first = utc - offsetAt(utc);
  return new Date(utc - offsetAt(first)).toISOString();
}
