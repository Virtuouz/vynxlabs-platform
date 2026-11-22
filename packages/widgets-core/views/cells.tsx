import { showValue } from "@volvel/ui";
import { ArrowDownRight, ArrowUpRight, Minus } from "@volvel/ui/icons";
import type { ColumnInfo, RowsData } from "@volvel/widgets";
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-meta font-medium whitespace-nowrap ${
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
export function totalOf(rows: RowsData["rows"], spec: ColumnSpec): string {
  const sum = rows.reduce((so, row) => so + (numberOf(row[spec.column]) ?? 0), 0);
  return formatNumber(sum, spec.format);
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
      : data.columns
          .filter((column) => !SYSTEM_COLUMNS.has(column.name))
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
        <span className="tabular-nums">{formatNumber(value, spec.format)}</span>
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
        {formatNumber(Math.abs(size), spec.format)}
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
      const words = found?.label ?? String(item);
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
      <DotBadge tone={spec.badges?.[String(value)]}>{formatNumber(value, spec.format)}</DotBadge>
    );
  }
  if (isNumeric(info) || spec.format) {
    return <span className="tabular-nums">{formatNumber(value, spec.format)}</span>;
  }
  if (isCode(value)) return <span className="font-mono text-[0.92em]">{value}</span>;
  return showValue(type, value);
}

/** What a column is headed. */
export const headingOf = (spec: ColumnSpec, data: RowsData) =>
  spec.label ?? labelOf(data.columns, spec.column);

/** A row's id, for a click and a key. A row with none is known by its place. */
export const rowId = (row: Record<string, unknown>, at: number): string =>
  typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : String(at);
