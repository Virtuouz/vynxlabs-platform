import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { DateInput } from "../DateInput.tsx";
import { SegmentedControl } from "../Pickers.tsx";
import { DashedAdd, type DrawerIcon } from "./Drawer.tsx";

const control =
  "h-9 min-w-0 rounded-control border border-line-control bg-surface px-2 text-body-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

// ---------------------------------------------------------------------------
// Conditions

/** A condition as the manifest's `Condition` has it: `{ field, test, value }`. */
export interface ConditionValue {
  field: string;
  test: string;
  value?: unknown;
}

export interface ConditionColumn {
  id: string;
  label: string;
  /** "choice", "text", "number", "date", "boolean": what words and values it takes. */
  type: string;
  icon?: DrawerIcon;
}

export interface ConditionOperator {
  test: string;
  /** The column's own words: "is in the last…", "is before". */
  label: string;
  /** What is typed after it. Default: by the column's type; `none` for "is empty". */
  input?: "text" | "number" | "date" | "none" | "last" | "between";
}

export interface ConditionChoice {
  value: string;
  label?: string;
  /** How many rows have it: "1,204 rows". */
  count?: number;
}

const UNITS = ["day", "week", "month", "quarter", "year"] as const;

const inputOf = (column: ConditionColumn | undefined, operator: ConditionOperator | undefined) =>
  operator?.input ??
  (column?.type === "number" ? "number" : column?.type === "date" ? "date" : "text");

const selected = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String)
    : value === undefined || value === ""
      ? []
      : [String(value)];

/**
 * The body of the condition editor: a field with its type's icon, the operators written in that
 * type's words, and, for a choice column, its values as a checked list with how many rows each
 * has. Nothing is typed that could be mistyped. It writes `{ field, test, value }`; several
 * values chosen are an array ("any of"), one is itself. Put it in a `DrawerEditor`.
 */
