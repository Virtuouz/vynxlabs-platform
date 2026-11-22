/**
 * What the drawer sections of the chart, stat, goal and pivot share: the props a
 * section takes, how it writes the widget, the columns it offers ordered by how well
 * they group, sample figures to draw a preview from when the real rows are not at hand,
 * and the small rows (text, choice, switch) the boards draw.
 */
import type { DataInput, PageFilter, PageWidget, VisualQuery } from "@volvel/manifest";
import { groupName } from "@volvel/manifest";
import {
  DrawerRow,
  NumberField,
  NumberFormatRow,
  SelectField,
  TextField,
  ToggleRow,
} from "@volvel/ui";
import type { ColumnInfo, SummaryData } from "@volvel/widgets";
import { MEASURE_FUNCTIONS, MEASURE_WORDS } from "@volvel/widgets";
import { Calendar, Hash, List, Type } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { Env } from "../controls.tsx";
import type { CatalogColumn } from "../model.ts";
import {
  heading,
  measureName,
  renamedResult,
  tidyVisual,
  visualOf,
  withConfig,
  withInput,
  withSystemColumns,
  withText,
} from "../model.ts";

/** What the real rows say, when the host has read them. Every part is optional: a section draws a sample without. */
export interface DrawerData {
  /** The widget's summary as it is drawn now: its rows, and for a comparison the period before. */
  summary?: SummaryData;
  /** How many different values each column of the source has, by column name. */
  counts?: Readonly<Record<string, number>>;
}

/** What every section is given. */
export interface SectionProps {
  env: Env;
  data?: DrawerData | undefined;
}

export type DrawerSection = ComponentType<SectionProps>;

export const TEMPORAL = new Set(["date", "timestamp"]);
export const NUMERIC = new Set(["integer", "number"]);

/** The words of a column: lower case, as in a sentence. */
export const lower = (name: string) => heading(name).toLowerCase();

// ---------------------------------------------------------------------------
// The data input

export interface Query {
  input: string;
  visual: VisualQuery;
  columns: CatalogColumn[];
  /** Writes the visual query, and with it any change to the widget that goes with it. */
  write: (next: VisualQuery, words: string, key?: string, widget?: PageWidget) => void;
}

/** The first data input of the widget as a visual query, when it reads a table that way. */
export function queryOf(env: Env, input?: string): Query | undefined {
  const name = input ?? Object.keys(env.definition.data)[0] ?? "rows";
  const data = env.widget.data?.[name];
  const visual = visualOf(data);
  if (!visual || !data) return undefined;
  const columns = withSystemColumns(
    env.catalog.tables.find((one) => one.name === visual.table)?.columns ?? [],
  );
  return {
    input: name,
    visual,
    columns,
    write: (next, words, key, widget = env.widget) =>
      env.write(
        withInput(widget, name, { ...data, source: { visual: tidyVisual(next) } }),
        words,
        key,
      ),
  };
}

/** The breakdowns of a query, with the type of each column. */
export function groupsOf(query: Query | undefined) {
  if (!query) return [];
  return (query.visual.groupBy ?? []).map((group) => ({
    ...group,
    type: query.columns.find((column) => column.name === group.column)?.type,
  }));
}

/** The date filters of the page: what a comparison is made across. */
export const dateFilters = (env: Env): string[] =>
  env.filters.filter((filter: PageFilter) => filter.type === "date_range").map((one) => one.name);

// ---------------------------------------------------------------------------
// Writing

/** The widget with several config properties set at once. */
export function patch(widget: PageWidget, values: Record<string, unknown>): PageWidget {
  let next = widget;
  for (const [name, value] of Object.entries(values)) next = withConfig(next, name, value);
  return next;
}

/** The widget with its whole configuration replaced, as `withCompare` hands it back. */
export function withConfigObject(widget: PageWidget, config: Record<string, unknown>): PageWidget {
  const { config: _before, ...rest } = widget;
  return Object.keys(config).length > 0 ? { ...rest, config } : rest;
}

/** Writes one config property, joining quick changes into one step to undo. */
export function setter(env: Env) {
  return (name: string, value: unknown, words: string, joined = true) =>
    env.write(
      withConfig(env.widget, name, value),
      words,
      joined ? `config:${env.widget.id}:${name}` : undefined,
    );
}

