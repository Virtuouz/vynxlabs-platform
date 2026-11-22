import { Button, DateField, Popover } from "@volvel/ui";
import { ChevronDown, ListFilter, Search, X } from "@volvel/ui/icons";
import type { Choice, FilterHost, WidgetViewProps } from "@volvel/widgets";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  type DateRange,
  isRelative,
  RANGE_LABELS,
  type RelativeRange,
  relativeRange,
  valueFor,
} from "./filterValues.ts";

/** How long typing rests before it is read as a value to filter by. */
export const TYPING_PAUSE = 300;

/** A page filter, as Search and filter's configuration declares it (the manifest checks it). */
export interface FilterSpec {
  name: string;
  label?: string;
  type: "date_range" | "choice" | "text" | "number" | "search";
  default?: unknown;
  choices?: string[];
  from?: { table: string; column: string };
}

interface FilterConfig {
  filters: FilterSpec[];
  reset?: boolean;
  /** Where the filters sit: in a row (the default), or behind a "Filters \u00b7 n" button. */
  sit?: "row" | "button";
}

const ALL = "all";
const CUSTOM = "custom";
const isRange = (value: unknown): value is DateRange =>
  typeof value === "object" && value !== null && "from" in value && "to" in value;

// A control is the width of its cell on a phone, and its own width where there is room.
const FIELD = "min-w-0 flex-[1_1_9rem] @md/cell:flex-none";
/** The one bordered bar the search and the filters sit in, side by side, wrapping where there is no room. */
const BAR = "flex flex-wrap items-center gap-2 rounded-panel border border-line bg-surface p-2.5";
const SEARCH_FIELD = "min-w-0 flex-[1_1_100%] @md/cell:flex-[1_1_14rem]";

/** The one box a compact control is drawn in: its label, or a magnifier, inside the edge. */
const BOX =
  "relative flex h-[34px] w-full min-w-0 items-center gap-2 rounded-control border border-line-control bg-sunken px-2.5 text-body-sm focus-within:outline-2 focus-within:outline-action";

/**
 * A select with its label inside the box ("Clinic  All"), as the filter bar draws every choice. The
 * label names the select for a screen reader; the words in the box are the same, shown.
 */
function CompactSelect({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={`${BOX} pr-7 @md/cell:min-w-40`}>
      <span aria-hidden="true" className="shrink-0 text-ink-muted">
        {label}
      </span>
      <select
        name={name}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        size={14}
        className="pointer-events-none absolute right-2 text-ink-muted"
      />
    </label>
  );
}

