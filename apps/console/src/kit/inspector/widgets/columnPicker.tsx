/**
 * The small editor of "For each", "Split into colors", "Rows" and "Columns": the table's columns
 * listed by how well they group (board 11), searchable, each with how many values it has. A
 * date adds how its periods are cut. Replaced by B3's BreakdownEditor at integration, where
 * that one offers the same.
 */
// replaced by B3's BreakdownEditor at integration
import { SegmentedControl } from "@volvel/ui";
import type { BREAKDOWN_CADENCES } from "@volvel/widgets";
import { Search } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { heading } from "../model.ts";
import { columnIcon, type Grouping, TEMPORAL } from "./shared.tsx";

export type Cadence = (typeof BREAKDOWN_CADENCES)[number];

/** The cuts a date offers, in the words of the board. */
export const CUTS: { value: Cadence; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

export function ColumnPicker({
  label,
  groupings,
  value,
  bucket,
  none,
  onPick,
  onBucket,
  children,
}: {
  label: string;
  groupings: readonly Grouping[];
  value: string | undefined;
  bucket?: Cadence | undefined;
  /** What choosing no column is called: "Nothing". Left out, a column must be chosen. */
  none?: string;
  /** The chosen column, and the cut a date starts with. */
  onPick: (column: string | undefined, type: string | undefined) => void;
  onBucket?: (cut: Cadence) => void;
  /** Under the list, for the chosen date: "Include weeks with no invoices". */
  children?: ReactNode;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const found = groupings.filter((one) =>
    `${heading(one.column.name)} ${one.column.name}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const good = found.filter((one) => one.good);
  const other = found.filter((one) => !one.good);
  const chosen = groupings.find((one) => one.column.name === value);
  const list = (title: string, items: readonly Grouping[]) =>
    items.length === 0 ? null : (
      <div className="flex flex-col gap-0.5">
        <p className="m-0 px-1 pb-1 text-body-sm text-ink-muted">{title}</p>
        {items.map((one) => {
          const on = one.column.name === value;
          const Icon = columnIcon(one.column.type);
          return (
            <label
              key={one.column.name}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-control border px-2 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                on ? "border-action bg-selected" : "border-transparent hover:bg-selected"
              }`}
            >
              <input
                type="radio"
                name={`${id}-column`}
                checked={on}
                onChange={() => onPick(one.column.name, one.column.type)}
                className="sr-only"
              />
              <Icon size={14} aria-hidden className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">{heading(one.column.name)}</span>
              <span className="shrink-0 text-meta text-ink-muted">{one.hint}</span>
            </label>
          );
        })}
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Find a column</span>
        <Search
          aria-hidden="true"
          size={14}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a column"
          className="h-9 w-full rounded-control border border-line-control bg-surface pr-3 pl-8 text-body-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
        />
      </label>
      {none ? (
        <label
          className={`flex h-9 cursor-pointer items-center rounded-control border px-2 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
            value === undefined
              ? "border-action bg-selected"
              : "border-transparent hover:bg-selected"
          }`}
        >
          <input
            type="radio"
            name={`${id}-column`}
            checked={value === undefined}
            onChange={() => onPick(undefined, undefined)}
            className="sr-only"
          />
          {none}
        </label>
      ) : null}
      {list("Good for grouping", good)}
      {list("Other columns", other)}
      {found.length === 0 ? (
        <p className="m-0 text-body-sm text-ink-muted">No column is called that.</p>
      ) : null}
      <p className="m-0 text-meta text-ink-muted">
        Columns with few values come first. A date adds a “by week / month” choice.
      </p>
      {chosen && TEMPORAL.has(chosen.column.type) && onBucket ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="m-0 text-body-sm text-ink-muted">Group {label.toLowerCase()} dates by</p>
          <SegmentedControl
            label="Group dates by"
            options={CUTS}
            value={bucket ?? "week"}
            onChange={onBucket}
          />
          {children}
        </div>
      ) : null}
    </div>
  );
}