export function ConditionEditor({
  columns,
  operators,
  choices,
  value,
  onChange,
  note,
}: {
  columns: readonly ConditionColumn[];
  /** The operator words for a column type. */
  operators: (type: string) => readonly ConditionOperator[];
  /** The values of a choice column, with their row counts. */
  choices?: (field: string) => readonly ConditionChoice[] | undefined;
  value: ConditionValue | undefined;
  onChange: (next: ConditionValue) => void;
  /** Under the list: "Status is a choice column, so you pick from its values". */
  note?: string;
}) {
  const id = useId();
  // What is typed after the words is kept in view: the list of words is long, the editor scrolls.
  const valueArea = useRef<HTMLDivElement>(null);
  const chosenTest = value?.test;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the chosen test is what moves the view
  useEffect(() => {
    valueArea.current?.scrollIntoView?.({ block: "nearest" });
  }, [chosenTest]);
  const column = columns.find((one) => one.id === value?.field) ?? columns[0];
  if (!column) return null;
  const words = operators(column.type);
  const operator = words.find((one) => one.test === value?.test) ?? words[0];
  const options = choices?.(column.id);
  const asChoice = column.type === "choice" && options !== undefined;
  const Icon = column.icon;
  const current: ConditionValue = {
    field: column.id,
    test: operator?.test ?? "is",
    ...(value?.value === undefined ? {} : { value: value.value }),
  };
  const picked = selected(current.value);
  const input = inputOf(column, operator);

  const chooseField = (field: string) => {
    const next = columns.find((one) => one.id === field);
    const first = next ? operators(next.type)[0] : undefined;
    onChange({ field, test: first?.test ?? "is" });
  };
  const chooseOperator = (test: string) => {
    const next = words.find((one) => one.test === test);
    const { value: _, ...rest } = current;
    onChange(
      inputOf(column, next) === "none" || inputOf(column, next) !== input
        ? { ...rest, test }
        : { ...current, test },
    );
  };
  const toggle = (choice: string, on: boolean) => {
    const next = on ? [...picked, choice] : picked.filter((one) => one !== choice);
    const { value: _, ...rest } = current;
    onChange(next.length === 0 ? rest : { ...rest, value: next.length === 1 ? next[0] : next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <label htmlFor={`${id}-field`} className="sr-only">
            Field
          </label>
          {Icon ? (
            <Icon
              size={14}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-muted"
            />
          ) : null}
          <select
            id={`${id}-field`}
            value={column.id}
            onChange={(event) => chooseField(event.target.value)}
            className={`${control} w-full ${Icon ? "pl-8" : ""}`}
          >
            {columns.map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </select>
        </div>
        {asChoice ? (
          <div>
            <label htmlFor={`${id}-test`} className="sr-only">
              Test
            </label>
            <select
              id={`${id}-test`}
              value={operator?.test}
              onChange={(event) => chooseOperator(event.target.value)}
              className={`${control} w-full`}
            >
              {words.map((one) => (
                <option key={one.test} value={one.test}>
                  {one.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {asChoice ? (
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1.5 text-body-sm text-ink-muted">Any of</legend>
          <div className="divide-y divide-line rounded-control border border-line">
            {options.map((choice) => (
              <label
                key={choice.value}
                className="flex min-h-9 cursor-pointer items-center gap-3 px-3 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(choice.value)}
                  onChange={(event) => toggle(choice.value, event.target.checked)}
                  className="size-4 accent-[var(--vx-action)]"
                />
                <span className="flex-1">{choice.label ?? choice.value}</span>
                {choice.count !== undefined ? (
                  <span className="font-mono text-meta text-ink-muted tabular-nums">
                    {choice.count.toLocaleString("en-US")} {choice.count === 1 ? "row" : "rows"}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
            <legend className="mb-1.5 text-body-sm text-ink-muted">
              The words change with the column. {column.label} gets its own.
            </legend>
            {words.map((one) => {
              const on = one.test === operator?.test;
              return (
                <label
                  key={one.test}
                  className={`flex h-8 cursor-pointer items-center rounded-inner px-3 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                    on ? "bg-selected text-ink" : "text-ink-muted hover:bg-selected"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-test`}
                    checked={on}
                    onChange={() => chooseOperator(one.test)}
                    className="sr-only"
                  />
                  {one.label}
                </label>
              );
            })}
          </fieldset>
          <div ref={valueArea}>
            {input === "last" ? (
              <LastInput
                id={id}
                value={current.value}
                onChange={(next) => {
                  const { value: _, ...rest } = current;
                  onChange(next === undefined ? rest : { ...rest, value: next });
                }}
              />
            ) : input === "between" ? (
              <BetweenInput
                id={id}
                kind={column.type === "date" ? "date" : "number"}
                value={current.value}
                onChange={(next) => {
                  const { value: _, ...rest } = current;
                  onChange(next === undefined ? rest : { ...rest, value: next });
                }}
              />
            ) : input !== "none" ? (
              <div>
                <label htmlFor={`${id}-value`} className="sr-only">
                  Value
                </label>
                {input === "date" ? (
                  <DateInput
                    id={`${id}-value`}
                    compact
                    value={current.value === undefined ? "" : String(current.value)}
                    onChange={(text) => {
                      const { value: _, ...rest } = current;
                      onChange(text === "" ? rest : { ...rest, value: text });
                    }}
                  />
                ) : (
                  <input
                    id={`${id}-value`}
                    type={input}
                    value={current.value === undefined ? "" : String(current.value)}
                    onChange={(event) => {
                      const text = event.target.value;
                      const { value: _, ...rest } = current;
                      onChange(
                        text === ""
                          ? rest
                          : { ...rest, value: input === "number" ? Number(text) : text },
                      );
                    }}
                    className={`${control} w-full`}
                  />
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
      {note ? <p className="m-0 text-meta text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** "is in the last  [30]  [days]": a count and a unit, as `{ count, unit }`. */
function LastInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (next: { count: number; unit: string } | undefined) => void;
}) {
  const now = (value ?? {}) as { count?: number; unit?: string };
  const unit = now.unit ?? "day";
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor={`${id}-count`} className="sr-only">
          How many
        </label>
        <input
          id={`${id}-count`}
          type="number"
          min={1}
          max={1000}
          value={now.count === undefined ? "" : String(now.count)}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? undefined : { count: Number(event.target.value), unit },
            )
          }
          className={`${control} w-full`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-unit`} className="sr-only">
          Unit
        </label>
        <select
          id={`${id}-unit`}
          value={unit}
          onChange={(event) => onChange({ count: now.count ?? 30, unit: event.target.value })}
          className={`${control} w-full`}
        >
          {UNITS.map((one) => (
            <option key={one} value={one}>
              {now.count === 1 ? one : `${one}s`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** "is between  [from]  and  [to]": two days or two numbers, as `[from, to]`. */
function BetweenInput({
  id,
  kind,
  value,
  onChange,
}: {
  id: string;
  kind: "date" | "number";
  value: unknown;
  onChange: (next: [unknown, unknown] | undefined) => void;
}) {
  const pair = Array.isArray(value) ? value : [];
  const set = (at: 0 | 1, text: string) => {
    const next: [unknown, unknown] = [pair[0] ?? "", pair[1] ?? ""];
    next[at] = text === "" ? "" : kind === "number" ? Number(text) : text;
    onChange(next[0] === "" && next[1] === "" ? undefined : next);
  };
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div>
        <label htmlFor={`${id}-from`} className="sr-only">
          From
        </label>
        {kind === "date" ? (
          <DateInput
            id={`${id}-from`}
            compact
            value={pair[0] === undefined ? "" : String(pair[0])}
            onChange={(text) => set(0, text)}
          />
        ) : (
          <input
            id={`${id}-from`}
            type={kind}
            value={pair[0] === undefined ? "" : String(pair[0])}
            onChange={(event) => set(0, event.target.value)}
            className={`${control} w-full`}
          />
        )}
      </div>
      <span className="text-body-sm text-ink-muted">and</span>
      <div>
        <label htmlFor={`${id}-to`} className="sr-only">
          To
        </label>
        {kind === "date" ? (
          <DateInput
            id={`${id}-to`}
            compact
            value={pair[1] === undefined ? "" : String(pair[1])}
            onChange={(text) => set(1, text)}
          />
        ) : (
          <input
            id={`${id}-to`}
            type={kind}
            value={pair[1] === undefined ? "" : String(pair[1])}
            onChange={(event) => set(1, event.target.value)}
            className={`${control} w-full`}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sorting

export interface SortKey {
  field: string;
  direction: "asc" | "desc";
}

export interface SortField {
  id: string;
  label: string;
  icon?: DrawerIcon;
  /** The two words for its direction: dates "Newest" / "Oldest", names "A to Z" / "Z to A". */
  words?: { desc: string; asc: string };
}

const DEFAULT_WORDS = { desc: "Newest", asc: "Oldest" };

/**
 * The body of the sort editor: a field and its direction in the column's words, "+ Then by",
 * and "Show at most". Put it in a `DrawerEditor` titled "Sorted by".
 */
export function SortEditor({
  fields,
  sorts,
  onChange,
  limit,
  limitOptions,
  onLimit,
}: {
  fields: readonly SortField[];
  sorts: readonly SortKey[];
  onChange: (next: SortKey[]) => void;
  limit?: number | undefined;
  /** What "Show at most" offers; `value` undefined is "All rows". */
  limitOptions?: readonly { value: number | undefined; label: string }[];
  onLimit?: (next: number | undefined) => void;
}) {
  const id = useId();
  const unused = fields.filter((field) => !sorts.some((sort) => sort.field === field.id));
  const put = (at: number, next: SortKey) =>
    onChange(sorts.map((one, i) => (i === at ? next : one)));
  return (
    <div className="flex flex-col gap-3">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {sorts.map((sort, at) => {
          const field = fields.find((one) => one.id === sort.field);
          const words = field?.words ?? DEFAULT_WORDS;
          const Icon = field?.icon;
          return (
            <li key={sort.field} className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <label htmlFor={`${id}-${at}`} className="sr-only">
                  {at === 0 ? "Sort by" : "Then by"}
                </label>
                {Icon ? (
                  <Icon
                    size={14}
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-muted"
                  />
                ) : null}
                <select
                  id={`${id}-${at}`}
                  value={sort.field}
                  onChange={(event) => put(at, { ...sort, field: event.target.value })}
                  className={`${control} w-full ${Icon ? "pl-8" : ""}`}
                >
                  {fields
                    .filter((one) => one.id === sort.field || unused.includes(one))
                    .map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.label}
                      </option>
                    ))}
                </select>
              </div>
              <SegmentedControl
                label={`Direction of ${field?.label ?? "sort"}`}
                size="small"
                value={sort.direction}
                onChange={(direction) => put(at, { ...sort, direction })}
                options={[
                  { value: "desc", label: words.desc },
                  { value: "asc", label: words.asc },
                ]}
              />
              {sorts.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove sort by ${field?.label ?? sort.field}`}
                  onClick={() => onChange(sorts.filter((_, i) => i !== at))}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-inner text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <X aria-hidden="true" size={14} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {unused[0] ? (
        <DashedAdd
          onClick={() =>
            onChange([...sorts, { field: (unused[0] as SortField).id, direction: "desc" }])
          }
        >
          Then by
        </DashedAdd>
      ) : null}
      {limitOptions && onLimit ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <label htmlFor={`${id}-limit`} className="text-body-sm text-ink-muted">
            Show at most
          </label>
          <select
            id={`${id}-limit`}
            value={limit === undefined ? "" : String(limit)}
            onChange={(event) =>
              onLimit(event.target.value === "" ? undefined : Number(event.target.value))
            }
            className={`${control} w-40`}
          >
            {limitOptions.map((one) => (
              <option
                key={one.value ?? "all"}
                value={one.value === undefined ? "" : String(one.value)}
              >
                {one.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
