/**
 * Dates as the kit's date input reads, writes and says them. A day is `{ y, m, d }` with the
 * month from 1; a time is `{ h, mi }`. The text a field holds is a "wall" string, `2026-11-21` or
 * `2026-11-21T14:30`, with no zone: which clock it is on is the field's business.
 */

export interface Ymd {
  y: number;
  m: number;
  d: number;
}
export interface Hm {
  h: number;
  mi: number;
}

const pad = (n: number, to = 2) => String(n).padStart(to, "0");

/** A day as a UTC date. Years below 100 are what they say, not 19xx. */
function utcDate({ y, m, d }: Ymd): Date {
  const at = new Date(0);
  at.setUTCFullYear(y, m - 1, d);
  return at;
}

export const ymdText = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
export const hmText = ({ h, mi }: Hm) => `${pad(h)}:${pad(mi)}`;

export function validYmd({ y, m, d }: Ymd): boolean {
  if (!(y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
  return utcDate({ y, m: m + 1, d: 0 }).getUTCDate();
}

export function addDays(day: Ymd, n: number): Ymd {
  const at = utcDate(day);
  at.setUTCDate(at.getUTCDate() + n);
  return { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate() };
}

/** A month on, clamped to the length of the month it lands in (31 Jan + 1 month is 28 Feb). */
export function addMonths(day: Ymd, n: number): Ymd {
  const index = day.y * 12 + (day.m - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return { y, m, d: Math.min(day.d, daysInMonth(y, m)) };
}

/** 0 for Sunday. */
export const weekdayOf = (day: Ymd): number => utcDate(day).getUTCDay();

export const compareYmd = (a: Ymd, b: Ymd): number => ymdText(a).localeCompare(ymdText(b));
export const sameDay = (a: Ymd | undefined, b: Ymd | undefined) =>
  a !== undefined && b !== undefined && a.y === b.y && a.m === b.m && a.d === b.d;

export function todayYmd(now = new Date()): Ymd {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/** What a wall string holds. Seconds and a zone mark after the minute are ignored. */
export function readWall(text: string | undefined): { day: Ymd; time: Hm | undefined } | undefined {
  if (!text) return undefined;
  const hit = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text);
  if (!hit) return undefined;
  const day = { y: Number(hit[1]), m: Number(hit[2]), d: Number(hit[3]) };
  if (!validYmd(day)) return undefined;
  const time = hit[4] === undefined ? undefined : { h: Number(hit[4]), mi: Number(hit[5]) };
  return { day, time };
}

// ---------------------------------------------------------------------------
// The person's locale

export function localeOf(): string {
  if (typeof navigator === "undefined") return "en-US";
  return navigator.languages?.[0] || navigator.language || "en-US";
}

/** In which order the locale writes day, month and year in numbers: `["m", "d", "y"]` in the US. */
export function dateOrder(locale: string): ("d" | "m" | "y")[] {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "UTC",
    }).formatToParts(Date.UTC(2033, 10, 22));
    const order = parts.flatMap((part) =>
      part.type === "day"
        ? ["d" as const]
        : part.type === "month"
          ? ["m" as const]
          : part.type === "year"
            ? ["y" as const]
            : [],
    );
    return order.length === 3 ? order : ["m", "d", "y"];
  } catch {
    return ["m", "d", "y"];
  }
}

/**
 * What an empty date box says, as a hint and never as a value: the shape the locale writes
 * ("mm/dd/yyyy", "dd.mm.yyyy"), with " hh:mm" for a date and time. "Pick a date" where the
 * locale cannot say it.
 */
export function datePattern(locale: string, withTime: boolean): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).formatToParts(Date.UTC(2033, 10, 22));
    const words = parts
      .map((part) =>
        part.type === "day"
          ? "dd"
          : part.type === "month"
            ? "mm"
            : part.type === "year"
              ? "yyyy"
              : part.type === "literal"
                ? part.value
                : "",
      )
      .join("");
    if (!/dd/.test(words) || !/mm/.test(words) || !/yyyy/.test(words)) return "Pick a date";
    return withTime ? `${words} hh:mm` : words;
  } catch {
    return "Pick a date";
  }
}

