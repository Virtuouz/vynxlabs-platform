/**
 * The controls that draw a widget's data input from its definition's
 * `dataHints`: where it reads from, what it works out, what it is broken
 * down by, which rows it takes, how they are sorted and how many.
 *
 * Each writes one part of the input's visual query (`@volvel/manifest`,
 * `VisualQuery`). A saved query or SQL decides its own columns, so only the
 * source is drawn for those.
 */
import {
  type DataInput,
  type FilterBinding,
  groupName,
  type PageFilter,
  VISUAL_OPERATORS,
  type VisualCondition,
  type VisualFunction,
  type VisualOperator,
  type VisualQuery,
} from "@volvel/manifest";
import {
  Button,
  ComboboxField,
  Details,
  MultiSelectField,
  NumberField,
  SelectField,
  TextField,
} from "@volvel/ui";
import {
  BREAKDOWN_CADENCES,
  CADENCE_WORDS,
  MEASURE_FUNCTIONS,
  MEASURE_WORDS,
} from "@volvel/widgets";
import { Plus, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Loading } from "../LoadState.tsx";
import type { Env } from "./controls.tsx";
import type { DataPart } from "./model.ts";
import {
  bindFilter,
  defaultInputs,
  filterColumn,
  heading,
  MAX_SEARCH_COLUMNS,
  measureName,
  renamedResult,
  resultNames,
  searchColumns,
  sourcesOf,
  tidyVisual,
  visualOf,
  withInput,
  withSystemColumns,
} from "./model.ts";