interface Control {
  filter: FilterSpec;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

function DateRangeControl({ filter, label, value, onChange }: Control) {
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
    <div className="flex min-w-0 flex-[1_1_9rem] flex-wrap items-center gap-2 @md/cell:flex-none">
      <div
        className={`min-w-0 flex-1 @md/cell:flex-none ${mode === CUSTOM ? "basis-full @md/cell:basis-auto" : ""}`}
      >
        <CompactSelect
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
              const start = range ?? relativeRange((named ?? "last_30_days") as RelativeRange);
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
          <div className="min-w-36 flex-1 @md/cell:w-44 @md/cell:flex-none">
            <DateField
              name={`filter-${filter.name}-from`}
              label="From"
              value={days?.from ?? ""}
              error={problem}
              onChange={(from) => set({ from, to: days?.to ?? "" })}
            />
          </div>
          <div className="min-w-36 flex-1 @md/cell:w-44 @md/cell:flex-none">
            <DateField
              name={`filter-${filter.name}-to`}
              label="To"
              value={days?.to ?? ""}
              onChange={(to) => set({ from: days?.from ?? "", to })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Whether the focus is in something that takes typing: `/` is then the letter. */
const inField = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Typed text, handed on a moment after the typing rests, or at once on Enter. A search box
 * is the same with a clear button, Esc to clear, and `/` to reach the first one on the page.
 */
function TypedControl({ filter, label, value, onChange }: Control) {
  const search = filter.type === "search";
  const shown = value === null || value === undefined ? "" : String(value);
  const [typed, setTyped] = useState(shown);
  const handing = useRef(onChange);
  handing.current = onChange;
  const box = useRef<HTMLDivElement>(null);
  // A value that comes in from outside, such as Clear, replaces what was typed.
  useEffect(() => setTyped(shown), [shown]);
  const numeric = filter.type === "number";
  // With nothing typed a search goes back to how it starts, a text filter says "no narrowing".
  const empty = filter.default === undefined && search ? undefined : null;
  const hand = useCallback(
    (text: string) => {
      const number = Number(text);
      if (text.trim() === "") handing.current(empty);
      else if (numeric) handing.current(Number.isFinite(number) ? number : null);
      else handing.current(text);
    },
    [numeric, empty],
  );
  useEffect(() => {
    if (typed === shown) return;
    const wait = setTimeout(() => hand(typed), TYPING_PAUSE);
    return () => clearTimeout(wait);
  }, [typed, shown, hand]);
  // `/` reaches the first search box on the page, as it does a list's search box in the console.
  useEffect(() => {
    if (!search) return;
    const on = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || inField(event.target)) return;
      const mine = box.current?.querySelector("input");
      if (!mine || document.querySelector("input[data-search]") !== mine) return;
      event.preventDefault();
      mine.focus();
      mine.select();
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [search]);
  const clear = () => {
    setTyped("");
    hand("");
    box.current?.querySelector("input")?.focus();
  };
  return (
    <form
      className={search ? SEARCH_FIELD : FIELD}
      onSubmit={(event) => {
        event.preventDefault();
        hand(typed);
      }}
    >
      <div ref={box} className={BOX}>
        {search ? (
          <Search aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
        ) : (
          <span aria-hidden="true" className="shrink-0 text-ink-muted">
            {label}
          </span>
        )}
        <input
          name={`filter-${filter.name}`}
          aria-label={label}
          type={numeric ? "number" : "text"}
          value={typed}
          onChange={(event) => setTyped(event.currentTarget.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted/70"
          {...(search
            ? {
                placeholder: label,
                autoComplete: "off",
                "data-search": "",
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === "Escape" && typed !== "") {
                    // The first Esc clears; the one after it is the page's.
                    event.stopPropagation();
                    setTyped("");
                    hand("");
                  }
                },
              }
            : {})}
        />
        {search && typed !== "" ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={clear}
            className="-mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-inner text-ink-muted hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-action"
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** What a choice with `from` offers, read through the host. `undefined` until it is read, or when it can't be. */
function useOffered(filter: FilterSpec, host: FilterHost | undefined) {
  const [read, setRead] = useState<readonly Choice[]>();
  const ask = useRef(host?.options);
  ask.current = host?.options;
  const wanted = filter.type === "choice" && filter.from !== undefined && !filter.choices;
  const where = filter.from ? `${filter.from.table}.${filter.from.column}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked again only when the filter or its column changes
  useEffect(() => {
    if (!wanted || !ask.current) return;
    let live = true;
    ask.current(filter.name, "").then(
      (found) => live && setRead(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [wanted, filter.name, where]);
  return filter.choices
    ? filter.choices.map((one) => ({ value: one, label: one }))
    : wanted
      ? read
      : undefined;
}

function ChoiceControl({
  filter,
  label,
  value,
  onChange,
  host,
}: Control & { host: FilterHost | undefined }) {
  const offered = useOffered(filter, host);
  // Nothing to list, such as a table's values that were not read: typed text takes its place.
  if (!offered)
    return <TypedControl filter={filter} label={label} value={value} onChange={onChange} />;
  const current = typeof value === "string" ? value : "";
  return (
    <div className={FIELD}>
      <CompactSelect
        name={`filter-${filter.name}`}
        label={label}
        value={current}
        options={[
          { value: "", label: "Any" },
          ...offered,
          // A value set before the list arrived, or that nothing holds any more, stays chosen.
          ...(current && !offered.some((one) => one.value === current)
            ? [{ value: current, label: current }]
            : []),
        ]}
        onChange={(next) => onChange(next === "" ? null : next)}
      />
    </div>
  );
}

/** How a value is compared with how it starts: nothing, `null` and no words are the same. */
const norm = (value: unknown) => JSON.stringify(value === undefined || value === "" ? null : value);

/**
 * Search and filter: the page's filters as one bar that wraps, drawn where the widget sits
 * and with no card. The values are the page's: the host keeps them (and, served, in the
 * address), and every widget they narrow reads again when one is set.
 */
export function FilterView({ config, filters: host }: WidgetViewProps<FilterConfig>) {
  const values = host?.values ?? {};
  const differs = config.filters.some(
    (filter) => norm(valueFor(filter, values)) !== norm(filter.default),
  );
  if (config.filters.length === 0) return null;
  const draw = (list: readonly FilterSpec[]) =>
    list.map((filter) => {
      const control: Control = {
        filter,
        label: filter.label ?? filter.name,
        value: valueFor(filter, values),
        onChange: (next) => host?.set(filter.name, next),
      };
      return filter.type === "date_range" ? (
        <DateRangeControl key={filter.name} {...control} />
      ) : filter.type === "choice" ? (
        <ChoiceControl key={filter.name} {...control} host={host} />
      ) : (
        <TypedControl key={filter.name} {...control} />
      );
    });
  const clear =
    config.reset && differs ? (
      <Button variant="quiet" onClick={() => host?.reset()}>
        Clear
      </Button>
    ) : null;
  if (config.sit === "button") {
    return (
      <FiltersBehindButton
        search={draw(config.filters.filter((filter) => filter.type === "search"))}
        others={config.filters.filter((filter) => filter.type !== "search")}
        values={values}
        clear={clear}
      >
        {draw(config.filters.filter((filter) => filter.type !== "search"))}
      </FiltersBehindButton>
    );
  }
  return (
    <search aria-label="Filters" className={BAR}>
      {draw(config.filters)}
      {clear}
    </search>
  );
}

/**
 * `sit: "button"`: the search box stays in the row; every other filter is in a popover behind
 * a "Filters \u00b7 n" button, n being how many of them are set.
 */
function FiltersBehindButton({
  search,
  others,
  values,
  clear,
  children,
}: {
  search: ReactNode;
  others: readonly FilterSpec[];
  values: Readonly<Record<string, unknown>>;
  clear: ReactNode;
  children: ReactNode;
}) {
  const set = others.filter((filter) => norm(valueFor(filter, values)) !== norm(null)).length;
  return (
    <search aria-label="Filters" className={BAR}>
      {/* The search and its button share the row, the search taking what the button leaves, wherever it is narrow. */}
      <div className="flex min-w-0 flex-[1_1_8rem] @md/cell:flex-[1_1_14rem]">{search}</div>
      {others.length > 0 ? (
        <Popover
          title="Filters"
          align="start"
          trigger={
            <Button variant="secondary" data-filters-button="">
              <ListFilter aria-hidden="true" size={16} />
              {set > 0 ? `Filters \u00b7 ${set}` : "Filters"}
            </Button>
          }
        >
          <div className="flex w-72 max-w-full flex-col gap-3">
            {children}
            {clear}
          </div>
        </Popover>
      ) : (
        clear
      )}
    </search>
  );
}