/** The widget's measures, with the first renamed, its sort and the columns of the config that name it following. */
export function withMeasure(
  env: Env,
  query: Query,
  at: number,
  fn: (typeof MEASURE_FUNCTIONS)[number],
  column: string | undefined,
): { visual: VisualQuery; widget: PageWidget } {
  const measures = query.visual.measures ?? [];
  const old = measures[at];
  if (!old) return { visual: query.visual, widget: env.widget };
  const others = measures.filter((_, index) => index !== at).map((one) => one.as);
  const wasAuto = old.as === measureName(old.fn, old.column, others);
  const as = wasAuto ? measureName(fn, column, others) : old.as;
  const next = measures.map((one, index) =>
    index === at ? { fn, ...(column ? { column } : {}), as } : one,
  );
  const visual: VisualQuery = {
    ...query.visual,
    measures: next,
    ...(query.visual.sort
      ? { sort: query.visual.sort.map((one) => (one.by === old.as ? { ...one, by: as } : one)) }
      : {}),
  };
  return {
    visual,
    widget:
      as === old.as
        ? env.widget
        : renamedResult(env.definition, env.widget, query.input, old.as, as),
  };
}

/** "Sum of Total", "Count of rows". */
export function measureWords(measure: { fn: string; column?: string | undefined } | undefined) {
  if (!measure) return undefined;
  const fn = MEASURE_WORDS[measure.fn as keyof typeof MEASURE_WORDS] ?? measure.fn;
  return measure.fn === "count" && !measure.column
    ? "Count of rows"
    : `${fn} of ${heading(measure.column ?? "")}`;
}

/**
 * A stand-in for the shared measure editor: one row that opens a function and a column.
 * Replaced by B3's MeasureEditor at integration.
 */
