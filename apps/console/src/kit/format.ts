/**
 * The one place the console turns times, durations, counts and sizes into
 * text (07 §7.3). Every screen formats through here, so the same value reads
 * the same everywhere and a column of them compares by eye. `enforce.test.ts`
 * keeps it so.
 */

import { duration } from "@vynxlabs/ui";

export { duration };

/** A time, as the API sends it or as the browser holds it. */
export type When = string | number | Date;

const at = (value: When): Date => (value instanceof Date ? value : new Date(value));
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-16", in the reader's own zone. */
export function day(value: When): string {
  const date = at(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "16:38", in the reader's own clock. */
export function hm(value: When): string {
  const date = at(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "2026-11-16 16:38:54": a time to the second, in one shape on every line. */
export function stamp(value: When): string {
  const date = at(value);
  return `${day(date)} ${hm(date)}:${pad(date.getSeconds())}`;
}

/** "16:38:54" for a time today, "2026-11-16 16:38:54" for any other day. */
export function clock(value: When, now: When = Date.now()): string {
  const date = at(value);
  return day(date) === day(now) ? `${hm(date)}:${pad(date.getSeconds())}` : stamp(date);
}

/**
 * How far a time is from now, in its largest unit: "just now", "5m ago",
 * "3h ago", "in 2m". Past a day it says how many days, and past a week the date.
 */
export function ago(value: When, now: When = Date.now()): string {
  const ms = at(value).getTime() - at(now).getTime();
  const seconds = Math.round(Math.abs(ms) / 1000);
  if (seconds < 5) return "just now";
  const days = Math.floor(seconds / 86_400);
  if (days >= 7) return day(value);
  const amount =
    seconds < 60
      ? `${seconds}s`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m`
        : seconds < 86_400
          ? `${Math.floor(seconds / 3600)}h`
          : `${days}d`;
  return ms > 0 ? `in ${amount}` : `${amount} ago`;
}

/**
 * Everything about a time, for a tooltip: the reader's local time with its
 * zone, the same in UTC, and how long ago.
 */
export function fullTime(value: When, now: When = Date.now()): string {
  const date = at(value);
  const zone =
    new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  const utc = date.toISOString().replace("T", " ").slice(0, 19);
  return `${stamp(date)}${zone ? ` ${zone}` : ""} · ${utc} UTC · ${ago(date, now)}`;
}

/** "12,480": a count, grouped as the reader groups digits. */
export function count(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/** "12.4 KB", "3.1 MB": a size in bytes, to one decimal. */
export function bytes(n: number): string {
  const one = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  if (n < 1024) return `${one.format(n)} B`;
  if (n < 1024 * 1024) return `${one.format(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${one.format(n / (1024 * 1024))} MB`;
  return `${one.format(n / (1024 * 1024 * 1024))} GB`;
}

/** How long between two times, or "" while either is missing. */
export function between(from: When | null | undefined, to: When | null | undefined): string {
  if (from === null || from === undefined || to === null || to === undefined) return "";
  return duration(at(to).getTime() - at(from).getTime());
}

/** "01a1e7…00999": a long value cut in its middle, so both its start and its end show. */
export function middle(value: string, max = 12): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - (max - 1 - head))}`;
}

/** "Tue 17 Nov, 14:00": a time as it falls in another zone, for a schedule's next times. */
export function inZone(value: When, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at(value));
}
