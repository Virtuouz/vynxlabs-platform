import type { PageFilter } from "@volvel/manifest";
import { Button, SelectField, TextField } from "@volvel/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  changed,
  type DateRange,
  isRelative,
  RANGE_LABELS,
  relativeRange,
  valueFor,
} from "./filters.ts";
import type { FilterValues } from "./types.ts";

/** How long typing rests before it is read as a value to filter by. */
export const TYPING_PAUSE = 300;

const ALL = "all";
const CUSTOM = "custom";
const isRange = (value: unknown): value is DateRange =>
  typeof value === "object" && value !== null && "from" in value && "to" in value;

function DateRangeControl({
  filter,
  label,
  value,
  onChange,
}: {
  filter: PageFilter;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const range = isRange(value) ? value : undefined;
  const named = isRelative(value) ? value : undefined;
  // Two days that are not yet a range: the second is still to be set, or is before the first.
  const [draft, setDraft] = useState<{ from: string; to: string }>();
  const days = draft ?? (range ? { from: range.from, to: range.to } : undefined);
  const mode = days ? CUSTOM : value === null ? ALL : (named ?? ALL);
  const problem =
    days?.from && days.to && days.from > days.to ? "The start is after the end." : undefined;
  const set = (next: { from: string; to: string }) => {
    setDraft(next);
    if (next.from && next.to && next.from <= next.to) {
      setDraft(undefined);
      onChange({ from: next.from, to: next.to });
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-44">
        <SelectField
          name={`filter-${filter.name}`}
          label={label}
          value={mode}
          options={[
            { value: ALL, label: "All time" },
            ...Object.entries(RANGE_LABELS).map(([name, words]) => ({ value: name, label: words })),
            { value: CUSTOM, label: "Between two dates" },
          ]}
          onChange={(next) => {
            if (next === CUSTOM) {
              // From the range it was showing, or the last thirty days.
              const start = range ?? relativeRange(named ?? "last_30_days");
              setDraft(undefined);
              onChange({ from: start.from, to: start.to });
            } else {
              setDraft(undefined);
              onChange(next === ALL ? null : next);
            }
          }}
        />
      </div>
      {mode === CUSTOM ? (
        <>
          <div className="w-40">
            <TextField
              name={`filter-${filter.name}-from`}
              label="From"
              type="date"
              value={days?.from ?? ""}
              error={problem}
              onChange={(from) => set({ from, to: days?.to ?? "" })}
            />
          </div>
          <div className="w-40">
            <TextField
              name={`filter-${filter.name}-to`}
              label="To"
              type="date"
              value={days?.to ?? ""}
              onChange={(to) => set({ from: days?.from ?? "", to })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Typed text, handed on a moment after the typing rests, or at once on Enter. */
function TypedControl({
  filter,
  label,
  value,
  onChange,
}: {
  filter: PageFilter;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const shown = value === null || value === undefined ? "" : String(value);
  const [typed, setTyped] = useState(shown);
  const handing = useRef(onChange);
  handing.current = onChange;
  // A value that comes in from outside, such as Reset, replaces what was typed.
  useEffect(() => setTyped(shown), [shown]);
  const numeric = filter.type === "number";
  const hand = useCallback(
    (text: string) => {
      const number = Number(text);
      if (text.trim() === "") handing.current(null);
      else if (numeric) handing.current(Number.isFinite(number) ? number : null);
      else handing.current(text);
    },
    [numeric],
  );
  useEffect(() => {
    if (typed === shown) return;
    const wait = setTimeout(() => hand(typed), TYPING_PAUSE);
    return () => clearTimeout(wait);
  }, [typed, shown, hand]);
  return (
    <form
      className="w-44"
      onSubmit={(event) => {
        event.preventDefault();
        hand(typed);
      }}
    >
      <TextField
        name={`filter-${filter.name}`}
        label={label}
        {...(filter.type === "number" ? { type: "number" as const } : {})}
        value={typed}
        onChange={setTyped}
      />
    </form>
  );
}

function ChoiceControl({
  filter,
  label,
  value,
  options,
  onChange,
}: {
  filter: PageFilter;
  label: string;
  value: unknown;
  options: readonly string[] | undefined;
  onChange: (value: unknown) => void;
}) {
  const offered = filter.choices ?? options;
  // Nothing to list, such as a table's values that were not read: typed text takes its place.
  if (!offered)
    return <TypedControl filter={filter} label={label} value={value} onChange={onChange} />;
  const current = typeof value === "string" ? value : "";
  return (
    <div className="w-44">
      <SelectField
        name={`filter-${filter.name}`}
        label={label}
        value={current}
        options={[
          { value: "", label: "Any" },
          ...offered.map((one) => ({ value: one, label: one })),
          // A value set before the list arrived, or that nothing holds any more, stays chosen.
          ...(current && !offered.includes(current) ? [{ value: current, label: current }] : []),
        ]}
        onChange={(next) => onChange(next === "" ? null : next)}
      />
    </div>
  );
}

export interface FilterBarProps {
  filters: readonly PageFilter[];
  /** What was set, by filter name. A filter that is absent is at its default. */
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  /** For a choice that lists a table's column: what the page read for it, by filter name. */
  options?: Readonly<Record<string, readonly string[]>> | undefined;
}

/** A page's filters, set by whoever reads it: a range of dates, a choice, some text or a number. */
export function FilterBar({ filters, values, onChange, options }: FilterBarProps) {
  if (filters.length === 0) return null;
  const set = (name: string, value: unknown) => onChange({ ...values, [name]: value });
  return (
    <search aria-label="Filters" className="flex flex-wrap items-end gap-4">
      {filters.map((filter) => {
        const label = filter.label ?? filter.name;
        const value = valueFor(filter, values);
        const change = (next: unknown) => set(filter.name, next);
        return filter.type === "date_range" ? (
          <DateRangeControl
            key={filter.name}
            filter={filter}
            label={label}
            value={value}
            onChange={change}
          />
        ) : filter.type === "choice" ? (
          <ChoiceControl
            key={filter.name}
            filter={filter}
            label={label}
            value={value}
            options={options?.[filter.name]}
            onChange={change}
          />
        ) : (
          <TypedControl
            key={filter.name}
            filter={filter}
            label={label}
            value={value}
            onChange={change}
          />
        );
      })}
      {changed(values) ? (
        <Button variant="quiet" onClick={() => onChange({})}>
          Reset
        </Button>
      ) : null}
    </search>
  );
}
