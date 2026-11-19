import {
  DASHBOARD_CHART_MARKS,
  type DashboardBody,
  type DashboardWidget,
  type DashboardWidgetOptions,
  type FilterBinding,
  groupName,
  type TableCell,
  VISUAL_BUCKETS,
  VISUAL_FUNCTIONS,
  VISUAL_OPERATORS,
  type VisualCondition,
  type VisualQuery,
  type WidgetSource,
} from "@vynxlabs/manifest";
import {
  Button,
  CheckboxField,
  MultiSelectField,
  Notice,
  SelectField,
  SideSheet,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { type ApiError, api, useLoad } from "../../api.ts";
import { Loading } from "../../kit/LoadState.tsx";
import { SectionLabel } from "../../kit/layout.tsx";
import { parametersIn } from "../Queries.tsx";
import type { Result } from "./model.ts";
import { ResultTable, visualPath } from "./Widgets.tsx";

const CodeEditor = lazy(() =>
  import("../../editor/CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })),
);

/** What the workspace has to ask questions of, as far as the reader may read it. */
interface Schema {
  tables: {
    name: string;
    columns: { name: string; type: string; references: string | null }[];
  }[];
  /** Whether whoever is here holds `sql:read`. */
  maySql: boolean;
}
interface SavedQuery {
  path: string;
  description: string;
  parameters: { name: string; type: string; label?: string }[];
}

const TYPE_LABELS: Record<DashboardWidget["type"], string> = {
  figure: "A figure: one number",
  chart: "A chart",
  table: "A table",
  pivot: "A pivot table",
  text: "A note",
};
const FUNCTION_LABELS: Record<string, string> = {
  count: "How many",
  count_distinct: "How many different",
  sum: "Sum of",
  avg: "Average of",
  min: "Least",
  max: "Most",
};
const OPERATOR_LABELS: Record<string, string> = {
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
};
const TEMPORAL = new Set(["date", "timestamp"]);

type SourceKind = "visual" | "query" | "sql";
const kindOf = (source: WidgetSource | undefined): SourceKind =>
  !source || "visual" in source ? "visual" : "query" in source ? "query" : "sql";

/** A name for a measure, from what it works out. */
const measureName = (fn: string, column: string | undefined, taken: string[]) => {
  const base =
    fn === "count" && !column
      ? "count"
      : `${fn === "count_distinct" ? "distinct" : fn}_${(column ?? "rows").replace(".", "_")}`;
  let name = base;
  for (let n = 2; taken.includes(name); n += 1) name = `${base}_${n}`;
  return name;
};

/** What was typed for a value, as a query takes it: a number where it reads as one, a list for "is one of". */
function typedValue(op: string, text: string): unknown {
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

function Row({
  children,
  onRemove,
  label,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  label: string;
}) {
  return (
    <li className="flex flex-wrap items-end gap-2">
      {children}
      <Button size="small" variant="quiet" aria-label={`Remove ${label}`} onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}

/** A query built from menus: the table, what of it to bring in, and what to work out. */
function VisualBuilder({
  schema,
  query,
  onChange,
}: {
  schema: Schema;
  query: VisualQuery;
  onChange: (query: VisualQuery) => void;
}) {
  const table = schema.tables.find((one) => one.name === query.table);
  const references = (table?.columns ?? []).filter((column) => column.references);
  // Every column a query can name: the table's own, and those of each table it follows a reference to.
  const columns = useMemo(() => {
    const own = [
      { name: "id", type: "uuid" },
      { name: "created_at", type: "timestamp" },
      ...(table?.columns ?? []).filter(
        (one) => !["id", "created_at", "updated_at"].includes(one.name),
      ),
    ];
    const joined = (query.joins ?? []).flatMap((via) => {
      const target = schema.tables.find(
        (one) => one.name === table?.columns.find((column) => column.name === via)?.references,
      );
      return (target?.columns ?? [])
        .filter((one) => !["created_at", "updated_at"].includes(one.name))
        .map((one) => ({ name: `${via}.${one.name}`, type: one.type }));
    });
    return [...own, ...joined];
  }, [schema, table, query.joins]);
  const columnOptions = columns.map((one) => ({ value: one.name, label: one.name }));
  const typeOf = (name: string | undefined) => columns.find((one) => one.name === name)?.type;
  const totals = (query.groupBy?.length ?? 0) > 0 || (query.measures?.length ?? 0) > 0;
  const set = (change: Partial<VisualQuery>) => {
    const next = { ...query, ...change };
    for (const key of Object.keys(next) as (keyof VisualQuery)[]) {
      const value = next[key];
      if (value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
    }
    onChange(next);
  };
  const results = totals
    ? [...(query.groupBy ?? []).map(groupName), ...(query.measures ?? []).map((one) => one.as)]
    : (query.columns ?? columns.map((one) => one.name)).map((name) => name.replace(".", "_"));

  return (
    <div className="flex flex-col gap-5">
      <SelectField
        name="table"
        label="Table"
        value={query.table}
        options={[
          ...(table ? [] : [{ value: query.table, label: query.table || "Choose a table" }]),
          ...schema.tables.map((one) => ({ value: one.name, label: one.name })),
        ]}
        onChange={(name) => onChange({ table: name })}
      />
      {references.length > 0 ? (
        <MultiSelectField
          label="Bring in the rows these point to"
          hint="Their columns can then be shown, filtered and grouped by, as column.theirs."
          options={references.map((one) => ({
            value: one.name,
            label: `${one.name} → ${one.references}`,
          }))}
          value={query.joins ?? []}
          placeholder="None"
          onChange={(joins) => set({ joins })}
        />
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionLabel>Only rows where</SectionLabel>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(query.filters ?? []).map((one, at) => {
            const change = (next: Partial<VisualCondition>) =>
              set({
                filters: (query.filters ?? []).map((before, index) =>
                  index === at ? { ...before, ...next } : before,
                ),
              });
            const valued = one.op !== "is_null" && one.op !== "not_null";
            return (
              <Row
                // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no name of their own
                key={at}
                label="this condition"
                onRemove={() =>
                  set({ filters: (query.filters ?? []).filter((_, index) => index !== at) })
                }
              >
                <div className="w-40">
                  <SelectField
                    name={`where-${at}-column`}
                    label="Column"
                    value={one.column}
                    options={columnOptions}
                    onChange={(column) => change({ column })}
                  />
                </div>
                <div className="w-36">
                  <SelectField
                    name={`where-${at}-op`}
                    label="Test"
                    value={one.op}
                    options={VISUAL_OPERATORS.map((op) => ({
                      value: op,
                      label: OPERATOR_LABELS[op] ?? op,
                    }))}
                    onChange={(op) => change({ op: op as VisualCondition["op"] })}
                  />
                </div>
                {valued ? (
                  <div className="w-40">
                    <TextField
                      name={`where-${at}-value`}
                      label={one.op === "in" ? "Values, with commas" : "Value"}
                      required={false}
                      value={shownValue(one.value)}
                      onChange={(text) => change({ value: typedValue(one.op, text) })}
                    />
                  </div>
                ) : null}
              </Row>
            );
          })}
        </ul>
        <div>
          <Button
            size="small"
            onClick={() =>
              set({
                filters: [
                  ...(query.filters ?? []),
                  { column: columns[0]?.name ?? "id", op: "eq", value: "" },
                ],
              })
            }
          >
            Add a condition
          </Button>
        </div>
      </section>

      <SelectField
        name="shape"
        label="Show"
        value={totals ? "totals" : "rows"}
        options={[
          { value: "rows", label: "The rows themselves" },
          { value: "totals", label: "Totals, for the whole or for groups" },
        ]}
        onChange={(shape) =>
          shape === "totals"
            ? onChange({
                table: query.table,
                ...(query.joins ? { joins: query.joins } : {}),
                ...(query.filters ? { filters: query.filters } : {}),
                measures: [{ fn: "count", as: "count" }],
              })
            : onChange({
                table: query.table,
                ...(query.joins ? { joins: query.joins } : {}),
                ...(query.filters ? { filters: query.filters } : {}),
              })
        }
      />

      {totals ? (
        <>
          <section className="flex flex-col gap-2">
            <SectionLabel>Grouped by</SectionLabel>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {(query.groupBy ?? []).map((group, at) => {
                const change = (next: { column?: string; bucket?: string | undefined }) =>
                  set({
                    groupBy: (query.groupBy ?? []).map((before, index) => {
                      if (index !== at) return before;
                      const column = next.column ?? before.column;
                      const bucket = "bucket" in next ? next.bucket : before.bucket;
                      return {
                        column,
                        ...(bucket && TEMPORAL.has(typeOf(column) ?? "")
                          ? { bucket: bucket as (typeof VISUAL_BUCKETS)[number] }
                          : {}),
                      };
                    }),
                    // A sort by a group that changed its name would name nothing.
                    sort: [],
                  });
                return (
                  <Row
                    // biome-ignore lint/suspicious/noArrayIndexKey: groups are told apart by their place
                    key={at}
                    label={`the group ${group.column}`}
                    onRemove={() =>
                      set({
                        groupBy: (query.groupBy ?? []).filter((_, index) => index !== at),
                        sort: [],
                      })
                    }
                  >
                    <div className="w-44">
                      <SelectField
                        name={`group-${at}`}
                        label="Column"
                        value={group.column}
                        options={columnOptions}
                        onChange={(column) => change({ column })}
                      />
                    </div>
                    {TEMPORAL.has(typeOf(group.column) ?? "") ? (
                      <div className="w-36">
                        <SelectField
                          name={`group-${at}-bucket`}
                          label="By"
                          value={group.bucket ?? ""}
                          options={[
                            { value: "", label: "Each value" },
                            ...VISUAL_BUCKETS.map((one) => ({ value: one, label: one })),
                          ]}
                          onChange={(bucket) => change({ bucket: bucket || undefined })}
                        />
                      </div>
                    ) : null}
                  </Row>
                );
              })}
            </ul>
            <div>
              <Button
                size="small"
                disabled={(query.groupBy?.length ?? 0) >= 4}
                onClick={() => {
                  const column = columns.find(
                    (one) =>
                      !query.groupBy?.some((group) => group.column === one.name) &&
                      one.name !== "id",
                  );
                  if (!column) return;
                  set({
                    groupBy: [
                      ...(query.groupBy ?? []),
                      {
                        column: column.name,
                        ...(TEMPORAL.has(column.type) ? { bucket: "month" as const } : {}),
                      },
                    ],
                  });
                }}
              >
                Add a group
              </Button>
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabel>Work out</SectionLabel>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {(query.measures ?? []).map((measure, at) => {
                const others = (query.measures ?? [])
                  .filter((_, index) => index !== at)
                  .map((one) => one.as);
                const change = (fn: string, column: string | undefined) => {
                  const needs = fn !== "count";
                  const of = needs
                    ? (column ??
                      columns.find((one) => ["integer", "number"].includes(one.type))?.name ??
                      columns[0]?.name)
                    : column;
                  set({
                    measures: (query.measures ?? []).map((before, index) =>
                      index === at
                        ? {
                            fn: fn as (typeof VISUAL_FUNCTIONS)[number],
                            ...(of ? { column: of } : {}),
                            as: measureName(fn, of, others),
                          }
                        : before,
                    ),
                    sort: [],
                  });
                };
                return (
                  <Row
                    // biome-ignore lint/suspicious/noArrayIndexKey: measures are told apart by their place
                    key={at}
                    label={`the measure ${measure.as}`}
                    onRemove={() =>
                      set({
                        measures: (query.measures ?? []).filter((_, index) => index !== at),
                        sort: [],
                      })
                    }
                  >
                    <div className="w-44">
                      <SelectField
                        name={`measure-${at}-fn`}
                        label="What"
                        value={measure.fn}
                        options={VISUAL_FUNCTIONS.map((fn) => ({
                          value: fn,
                          label: FUNCTION_LABELS[fn] ?? fn,
                        }))}
                        onChange={(fn) => change(fn, measure.column)}
                      />
                    </div>
                    <div className="w-44">
                      <SelectField
                        name={`measure-${at}-column`}
                        label="Of"
                        value={measure.column ?? ""}
                        options={[
                          ...(measure.fn === "count" ? [{ value: "", label: "Rows" }] : []),
                          ...columnOptions,
                        ]}
                        onChange={(column) => change(measure.fn, column || undefined)}
                      />
                    </div>
                  </Row>
                );
              })}
            </ul>
            <div>
              <Button
                size="small"
                disabled={(query.measures?.length ?? 0) >= 8}
                onClick={() => {
                  const taken = (query.measures ?? []).map((one) => one.as);
                  set({
                    measures: [
                      ...(query.measures ?? []),
                      { fn: "count", as: measureName("count", undefined, taken) },
                    ],
                  });
                }}
              >
                Add a measure
              </Button>
            </div>
          </section>
        </>
      ) : (
        <MultiSelectField
          label="Columns"
          options={columnOptions}
          value={query.columns ?? []}
          placeholder="Every column of the table"
          onChange={(chosen) => set({ columns: chosen, sort: [] })}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <SelectField
            name="sort"
            label="Sorted by"
            value={query.sort?.[0]?.by ?? ""}
            options={[
              { value: "", label: totals ? "The groups, in order" : "As they come" },
              ...results.map((name) => ({ value: name, label: name })),
            ]}
            onChange={(by) =>
              set({
                sort: by
                  ? [{ by, ...(query.sort?.[0]?.descending ? { descending: true } : {}) }]
                  : [],
              })
            }
          />
        </div>
        {query.sort?.[0] ? (
          <div className="w-44">
            <SelectField
              name="direction"
              label="Order"
              value={query.sort[0].descending ? "desc" : "asc"}
              options={[
                { value: "asc", label: "Least first" },
                { value: "desc", label: "Most first" },
              ]}
              onChange={(direction) =>
                set({
                  sort: [
                    {
                      by: query.sort?.[0]?.by as string,
                      ...(direction === "desc" ? { descending: true } : {}),
                    },
                  ],
                })
              }
            />
          </div>
        ) : null}
        <div className="w-32">
          <TextField
            name="limit"
            label="At most"
            type="number"
            required={false}
            hint="rows"
            value={query.limit === undefined ? "" : String(query.limit)}
            onChange={(text) => {
              const limit = Number(text);
              const { limit: _before, ...rest } = query;
              onChange(text && Number.isInteger(limit) && limit > 0 ? { ...rest, limit } : rest);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** How the widget is drawn, chosen from the columns its query gives. */
function Options({
  widget,
  columns,
  dateFilters,
  onChange,
}: {
  widget: DashboardWidget;
  columns: { name: string; type: string }[];
  dateFilters: string[];
  onChange: (options: DashboardWidgetOptions) => void;
}) {
  const options = widget.options ?? {};
  const set = (
    change: Partial<{ [K in keyof DashboardWidgetOptions]: DashboardWidgetOptions[K] | undefined }>,
  ) => {
    const next: Record<string, unknown> = { ...options, ...change };
    for (const key of Object.keys(next)) {
      const value = next[key];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0))
        delete next[key];
    }
    onChange(next as DashboardWidgetOptions);
  };
  const all = columns.map((one) => ({ value: one.name, label: one.name }));
  const numbers = columns
    .filter((one) => one.type === "number")
    .map((one) => ({ value: one.name, label: one.name }));
  const blank = (label: string) => [{ value: "", label }];
  // What a figure's line can run over: for a question built from menus, the columns its date
  // filters narrow; for a saved query or SQL, a column of its own rows.
  const trendColumns =
    widget.source && "visual" in widget.source
      ? [
          ...new Set(
            (widget.filters ?? [])
              .filter((one) => dateFilters.includes(one.filter) && one.column)
              .map((one) => one.column as string),
          ),
        ]
      : columns.map((one) => one.name);
  const format = (
    <div className="w-44">
      <SelectField
        name="format"
        label="Written as"
        value={
          options.format
            ? `${options.format.style}${options.format.minorUnits ? "-minor" : ""}`
            : ""
        }
        options={[
          ...blank("A number"),
          { value: "currency", label: "Money" },
          { value: "currency-minor", label: "Money, kept in cents" },
          { value: "percent", label: "A percentage" },
        ]}
        onChange={(style) =>
          set({
            format: style
              ? {
                  style: style.startsWith("currency") ? "currency" : "percent",
                  ...(style.endsWith("-minor") ? { minorUnits: true } : {}),
                }
              : undefined,
          })
        }
      />
    </div>
  );
  if (columns.length === 0) {
    return (
      <p className="m-0 text-ink-muted">Run the query to choose what is drawn from its columns.</p>
    );
  }
  if (widget.type === "figure") {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <SelectField
            name="value"
            label="The number"
            value={options.value ?? ""}
            options={[...blank("The first number"), ...all]}
            onChange={(value) => set({ value })}
          />
        </div>
        {format}
        {dateFilters.length > 0 ? (
          <div className="w-56">
            <SelectField
              name="compareTo"
              label="Compared with the period before"
              value={options.compareTo ?? ""}
              options={[
                ...blank("Not compared"),
                ...dateFilters.map((name) => ({ value: name, label: `By the filter ${name}` })),
              ]}
              onChange={(compareTo) => set({ compareTo })}
            />
          </div>
        ) : null}
        {options.compareTo ? (
          <>
            <div className="w-44">
              <SelectField
                name="delta"
                label="The change is said as"
                value={options.delta ?? "percent"}
                options={[
                  { value: "percent", label: "A share: 18%" },
                  { value: "absolute", label: "The amount: 64" },
                  { value: "points", label: "Points, for a rate" },
                ]}
                onChange={(delta) =>
                  set({
                    delta:
                      delta === "percent" ? undefined : (delta as DashboardWidgetOptions["delta"]),
                  })
                }
              />
            </div>
            <div className="w-40">
              <SelectField
                name="goodWhen"
                label="Good news is"
                value={options.goodWhen ?? "up"}
                options={[
                  { value: "up", label: "More" },
                  { value: "down", label: "Less" },
                ]}
                onChange={(way) => set({ goodWhen: way === "down" ? "down" : undefined })}
              />
            </div>
          </>
        ) : null}
        <div className="w-56">
          <SelectField
            name="trend"
            label="A line of how it went"
            value={options.trend?.by ?? ""}
            {...(trendColumns.length === 0
              ? { hint: "Give a date filter a column of this widget first." }
              : {})}
            options={[
              ...blank("No line"),
              ...trendColumns.map((name) => ({ value: name, label: `Over ${name}` })),
            ]}
            onChange={(by) => set({ trend: by ? { by } : undefined })}
          />
        </div>
        <div className="min-w-56 flex-1">
          <TextField
            name="caption"
            label="A line under it"
            required={false}
            value={options.caption ?? ""}
            hint="{previous} is written as the number for the period before."
            onChange={(caption) => set({ caption })}
          />
        </div>
      </div>
    );
  }
  if (widget.type === "chart") {
    const mark = options.mark ?? "bar";
    const y = Array.isArray(options.y) ? options.y : options.y ? [options.y] : [];
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <SelectField
              name="mark"
              label="Shape"
              value={mark}
              options={DASHBOARD_CHART_MARKS.map((one) => ({
                value: one,
                label: one === "scatter" ? "points" : one === "heatmap" ? "squares, shaded" : one,
              }))}
              onChange={(next) => set({ mark: next as (typeof DASHBOARD_CHART_MARKS)[number] })}
            />
          </div>
          <div className="w-44">
            <SelectField
              name="x"
              label={mark === "pie" ? "Cut by" : "Along the bottom"}
              value={options.x ?? ""}
              options={[...blank("The first column"), ...all]}
              onChange={(x) => set({ x })}
            />
          </div>
          {format}
        </div>
        {mark === "heatmap" ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <SelectField
                name="down"
                label="Down the side"
                value={typeof options.y === "string" ? options.y : ""}
                options={[...blank("Choose a column"), ...all]}
                onChange={(down) => set({ y: down })}
              />
            </div>
            <div className="w-44">
              <SelectField
                name="shade"
                label="Shaded by"
                value={options.value ?? ""}
                options={[...blank("Choose a number"), ...(numbers.length > 0 ? numbers : all)]}
                onChange={(value) => set({ value })}
              />
            </div>
          </div>
        ) : null}
        {mark === "heatmap" ? null : (
          <MultiSelectField
            label={mark === "pie" ? "Sized by" : "Up the side"}
            hint={
              mark === "pie" || mark === "scatter"
                ? undefined
                : "Several are drawn as a series each."
            }
            options={numbers.length > 0 ? numbers : all}
            value={y}
            placeholder="The first number"
            onChange={(chosen) => set({ y: chosen.length === 1 ? chosen[0] : chosen })}
          />
        )}
        {mark === "pie" || mark === "heatmap" ? null : (
          <div className="flex flex-wrap items-end gap-3">
            {y.length > 1 ? null : (
              <div className="w-44">
                <SelectField
                  name="series"
                  label="A colour for each"
                  value={options.series ?? ""}
                  options={[...blank("One series"), ...all]}
                  onChange={(series) => set({ series })}
                />
              </div>
            )}
            {mark === "bar" ? (
              <>
                <div className="w-40">
                  <SelectField
                    name="bars"
                    label="Several series"
                    value={options.bars ?? "stacked"}
                    options={[
                      { value: "stacked", label: "Stacked" },
                      { value: "grouped", label: "Side by side" },
                    ]}
                    onChange={(bars) => set({ bars: bars === "grouped" ? "grouped" : undefined })}
                  />
                </div>
                <div className="w-44">
                  <SelectField
                    name="line"
                    label="A line over the bars"
                    value={options.line ?? ""}
                    options={[...blank("None"), ...numbers]}
                    onChange={(line) => set({ line })}
                  />
                </div>
                <CheckboxField
                  name="horizontal"
                  label="Bars lie down"
                  checked={options.horizontal === true}
                  onChange={(horizontal) => set({ horizontal: horizontal ? true : undefined })}
                />
              </>
            ) : null}
            {mark !== "scatter" && dateFilters.length > 0 ? (
              <div className="w-56">
                <SelectField
                  name="compare"
                  label="Also draw the period before"
                  value={options.compare ? (options.compareTo ?? "") : ""}
                  options={[
                    ...blank("No"),
                    ...dateFilters.map((name) => ({ value: name, label: `By the filter ${name}` })),
                  ]}
                  onChange={(compareTo) =>
                    set({ compareTo, compare: compareTo ? true : undefined })
                  }
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }
  if (widget.type === "pivot") {
    return (
      <div className="flex flex-col gap-3">
        <MultiSelectField
          label="Down the side"
          options={all}
          value={options.rows ?? []}
          placeholder="Nothing"
          onChange={(rows) => set({ rows: rows.slice(0, 3) })}
        />
        <MultiSelectField
          label="Across the top"
          options={all}
          value={options.columns ?? []}
          placeholder="Nothing"
          onChange={(chosen) => set({ columns: chosen.slice(0, 2) })}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <SelectField
              name="value"
              label="In each cell"
              value={options.value ?? ""}
              options={[...blank("How many rows"), ...numbers]}
              onChange={(value) => set({ value, cell: value ? options.cell : "count" })}
            />
          </div>
          {options.value ? (
            <div className="w-40">
              <SelectField
                name="cell"
                label="Worked out as"
                value={options.cell ?? "sum"}
                options={[
                  { value: "sum", label: "The sum" },
                  { value: "avg", label: "The average" },
                  { value: "min", label: "The least" },
                  { value: "max", label: "The most" },
                  { value: "count", label: "How many" },
                ]}
                onChange={(cell) => set({ cell: cell as DashboardWidgetOptions["cell"] })}
              />
            </div>
          ) : null}
          {format}
        </div>
        <CheckboxField
          name="totals"
          label="Show totals"
          checked={options.totals !== false}
          onChange={(totals) => set({ totals: totals ? undefined : false })}
        />
      </div>
    );
  }
  // A table: which columns, and how some of them are headed, written and drawn.
  const cellOf = (column: string) => (options.cells ?? []).find((one) => one.column === column);
  const setCell = (
    column: string,
    change: { [K in keyof TableCell]?: TableCell[K] | undefined },
  ) => {
    const next: Record<string, unknown> = { ...cellOf(column), column, ...change };
    for (const key of Object.keys(next)) {
      if (next[key] === undefined || next[key] === "" || next[key] === "text") delete next[key];
    }
    const rest = (options.cells ?? []).filter((one) => one.column !== column);
    // A column with nothing said about it is not kept.
    set({ cells: Object.keys(next).length > 1 ? [...rest, next as unknown as TableCell] : rest });
  };
  return (
    <div className="flex flex-col gap-3">
      <MultiSelectField
        label="Columns shown"
        options={all}
        value={options.show ?? []}
        placeholder="Every column of the result"
        onChange={(show) => set({ show })}
      />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="p-0 text-body-sm font-medium">How each column is drawn</legend>
        {(options.show && options.show.length > 0 ? options.show : columns.map((one) => one.name))
          .filter((name) => columns.some((one) => one.name === name))
          .map((name) => {
            const cell = cellOf(name);
            const number = columns.find((one) => one.name === name)?.type === "number";
            return (
              <div key={name} className="flex flex-wrap items-end gap-2">
                <div className="min-w-36 flex-1">
                  <TextField
                    name={`heading-${name}`}
                    label={`Heading of ${name}`}
                    required={false}
                    placeholder={name}
                    value={cell?.label ?? ""}
                    onChange={(label) => setCell(name, { label })}
                  />
                </div>
                <div className="w-40">
                  <SelectField
                    name={`as-${name}`}
                    label={`${name} is drawn as`}
                    value={cell?.as ?? "text"}
                    options={[
                      { value: "text", label: "Written" },
                      ...(number
                        ? [
                            { value: "bar", label: "A bar" },
                            { value: "delta", label: "A change, up or down" },
                          ]
                        : []),
                      { value: "chip", label: "A chip" },
                    ]}
                    onChange={(as) => setCell(name, { as: as as TableCell["as"] })}
                  />
                </div>
                {number ? (
                  <div className="w-44">
                    <SelectField
                      name={`format-${name}`}
                      label={`${name} is written as`}
                      value={
                        cell?.format
                          ? `${cell.format.style}${cell.format.minorUnits ? "-minor" : ""}`
                          : ""
                      }
                      options={[
                        ...blank("A number"),
                        { value: "currency", label: "Money" },
                        { value: "currency-minor", label: "Money, kept in cents" },
                        { value: "percent", label: "A percentage" },
                      ]}
                      onChange={(style) =>
                        setCell(name, {
                          format: style
                            ? {
                                style: style.startsWith("currency") ? "currency" : "percent",
                                ...(style.endsWith("-minor") ? { minorUnits: true } : {}),
                              }
                            : undefined,
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
      </fieldset>
      <CheckboxField
        name="totals"
        label="Add a row of totals"
        checked={options.totals === true}
        onChange={(totals) => set({ totals: totals ? true : undefined })}
      />
    </div>
  );
}

/**
 * One widget, changed in a sheet beside the dashboard: what it is, the
 * question it asks, the filters its question takes, and how the answer is
 * drawn. The answer is shown as the question is changed.
 */
export function WidgetEditor({
  root,
  body,
  widget: opened,
  onSave,
  open,
  onClose,
}: {
  root: string;
  body: DashboardBody;
  widget: DashboardWidget;
  onSave: (widget: DashboardWidget) => Promise<void>;
  open: boolean;
  onClose: () => void;
}) {
  const [widget, setWidget] = useState(opened);
  const [busy, setBusy] = useState(false);
  const schema = useLoad<Schema>(`${root}/queries/schema`);
  // SQL is offered to whoever may write it. The server says so, and refuses the rest on a save.
  const canWriteSql = schema.data?.maySql === true;
  const saved = useLoad<{ items: SavedQuery[] }>(`${root}/queries`);
  const [preview, setPreview] = useState<Result>();
  const [problem, setProblem] = useState<string>();
  const kind = kindOf(widget.source);
  const filters = body.filters ?? [];
  const set = (change: Partial<DashboardWidget>) =>
    setWidget((before) => ({ ...before, ...change }));
  const source = widget.source;
  const sourceText = JSON.stringify(source ?? null);

  // The answer follows the question: asked again a moment after it last changed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the source's text
  useEffect(() => {
    if (!source || widget.type === "text") return;
    let current = true;
    const ask = setTimeout(async () => {
      try {
        const answer =
          "visual" in source
            ? source.visual.table
              ? await api.get<Result>(visualPath(root, source.visual, 50))
              : undefined
            : "query" in source
              ? source.query
                ? await api.get<Result>(
                    `${root}/queries/saved/${source.query}?limit=50&params=${encodeURIComponent(JSON.stringify(source.values ?? {}))}`,
                  )
                : undefined
              : source.sql.trim()
                ? await api.post<Result>(`${root}/queries/run`, {
                    sql: source.sql,
                    limit: 50,
                    params: Array.from(
                      { length: parametersIn(source.sql) },
                      (_, at) => source.values?.[at] ?? null,
                    ),
                  })
                : undefined;
        if (!current) return;
        setPreview(answer);
        setProblem(undefined);
      } catch (error) {
        if (!current) return;
        const caught = error as ApiError;
        setProblem(caught.fields?.[0]?.message ?? caught.message);
      }
    }, 400);
    return () => {
      current = false;
      clearTimeout(ask);
    };
  }, [sourceText, widget.type, root]);

  const columns = preview?.columns ?? [];
  const parameters =
    source && "query" in source
      ? (saved.data?.items.find((one) => one.path === source.query)?.parameters ?? []).map(
          (one) => one.name,
        )
      : source && "sql" in source
        ? Array.from({ length: parametersIn(source.sql) }, (_, at) => `$${at + 1}`)
        : [];
  const visualColumns = useMemo(() => {
    if (!source || !("visual" in source)) return [];
    const table = schema.data?.tables.find((one) => one.name === source.visual.table);
    return [
      "created_at",
      ...(table?.columns ?? []).map((one) => one.name),
      ...(source.visual.joins ?? []).flatMap((via) => {
        const target = schema.data?.tables.find(
          (one) => one.name === table?.columns.find((column) => column.name === via)?.references,
        );
        return (target?.columns ?? []).map((one) => `${via}.${one.name}`);
      }),
    ];
  }, [schema.data, source]);

  /** The binding of one filter, changed or taken away. */
  const bind = (filter: string, part: FilterBinding["part"], target: string) => {
    const others = (widget.filters ?? []).filter(
      (one) => !(one.filter === filter && one.part === part),
    );
    const next = target
      ? [
          ...others,
          {
            filter,
            ...(kind === "visual" ? { column: target } : { parameter: target }),
            ...(part ? { part } : {}),
          },
        ]
      : others;
    const { filters: _before, ...rest } = widget;
    setWidget(next.length > 0 ? { ...rest, filters: next } : rest);
  };
  const boundTo = (filter: string, part?: FilterBinding["part"]) => {
    const binding = (widget.filters ?? []).find(
      (one) => one.filter === filter && one.part === part,
    );
    return (kind === "visual" ? binding?.column : binding?.parameter) ?? "";
  };

  const toSql = () => {
    const written = preview?.written;
    if (!written) return;
    setWidget(({ filters: _filters, ...rest }) => ({
      ...rest,
      source: {
        sql: written.sql,
        ...(written.parameters.length > 0 ? { values: written.parameters } : {}),
      },
    }));
  };

  return (
    <SideSheet
      open={open}
      size="wide"
      onClose={onClose}
      title={opened.title || "A new widget"}
      description="What it asks, and how the answer is drawn."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(widget);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save the widget
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <TextField
              name="title"
              label="Title"
              required={false}
              value={widget.title ?? ""}
              onChange={(title) => set({ title })}
            />
          </div>
          {widget.type === "text" ? null : (
            <div className="min-w-48 flex-1">
              <TextField
                name="subtitle"
                label="Subheading"
                required={false}
                value={widget.subtitle ?? ""}
                onChange={(subtitle) => {
                  const { subtitle: _before, ...rest } = widget;
                  setWidget(subtitle ? { ...rest, subtitle } : rest);
                }}
              />
            </div>
          )}
          <div className="w-52">
            <SelectField
              name="type"
              label="It is"
              value={widget.type}
              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(type) => {
                const { options: _options, ...rest } = widget;
                if (type === "text") {
                  const { source: _source, filters: _filters, ...bare } = rest;
                  setWidget({ ...bare, type: "text" });
                } else
                  setWidget({
                    ...rest,
                    type: type as DashboardWidget["type"],
                    source: widget.source ?? { visual: { table: "" } },
                  });
              }}
            />
          </div>
        </div>

        {widget.type === "text" ? (
          <TextAreaField
            name="text"
            label="What it says"
            rows={6}
            value={widget.options?.text ?? ""}
            onChange={(text) => set({ options: { text } })}
          />
        ) : (
          <>
            <section className="flex flex-col gap-4">
              <SelectField
                name="source"
                label="It asks"
                value={kind}
                options={[
                  { value: "visual", label: "A table, from menus" },
                  { value: "query", label: "A query the workspace keeps" },
                  ...(canWriteSql || kind === "sql"
                    ? [{ value: "sql", label: "SQL written here" }]
                    : []),
                ]}
                onChange={(next) => {
                  const { filters: _filters, ...rest } = widget;
                  setPreview(undefined);
                  setWidget({
                    ...rest,
                    source:
                      next === "visual"
                        ? { visual: { table: "" } }
                        : next === "query"
                          ? { query: "" }
                          : { sql: "" },
                  });
                }}
              />
              {schema.error ? <Notice tone="danger">{schema.error.message}</Notice> : null}
              {source && "visual" in source ? (
                schema.data ? (
                  <VisualBuilder
                    schema={schema.data}
                    query={source.visual}
                    onChange={(visual) => set({ source: { visual } })}
                  />
                ) : (
                  <Loading />
                )
              ) : source && "query" in source ? (
                <SelectField
                  name="query"
                  label="Query"
                  hint={
                    saved.error
                      ? "The workspace's queries could not be listed."
                      : "Queries are kept under Data, Queries."
                  }
                  value={source.query}
                  options={[
                    { value: "", label: "Choose a query" },
                    ...(saved.data?.items ?? []).map((one) => ({
                      value: one.path,
                      label: one.description ? `${one.path}: ${one.description}` : one.path,
                    })),
                  ]}
                  onChange={(query) => set({ source: { query } })}
                />
              ) : source && "sql" in source ? (
                <div className="overflow-hidden rounded-panel border border-line">
                  <Suspense fallback={<Loading />}>
                    <CodeEditor
                      label="The widget's query"
                      language="sql"
                      path={`dashboards/${opened.id}.sql`}
                      value={source.sql}
                      height="12rem"
                      onChange={(sql) =>
                        set({
                          source: { sql, ...(source.values ? { values: source.values } : {}) },
                        })
                      }
                    />
                  </Suspense>
                </div>
              ) : null}
              {source && "visual" in source && canWriteSql && preview?.written ? (
                <div>
                  <Button size="small" variant="quiet" onClick={toSql}>
                    Turn it into SQL
                  </Button>
                  <span className="ml-2 text-body-sm text-ink-muted">
                    One way: SQL cannot be turned back into menus.
                  </span>
                </div>
              ) : null}
            </section>

            {filters.length > 0 ? (
              <section className="flex flex-col gap-3">
                <SectionLabel>The dashboard's filters</SectionLabel>
                <p className="m-0 text-body-sm text-ink-muted">
                  {kind === "visual"
                    ? "Choose the column each filter narrows. A filter with no column leaves this widget as it is."
                    : "Choose the parameter each filter fills. A parameter nothing fills is empty."}
                </p>
                {filters.map((filter) => {
                  const targets = (kind === "visual" ? visualColumns : parameters).map((name) => ({
                    value: name,
                    label: name,
                  }));
                  const ranged = filter.type === "date_range" && kind !== "visual";
                  return (
                    <div key={filter.name} className="flex flex-wrap items-end gap-3">
                      {(ranged ? (["from", "to"] as const) : [undefined]).map((part) => (
                        <div key={part ?? "one"} className="w-56">
                          <SelectField
                            name={`bind-${filter.name}-${part ?? "one"}`}
                            label={`${filter.label ?? filter.name}${part ? `, ${part}` : ""}`}
                            value={boundTo(filter.name, part)}
                            options={[{ value: "", label: "Not used here" }, ...targets]}
                            onChange={(target) => bind(filter.name, part, target)}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <SectionLabel>How it is drawn</SectionLabel>
              <Options
                widget={widget}
                columns={columns}
                dateFilters={filters
                  .filter((one) => one.type === "date_range")
                  .map((one) => one.name)}
                onChange={(options) => {
                  const { options: _before, ...rest } = widget;
                  setWidget(Object.keys(options).length > 0 ? { ...rest, options } : rest);
                }}
              />
            </section>

            <section className="flex flex-col gap-2" aria-label="What it gives">
              <SectionLabel>What it gives</SectionLabel>
              {problem ? (
                <Notice tone="danger">{problem}</Notice>
              ) : preview ? (
                <div className="max-h-64 overflow-auto">
                  <ResultTable
                    result={{ ...preview, rows: preview.rows.slice(0, 20) }}
                    label="The first rows of what it gives"
                  />
                </div>
              ) : (
                <p className="m-0 text-ink-muted">Choose what it asks to see the answer here.</p>
              )}
            </section>
          </>
        )}
      </div>
    </SideSheet>
  );
}
