import type {
  InterfaceBody,
  InterfacePage,
  PageWidget,
  ValueFormat,
  WidgetLink,
  WidgetType,
} from "@vynxlabs/manifest";
import {
  type DataClient,
  type Filter,
  formatValue,
  heading,
  PageRenderer,
  settle,
  type TableInfo,
} from "@vynxlabs/screens";
import {
  Button,
  CheckboxField,
  ComboboxField,
  Dialog,
  EmptyState,
  Notice,
  NumberField,
  SelectField,
  Table,
  TextAreaField,
  TextField,
} from "@vynxlabs/ui";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { Mono, Tag } from "../kit/status.tsx";
import { Page } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { fromNow } from "./Overview.tsx";

interface Listed {
  path: string;
  title: string;
  deployed: boolean;
  draft: boolean;
  removing: boolean;
  app: string | null;
  pages?: number;
  version?: number | null;
  tables?: string[];
  editedAt?: string | null;
}
interface DraftAnswer {
  revision: number;
  body: InterfaceBody;
  problems?: { path: string; message: string }[];
}
interface Column {
  name: string;
  type: string;
  required: boolean;
  references: string | null;
  status?: string;
}

const SYSTEM: Column[] = [
  { name: "id", type: "uuid", required: true, references: null },
  { name: "created_at", type: "timestamp", required: true, references: null },
  { name: "updated_at", type: "timestamp", required: true, references: null },
];
const TYPES: { type: WidgetType; label: string; about: string }[] = [
  { type: "table", label: "Table", about: "Rows and columns, or totals" },
  { type: "card", label: "Card", about: "One row, a value a line" },
  { type: "cards", label: "Cards", about: "Each row as a card to choose" },
  { type: "chart", label: "Chart", about: "Bars, lines or a pie" },
  { type: "figure", label: "Figure", about: "One total, large: a count, a sum" },
  { type: "form", label: "Form", about: "Adds a row" },
  { type: "text", label: "Text", about: "Words on the page" },
];
const FUNCTIONS = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Least" },
  { value: "max", label: "Most" },
];
const BUCKETS = [
  { value: "", label: "Each value" },
  { value: "day", label: "By day" },
  { value: "week", label: "By week" },
  { value: "month", label: "By month" },
  { value: "year", label: "By year" },
];
const OPERATORS = [
  { value: "eq", label: "is" },
  { value: "ne", label: "is not" },
  { value: "gt", label: "is more than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "contains", label: "contains" },
  { value: "is_null", label: "is empty" },
];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * Rows for the builder's preview, read as the member who is building, or as
 * someone in a chosen group would read them.
 */
function clientFor(root: string, asGroup?: string): DataClient {
  const query = (options: Record<string, unknown>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
      params.set(
        key,
        Array.isArray(value)
          ? value.join(",")
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value),
      );
    }
    const text = params.toString();
    return text ? `?${text}` : "";
  };
  return {
    find: (table, options) =>
      api.get(`${root}/rows/${table}${query({ ...options, ...(asGroup ? { asGroup } : {}) })}`),
    aggregate: (table, options) =>
      api.get(
        `${root}/aggregate/${table}${query({
          group: options.group,
          measure: options.measures,
          filter: options.filter,
          sort: options.sort,
          limit: options.limit,
          ...(asGroup ? { asGroup } : {}),
        })}`,
      ),
    insert: async (table, row) =>
      (await api.post<{ items: Record<string, unknown>[] }>(`${root}/rows/${table}`, row))
        .items[0] as Record<string, unknown>,
    update: (table, id, changes) => api.patch(`${root}/row/${id}/${table}`, changes),
    remove: async (table, id) => {
      await api.delete(`${root}/row/${id}/${table}`);
    },
  };
}

/** What each of the named tables holds, fetched once each and kept. */
function useTables(root: string, names: string[]): Record<string, TableInfo> {
  const [known, setKnown] = useState<Record<string, TableInfo>>({});
  const asked = useRef(new Set<string>());
  const wanted = names.join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `wanted` is the names as one value
  useEffect(() => {
    for (const name of names) {
      if (asked.current.has(name)) continue;
      asked.current.add(name);
      api.get<{ columns: Column[] }>(`${root}/tables/${name}`).then(
        (detail) =>
          setKnown((before) => ({
            ...before,
            [name]: {
              found: true,
              canRead: true,
              canWrite: true,
              columns: [
                ...SYSTEM,
                ...detail.columns
                  .filter((column) => column.status === undefined || column.status === "active")
                  .map((column) => ({
                    name: column.name,
                    type: column.type,
                    required: column.required,
                    references: column.references ?? null,
                  })),
              ],
            },
          })),
        () =>
          setKnown((before) => ({
            ...before,
            [name]: { found: false, canRead: false, canWrite: false, columns: [] },
          })),
      );
    }
  }, [root, wanted]);
  return known;
}

/** Every table a body shows, and every table those refer to, so references can be shown by name. */
function tablesOf(body: InterfaceBody | undefined, known: Record<string, TableInfo>): string[] {
  const names = new Set<string>();
  for (const page of body?.pages ?? []) {
    for (const widget of page.widgets) {
      if (!widget.table) continue;
      names.add(widget.table);
      for (const column of known[widget.table]?.columns ?? []) {
        if (column.references) names.add(column.references);
      }
    }
  }
  return [...names].sort();
}

// ----- What a widget can follow -----

interface LinkChoice {
  value: string;
  label: string;
  link: WidgetLink;
}

/** Every way this widget could follow another on the page, each said as a sentence. */
function linkChoices(
  widget: PageWidget,
  page: InterfacePage,
  tables: Record<string, TableInfo>,
): LinkChoice[] {
  const choices: LinkChoice[] = [];
  const mine = widget.table ? tables[widget.table] : undefined;
  for (const source of page.widgets) {
    if (source.id === widget.id || !source.table) continue;
    if (["form", "text", "chart"].includes(source.type)) continue;
    // Following a widget that follows this one would go round in a circle.
    let walk: PageWidget | undefined = source;
    const seen = new Set<string>();
    let circle = false;
    while (walk?.link && !seen.has(walk.id)) {
      seen.add(walk.id);
      if (walk.link.from === widget.id) circle = true;
      const next: string = walk.link.from;
      walk = page.widgets.find((candidate) => candidate.id === next);
    }
    if (circle) continue;
    const name = source.title || heading(source.id);
    const add = (link: WidgetLink, label: string) =>
      choices.push({ value: JSON.stringify(link), label, link });
    if (source.summary) {
      if (source.table === widget.table && !widget.summary && widget.type !== "form") {
        add({ from: source.id, type: "group" }, `The rows behind the line chosen in ${name}`);
      }
      continue;
    }
    if (source.table === widget.table && !widget.summary && widget.type !== "form") {
      add({ from: source.id, type: "same" }, `The row chosen in ${name}`);
    }
    for (const column of mine?.columns ?? []) {
      if (column.references === source.table) {
        add(
          { from: source.id, type: "refersTo", via: column.name },
          widget.type === "form"
            ? `New rows get the row chosen in ${name} as their ${heading(column.name).toLowerCase()}`
            : `Rows whose ${heading(column.name).toLowerCase()} is the row chosen in ${name}`,
        );
      }
    }
    if (widget.type !== "form" && !widget.summary) {
      for (const column of tables[source.table]?.columns ?? []) {
        if (column.references === widget.table) {
          add(
            { from: source.id, type: "referredBy", via: column.name },
            `The ${heading(column.name).toLowerCase()} of the row chosen in ${name}`,
          );
        }
      }
    }
  }
  return choices;
}