/** Which day a week starts on in the locale, 0 for Sunday. */
export function firstDayOf(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay;
    if (first !== undefined) return first % 7;
  } catch {
    // fall through
  }
  return /^(en-(US|CA)|es-(US|MX)|ja|he|ko|pt-BR|zh)/.test(locale) || locale === "en" ? 0 : 1;
}

export function monthNames(locale: string, style: "long" | "short"): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, index) => format.format(Date.UTC(2021, index, 15)));
}

/** Names of the days from Sunday: 2021-08-01 was one. */
export function weekdayNames(locale: string, style: "long" | "short" | "narrow"): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => format.format(Date.UTC(2021, 7, 1 + index)));
}

export function formatDay(day: Ymd, locale: string, style: "medium" | "full" = "medium"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: "UTC" }).format(
    utcDate(day),
  );
}

export function formatTime(time: Hm, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(
    Date.UTC(1970, 0, 1, time.h, time.mi),
  );
}

export function formatWall(text: string | undefined, locale: string, withTime: boolean): string {
  const read = readWall(text);
  if (!read) return "";
  if (!withTime) return formatDay(read.day, locale);
  return `${formatDay(read.day, locale)}, ${formatTime(read.time ?? { h: 0, mi: 0 }, locale)}`;
}

// ---------------------------------------------------------------------------
// Reading what was typed

const KEYWORDS: Record<string, number> = { today: 0, tomorrow: 1, yesterday: -1 };

const fold = (word: string) =>
  word.toLowerCase().replace(/\.$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "");

function monthOfWord(word: string, locale: string): number | undefined {
  const w = fold(word);
  if (!/^\p{L}+$/u.test(w)) return undefined;
  const lists = [
    monthNames(locale, "long"),
    monthNames(locale, "short"),
    monthNames("en", "long"),
    monthNames("en", "short"),
  ].map((names) => names.map(fold));
  for (const names of lists) {
    const exact = names.indexOf(w);
    if (exact >= 0) return exact + 1;
  }
  if (w.length < 3) return undefined;
  for (const names of lists) {
    const starts = names.flatMap((name, index) => (name.startsWith(w) ? [index + 1] : []));
    if (starts.length === 1) return starts[0];
  }
  return undefined;
}

const fullYear = (text: string): number => (text.length <= 2 ? 2000 + Number(text) : Number(text));

