import { showValue } from "@volvel/ui";
import { ArrowDownRight, ArrowUpRight, Minus } from "@volvel/ui/icons";
import type { ColumnInfo, RowsData } from "@volvel/widgets";
import { choiceWords, formatDay, formatOfColumn } from "@volvel/widgets";
import type { ReactNode } from "react";
import { formatNumber, labelOf, numberOf, type ValueFormat } from "./format.ts";

/** One column of a table, as its widget's configuration lists it. */
export interface ColumnSpec {
  column: string;
  label?: string;
  format?: ValueFormat;
  as?: "text" | "bar" | "delta" | "badge";
  /** For `as: "badge"`: each value's tone. */
  badges?: Record<string, Tone>;
  align?: "auto" | "right";
  width?: "auto" | "fixed";
  sortable?: boolean;
  total?: boolean;
  /** `false` leaves the column out of the list a table becomes on a phone. */
  phone?: boolean;
  hidden?: boolean;
}

export type Tone = "success" | "attention" | "danger" | "neutral" | "action";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-muted",
  action: "bg-action-soft text-action",
  attention: "bg-attention-soft text-attention",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
};

/**
 * A status: a chip with a dot, as the boards draw it. Its tone is the widget's (`badges`); with
 * none, the colour the column gives the value, drawn as a tint with that colour's dot.
 */
export function DotBadge({
  tone,
  color,
  children,
}: {
  tone?: Tone | undefined;
  color?: string | undefined;
  children: ReactNode;
}) {
  const tinted = tone === undefined && color !== undefined;
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-[5px] rounded-full px-2 text-meta font-medium whitespace-nowrap ${
        tinted ? "text-ink" : TONE_CLASS[tone ?? "neutral"]
      }`}
      style={
        tinted ? { backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` } : undefined
      }
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-current"
        style={tinted ? { backgroundColor: color } : undefined}
      />
      {children}
    </span>
  );
}

/** An id as the boards set it: "INV-9338", "C-1001". */
const CODE = /^[A-Z][A-Z0-9]{0,5}-[A-Z0-9][A-Z0-9-]*$/;
export const isCode = (value: unknown): value is string =>
  typeof value === "string" && CODE.test(value) && /\d/.test(value);

/** Whether a column's values line up at the right. */
export const isRight = (spec: ColumnSpec, info: ColumnInfo | undefined) =>
  spec.align === "right" || isNumeric(info);

/** The sum of a column over the rows shown, written as the column is. */
export function totalOf(
  rows: RowsData["rows"],
  spec: ColumnSpec,
  info?: ColumnInfo | undefined,
): string {
  const sum = rows.reduce((so, row) => so + (numberOf(row[spec.column]) ?? 0), 0);
  return formatNumber(sum, formatOfColumn(spec.format, info));
}

/** The rows ordered by a column, as it reads (a reference by the name it points at). Empty values last. */
export function sortedBy(
  rows: RowsData["rows"],
  data: RowsData,
  column: string,
  descending: boolean,
): RowsData["rows"] {
  const type = data.columns.find((one) => one.name === column)?.type;
  const key = (row: Record<string, unknown>): number | string | undefined => {
    const value = row[column];
    if (value === null || value === undefined || value === "") return undefined;
    const name = data.names?.[column]?.[String(value)];
    if (name !== undefined) return name;
    if (type === "number" || type === "integer") return numberOf(value);
    return String(value);
  };
  const way = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * way;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * way;
  });
}

/** The columns every table has, which are not shown unless a widget asks. */
export const SYSTEM_COLUMNS = new Set(["id", "created_at", "updated_at"]);

/** A column a widget draws when it names none: not a system column, and not JSON, which says nothing in a cell. */
export const isDefaultColumn = (column: { name: string; type: string }): boolean =>
  !SYSTEM_COLUMNS.has(column.name) && column.type !== "json";

/** The names that say what a row is, then where it stands and when, most telling first. */
const IDENTIFYING = [
  "name",
  "title",
  "number",
  "code",
  "reference",
  "ref",
  "label",
  "subject",
  "status",
  "starts_at",
  "date",
  "due_on",
];

/**
 * The columns a widget draws when it names none: the default ones, with the columns that say
 * what a row is (its name, title or number), where it stands and when first, and the rest as the table has them.
 */
export function defaultColumns<T extends { name: string; type: string }>(
  columns: readonly T[],
): T[] {
  // What a row is about is named in a column of its own (`pet_name`, `client_name`): after the
  // columns that name the row itself, before the status and the date.
  const about = IDENTIFYING.indexOf("reference") - 0.5;
  const rank = (column: T) => {
    const name = column.name.toLowerCase();
    const at = IDENTIFYING.indexOf(name);
    if (at !== -1) return at;
    return /_(name|title)$/.test(name) ? about : IDENTIFYING.length;
  };
  return columns
    .filter(isDefaultColumn)
    .map((column, at) => ({ column, at }))
    .sort((a, b) => rank(a.column) - rank(b.column) || a.at - b.at)
    .map((one) => one.column);
}

/**
 * A JSON value as a short, readable form: how many items a list holds, or the JSON written
 * compactly and cut. `full` is the whole of it, for a tooltip.
 */
export function jsonWords(value: unknown, cut = 40): { text: string; full: string } {
  const full = JSON.stringify(value) ?? "";
  if (Array.isArray(value)) {
    return { text: `${value.length} ${value.length === 1 ? "item" : "items"}`, full };
  }
  return { text: full.length > cut ? `${full.slice(0, cut - 1)}…` : full, full };
}