// ----- The settings of one widget -----

/**
 * How a number is written: as it is, as a number, as money or as a percent.
 * Money kept in cents is divided by 100. An example shows the result.
 */
function FormatSettings({
  name,
  label,
  format,
  onChange,
}: {
  name: string;
  label: string;
  format: ValueFormat | undefined;
  onChange: (format: ValueFormat | undefined) => void;
}) {
  const sample = 123456.789;
  const example = format
    ? formatValue(format.minorUnits ? Math.round(sample * 100) : sample, format)
    : undefined;
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label={label}
        name={`format-${name}`}
        value={format?.style ?? ""}
        options={[
          { value: "", label: "As it is" },
          { value: "number", label: "A number: 1,234.5" },
          { value: "currency", label: "Money: $1,234.50" },
          { value: "percent", label: "A percent: 0.25 as 25%" },
        ]}
        onChange={(style) =>
          onChange(
            style
              ? {
                  ...(format?.style === style ? format : {}),
                  style: style as ValueFormat["style"],
                  ...(style === "currency" ? { currency: format?.currency ?? "USD" } : {}),
                }
              : undefined,
          )
        }
      />
      {format?.style === "currency" ? (
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Currency"
            name={`currency-${name}`}
            value={format.currency ?? "USD"}
            maxLength={3}
            onChange={(code) => onChange({ ...format, currency: code.toUpperCase() || "USD" })}
          />
          <CheckboxField
            label="Kept in cents"
            name={`cents-${name}`}
            checked={format.minorUnits ?? false}
            onChange={(minorUnits) => {
              const next = { ...format };
              if (minorUnits) next.minorUnits = true;
              else delete next.minorUnits;
              onChange(next);
            }}
          />
        </div>
      ) : null}
      {format ? (
        <SelectField
          label="Decimal places"
          name={`decimals-${name}`}
          value={format.decimals === undefined ? "" : String(format.decimals)}
          options={[
            { value: "", label: "As usual" },
            ...[0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) })),
          ]}
          onChange={(places) => {
            const next = { ...format };
            if (places === "") delete next.decimals;
            else next.decimals = Number(places);
            onChange(next);
          }}
        />
      ) : null}
      {example ? <p className="m-0 text-[12.5px] text-ink-muted">Shown as {example}</p> : null}
    </div>
  );
}