const CodeEditor = lazy(() =>
  import("../../editor/CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })),
);

const TEMPORAL = new Set(["date", "timestamp"]);
const NUMERIC = new Set(["integer", "number"]);

/** What a condition's test is called in a sentence. */
export const TEST_WORDS: Record<VisualOperator, string> = {
  eq: "is",
  ne: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  in: "is one of",
  contains: "contains",
  is_null: "is empty",
  not_null: "is not empty",
  last: "is in the last",
  between: "is between",
};

/** What was typed for a value, as a query takes it: a number where it reads as one, a list for "is one of". */
export function typedValue(op: string, text: string): unknown {
  if (op === "in") {
    return text
      .split(",")
      .map((one) => one.trim())
      .filter(Boolean);
  }
  const trimmed = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return text;
}
const shownValue = (value: unknown) =>
  Array.isArray(value)
    ? value.join(", ")
    : value === undefined || value === null
      ? ""
      : String(value);

type Kind = "table" | "query" | "sql";
const kindOf = (input: DataInput | undefined): Kind | undefined =>
  !input
    ? undefined
    : "visual" in input.source
      ? "table"
      : "query" in input.source
        ? "query"
        : "sql";

/** One data control of one input. */
export function DataControl({
  env,
  input,
  control,
  label,
  help,
}: {
  env: Env;
  input: string;
  control: DataPart["control"];
  label: string;
  help?: string | undefined;
}) {
  const data = env.widget.data?.[input];
  const visual = visualOf(data);
  if (control === "source")
    return <SourceControl env={env} input={input} label={label} help={help} />;
  // A saved query or SQL decides its own columns. Until something is chosen there is nothing to set.
  if (!visual) return null;
  const columns = withSystemColumns(
    env.catalog.tables.find((one) => one.name === visual.table)?.columns ?? [],
  );
  const write = (next: VisualQuery, words: string, key?: string) =>
    env.write(
      withInput(env.widget, input, {
        ...(data as DataInput),
        source: { visual: tidyVisual(next) },
      }),
      words,
      key,
    );
  const props = { env, input, visual, columns, label, help, write };
  switch (control) {
    case "measure":
      return <MeasureControl {...props} />;
    case "breakdown":
      return <BreakdownControl {...props} />;
    case "conditions":
      return <ConditionsControl {...props} />;
    case "sort":
      return <SortControl {...props} />;
    case "limit":
      return <LimitControl {...props} />;
    default:
      return null;
  }
}

interface PartProps {
  env: Env;
  input: string;
  visual: VisualQuery;
  columns: { name: string; type: string }[];
  label: string;
  help: string | undefined;
  write: (next: VisualQuery, words: string, key?: string) => void;
}

const group = (label: string, help: string | undefined, children: React.ReactNode) => (
  <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
    <legend className="p-0 text-body-sm font-medium text-ink">{label}</legend>
    {children}
    {help ? <p className="m-0 text-body-sm text-ink-muted">{help}</p> : null}
  </fieldset>
);

/** A name a result had is the name it has now: in the visual's own sort, and in the widget's configuration. */
function renameIn(env: Env, input: string, visual: VisualQuery, from: string, to: string) {
  if (from === to) return { visual, widget: env.widget };
  return {
    visual: {
      ...visual,
      ...(visual.sort
        ? { sort: visual.sort.map((one) => (one.by === from ? { ...one, by: to } : one)) }
        : {}),
    },
    widget: renamedResult(env.definition, env.widget, input, from, to),
  };
}

// ---------------------------------------------------------------------------
// Source

function SourceControl({
  env,
  input,
  label,
  help,
}: {
  env: Env;
  input: string;
  label: string;
  help: string | undefined;
}) {
  const declared = env.definition.data[input];
  const data = env.widget.data?.[input];
  const current = kindOf(data);
  const offered = sourcesOf(declared, env.surface).filter(
    (kind) => kind !== "sql" || env.catalog.maySql || current === "sql",
  );
  // SQL is chosen before any is written: the editor shows, and the input is made when there is text.
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    if (current && current !== "sql") setWriting(false);
  }, [current]);
  const showSql = current === "sql" || writing;
  const { catalog } = env;
  const visual = visualOf(data);
  const key = `source:${env.widget.id}:${input}`;

  /** A table chosen starts the input over for that table, following the filters whose column it has. */
  const choose = (table: string) => {
    const start = defaultInputs(env.definition, table, catalog)[input] ?? {
      source: { visual: { table } },
    };
    let widget = withInput(env.widget, input, start);
    for (const filter of env.filters) widget = bindFilter(widget, filter, catalog, env.neighbours);
    env.write(widget, "choosing a table", key);
  };
  const options = [
    ...(offered.includes("table")
      ? catalog.tables.map((one) => ({ value: `table:${one.name}`, label: heading(one.name) }))
      : []),
    ...(offered.includes("query")
      ? catalog.queries.map((one) => ({
          value: `query:${one.path}`,
          label: `Query: ${one.path}`,
          ...(one.description ? { hint: one.description } : {}),
        }))
      : []),
    ...(offered.includes("sql") ? [{ value: "sql:", label: "SQL written here" }] : []),
  ];
  const value = showSql
    ? "sql:"
    : data && "visual" in data.source && data.source.visual.table
      ? `table:${data.source.visual.table}`
      : data && "query" in data.source
        ? `query:${data.source.query}`
        : undefined;

  return (
    <div className="flex flex-col gap-2">
      <ComboboxField
        label={label}
        value={value}
        placeholder="Choose where it reads from"
        empty="Nothing has that name."
        {...(help ? { hint: help } : {})}
        options={options}
        onChange={(next) => {
          if (!next || next === value) return;
          if (next === "sql:") {
            setWriting(true);
            if (current !== "sql")
              env.write(withInput(env.widget, input, undefined), "choosing SQL", key);
          } else if (next.startsWith("query:")) {
            setWriting(false);
            env.write(
              withInput(env.widget, input, { source: { query: next.slice(6) } }),
              "choosing a query",
              key,
            );
          } else {
            setWriting(false);
            choose(next.slice(6));
          }
        }}
      />
      {showSql ? (
        <div className="overflow-hidden rounded-control border border-line">
          <Suspense fallback={<Loading />}>
            <CodeEditor
              label="The widget's query"
              language="sql"
              path={`widgets/${env.widget.id}-${input}.sql`}
              value={data && "sql" in data.source ? data.source.sql : ""}
              height="10rem"
              onChange={(sql) => {
                const values =
                  data && "sql" in data.source && data.source.values
                    ? { values: data.source.values }
                    : {};
                env.write(
                  withInput(
                    env.widget,
                    input,
                    sql.trim() ? { ...(data ?? {}), source: { sql, ...values } } : undefined,
                  ),
                  "writing the query",
                  key,
                );
              }}
            />
          </Suspense>
        </div>
      ) : null}
      {data && !visual ? (
        <p className="m-0 text-body-sm text-ink-muted">It gives its own columns.</p>
      ) : null}
      {data && env.filters.length > 0 ? (
        <FollowFilters
          env={env}
          input={input}
          columns={withSystemColumns(
            catalog.tables.find((one) => one.name === visual?.table)?.columns ?? [],
          )}
        />
      ) : null}
      {data && env.filters.length === 0 && env.addFilters ? (
        <div className="flex flex-col items-start gap-2">
          <p className="m-0 text-body-sm text-ink-muted">
            Add Search and filter to let people narrow this page.
          </p>
          <Button size="small" onClick={env.addFilters}>
            <Plus aria-hidden="true" size={14} /> Add Search and filter
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Which of the page's filters narrow this input, each by its label with a switch, and where
 * each goes: the column a filter narrows, the columns a search looks in, or the parameter of
 * a saved query or SQL it fills.
 */
function FollowFilters({
  env,
  input,
  columns,
}: {
  env: Env;
  input: string;
  columns: { name: string; type?: string }[];
}) {
  const data = env.widget.data?.[input] as DataInput;
  const visual = visualOf(data);
  const bindings = data.filters ?? [];
  const save = (next: FilterBinding[], words: string) => {
    const { filters: _before, ...rest } = data;
    env.write(
      withInput(env.widget, input, next.length > 0 ? { ...rest, filters: next } : rest),
      words,
      `follows:${env.widget.id}:${input}`,
    );
  };
  const follow = (filter: PageFilter): FilterBinding[] => {
    if (visual && filter.type === "search") {
      const looks = searchColumns(env.widget, visual.table, env.catalog);
      const text = columns.filter((one) => one.type === "text").map((one) => one.name);
      return [{ filter: filter.name, columns: looks.length > 0 ? looks : text.slice(0, 1) }];
    }
    if (visual) {
      const column = columns.some((one) => one.name === filterColumn(filter))
        ? filterColumn(filter)
        : (columns[0]?.name ?? "id");
      return [{ filter: filter.name, column }];
    }
    return filter.type === "date_range"
      ? [
          { filter: filter.name, parameter: `${filter.name}_from`, part: "from" },
          { filter: filter.name, parameter: `${filter.name}_to`, part: "to" },
        ]
      : [{ filter: filter.name, parameter: filter.name }];
  };
  // One line, as board 1 draws it, that opens to the switches: a page of five filters would
  // otherwise push Value and Break down by out of sight.
  const followed = env.filters
    .filter((filter) => bindings.some((one) => one.filter === filter.name))
    .map((filter) => filter.label ?? heading(filter.name));
  const summary =
    followed.length === 0
      ? "None"
      : followed.length === env.filters.length
        ? "All of them"
        : followed.join(", ");
  return (
    <Details
      summary={
        <span className="text-body-sm">
          Follows the page filters: <span className="font-normal text-ink-muted">{summary}</span>
        </span>
      }
    >
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="sr-only">Follows the page filters</legend>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {env.filters.map((filter) => {
            const mine = bindings.filter((one) => one.filter === filter.name);
            const on = mine.length > 0;
            const name = filter.label ?? heading(filter.name);
            return (
              <li key={filter.name} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-body-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--vx-action)"
                    checked={on}
                    onChange={(event) =>
                      save(
                        event.currentTarget.checked
                          ? [...bindings, ...follow(filter)]
                          : bindings.filter((one) => one.filter !== filter.name),
                        `changing which filters ${env.widget.title || "the widget"} follows`,
                      )
                    }
                  />
                  {name}
                </label>
                {on && visual && filter.type === "search" ? (
                  <MultiSelectField
                    label={`Columns ${name} looks in`}
                    options={columns
                      .filter((one) => one.type === "text")
                      .map((one) => ({ value: one.name, label: heading(one.name) }))}
                    value={mine[0]?.columns ?? (mine[0]?.column ? [mine[0].column] : [])}
                    placeholder="None"
                    hint={`Up to ${MAX_SEARCH_COLUMNS}. A row is kept when any of them has the words.`}
                    onChange={(next) => {
                      const chosen = next.slice(0, MAX_SEARCH_COLUMNS);
                      // A search that looks nowhere is not following.
                      save(
                        chosen.length === 0
                          ? bindings.filter((one) => one.filter !== filter.name)
                          : bindings.map((one) =>
                              one.filter === filter.name
                                ? { filter: filter.name, columns: chosen }
                                : one,
                            ),
                        "changing the columns a search looks in",
                      );
                    }}
                  />
                ) : null}
                {on && visual && filter.type !== "search" ? (
                  <SelectField
                    name={`${env.widget.id}-${input}-bind-${filter.name}`}
                    label={`Column that ${name} narrows`}
                    value={mine[0]?.column ?? ""}
                    options={columns.map((column) => ({
                      value: column.name,
                      label: heading(column.name),
                    }))}
                    onChange={(column) =>
                      save(
                        bindings.map((one) =>
                          one.filter === filter.name ? { ...one, column } : one,
                        ),
                        "changing the column a filter narrows",
                      )
                    }
                  />
                ) : null}
                {on && !visual
                  ? mine.map((binding) => (
                      <TextField
                        key={binding.part ?? "value"}
                        name={`${env.widget.id}-${input}-param-${filter.name}-${binding.part ?? "value"}`}
                        label={`Parameter that ${name} fills${binding.part ? ` (${binding.part})` : ""}`}
                        value={binding.parameter ?? ""}
                        onChange={(parameter) =>
                          save(
                            bindings.map((one) => (one === binding ? { ...one, parameter } : one)),
                            "changing the parameter a filter fills",
                          )
                        }
                      />
                    ))
                  : null}
              </li>
            );
          })}
        </ul>
      </fieldset>
    </Details>
  );
}

// ---------------------------------------------------------------------------
// Value

function MeasureControl({ env, input, visual, columns, label, help, write }: PartProps) {
  const declared = env.definition.data[input];
  const limits = declared?.values ?? { min: 1, max: 1 };
  const measures = visual.measures ?? [];
  const allowed = (fn: VisualFunction) =>
    columns.filter((column) =>
      fn === "count_distinct"
        ? true
        : fn === "sum" || fn === "avg"
          ? NUMERIC.has(column.type)
          : NUMERIC.has(column.type) || TEMPORAL.has(column.type),
    );
  const change = (at: number, fn: VisualFunction, column: string | undefined) => {
    const old = measures[at];
    if (!old) return;
    const others = measures.filter((_, index) => index !== at).map((one) => one.as);
    const wasAuto = old.as === measureName(old.fn, old.column, others);
    const as = wasAuto ? measureName(fn, column, others) : old.as;
    const next = measures.map((one, index) =>
      index === at ? { fn, ...(column ? { column } : {}), as } : one,
    );
    const renamed = renameIn(env, input, { ...visual, measures: next }, old.as, as);
    env.write(
      withInput(renamed.widget, input, {
        ...(env.widget.data?.[input] as DataInput),
        source: { visual: tidyVisual(renamed.visual) },
      }),
      "changing the value it works out",
      `measure:${env.widget.id}:${input}:${at}`,
    );
  };
  return group(
    label,
    help,
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {measures.map((measure, at) => (
          <li key={measure.as} className="flex flex-wrap items-center gap-2">
            <div className="w-40 max-w-full">
              <SelectField
                name={`${env.widget.id}-${input}-fn-${at}`}
                label={`What value ${at + 1} works out`}
                labelHidden
                value={measure.fn}
                options={MEASURE_FUNCTIONS.map((fn) => ({ value: fn, label: MEASURE_WORDS[fn] }))}
                onChange={(fn) => {
                  const wanted = fn as VisualFunction;
                  const keep =
                    measure.column && allowed(wanted).some((one) => one.name === measure.column);
                  change(
                    at,
                    wanted,
                    wanted === "count"
                      ? undefined
                      : keep
                        ? measure.column
                        : allowed(wanted)[0]?.name,
                  );
                }}
              />
            </div>
            {measure.fn === "count" ? null : (
              <>
                <span className="text-body-sm text-ink-muted">of</span>
                <div className="w-40 max-w-full">
                  <SelectField
                    name={`${env.widget.id}-${input}-column-${at}`}
                    label={`Column value ${at + 1} is of`}
                    labelHidden
                    value={measure.column ?? ""}
                    options={allowed(measure.fn).map((column) => ({
                      value: column.name,
                      label: heading(column.name),
                    }))}
                    onChange={(column) => change(at, measure.fn, column)}
                  />
                </div>
              </>
            )}
            {measures.length > limits.min ? (
              <Button
                size="small"
                variant="quiet"
                aria-label={`Remove value ${at + 1}`}
                onClick={() =>
                  write(
                    { ...visual, measures: measures.filter((_, index) => index !== at) },
                    "removing a value",
                  )
                }
              >
                <X aria-hidden="true" size={14} />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {measures.length < limits.max ? (
        <div>
          <Button
            size="small"
            variant="quiet"
            onClick={() =>
              write(
                {
                  ...visual,
                  measures: [
                    ...measures,
                    {
                      fn: "count",
                      as: measureName(
                        "count",
                        undefined,
                        measures.map((one) => one.as),
                      ),
                    },
                  ],
                },
                "adding a value",
              )
            }
          >
            <Plus aria-hidden="true" size={14} /> Add a value
          </Button>
        </div>
      ) : null}
    </>,
  );
}

// ---------------------------------------------------------------------------
// Break down by

function BreakdownControl({ env, input, visual, columns, label, help, write }: PartProps) {
  const limits = env.definition.data[input]?.breakdowns ?? { min: 0, max: 1 };
  const groups = visual.groupBy ?? [];
  const change = (
    at: number,
    next: { column: string; bucket?: (typeof BREAKDOWN_CADENCES)[number] },
  ) => {
    const old = groups[at];
    if (!old) return;
    const groupBy = groups.map((one, index) => (index === at ? next : one));
    const renamed = renameIn(env, input, { ...visual, groupBy }, groupName(old), groupName(next));
    env.write(
      withInput(renamed.widget, input, {
        ...(env.widget.data?.[input] as DataInput),
        source: { visual: tidyVisual(renamed.visual) },
      }),
      "changing what it is broken down by",
      `breakdown:${env.widget.id}:${input}:${at}`,
    );
  };
  return group(
    label,
    help,
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {groups.map((one, at) => {
          const type = columns.find((column) => column.name === one.column)?.type;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a part of a query has no identity but its place in the list
            <li key={`${one.column}-${at}`} className="flex flex-wrap items-center gap-2">
              <div className="w-40 max-w-full">
                <SelectField
                  name={`${env.widget.id}-${input}-by-${at}`}
                  label={`Breakdown ${at + 1}`}
                  labelHidden
                  value={one.column}
                  options={columns.map((column) => ({
                    value: column.name,
                    label: heading(column.name),
                  }))}
                  onChange={(column) => {
                    const temporal = TEMPORAL.has(
                      columns.find((c) => c.name === column)?.type ?? "",
                    );
                    change(at, { column, ...(temporal ? { bucket: one.bucket ?? "week" } : {}) });
                  }}
                />
              </div>
              {type && TEMPORAL.has(type) ? (
                <div className="w-32 max-w-full">
                  <SelectField
                    name={`${env.widget.id}-${input}-cadence-${at}`}
                    label={`How often breakdown ${at + 1} is cut`}
                    labelHidden
                    value={one.bucket ?? ""}
                    options={[
                      { value: "", label: "Each value" },
                      ...BREAKDOWN_CADENCES.map((cadence) => ({
                        value: cadence,
                        label: CADENCE_WORDS[cadence],
                      })),
                    ]}
                    onChange={(cadence) =>
                      change(at, {
                        column: one.column,
                        ...(cadence
                          ? { bucket: cadence as (typeof BREAKDOWN_CADENCES)[number] }
                          : {}),
                      })
                    }
                  />
                </div>
              ) : null}
              {groups.length > limits.min ? (
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Remove breakdown ${at + 1}`}
                  onClick={() =>
                    write(
                      { ...visual, groupBy: groups.filter((_, index) => index !== at) },
                      "removing a breakdown",
                    )
                  }
                >
                  <X aria-hidden="true" size={14} />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {groups.length < limits.max ? (
        <div>
          <Button
            size="small"
            variant="quiet"
            disabled={columns.length === 0}
            onClick={() => {
              const column =
                columns.find(
                  (one) =>
                    !groups.some((g) => g.column === one.name) &&
                    TEMPORAL.has(one.type) &&
                    one.name !== "updated_at",
                ) ?? columns.find((one) => !groups.some((g) => g.column === one.name));
              if (!column) return;
              write(
                {
                  ...visual,
                  groupBy: [
                    ...groups,
                    {
                      column: column.name,
                      ...(TEMPORAL.has(column.type) ? { bucket: "week" as const } : {}),
                    },
                  ],
                },
                "adding a breakdown",
              );
            }}
          >
            <Plus aria-hidden="true" size={14} /> Break it down
          </Button>
        </div>
      ) : null}
    </>,
  );
}

// ---------------------------------------------------------------------------
// Only include

function ConditionsControl({ env, input, visual, columns, label, help, write }: PartProps) {
  const conditions = visual.filters ?? [];
  const set = (at: number, patch: Partial<VisualCondition>, key = true) => {
    const next = conditions.map((one, index) => {
      if (index !== at) return one;
      const merged = { ...one, ...patch };
      if (merged.op === "is_null" || merged.op === "not_null") delete merged.value;
      return merged;
    });
    write(
      { ...visual, filters: next },
      "changing a condition",
      key ? `condition:${env.widget.id}:${input}:${at}` : undefined,
    );
  };
  return group(
    label,
    help,
    <>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {conditions.map((condition, at) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a part of a query has no identity but its place in the list
            key={`${condition.column}-${at}`}
            className="flex flex-col gap-2 rounded-control border border-line p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40 max-w-full">
                <SelectField
                  name={`${env.widget.id}-${input}-cond-${at}-column`}
                  label={`Column of condition ${at + 1}`}
                  labelHidden
                  value={condition.column}
                  options={columns.map((column) => ({
                    value: column.name,
                    label: heading(column.name),
                  }))}
                  onChange={(column) => set(at, { column }, false)}
                />
              </div>
              <div className="w-36 max-w-full">
                <SelectField
                  name={`${env.widget.id}-${input}-cond-${at}-test`}
                  label={`Test of condition ${at + 1}`}
                  labelHidden
                  value={condition.op}
                  options={VISUAL_OPERATORS.map((op) => ({ value: op, label: TEST_WORDS[op] }))}
                  onChange={(op) => set(at, { op: op as VisualOperator }, false)}
                />
              </div>
              <Button
                size="small"
                variant="quiet"
                aria-label={`Remove condition ${at + 1}`}
                onClick={() =>
                  write(
                    { ...visual, filters: conditions.filter((_, index) => index !== at) },
                    "removing a condition",
                  )
                }
              >
                <X aria-hidden="true" size={14} />
              </Button>
            </div>
            {condition.op === "is_null" || condition.op === "not_null" ? null : (
              <TextField
                name={`${env.widget.id}-${input}-cond-${at}-value`}
                label={`Value of condition ${at + 1}`}
                labelHidden
                placeholder={condition.op === "in" ? "One, two, three" : "Value"}
                required={false}
                value={shownValue(condition.value)}
                onChange={(text) => set(at, { value: typedValue(condition.op, text) })}
              />
            )}
          </li>
        ))}
      </ul>
      {conditions.length < 20 ? (
        <div>
          <Button
            size="small"
            variant="quiet"
            disabled={columns.length === 0}
            onClick={() => {
              const column = columns.find((one) => one.type === "enum") ?? columns[1] ?? columns[0];
              if (!column) return;
              write(
                {
                  ...visual,
                  filters: [...conditions, { column: column.name, op: "eq", value: "" }],
                },
                "adding a condition",
              );
            }}
          >
            <Plus aria-hidden="true" size={14} /> Add a condition
          </Button>
        </div>
      ) : null}
    </>,
  );
}

// ---------------------------------------------------------------------------
// Sorted by, and how many

function SortControl({ env, input, visual, columns, label, help, write }: PartProps) {
  const sorts = visual.sort ?? [];
  const summary = env.definition.data[input]?.shape === "summary";
  const byOptions = summary
    ? resultNames(env.widget.data?.[input]).map((name) => ({ value: name, label: heading(name) }))
    : columns.map((column) => ({ value: column.name, label: heading(column.name) }));
  return group(
    label,
    help,
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {sorts.map((one, at) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a part of a query has no identity but its place in the list
          <li key={`${one.by}-${at}`} className="flex flex-wrap items-center gap-2">
            <div className="w-40 max-w-full">
              <SelectField
                name={`${env.widget.id}-${input}-sort-${at}`}
                label={`Sort ${at + 1} by`}
                labelHidden
                value={one.by}
                options={byOptions}
                onChange={(by) =>
                  write(
                    { ...visual, sort: sorts.map((s, index) => (index === at ? { ...s, by } : s)) },
                    "changing the order",
                  )
                }
              />
            </div>
            <div className="w-36 max-w-full">
              <SelectField
                name={`${env.widget.id}-${input}-direction-${at}`}
                label={`Direction of sort ${at + 1}`}
                labelHidden
                value={one.descending ? "down" : "up"}
                options={[
                  { value: "up", label: "Smallest first" },
                  { value: "down", label: "Largest first" },
                ]}
                onChange={(way) =>
                  write(
                    {
                      ...visual,
                      sort: sorts.map((s, index) => {
                        if (index !== at) return s;
                        const { descending: _before, ...rest } = s;
                        return way === "down" ? { ...rest, descending: true } : rest;
                      }),
                    },
                    "changing the order",
                  )
                }
              />
            </div>
            <Button
              size="small"
              variant="quiet"
              aria-label={`Remove sort ${at + 1}`}
              onClick={() =>
                write(
                  { ...visual, sort: sorts.filter((_, index) => index !== at) },
                  "removing a sort",
                )
              }
            >
              <X aria-hidden="true" size={14} />
            </Button>
          </li>
        ))}
      </ul>
      {sorts.length < 4 && byOptions.length > 0 ? (
        <div>
          <Button
            size="small"
            variant="quiet"
            onClick={() =>
              write(
                { ...visual, sort: [...sorts, { by: byOptions[0]?.value ?? "id" }] },
                "adding a sort",
              )
            }
          >
            <Plus aria-hidden="true" size={14} /> Sort it
          </Button>
        </div>
      ) : null}
    </>,
  );
}

function LimitControl({ env, input, visual, label, help, write }: PartProps) {
  return (
    <NumberField
      name={`${env.widget.id}-${input}-limit`}
      label={label}
      required={false}
      min={1}
      max={10000}
      placeholder="All of them"
      hint={help ?? "Leave empty for no limit."}
      value={visual.limit}
      onChange={(limit) => {
        const { limit: _before, ...rest } = visual;
        write(
          limit === undefined ? rest : { ...rest, limit: Math.round(limit) },
          "changing how many",
          `limit:${env.widget.id}:${input}`,
        );
      }}
    />
  );
}