const isJsonValue = (type: string, value: unknown): boolean =>
  type === "json" ||
  (typeof value === "object" && value !== null && !Array.isArray(value)) ||
  (Array.isArray(value) && value.some((item) => typeof item === "object" && item !== null));

/** The most columns drawn when a widget names none. */
export const DEFAULT_COLUMNS = 8;

/** What to draw for each column: the widget's list, or the columns that were read. */
export function columnsToShow(
  specs: readonly ColumnSpec[] | undefined,
  data: RowsData,
): { spec: ColumnSpec; info: ColumnInfo | undefined }[] {
  const named = (specs ?? []).filter((spec) => !spec.hidden);
  const chosen: ColumnSpec[] =
    specs && specs.length > 0
      ? named
      : defaultColumns(data.columns)
          .slice(0, DEFAULT_COLUMNS)
          .map((column) => ({ column: column.name }));
  return chosen.map((spec) => ({
    spec,
    info: data.columns.find((column) => column.name === spec.column),
  }));
}

export const isNumeric = (info: ColumnInfo | undefined) =>
  info?.type === "number" || info?.type === "integer";

const nothing = <span className="text-ink-muted/60">—</span>;

/** How much of the column's largest a number is, for a bar. */
export function largest(rows: RowsData["rows"], column: string): number {
  return Math.max(0, ...rows.map((row) => Math.abs(numberOf(row[column]) ?? 0)));
}

/** One value as a person reads it: the name a reference points at, a choice as a chip, a number as its format says. */
export function cellOf(
  spec: ColumnSpec,
  info: ColumnInfo | undefined,
  value: unknown,
  data: RowsData,
  most = 0,
): ReactNode {
  if (value === null || value === undefined || value === "") return nothing;
  const type = info?.type ?? "text";
  // The widget's format, else what the table says the column holds (money kept in cents).
  const format = formatOfColumn(spec.format, info);
  if (isJsonValue(type, value)) {
    const { text, full } = jsonWords(value);
    return (
      <span title={full} className="font-mono text-[12.5px] text-ink-muted">
        {text}
      </span>
    );
  }
  if (spec.as === "bar" && numberOf(value) !== undefined) {
    const share = (Math.abs(numberOf(value) as number) / (most || 1)) * 100;
    return (
      <span className="flex min-w-24 items-center gap-2">
        <span aria-hidden="true" className="h-1.5 min-w-10 flex-1 rounded-full bg-sunken">
          <span
            className="block h-full rounded-full bg-action"
            style={{ width: `${Math.min(100, share)}%` }}
          />
        </span>
        <span className="tabular-nums">{formatNumber(value, format)}</span>
      </span>
    );
  }
  if (spec.as === "delta" && numberOf(value) !== undefined) {
    const size = numberOf(value) as number;
    const Way = size > 0 ? ArrowUpRight : size < 0 ? ArrowDownRight : Minus;
    return (
      <span
        className={`inline-flex items-center gap-0.5 tabular-nums ${
          size > 0 ? "text-success" : size < 0 ? "text-danger" : "text-ink-muted"
        }`}
      >
        <Way aria-hidden="true" size={14} />
        <span className="sr-only">{size > 0 ? "up" : size < 0 ? "down" : "no change"} </span>
        {formatNumber(Math.abs(size), format)}
      </span>
    );
  }
  if (type === "reference") {
    const name = data.names?.[spec.column]?.[String(value)];
    return name ?? String(value);
  }
  if (type === "enum" || type === "enum_list" || Array.isArray(value)) {
    const one = (item: unknown) => {
      const found = info?.values?.find((candidate) => candidate.value === item);
      const words = choiceWords(info, item);
      if (spec.as === "text") return <span key={String(item)}>{words}</span>;
      return (
        <DotBadge key={String(item)} tone={spec.badges?.[String(item)]} color={found?.color}>
          {words}
        </DotBadge>
      );
    };
    return (
      <span className="inline-flex flex-wrap gap-1">
        {(Array.isArray(value) ? value : [value]).map(one)}
      </span>
    );
  }
  if (spec.as === "badge") {
    return (
      <DotBadge tone={spec.badges?.[String(value)]}>
        {typeof value === "string" ? choiceWords(info, value) : formatNumber(value, format)}
      </DotBadge>
    );
  }
  if (isNumeric(info) || format) {
    return <span className="tabular-nums">{formatNumber(value, format)}</span>;
  }
  if (isCode(value)) return <span className="font-mono text-[12.5px]">{value}</span>;
  if (type === "date" && typeof value === "string") {
    const day = formatDay(value);
    if (day) return <span className="text-ink-muted">{day}</span>;
  }
  if (type === "timestamp" && typeof value === "string") {
    const at = new Date(value);
    if (!Number.isNaN(at.getTime())) {
      // "Nov 21, 1:10 PM": the year only when it is not this one, as a day is written.
      return at.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        ...(at.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }
  return showValue(type, value);
}

/** What a column is headed. */
export const headingOf = (spec: ColumnSpec, data: RowsData) =>
  spec.label ?? labelOf(data.columns, spec.column);

/** A row's id, for a click and a key. A row with none is known by its place. */
export const rowId = (row: Record<string, unknown>, at: number): string =>
  typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : String(at);