// replaced by B3's MeasureEditor at integration
export function MeasureRow({ env, label, at = 0 }: { env: Env; label: string; at?: number }) {
  const query = queryOf(env);
  const measure = query?.visual.measures?.[at];
  if (!query) return <DrawerRow label={label} value={undefined} />;
  const allowed = (fn: string) =>
    query.columns.filter((column) =>
      fn === "count_distinct"
        ? true
        : fn === "sum" || fn === "avg"
          ? NUMERIC.has(column.type)
          : NUMERIC.has(column.type) || TEMPORAL.has(column.type),
    );
  const change = (fn: (typeof MEASURE_FUNCTIONS)[number], column: string | undefined) => {
    const made = withMeasure(env, query, at, fn, column);
    query.write(
      made.visual,
      "changing the value it works out",
      `measure:${env.widget.id}:${at}`,
      made.widget,
    );
  };
  return (
    <DrawerRow
      label={label}
      icon={Hash}
      value={measureWords(measure)}
      editorTitle={label}
      editor={
        measure ? (
          <div className="flex flex-col gap-3">
            <SelectField
              name={`${env.widget.id}-fn-${at}`}
              label="Works out"
              value={measure.fn}
              options={MEASURE_FUNCTIONS.map((fn) => ({ value: fn, label: MEASURE_WORDS[fn] }))}
              onChange={(value) => {
                const fn = value as (typeof MEASURE_FUNCTIONS)[number];
                const keep =
                  measure.column && allowed(fn).some((one) => one.name === measure.column);
                change(
                  fn,
                  fn === "count" ? undefined : keep ? measure.column : allowed(fn)[0]?.name,
                );
              }}
            />
            {measure.fn === "count" ? null : (
              <SelectField
                name={`${env.widget.id}-column-${at}`}
                label="Of"
                value={measure.column ?? ""}
                options={allowed(measure.fn).map((column) => ({
                  value: column.name,
                  label: heading(column.name),
                }))}
                onChange={(column) => change(measure.fn, column)}
              />
            )}
          </div>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Columns, ordered by how well they group

export interface Grouping {
  column: CatalogColumn;
  /** Good for grouping: few values, a choice, or a date. */
  good: boolean;
  /** What is said of it: "3 values", "a date", "every row differs". */
  hint: string;
  order: number;
}

const COUNT_FOR_GOOD = 60;
const isSystemId = (column: CatalogColumn) =>
  column.name === "id" || column.type === "uuid" || column.name.endsWith("_id");

/** The columns, those that group well first (the fewest values first), and what is known of each. */
export function groupings(
  columns: readonly CatalogColumn[],
  counts: DrawerData["counts"],
  except: readonly string[] = [],
): Grouping[] {
  const all = columns
    .filter((column) => !except.includes(column.name))
    .filter((column) => column.name !== "updated_at")
    .map((column): Grouping => {
      const count = counts?.[column.name];
      const when = TEMPORAL.has(column.type);
      if (isSystemId(column)) {
        return { column, good: false, hint: "every row differs", order: 1e9 };
      }
      if (when) {
        return { column, good: column.name !== "created_at", hint: "a date", order: 40 };
      }
      if (count !== undefined) {
        return {
          column,
          good: count <= COUNT_FOR_GOOD && !NUMERIC.has(column.type),
          hint: `${count} ${count === 1 ? "value" : "values"}`,
          order: count,
        };
      }
      if (column.type === "enum" || column.type === "boolean" || column.references) {
        return {
          column,
          good: true,
          hint: column.type === "boolean" ? "2 values" : "a few values",
          order: 10,
        };
      }
      return {
        column,
        good: false,
        hint: NUMERIC.has(column.type) ? "a number" : "every row may differ",
        order: 1e6,
      };
    });
  return all.sort((a, b) => a.order - b.order);
}

export function columnIcon(type: string) {
  return TEMPORAL.has(type) ? Calendar : NUMERIC.has(type) ? Hash : type === "text" ? Type : List;
}

// ---------------------------------------------------------------------------
// Sample figures

const WEEK = 7 * 86_400_000;
const BASE = Date.UTC(2026, 8, 7);

/** The headings a breakdown would have, from what is known of the column: a few of them, or dates in order. */
function labelsOf(
  group: { column: string; bucket?: string | undefined; type: string | undefined },
  counts: DrawerData["counts"],
  limit: number,
): string[] {
  if (group.type && TEMPORAL.has(group.type)) {
    const step =
      group.bucket === "day"
        ? WEEK / 7
        : group.bucket === "month"
          ? 30 * 86_400_000
          : group.bucket === "quarter"
            ? 91 * 86_400_000
            : WEEK;
    return Array.from({ length: Math.min(limit, 6) }, (_, at) =>
      new Date(BASE + at * step).toISOString().slice(0, 10),
    );
  }
  const known = counts?.[group.column];
  const size = Math.max(1, Math.min(known ?? 3, limit));
  return Array.from(
    { length: size },
    (_, at) => `${heading(group.column)} ${String.fromCharCode(65 + at)}`,
  );
}

/**
 * Figures to draw a preview from when the rows are not at hand: the breakdowns and values the
 * query names, a few of each, with numbers that do not change from one draw to the next.
 */
export function sampleSummary(
  query: Query | undefined,
  counts?: DrawerData["counts"],
  options: { value?: number; previous?: boolean; extra?: number } = {},
): SummaryData {
  const groups = groupsOf(query);
  const measures = query?.visual.measures ?? [];
  const names = groups.map((group) => groupName(group));
  const valueNames = measures.map((measure) => measure.as);
  const columns: ColumnInfo[] = [
    ...groups.map((group) => ({
      name: groupName(group),
      label: heading(group.column),
      type: group.type && TEMPORAL.has(group.type) ? "date" : "text",
    })),
    ...measures.map((measure) => ({
      name: measure.as,
      label: heading(measure.as),
      type: "number",
    })),
  ];
  const limit = groups.length > 1 ? 3 : 6;
  const combos = groups.reduce<string[][]>(
    (rows, group) =>
      rows.flatMap((row) => labelsOf(group, counts, limit).map((label) => [...row, label])),
    [[]],
  );
  const rows = combos.map((combo, at) => {
    const row: Record<string, unknown> = {};
    names.forEach((name, index) => {
      row[name] = combo[index];
    });
    valueNames.forEach((name, index) => {
      const base = ((at * 37 + 13 + index * 11) % 70) + 25 + at * 4;
      row[name] = groups.length === 0 ? (options.value ?? 27_257.93) : base * 100;
    });
    return row;
  });
  const previous = options.previous
    ? rows.map((row) => {
        const copy: Record<string, unknown> = {};
        for (const name of valueNames) copy[name] = (Number(row[name]) || 0) / 1.084;
        return copy;
      })
    : undefined;
  return {
    shape: "summary",
    columns,
    breakdowns: names,
    values: valueNames,
    rows,
    ...(previous ? { previous } : {}),
  };
}

// ---------------------------------------------------------------------------
// Rows

/** A row that opens a text field: a title, a caption. */
export function TextRow({
  idPrefix,
  label,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  idPrefix: string;
  label: string;
  value: string | undefined;
  placeholder?: string;
  maxLength?: number;
  onChange: (text: string) => void;
}) {
  return (
    <DrawerRow
      label={label}
      icon={Type}
      value={value || <span className="text-ink-muted">{placeholder ?? "Not set"}</span>}
      editorTitle={label}
      editor={
        <TextField
          name={`${idPrefix}-${label}`}
          label={label}
          required={false}
          value={value ?? ""}
          {...(maxLength ? { maxLength } : {})}
          onChange={onChange}
        />
      }
    />
  );
}

/** A switch row for a boolean of the widget's configuration. `on` is how the stored value reads. */
export function ConfigToggle({
  env,
  name,
  label,
  help,
  on,
}: {
  env: Env;
  name: string;
  label: string;
  help?: ReactNode;
  on?: boolean;
}) {
  const set = setter(env);
  return (
    <ToggleRow
      label={label}
      {...(help ? { help } : {})}
      checked={on ?? env.config[name] === true}
      onChange={(next) => set(name, next, `changing ${label.toLowerCase()}`, false)}
    />
  );
}

/** One choice among a few, listed in a small editor, the chosen one shown on the row. */
export function ChoiceRow<Value extends string>({
  idPrefix,
  label,
  icon,
  value,
  options,
  onChange,
}: {
  idPrefix: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" }>;
  value: Value | undefined;
  options: readonly { value: Value; label: string; swatches?: readonly string[] }[];
  onChange: (value: Value) => void;
}) {
  const current = options.find((one) => one.value === value);
  return (
    <DrawerRow
      label={label}
      {...(icon ? { icon } : {})}
      value={
        <span className="inline-flex items-center gap-2">
          {current?.swatches ? <Swatches colors={current.swatches} /> : null}
          {current?.label ?? "Not set"}
        </span>
      }
      editorTitle={label}
      editorFooter={false}
      editor={
        <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
          <legend className="sr-only">{label}</legend>
          {options.map((option) => {
            const on = option.value === value;
            return (
              <label
                key={option.value}
                className={`flex h-10 cursor-pointer items-center justify-between gap-3 rounded-control border px-3 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                  on ? "border-action bg-selected" : "border-transparent hover:bg-selected"
                }`}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-${label}`}
                  checked={on}
                  onChange={() => onChange(option.value)}
                  className="sr-only"
                />
                <span>{option.label}</span>
                {option.swatches ? <Swatches colors={option.swatches} /> : null}
              </label>
            );
          })}
        </fieldset>
      }
    />
  );
}

/** Small squares of color: a palette. */
export function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {colors.map((color) => (
        <span key={color} className="size-3 rounded-[3px]" style={{ background: color }} />
      ))}
    </span>
  );
}

/** The format row of the page: "Numbers  $43,120.00 · Money". */
export function NumbersRow({ env, sample }: { env: Env; sample?: number }) {
  const set = setter(env);
  const format = env.config.format as Parameters<typeof NumberFormatRow>[0]["value"];
  return (
    <NumberFormatRow
      value={format}
      {...(sample === undefined ? {} : { sample })}
      icon={Hash}
      onChange={(next) => set("format", next, "changing how numbers are written")}
    />
  );
}

/** Title and caption as rows, for a widget whose caption is a config property or its subtitle. */
export function HeadingRows({
  env,
  caption,
}: {
  env: Env;
  /** `config` writes the `caption` property; `subtitle` writes the widget's own. */
  caption: { kind: "config"; name: string; label?: string } | { kind: "subtitle" };
}) {
  const { widget } = env;
  const set = setter(env);
  const label = caption.kind === "config" ? (caption.label ?? "Caption") : "Caption";
  const text =
    caption.kind === "config"
      ? typeof env.config[caption.name] === "string"
        ? (env.config[caption.name] as string)
        : undefined
      : widget.subtitle;
  return (
    <>
      <TextRow
        idPrefix={widget.id}
        label="Title"
        value={widget.title}
        onChange={(value) =>
          env.write(withText(widget, "title", value), "changing the title", `title:${widget.id}`)
        }
      />
      <TextRow
        idPrefix={widget.id}
        label={label}
        value={text}
        placeholder="Add a line under the title"
        maxLength={200}
        onChange={(value) =>
          caption.kind === "config"
            ? set(caption.name, value, "changing the caption")
            : env.write(
                withText(widget, "subtitle", value),
                "changing the caption",
                `subtitle:${widget.id}`,
              )
        }
      />
    </>
  );
}

/** A number field in a row's editor, for "Show at most". */
export function NumberEditor({
  name,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  name: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <NumberField
      name={name}
      label={label}
      required={false}
      min={1}
      max={10000}
      {...(placeholder ? { placeholder } : {})}
      {...(hint ? { hint } : {})}
      value={value}
      onChange={onChange}
    />
  );
}

/** The widget's input, as a data input, when the query needs it. */
export const inputOf = (env: Env, name: string): DataInput | undefined => env.widget.data?.[name];

/** The card a preview is drawn in. */
export function PreviewCard({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      className="rounded-panel border border-line bg-surface px-3 py-3"
      {...(label ? { role: "group", "aria-label": label } : {})}
    >
      {children}
    </div>
  );
}

/** The label "PREVIEW" over a card, as the groups of rows are labelled. */
export function PreviewSection({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="m-0 px-0.5 text-label font-semibold text-ink-muted uppercase">Preview</h3>
      {children}
    </section>
  );
}
