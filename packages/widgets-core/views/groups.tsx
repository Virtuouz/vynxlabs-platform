import {
  type ColumnInfo,
  choiceWords,
  countText,
  formatDay,
  type RowsData,
  readerLocale,
} from "@volvel/widgets";
import type { ReactNode } from "react";
import { cellOf, rowId } from "./cells.tsx";

/** What a list or a table keeps its rows together by (`config.groupRows`). */
export interface GroupRows {
  column: string;
  /** For a date or a time: how long each group is. A day, when left out. */
  by?: "day" | "week" | "month";
  descending?: boolean;
}

type Row = Readonly<Record<string, unknown>>;

/** Rows under one heading. */
export interface RowGroup {
  /** A name for it that is the same for the same group, however many rows are read. */
  id: string;
  heading: ReactNode;
  /** What the heading says, as text. */
  name: string;
  /** How many rows it has in all: more than are here, while there are more to read. */
  count: number;
  /** Its rows that are here, each with its place among all of them. */
  rows: { row: Row; at: number; id: string }[];
}

const two = (n: number) => String(n).padStart(2, "0");
const dayKey = (at: Date) => `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
/** A day's own date, at noon, so that a change of clocks does not move it to another. */
const dateOf = (key: string) => {
  const [year = 1970, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};
const shifted = (key: string, days: number) => {
  const at = dateOf(key);
  at.setDate(at.getDate() + days);
  return dayKey(at);
};
const isTime = (type: string | undefined) => type === "date" || type === "timestamp";

/** The day a value is on where its reader is, or the Monday of its week, or the first of its month. */
function periodOf(value: unknown, type: string, by: "day" | "week" | "month"): string | null {
  if (typeof value !== "string") return null;
  let day: string;
  if (type === "timestamp") {
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return null;
    day = dayKey(at);
  } else {
    day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  }
  if (by === "month") return `${day.slice(0, 7)}-01`;
  // Weeks begin on Monday, as the server gathers them.
  if (by === "week") return shifted(day, -((dateOf(day).getDay() + 6) % 7));
  return day;
}

const said = (key: string, now: Date, options: Intl.DateTimeFormatOptions) => {
  const at = dateOf(key);
  return at.toLocaleDateString(readerLocale(), {
    ...options,
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
};

/** A period as its heading says it: "Today · Sunday, Nov 22", "This week · Nov 16 – 22", "November". */
export function periodWords(
  key: string,
  by: "day" | "week" | "month",
  now: Date = new Date(),
): string {
  const today = dayKey(now);
  if (by === "month") return said(key, now, { month: "long" });
  if (by === "week") {
    const end = shifted(key, 6);
    const from = formatDay(key, now) ?? key;
    const until =
      end.slice(0, 7) === key.slice(0, 7) && from.length <= 6
        ? String(Number(end.slice(8)))
        : (formatDay(end, now) ?? end);
    const range = `${from} – ${until}`;
    const mine = periodOf(today, "date", "week");
    const near = mine
      ? { [mine]: "This week", [shifted(mine, -7)]: "Last week", [shifted(mine, 7)]: "Next week" }
      : {};
    return near[key] ? `${near[key]} · ${range}` : range;
  }
  const full = said(key, now, { weekday: "long", month: "short", day: "numeric" });
  const near: Record<string, string> = {
    [today]: "Today",
    [shifted(today, -1)]: "Yesterday",
    [shifted(today, 1)]: "Tomorrow",
  };
  return near[key] ? `${near[key]} · ${full}` : full;
}

/** A time as it is said under its own day: "9:00 AM". */
const timeOf = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? undefined
    : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

const byOf = (group: GroupRows) => group.by ?? "day";
const infoOf = (data: RowsData, name: string): ColumnInfo | undefined =>
  data.columns.find((one) => one.name === name);

/**
 * What a cell of the grouped column says instead of its value: under a day's heading, only the
 * time. `undefined` leaves the cell as it is.
 */
export function underItsDay(
  group: GroupRows | undefined,
  data: RowsData,
  column: string,
  value: unknown,
): string | undefined {
  if (!group || group.column !== column || byOf(group) !== "day") return undefined;
  return infoOf(data, column)?.type === "timestamp" ? timeOf(value) : undefined;
}

/**
 * The rows gathered under their headings, in the order the groups come; `undefined` when they are
 * not grouped (nothing is chosen, or the column is not among what was read). `ordered` are the
 * rows as the view shows them: within a group they keep that order.
 */
export function groupsOf(
  data: RowsData,
  group: GroupRows | undefined,
  ordered: readonly Row[] = data.rows,
): RowGroup[] | undefined {
  if (!group?.column) return undefined;
  const info = infoOf(data, group.column);
  if (!info) return undefined;
  const by = byOf(group);
  const time = isTime(info.type);
  const keyOf = (row: Row): unknown => {
    const value = row[group.column];
    if (value === null || value === undefined || value === "") return null;
    return time ? periodOf(value, info.type, by) : value;
  };
  const counted = data.groups
    ? new Map(data.groups.map((one) => [String(one.key ?? ""), one.count]))
    : undefined;
  // The groups come as the server put the rows in order, whatever order the view has put them in since.
  const found = new Map<string, RowGroup & { key: unknown }>();
  const groupFor = (row: Row) => {
    const key = keyOf(row);
    const id = String(key ?? "");
    let one = found.get(id);
    if (!one) {
      const label = info.label ?? group.column;
      const name =
        key === null
          ? time
            ? "No date"
            : `No ${label.charAt(0).toLowerCase()}${label.slice(1)}`
          : time
            ? periodWords(String(key), by)
            : info.type === "boolean"
              ? key === true
                ? "Yes"
                : "No"
              : info.type === "enum"
                ? choiceWords(info, key)
                : String(key);
      one = {
        id,
        key,
        name,
        heading:
          key !== null && info.type === "enum"
            ? cellOf({ column: group.column, as: "badge" }, info, key, data)
            : name,
        count: 0,
        rows: [],
      };
      found.set(id, one);
    }
    return one;
  };
  const places = new Map<Row, number>();
  data.rows.forEach((row, at) => {
    places.set(row, at);
    groupFor(row).count += 1;
  });
  for (const row of ordered) {
    const at = places.get(row) ?? 0;
    groupFor(row).rows.push({ row, at, id: rowId(row, at) });
  }
  return [...found.values()].map(({ key: _key, ...one }) => ({
    ...one,
    // Without the server's count every row is here, and they are counted.
    count: Math.max(counted?.get(one.id) ?? 0, one.count),
  }));
}

/** A group's heading: what it is, and how many rows it has. */
export function GroupHeading({ group }: { group: RowGroup }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">{group.heading}</span>
      <span className="ml-auto shrink-0 text-meta font-normal text-ink-muted tabular-nums">
        {countText(group.count)}
        <span className="sr-only"> {group.count === 1 ? "row" : "rows"}</span>
      </span>
    </span>
  );
}