function WidgetSettings({
  widget,
  page,
  tables,
  tableNames,
  onChange,
  onRemove,
}: {
  widget: PageWidget;
  page: InterfacePage;
  tables: Record<string, TableInfo>;
  tableNames: string[];
  onChange: (change: (widget: PageWidget) => void) => void;
  onRemove: () => void;
}) {
  const info = widget.table ? tables[widget.table] : undefined;
  const columns = info?.columns ?? [];
  const options = (list: { name: string }[]) =>
    list.map((column) => ({ value: column.name, label: heading(column.name) }));
  const summary = widget.summary;
  // The names a widget's rows have: its totals' names, or its table's columns.
  const shownNames = summary
    ? [
        ...summary.groupBy.map((group) => ({ name: group.column })),
        ...summary.aggregates.map((aggregate) => ({ name: aggregate.as })),
      ]
    : columns;
  const fields = widget.fields ?? [];
  const links = linkChoices(widget, page, tables);
  const conditions: { column: string; op?: string; value?: unknown }[] =
    widget.filter === undefined
      ? []
      : "and" in (widget.filter as object)
        ? ((widget.filter as { and: Filter[] }).and as { column: string }[])
        : [widget.filter as { column: string }];
  const setConditions = (next: typeof conditions) =>
    onChange((draft) => {
      if (next.length === 0) delete draft.filter;
      else draft.filter = next.length === 1 ? next[0] : { and: next };
    });
  const section = "mt-4 mb-0 text-[13px] font-semibold tracking-wide text-ink-muted uppercase";

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Title"
        name="title"
        value={widget.title ?? ""}
        maxLength={100}
        onChange={(title) =>
          onChange((draft) => {
            if (title) draft.title = title;
            else delete draft.title;
          })
        }
      />
      {widget.type === "text" ? (
        <TextAreaField
          label="Text"
          name="text"
          rows={6}
          value={widget.options?.text ?? ""}
          onChange={(text) =>
            onChange((draft) => {
              draft.options = { ...draft.options, text };
            })
          }
        />
      ) : (
        <ComboboxField
          label="Table"
          options={tableNames.map((name) => ({ value: name, label: name }))}
          value={widget.table}
          placeholder="Choose a table"
          onChange={(table) =>
            onChange((draft) => {
              if (table === draft.table) return;
              // Everything below was about the other table's columns.
              for (const key of ["summary", "fields", "sort", "filter", "link"] as const) {
                delete draft[key];
              }
              if (table) draft.table = table;
              else delete draft.table;
            })
          }
        />
      )}

      {widget.table && (widget.type === "table" || widget.type === "chart") ? (
        <>
          <CheckboxField
            label="Show totals in place of rows"
            name="totals"
            checked={summary !== undefined}
            hint="Count, add up or average the rows, for the whole table or for each group."
            onChange={(on) =>
              onChange((draft) => {
                delete draft.fields;
                delete draft.sort;
                if (on) draft.summary = { groupBy: [], aggregates: [{ fn: "count", as: "count" }] };
                else delete draft.summary;
              })
            }
          />
          {summary ? (
            <div className="flex flex-col gap-2 rounded-control border border-line p-2">
              {summary.groupBy.map((group, index) => {
                const type = columns.find((column) => column.name === group.column)?.type;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a group has no identity but its place
                  <div key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <SelectField
                        label={`Group ${index + 1}`}
                        name={`group-${index}`}
                        value={group.column}
                        options={options(columns)}
                        onChange={(column) =>
                          onChange((draft) => {
                            const target = draft.summary?.groupBy[index];
                            if (target) {
                              target.column = column;
                              delete target.bucket;
                            }
                          })
                        }
                      />
                    </div>
                    {type === "timestamp" || type === "date" ? (
                      <SelectField
                        label="Gathered"
                        name={`bucket-${index}`}
                        value={group.bucket ?? ""}
                        options={BUCKETS}
                        onChange={(bucket) =>
                          onChange((draft) => {
                            const target = draft.summary?.groupBy[index];
                            if (!target) return;
                            if (bucket) target.bucket = bucket as "day";
                            else delete target.bucket;
                          })
                        }
                      />
                    ) : null}
                    <Button
                      aria-label={`Remove group ${index + 1}`}
                      onClick={() =>
                        onChange((draft) => {
                          draft.summary?.groupBy.splice(index, 1);
                        })
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
              {summary.groupBy.length < 3 && columns.length > 0 ? (
                <Button
                  size="small"
                  onClick={() =>
                    onChange((draft) => {
                      const free = columns.find(
                        (column) =>
                          !["json", "file"].includes(column.type) &&
                          !draft.summary?.groupBy.some((group) => group.column === column.name) &&
                          !SYSTEM.some((system) => system.name === column.name),
                      );
                      if (free) draft.summary?.groupBy.push({ column: free.name });
                    })
                  }
                >
                  <Plus size={14} aria-hidden="true" /> Group by a column
                </Button>
              ) : null}
              {summary.aggregates.map((aggregate, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a total has no identity but its place
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={`Total ${index + 1}`}
                    name={`fn-${index}`}
                    value={aggregate.fn}
                    options={FUNCTIONS}
                    onChange={(fn) =>
                      onChange((draft) => {
                        const target = draft.summary?.aggregates[index];
                        if (!target) return;
                        target.fn = fn as "count";
                        const numeric = columns.find((column) =>
                          ["integer", "number"].includes(column.type),
                        )?.name;
                        if (fn === "count") delete target.column;
                        else if (target.column === undefined && numeric) target.column = numeric;
                        target.as = target.column ? `${fn}_${target.column}`.slice(0, 63) : "count";
                      })
                    }
                  />
                  {aggregate.fn !== "count" ? (
                    <div className="min-w-0 flex-1">
                      <SelectField
                        label="Of"
                        name={`of-${index}`}
                        value={aggregate.column ?? ""}
                        options={options(
                          columns.filter((column) =>
                            aggregate.fn === "sum" || aggregate.fn === "avg"
                              ? ["integer", "number"].includes(column.type)
                              : ["integer", "number", "timestamp", "date", "text"].includes(
                                  column.type,
                                ),
                          ),
                        )}
                        onChange={(column) =>
                          onChange((draft) => {
                            const target = draft.summary?.aggregates[index];
                            if (!target) return;
                            target.column = column;
                            target.as = `${target.fn}_${column}`.slice(0, 63);
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {summary.aggregates.length > 1 ? (
                    <Button
                      aria-label={`Remove total ${index + 1}`}
                      onClick={() =>
                        onChange((draft) => {
                          draft.summary?.aggregates.splice(index, 1);
                        })
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {summary.aggregates.length < 5 ? (
                <Button
                  size="small"
                  onClick={() =>
                    onChange((draft) => {
                      const numeric = columns.find((column) =>
                        ["integer", "number"].includes(column.type),
                      );
                      const taken = new Set(draft.summary?.aggregates.map((one) => one.as));
                      const next = numeric
                        ? { fn: "sum" as const, column: numeric.name, as: `sum_${numeric.name}` }
                        : { fn: "count" as const, as: "count" };
                      if (!taken.has(next.as)) draft.summary?.aggregates.push(next);
                    })
                  }
                >
                  <Plus size={14} aria-hidden="true" /> Add a total
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {widget.table && widget.type === "chart" ? (
        <>
          <h3 className={section}>What to draw</h3>
          <SelectField
            label="Shape"
            name="mark"
            value={widget.options?.mark ?? ""}
            options={[
              { value: "", label: "Choose a shape" },
              { value: "bar", label: "Bars" },
              { value: "line", label: "A line" },
              { value: "area", label: "An area" },
              { value: "pie", label: "A pie" },
            ]}
            onChange={(mark) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (mark) draft.options.mark = mark as "bar";
                else delete draft.options.mark;
              })
            }
          />
          {(["x", "y", "series"] as const).map((axis) => (
            <SelectField
              key={axis}
              label={
                axis === "x"
                  ? "Along the bottom, or each slice"
                  : axis === "y"
                    ? "How much"
                    : "A color for each"
              }
              name={axis}
              value={widget.options?.[axis] ?? ""}
              options={[
                { value: "", label: axis === "series" ? "Nothing" : "Choose" },
                ...options(shownNames),
              ]}
              onChange={(name) =>
                onChange((draft) => {
                  draft.options = { ...draft.options };
                  if (name) draft.options[axis] = name;
                  else delete draft.options[axis];
                })
              }
            />
          ))}
          <FormatSettings
            name="chart"
            label="How much is written as"
            format={widget.options?.format}
            onChange={(format) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (format) draft.options.format = format;
                else delete draft.options.format;
              })
            }
          />
        </>
      ) : null}

      {widget.table && widget.type === "figure" ? (
        <>
          <h3 className={section}>Number</h3>
          <FormatSettings
            name="figure"
            label="Written as"
            format={widget.options?.format}
            onChange={(format) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (format) draft.options.format = format;
                else delete draft.options.format;
                if (Object.keys(draft.options).length === 0) delete draft.options;
              })
            }
          />
        </>
      ) : null}

      {widget.table && widget.type !== "text" && widget.type !== "chart" ? (
        <>
          <h3 className={section}>{widget.type === "form" ? "Asks for" : "Shows"}</h3>
          {fields.length === 0 && widget.type !== "form" ? (
            <p className="m-0 text-[13px] text-ink-muted">
              {summary ? "Every group and total." : "The table's first columns. Add one to choose."}
            </p>
          ) : null}
          {fields.map((field, index) => {
            const column = columns.find((candidate) => candidate.name === field.column);
            const target = column?.references ? tables[column.references] : undefined;
            return (
              <div
                key={field.column}
                className="flex flex-col gap-2 rounded-control border border-line p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[13px]">{heading(field.column)}</strong>
                  <span className="flex gap-1">
                    <Button
                      size="small"
                      aria-label={`Move ${field.column} up`}
                      disabled={index === 0}
                      onClick={() =>
                        onChange((draft) => {
                          const list = draft.fields ?? [];
                          [list[index - 1], list[index]] = [
                            list[index] as (typeof list)[number],
                            list[index - 1] as (typeof list)[number],
                          ];
                        })
                      }
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                    </Button>
                    <Button
                      size="small"
                      aria-label={`Move ${field.column} down`}
                      disabled={index === fields.length - 1}
                      onClick={() =>
                        onChange((draft) => {
                          const list = draft.fields ?? [];
                          [list[index + 1], list[index]] = [
                            list[index] as (typeof list)[number],
                            list[index + 1] as (typeof list)[number],
                          ];
                        })
                      }
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </Button>
                    <Button
                      size="small"
                      aria-label={`Remove ${field.column}`}
                      onClick={() =>
                        onChange((draft) => {
                          draft.fields?.splice(index, 1);
                          if (draft.fields?.length === 0) delete draft.fields;
                        })
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </span>
                </div>
                <TextField
                  label={`Called (${field.column})`}
                  name={`label-${field.column}`}
                  value={field.label ?? ""}
                  placeholder={heading(field.column)}
                  maxLength={100}
                  onChange={(label) =>
                    onChange((draft) => {
                      const one = draft.fields?.[index];
                      if (!one) return;
                      if (label) one.label = label;
                      else delete one.label;
                    })
                  }
                />
                {target && widget.type !== "form" ? (
                  <SelectField
                    label={`Shown as (${field.column})`}
                    name={`show-${field.column}`}
                    value={field.show ?? ""}
                    options={[
                      { value: "", label: "Its ID" },
                      ...options(
                        target.columns.filter((one) => !SYSTEM.some((s) => s.name === one.name)),
                      ),
                    ]}
                    onChange={(show) =>
                      onChange((draft) => {
                        const one = draft.fields?.[index];
                        if (!one) return;
                        if (show) one.show = show;
                        else delete one.show;
                      })
                    }
                  />
                ) : null}
                {widget.type !== "form" &&
                (summary
                  ? summary.aggregates.some(
                      (aggregate) =>
                        aggregate.as === field.column &&
                        (aggregate.fn === "count" ||
                          ["integer", "number"].includes(
                            columns.find((one) => one.name === aggregate.column)?.type ?? "",
                          )),
                    )
                  : column?.type === "integer" || column?.type === "number") ? (
                  <FormatSettings
                    name={field.column}
                    label={`Written as (${field.column})`}
                    format={field.format}
                    onChange={(format) =>
                      onChange((draft) => {
                        const one = draft.fields?.[index];
                        if (!one) return;
                        if (format) one.format = format;
                        else delete one.format;
                      })
                    }
                  />
                ) : null}
                {!summary && (widget.type === "table" || widget.type === "cards") ? (
                  <CheckboxField
                    label={`Can be changed here (${field.column})`}
                    name={`editable-${field.column}`}
                    checked={field.editable ?? false}
                    onChange={(editable) =>
                      onChange((draft) => {
                        const one = draft.fields?.[index];
                        if (!one) return;
                        if (editable) one.editable = true;
                        else delete one.editable;
                      })
                    }
                  />
                ) : null}
              </div>
            );
          })}
          <SelectField
            label="Add"
            name="add-field"
            value=""
            options={[
              { value: "", label: "Choose what to add" },
              ...options(
                shownNames.filter(
                  (column) =>
                    !fields.some((field) => field.column === column.name) &&
                    !(
                      widget.type === "form" && SYSTEM.some((system) => system.name === column.name)
                    ),
                ),
              ),
            ]}
            onChange={(name) => {
              if (!name) return;
              onChange((draft) => {
                draft.fields = [...(draft.fields ?? []), { column: name }];
              });
            }}
          />
          {widget.type !== "form" ? (
            <p className="m-0 text-[12.5px] text-ink-muted">
              Leaving a value out only keeps it off the screen. Whoever may read the row can still
              be sent it. What keeps rows from people is the table's row rules.
            </p>
          ) : null}
        </>
      ) : null}

      {widget.table && widget.type !== "text" && widget.type !== "form" ? (
        <>
          <h3 className={section}>Order and filter</h3>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelectField
                label="Sorted by"
                name="sort"
                value={widget.sort?.[0]?.column ?? ""}
                options={[{ value: "", label: "As they come" }, ...options(shownNames)]}
                onChange={(column) =>
                  onChange((draft) => {
                    if (column)
                      draft.sort = [{ column, ...(draft.sort?.[0]?.desc ? { desc: true } : {}) }];
                    else delete draft.sort;
                  })
                }
              />
            </div>
            {widget.sort?.[0] ? (
              <SelectField
                label="Direction"
                name="direction"
                value={widget.sort[0].desc ? "desc" : "asc"}
                options={[
                  { value: "asc", label: "Up" },
                  { value: "desc", label: "Down" },
                ]}
                onChange={(direction) =>
                  onChange((draft) => {
                    const first = draft.sort?.[0];
                    if (!first) return;
                    if (direction === "desc") first.desc = true;
                    else delete first.desc;
                  })
                }
              />
            ) : null}
          </div>
          {conditions.map((condition, index) => {
            const type = columns.find((column) => column.name === condition.column)?.type ?? "text";
            const change = (patch: object) =>
              setConditions(
                conditions.map((one, at) => (at === index ? { ...one, ...patch } : one)),
              );
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a condition has no identity but its place
                key={index}
                className="flex flex-wrap items-end gap-2 rounded-control border border-line p-2"
              >
                <SelectField
                  label={`Only rows where (${index + 1})`}
                  name={`where-${index}`}
                  value={condition.column}
                  options={options(columns.filter((column) => column.type !== "json"))}
                  onChange={(column) => change({ column, value: undefined })}
                />
                <SelectField
                  label="Test"
                  name={`op-${index}`}
                  value={condition.op ?? "eq"}
                  options={OPERATORS.filter((op) => op.value !== "contains" || type === "text")}
                  onChange={(op) => change({ op })}
                />
                {condition.op !== "is_null" ? (
                  <TextField
                    label="Value"
                    name={`value-${index}`}
                    value={condition.value === undefined ? "" : String(condition.value)}
                    onChange={(text) =>
                      change({
                        value:
                          type === "integer" || type === "number"
                            ? text === "" || Number.isNaN(Number(text))
                              ? undefined
                              : Number(text)
                            : type === "boolean"
                              ? text === "true"
                              : text,
                      })
                    }
                  />
                ) : null}
                <Button
                  aria-label={`Remove condition ${index + 1}`}
                  onClick={() => setConditions(conditions.filter((_, at) => at !== index))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          {summary && conditions.length === 0 ? (
            <p className="m-0 text-[12.5px] text-ink-muted">
              A condition narrows what is counted or added up here, besides the page's filters: for
              example, only the invoices whose status is unpaid.
            </p>
          ) : null}
          {conditions.length < 20 && columns.length > 0 ? (
            <Button
              size="small"
              onClick={() =>
                setConditions([
                  ...conditions,
                  {
                    column:
                      (columns.find((column) => !SYSTEM.includes(column)) ?? columns[0])?.name ??
                      "id",
                    op: "eq",
                  },
                ])
              }
            >
              <Plus size={14} aria-hidden="true" /> Add a condition
            </Button>
          ) : null}
        </>
      ) : null}

      {widget.table && widget.type !== "text" ? (
        <>
          <h3 className={section}>Follows</h3>
          <SelectField
            label="What it shows follows"
            name="link"
            value={widget.link ? JSON.stringify(widget.link) : ""}
            options={[
              {
                value: "",
                label: widget.type === "form" ? "Nothing" : "Nothing: it shows the table",
              },
              ...links.map((choice) => ({ value: choice.value, label: choice.label })),
              // A link that the page no longer allows is still shown, so that it can be seen and taken off.
              ...(widget.link &&
              !links.some((choice) => choice.value === JSON.stringify(widget.link))
                ? [{ value: JSON.stringify(widget.link), label: "A link that no longer fits" }]
                : []),
            ]}
            hint={
              links.length === 0
                ? "Nothing else on this page can be followed yet. A widget can follow one over the same table, or one a column of its table refers to."
                : "Choosing a row in the other widget decides what this one shows."
            }
            onChange={(value) =>
              onChange((draft) => {
                if (value) draft.link = JSON.parse(value) as WidgetLink;
                else delete draft.link;
              })
            }
          />
        </>
      ) : null}

      {widget.type === "form" ? (
        <>
          <TextField
            label="Button"
            name="submitLabel"
            value={widget.options?.submitLabel ?? ""}
            placeholder="Add"
            maxLength={60}
            onChange={(submitLabel) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (submitLabel) draft.options.submitLabel = submitLabel;
                else delete draft.options.submitLabel;
              })
            }
          />
          <TextField
            label="Says afterwards"
            name="success"
            value={widget.options?.success ?? ""}
            placeholder="Added."
            maxLength={300}
            onChange={(success) =>
              onChange((draft) => {
                draft.options = { ...draft.options };
                if (success) draft.options.success = success;
                else delete draft.options.success;
              })
            }
          />
        </>
      ) : null}
      {(widget.type === "table" || widget.type === "cards") && !summary ? (
        <>
          <CheckboxField
            label="Rows can be added here"
            name="allowAdd"
            checked={widget.options?.allowAdd ?? false}
            onChange={(allowAdd) =>
              onChange((draft) => {
                draft.options = { ...draft.options, allowAdd };
              })
            }
          />
          {widget.type === "table" ? (
            <CheckboxField
              label="Rows can be deleted here"
              name="allowDelete"
              checked={widget.options?.allowDelete ?? false}
              onChange={(allowDelete) =>
                onChange((draft) => {
                  draft.options = { ...draft.options, allowDelete };
                })
              }
            />
          ) : null}
        </>
      ) : null}

      <h3 className={section}>Place and size</h3>
      <p className="m-0 text-[12.5px] text-ink-muted">
        The page is twelve columns wide. A widget can also be dragged by its heading and stretched
        by its bottom right corner.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["x", "From the left", 0, 11],
            ["y", "From the top", 0, 199],
            ["w", "Width", 1, 12],
            ["h", "Height", 1, 40],
          ] as const
        ).map(([key, label, min, max]) => (
          <NumberField
            key={key}
            label={label}
            name={key}
            min={min}
            max={max}
            step={1}
            value={widget.at[key]}
            onChange={(value) =>
              onChange((draft) => {
                if (value === undefined) return;
                draft.at[key] = Math.min(max, Math.max(min, Math.round(value)));
                // A widget ends where the page does.
                if (draft.at.x + draft.at.w > 12) draft.at.w = 12 - draft.at.x;
              })
            }
          />
        ))}
      </div>
      <div className="mt-2">
        <Button variant="danger" onClick={onRemove}>
          Remove this widget
        </Button>
      </div>
    </div>
  );
}

/** A page as it is, for someone who may look and not change it. */
export function PageView({ root, page }: { root: string; page: InterfacePage }) {
  const client = useMemo(() => clientFor(root), [root]);
  const [known, setKnown] = useState<Record<string, TableInfo>>({});
  const tables = useTables(root, tablesOf({ title: "", pages: [page] }, known));
  useEffect(() => setKnown(tables), [tables]);
  return <PageRenderer page={page} tables={known} client={client} />;
}

// ----- One page being worked on -----

/**
 * A page drawn from the workspace's rows as the member may read them, beside
 * the settings of the widget that is chosen. The builder of an app uses it
 * for each of the app's pages, and a dashboard is one of these.
 */
export function PageEditor({
  root,
  page,
  selected,
  onSelect,
  onChange,
}: {
  root: string;
  page: InterfacePage;
  selected: string | undefined;
  onSelect: (widget: string | undefined) => void;
  onChange: (apply: (page: InterfacePage) => void) => void;
}) {
  const tableList = useLoad<{ items: { name: string; status: string }[] }>(`${root}/tables`);
  const [viewport, setViewport] = useState<keyof typeof VIEWPORTS>("desktop");
  const [asGroup, setAsGroup] = useState("");
  const tenantBase = root.split("/workspaces/")[0] ?? "";
  const memberGroups = useLoad<{ items: { id: string; name: string }[] }>(
    `${tenantBase}/groups?limit=200`,
  );
  const endUserGroups = useLoad<{ items: { id: string; name: string }[] }>(
    `${tenantBase}/end-user-groups?limit=200`,
  );
  const client = useMemo(() => clientFor(root, asGroup || undefined), [root, asGroup]);
  const [known, setKnown] = useState<Record<string, TableInfo>>({});
  const tables = useTables(root, tablesOf({ title: "", pages: [page] }, known));
  useEffect(() => setKnown(tables), [tables]);
  const tableNames = (tableList.data?.items ?? [])
    .filter((table) => table.status === "active")
    .map((table) => table.name);
  const widget = page.widgets.find((candidate) => candidate.id === selected);

  const addWidget = (type: WidgetType) => {
    let id: string = type;
    for (let count = 2; page.widgets.some((one) => one.id === id); count += 1) {
      id = `${type}_${count}`;
    }
    onChange((target) => {
      const bottom = Math.max(0, ...target.widgets.map((one) => one.at.y + one.at.h));
      const wide = type === "table" || type === "cards";
      target.widgets.push({
        id,
        type,
        title: TYPES.find((one) => one.type === type)?.label ?? type,
        at: {
          x: 0,
          y: bottom,
          w: wide ? 12 : type === "figure" ? 3 : 6,
          h: type === "text" || type === "figure" ? 3 : 8,
        },
        ...(type === "text" ? { options: { text: "Write something here." } } : {}),
        ...(type === "figure"
          ? { summary: { groupBy: [], aggregates: [{ fn: "count" as const, as: "count" }] } }
          : {}),
      });
    });
    onSelect(id);
  };

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div
            role="radiogroup"
            aria-label="Screen size"
            className="flex rounded-control border border-line p-0.5"
          >
            {(Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]).map((one) => {
              const Icon = VIEWPORTS[one].icon;
              return (
                // biome-ignore lint/a11y/useSemanticElements: a segmented control of toggle buttons
                <button
                  key={one}
                  type="button"
                  role="radio"
                  aria-checked={viewport === one}
                  onClick={() => setViewport(one)}
                  className={`flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-meta ${
                    viewport === one ? "bg-selected text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Icon aria-hidden="true" size={14} /> {VIEWPORTS[one].label}
                  {VIEWPORTS[one].width ? (
                    <span className="font-mono text-tag text-ink-subtle">
                      {VIEWPORTS[one].width}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="w-64">
            <SelectField
              label="See it as"
              name="as"
              value={asGroup}
              onChange={setAsGroup}
              options={[
                { value: "", label: "You, as you may read it" },
                ...(endUserGroups.data?.items ?? []).map((group) => ({
                  value: group.id,
                  label: `End users in ${group.name}`,
                })),
                ...(memberGroups.data?.items ?? []).map((group) => ({
                  value: group.id,
                  label: `Members in ${group.name}`,
                })),
              ]}
            />
          </div>
        </div>
        {asGroup ? (
          <p className="mt-0 mb-3 text-meta text-ink-muted">
            Rows as someone in this group who owns none would see them. Owner rules show nothing
            here.
          </p>
        ) : null}
        <div
          className="mx-auto overflow-x-auto rounded-panel border border-line bg-canvas p-3 transition-[max-width]"
          style={{
            maxWidth: VIEWPORTS[viewport].width ? `${VIEWPORTS[viewport].width}px` : undefined,
          }}
        >
          <PageRenderer
            page={page}
            tables={known}
            client={client}
            editing={{
              selected,
              onSelect,
              onMove: (id, to) =>
                onChange((target) => {
                  const moved = target.widgets.find((one) => one.id === id);
                  if (moved) moved.at = to;
                  // Whatever it was dropped on moves out of its way.
                  settle(target.widgets, id);
                }),
            }}
          />
        </div>
        <PageFilterSettings page={page} known={known} onChange={onChange} />
        {page.widgets.length < 12 ? (
          <fieldset className="mt-4 rounded-panel border border-line border-dashed p-3">
            <legend className="px-1 text-[13px] text-ink-muted">Add a widget</legend>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((one) => (
                <Button key={one.type} title={one.about} onClick={() => addWidget(one.type)}>
                  <Plus size={14} aria-hidden="true" /> {one.label}
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
      <aside
        aria-label="Settings"
        className="w-full shrink-0 rounded-panel border border-line bg-surface p-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:w-80 xl:overflow-auto"
      >
        {widget ? (
          <WidgetSettings
            key={widget.id}
            widget={widget}
            page={page}
            tables={known}
            tableNames={tableNames}
            onChange={(apply) =>
              onChange((target) => {
                const changed = target.widgets.find((one) => one.id === widget.id);
                if (!changed) return;
                const before = JSON.stringify(changed.at);
                apply(changed);
                if (JSON.stringify(changed.at) !== before) settle(target.widgets, widget.id);
              })
            }
            onRemove={() => {
              onChange((target) => {
                target.widgets = target.widgets.filter((one) => one.id !== widget.id);
                // Whatever followed it follows nothing now.
                for (const one of target.widgets) {
                  if (one.link?.from === widget.id) delete one.link;
                }
                // What was under it rises into the room it left.
                settle(target.widgets, undefined);
              });
              onSelect(undefined);
            }}
          />
        ) : (
          <p className="m-0 text-ink-muted">
            Press Edit on a widget to change it, or add one. What you see is drawn from this
            workspace's rows, as you may read them.
          </p>
        )}
      </aside>
    </div>
  );
}

/**
 * Filters across the page for whoever reads it: a range of dates, or one value
 * of a column. Each narrows every widget whose table has that column.
 */
function PageFilterSettings({
  page,
  known,
  onChange,
}: {
  page: InterfacePage;
  known: Record<string, TableInfo>;
  onChange: (apply: (page: InterfacePage) => void) => void;
}) {
  const columns = [
    ...new Set(
      page.widgets.flatMap((widget) =>
        widget.table ? (known[widget.table]?.columns ?? []).map((column) => column.name) : [],
      ),
    ),
  ].sort();
  const filters = page.filters ?? [];
  return (
    <fieldset className="mt-4 rounded-panel border border-line p-3">
      <legend className="px-1 text-[13px] text-ink-muted">
        Filters for whoever reads this page
      </legend>
      <div className="flex flex-col gap-2">
        {filters.length === 0 ? (
          <p className="m-0 text-[13px] text-ink-muted">
            None. A filter narrows every widget whose table has its column.
          </p>
        ) : null}
        {filters.map((one, index) => (
          <div key={one.id} className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <TextField
                label="Label"
                name={`filter-${one.id}-label`}
                value={one.label}
                required={false}
                onChange={(value) =>
                  onChange((target) => {
                    const found = target.filters?.[index];
                    if (found) found.label = value || one.column;
                  })
                }
              />
            </div>
            <div className="w-40">
              <SelectField
                label="Column"
                name={`filter-${one.id}-column`}
                value={one.column}
                options={columns.map((name) => ({ value: name, label: name }))}
                onChange={(value) =>
                  onChange((target) => {
                    const found = target.filters?.[index];
                    if (found) found.column = value;
                  })
                }
              />
            </div>
            <div className="w-36">
              <SelectField
                label="Kind"
                name={`filter-${one.id}-type`}
                value={one.type}
                options={[
                  { value: "date", label: "Range of dates" },
                  { value: "value", label: "One value" },
                ]}
                onChange={(value) =>
                  onChange((target) => {
                    const found = target.filters?.[index];
                    if (found) found.type = value === "date" ? "date" : "value";
                  })
                }
              />
            </div>
            <Button
              size="small"
              variant="danger"
              onClick={() => onChange((target) => target.filters?.splice(index, 1))}
            >
              Remove
            </Button>
          </div>
        ))}
        {filters.length < 4 && columns.length > 0 ? (
          <div>
            <Button
              size="small"
              onClick={() =>
                onChange((target) => {
                  const column =
                    columns.find((name) => name.endsWith("_at")) ?? (columns[0] as string);
                  let id = "filter";
                  for (let n = 2; (target.filters ?? []).some((one) => one.id === id); n += 1)
                    id = `filter_${n}`;
                  target.filters = [
                    ...(target.filters ?? []),
                    {
                      id,
                      label: heading(column),
                      column,
                      type: column.endsWith("_at") ? "date" : "value",
                    },
                  ];
                })
              }
            >
              <Plus size={14} aria-hidden="true" /> Add a filter
            </Button>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

/** The sizes the preview can be drawn at. */
const VIEWPORTS = {
  desktop: { label: "Desktop", width: undefined, icon: Monitor },
  tablet: { label: "Tablet", width: 768, icon: Tablet },
  phone: { label: "Phone", width: 390, icon: Smartphone },
} as const;

// ----- The builder -----

type Saving = "saved" | "waiting" | "saving" | { failed: string };

/** Builds one interface: a preview drawn from live rows, and the settings of what is chosen. */
export function InterfaceBuilder({
  root,
  link,
  path,
}: {
  root: string;
  link: string;
  path: string;
}) {
  const [body, setBody] = useState<InterfaceBody>();
  const [missing, setMissing] = useState<string>();
  const [pageId, setPageId] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [saving, setSaving] = useState<Saving>("saved");
  const [problems, setProblems] = useState<{ path: string; message: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
  const revision = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const list = useLoad<{ items: Listed[] }>(`${root}/interfaces`);
  const drafts = useLoad<{ items: { path: string }[] }>(`${root}/drafts`);
  const apps = useLoad<{ items: { path: string; url: string }[] }>(`${root}/apps`);

  // What is saved and not deployed, or else what is deployed.
  useEffect(() => {
    let current = true;
    api.get<DraftAnswer>(`${root}/drafts/${path}`).then(
      (draft) => {
        if (!current) return;
        revision.current = draft.revision;
        setBody(draft.body);
      },
      () =>
        api.get<{ interface: InterfaceBody }>(`${root}/interfaces/${path}`).then(
          (view) => current && setBody(view.interface),
          (error: ApiError) => current && setMissing(error.message),
        ),
    );
    return () => {
      current = false;
    };
  }, [root, path]);

  const save = useCallback(
    async (next: InterfaceBody) => {
      setSaving("saving");
      try {
        const saved = await api.put<DraftAnswer>(`${root}/drafts/${path}`, {
          kind: "interface",
          schemaVersion: 1,
          body: next,
          ...(revision.current !== undefined ? { revision: revision.current } : {}),
        });
        revision.current = saved.revision;
        setProblems(saved.problems ?? []);
        setSaving("saved");
        return true;
      } catch (error) {
        setSaving({ failed: failureText(error) });
        return false;
      }
    },
    [root, path],
  );
  // A change is saved a moment after the last one, so that typing does not save every letter.
  useEffect(() => {
    if (!body || !dirty.current) return;
    setSaving("waiting");
    const timer = setTimeout(() => {
      dirty.current = false;
      void save(body);
    }, 700);
    return () => clearTimeout(timer);
  }, [body, save]);

  const change = (apply: (draft: InterfaceBody) => void) => {
    setBody((before) => {
      if (!before) return before;
      const next = structuredClone(before);
      apply(next);
      dirty.current = true;
      return next;
    });
  };

  if (missing) return <Notice tone="danger">{missing}</Notice>;
  if (!body) return <p className="text-ink-muted">Loading…</p>;
  const page = body.pages.find((candidate) => candidate.id === pageId) ?? body.pages[0];
  const listed = list.data?.items.find((item) => item.path === path);
  const appPath = listed?.app ?? null;
  const pending = new Set(drafts.data?.items.map((draft) => draft.path));
  const hasChanges =
    pending.has(path) || (appPath !== null && pending.has(appPath)) || saving !== "saved";
  const url = apps.data?.items.find((app) => app.path === appPath)?.url;
  const publish = async () => {
    setPublishing(true);
    try {
      dirty.current = false;
      if (!(await save(body))) return;
      const fresh = await api.get<{ items: { path: string }[] }>(`${root}/drafts`);
      const waiting = new Set(fresh.items.map((draft) => draft.path));
      const paths = [path, ...(appPath ? [appPath] : [])].filter((one) => waiting.has(one));
      if (paths.length === 0) {
        notify.success("Nothing has changed since it was last published.");
        return;
      }
      await api.post(`${root}/changes/deploy`, { paths, message: `Publish ${body.title}` });
      revision.current = undefined;
      notify.success("Published. People who open the app now see this.");
      list.reload();
      drafts.reload();
      apps.reload();
    } catch (error) {
      notify.error(error);
    } finally {
      setPublishing(false);
    }
  };

  /** Where a problem is, in the words of the page: its page and widget. */
  const where = (problemPath: string) => {
    const match = /^\/body\/pages\/(\d+)(?:\/widgets\/(\d+))?/.exec(problemPath);
    const at = match ? body.pages[Number(match[1])] : undefined;
    const on = at && match?.[2] !== undefined ? at.widgets[Number(match[2])] : undefined;
    return [at?.title, on ? on.title || heading(on.id) : undefined].filter(Boolean).join(" › ");
  };

  return (
    <section className="flex flex-col gap-4">
      <Link to={`${link}/screens`} className="flex w-fit items-center gap-1 text-action">
        <ArrowLeft size={16} aria-hidden="true" /> All apps made here
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-80 max-w-full">
          <TextField
            label="Name of the app"
            name="app-title"
            value={body.title}
            maxLength={200}
            required
            onChange={(title) =>
              change((draft) => {
                if (title) draft.title = title;
              })
            }
          />
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-muted" role="status">
            {saving === "saved"
              ? hasChanges
                ? "Saved. Not published yet."
                : "Published."
              : saving === "saving" || saving === "waiting"
                ? "Saving…"
                : `Not saved: ${saving.failed}`}
          </span>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-action">
              Open the app
            </a>
          ) : null}
          <Button
            variant="primary"
            disabled={publishing || problems.length > 0 || typeof saving === "object"}
            onClick={publish}
          >
            Publish
          </Button>
        </span>
      </header>
      {appPath === null && list.data ? (
        <Notice
          tone="attention"
          action={
            <Button
              onClick={async () => {
                const address = await ask.prompt({
                  title: "Make an app for it",
                  text: "The app's address ends with this. Lower-case letters, digits and dashes.",
                  label: "Address",
                  initial: slug(body.title),
                  action: "Make the app",
                });
                if (!address) return;
                try {
                  await api.put(`${root}/drafts/${slug(address)}`, {
                    kind: "app",
                    schemaVersion: 1,
                    body: { title: body.title, interface: path },
                  });
                  list.reload();
                  drafts.reload();
                } catch (error) {
                  notify.error(error);
                }
              }}
            >
              Make an app for it
            </Button>
          }
        >
          No app serves this yet, so nobody can open it.
        </Notice>
      ) : null}
      {problems.length > 0 ? (
        <Notice tone="attention">
          <strong>To fix before it can be published:</strong>
          <ul className="mt-1 mb-0 pl-5">
            {problems.map((problem) => (
              <li key={`${problem.path} ${problem.message}`}>
                {where(problem.path)}: {problem.message}.
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-line border-b pb-2">
        {body.pages.map((one) => (
          <Button
            key={one.id}
            variant={one.id === page?.id ? "primary" : "quiet"}
            aria-pressed={one.id === page?.id}
            onClick={() => {
              setPageId(one.id);
              setSelected(undefined);
            }}
          >
            {one.title}
          </Button>
        ))}
        {body.pages.length < 20 ? (
          <Button
            onClick={async () => {
              const title = await ask.prompt({
                title: "Add a page",
                label: "Name of the page",
                action: "Add the page",
              });
              if (!title) return;
              change((draft) => {
                let id = slug(title).replace(/^[^a-z]+/, "") || "page";
                for (let count = 2; draft.pages.some((one) => one.id === id); count += 1) {
                  id = `${slug(title) || "page"}-${count}`;
                }
                draft.pages.push({ id, title, widgets: [] });
                setPageId(id);
                setSelected(undefined);
              });
            }}
          >
            <Plus size={14} aria-hidden="true" /> Page
          </Button>
        ) : null}
        {page ? (
          <>
            <Button
              variant="quiet"
              onClick={async () => {
                const title = await ask.prompt({
                  title: "Rename the page",
                  label: "Name of the page",
                  initial: page.title,
                  action: "Rename",
                });
                if (!title) return;
                change((draft) => {
                  const target = draft.pages.find((one) => one.id === page.id);
                  if (target) target.title = title;
                });
              }}
            >
              Rename
            </Button>
            {body.pages.length > 1 ? (
              <Button
                variant="quiet"
                onClick={async () => {
                  const sure = await ask.confirm({
                    title: `Remove the page ${page.title}?`,
                    text: "Its widgets go with it. Nothing in any table is touched.",
                    action: "Remove the page",
                    danger: true,
                  });
                  if (!sure) return;
                  change((draft) => {
                    draft.pages = draft.pages.filter((one) => one.id !== page.id);
                  });
                  setPageId(undefined);
                  setSelected(undefined);
                }}
              >
                Remove page
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {page ? (
        <PageEditor
          root={root}
          page={page}
          selected={selected}
          onSelect={setSelected}
          onChange={(apply) =>
            change((draft) => {
              const target = draft.pages.find((one) => one.id === page.id);
              if (target) apply(target);
            })
          }
        />
      ) : null}
    </section>
  );
}

// ----- The list -----

/** The apps made in the console: each an interface, and the app that serves it. */
export function Interfaces({
  root,
  link,
  editable,
}: {
  root: string;
  link: string;
  /** Only a dev workspace is built in. Others are given what is promoted to them. */
  editable: boolean;
}) {
  const list = useLoad<{ items: Listed[] }>(`${root}/interfaces`);
  const apps = useLoad<{ items: { path: string; url: string }[] }>(`${root}/apps`);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const where = address || slug(title);

  const create = editable ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      Make an app
    </Button>
  ) : undefined;

  return (
    <Page
      title="App Builder"
      description="Apps over this workspace's tables, built without code: tables, cards, charts and forms, where choosing a row in one decides what another shows. A change is saved as you make it, and reaches people only when it is published."
      action={create}
    >
      {editable ? null : (
        <Notice tone="plain">
          Apps are built in a dev workspace and promoted. Here they can be opened.
        </Notice>
      )}
      {list.error ? (
        <Notice tone="danger" action={<Button onClick={list.reload}>Try again</Button>}>
          {list.error.message}
        </Notice>
      ) : list.data ? (
        <Table<Listed>
          rows={list.data.items}
          rowKey={(row) => row.path}
          empty={
            <EmptyState title="No apps made here yet" action={create}>
              Make one over a table of this workspace. Tables are under Data.
            </EmptyState>
          }
          columns={[
            {
              header: "App",
              cell: (row) => (
                <span className="flex flex-col gap-0.5">
                  {editable ? (
                    <Link to={`${link}/screens/${row.path}`} className="font-medium text-action">
                      {row.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{row.title}</span>
                  )}
                  <code className="font-mono text-[13px] text-ink-muted">{row.path}</code>
                </span>
              ),
            },
            {
              header: "Pages",
              cell: (row) => (
                <span className="flex flex-col">
                  <Mono>{row.pages ?? "—"}</Mono>
                  {row.tables && row.tables.length > 0 ? (
                    <span className="text-meta text-ink-subtle">reads {row.tables.join(", ")}</span>
                  ) : null}
                </span>
              ),
            },
            {
              header: "State",
              cell: (row) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  {row.deployed ? (
                    <Tag tone="live">Published{row.version ? ` v${row.version}` : ""}</Tag>
                  ) : (
                    <Tag tone="draft">Not published</Tag>
                  )}
                  {row.removing ? (
                    <Tag tone="danger">Being removed</Tag>
                  ) : row.draft && row.deployed ? (
                    <Tag tone="production">Edits not published</Tag>
                  ) : null}
                  {row.editedAt ? (
                    <span className="text-meta text-ink-subtle">
                      edited {fromNow(row.editedAt)}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              header: "Address",
              cell: (row) => {
                const url = apps.data?.items.find((app) => app.path === row.app)?.url;
                return url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="break-all text-action">
                    {url}
                  </a>
                ) : (
                  <span className="text-ink-muted">
                    {row.app ? "Once it is published" : "No app serves it"}
                  </span>
                );
              },
            },
          ]}
        />
      ) : null}
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Make an app"
        description="It starts with one empty page. Nobody else sees it until you publish it."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(undefined);
            const path = `screens/${where}`;
            try {
              await api.put(`${root}/drafts/${path}`, {
                kind: "interface",
                schemaVersion: 1,
                body: {
                  title: title.trim(),
                  pages: [{ id: "main", title: title.trim(), widgets: [] }],
                },
              });
              await api.put(`${root}/drafts/${where}`, {
                kind: "app",
                schemaVersion: 1,
                body: { title: title.trim(), interface: path },
              });
              setCreating(false);
              setTitle("");
              setAddress("");
              navigate(`${link}/screens/${path}`);
            } catch (caught) {
              setError(failureText(caught));
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField
            label="Name"
            name="title"
            value={title}
            required
            maxLength={200}
            onChange={setTitle}
          />
          <TextField
            label="Address"
            name="address"
            value={where}
            required
            hint="The app's address ends with this. Lower-case letters, digits and dashes."
            onChange={(value) => setAddress(slug(value))}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="mt-1 flex justify-end gap-2">
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy || where === ""}>
              Make the app
            </Button>
          </div>
        </form>
      </Dialog>
    </Page>
  );
}
