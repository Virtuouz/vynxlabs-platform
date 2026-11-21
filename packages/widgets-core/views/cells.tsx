import { Badge, showValue, ValueChip } from "@volvel/ui";
import { ArrowDownRight, ArrowUpRight, Minus } from "@volvel/ui/icons";
import type { ColumnInfo, RowsData } from "@volvel/widgets";
import type { ReactNode } from "react";
import { formatNumber, labelOf, numberOf, type ValueFormat } from "./format.ts";

/** One column of a table, as its widget's configuration lists it. */
export interface ColumnSpec {
  column: string;
  label?: string;
  format?: ValueFormat;
  as?: "text" | "bar" | "delta" | "chip";
  hidden?: boolean;
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
      return (
        <ValueChip key={String(item)} color={found?.color}>
          {found?.label ?? String(item)}
        </ValueChip>
      );
    };
    return (
      <span className="inline-flex flex-wrap gap-1">
        {(Array.isArray(value) ? value : [value]).map(one)}
      </span>
    );
  }
  if (spec.as === "chip") return <Badge>{formatNumber(value, spec.format)}</Badge>;
  if (isNumeric(info) || spec.format) {
    return <span className="tabular-nums">{formatNumber(value, spec.format)}</span>;
  }
  return showValue(type, value);
}

/** What a column is headed. */
export const headingOf = (spec: ColumnSpec, data: RowsData) =>
  spec.label ?? labelOf(data.columns, spec.column);

/** A row's id, for a click and a key. A row with none is known by its place. */
export const rowId = (row: Record<string, unknown>, at: number): string =>
  typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : String(at);