/** A day from what a person typed, or nothing if it can't be read. */
export function parseDay(raw: string, locale: string, now: Date = new Date()): Ymd | undefined {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return undefined;
  const word = text.toLowerCase();
  if (word in KEYWORDS) return addDays(todayYmd(now), KEYWORDS[word] ?? 0);

  const tokens = text
    .replace(/(\d)(st|nd|rd|th)\b/gi, "$1")
    .split(/[\s,./-]+/)
    .filter(Boolean);

  if (tokens.every((token) => /^\d+$/.test(token))) {
    if (tokens.length < 2 || tokens.length > 3 || tokens.some((token) => token.length > 4)) {
      return undefined;
    }
    const nums = tokens.map(Number);
    const current = todayYmd(now).y;
    if (tokens.length === 3 && tokens[0]?.length === 4) {
      const day = { y: nums[0] ?? 0, m: nums[1] ?? 0, d: nums[2] ?? 0 };
      return validYmd(day) ? day : undefined;
    }
    const order = dateOrder(locale).filter((part) => tokens.length === 3 || part !== "y");
    const place = (parts: ("d" | "m" | "y")[]): Ymd => {
      const at = (part: "d" | "m" | "y") => parts.indexOf(part);
      return {
        y: tokens.length === 3 ? fullYear(tokens[at("y")] ?? "") : current,
        m: nums[at("m")] ?? 0,
        d: nums[at("d")] ?? 0,
      };
    };
    const first = place(order);
    if (validYmd(first)) return first;
    // 21/11/2026 in a month-first locale: the month can't be 21, so it is the other way round.
    const swapped = place(order.map((part) => (part === "d" ? "m" : part === "m" ? "d" : part)));
    return validYmd(swapped) ? swapped : undefined;
  }

  let month: number | undefined;
  const numbers: string[] = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      numbers.push(token);
      continue;
    }
    const found = monthOfWord(token, locale);
    if (found !== undefined && month === undefined) {
      month = found;
      continue;
    }
    const isWeekday = [weekdayNames(locale, "long"), weekdayNames(locale, "short")]
      .concat([weekdayNames("en", "long"), weekdayNames("en", "short")])
      .some((names) => names.map(fold).some((name) => name === fold(token)));
    if (!isWeekday) return undefined;
  }
  if (month === undefined || numbers.length === 0 || numbers.length > 2) return undefined;
  const yearAt = numbers.findIndex((token) => token.length === 4);
  const dayText = numbers.find((_, index) => index !== yearAt);
  if (dayText === undefined || dayText.length > 2) return undefined;
  const yearText = yearAt >= 0 ? numbers[yearAt] : numbers.length === 2 ? numbers[1] : undefined;
  const day = {
    y: yearText === undefined ? todayYmd(now).y : fullYear(yearText),
    m: month,
    d: Number(dayText),
  };
  return validYmd(day) ? day : undefined;
}

const TIME_WORD =
  "\\d{1,2}(?:[:.h]\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)|\\d{1,2}[:h]\\d{2}|noon|midnight";

/** A time of day from "14:30", "2:30 PM", "9am", "noon". */
export function parseTime(raw: string): Hm | undefined {
  const text = raw.trim().toLowerCase();
  if (text === "noon") return { h: 12, mi: 0 };
  if (text === "midnight") return { h: 0, mi: 0 };
  const hit = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(text);
  if (!hit) return undefined;
  let h = Number(hit[1]);
  const mi = hit[2] === undefined ? 0 : Number(hit[2]);
  if (hit[2] === undefined && hit[3] === undefined) return undefined;
  if (mi > 59) return undefined;
  if (hit[3]) {
    if (h < 1 || h > 12) return undefined;
    h = (h % 12) + (hit[3].startsWith("p") ? 12 : 0);
  } else if (h > 23) {
    return undefined;
  }
  return { h, mi };
}

export type Entry = { day: Ymd; time: Hm | undefined };

/**
 * What a box holds, read: a day, and with a time asked for, a time too. `2026-11-21T14:30`,
 * "21 nov 2026 9am", "tomorrow 14:30". A day alone keeps the time the field had.
 */
export function parseEntry(
  raw: string,
  withTime: boolean,
  locale: string,
  now: Date = new Date(),
): Entry | undefined {
  const text = raw.trim();
  const iso = /^(\d{4}-\d{1,2}-\d{1,2})[T ](\d{1,2}:\d{2})(?::\d{2}(?:\.\d+)?)?Z?$/i.exec(text);
  if (iso) {
    const day = parseDay(iso[1] ?? "", locale, now);
    const time = parseTime(iso[2] ?? "");
    return day && time ? { day, time: withTime ? time : undefined } : undefined;
  }
  if (!withTime) {
    const day = parseDay(text, locale, now);
    return day ? { day, time: undefined } : undefined;
  }
  const split = new RegExp(`^(.*?)[,\\s]+(?:at\\s+)?(${TIME_WORD})$`, "i").exec(text);
  if (split) {
    const day = parseDay(split[1] ?? "", locale, now);
    const time = parseTime(split[2] ?? "");
    return day && time ? { day, time } : undefined;
  }
  const day = parseDay(text, locale, now);
  return day ? { day, time: undefined } : undefined;
}
