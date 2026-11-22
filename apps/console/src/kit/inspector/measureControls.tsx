/**
 * "What it shows" and the breakdown, as rows of the drawer: a measure ("Sum of Total"), what it is
 * broken down by ("Issued on · Weekly"), and the number format ("$43,120.00 · Money"). Each row
 * opens an editor; the editors are exported so a widget's own drawer (the chart's three
 * questions) puts them where its words ask for them.
 */
import { groupName, type VisualFunction } from "@volvel/manifest";
import {
  DashedAdd,
  DrawerGroup,
  DrawerRow,
  type NumberFormat,
  NumberFormatRow,
  SegmentedControl,
  SelectField,
  ToggleRow,
} from "@volvel/ui";
import {
  BREAKDOWN_CADENCES,
  CADENCE_WORDS,
  MEASURE_FUNCTIONS,
  MEASURE_WORDS,
} from "@volvel/widgets";
import { Hash } from "lucide-react";
import type { Env } from "./controls.tsx";
import { columnsByGrouping } from "./grouping.ts";
import { type CatalogColumn, heading, measureName, visualOf } from "./model.ts";
import {
  ChoiceList,
  columnsOf,
  iconOfType,
  NUMERIC,
  renameIn,
  TEMPORAL,
  writeVisual,
} from "./queryParts.tsx";

type Cadence = (typeof BREAKDOWN_CADENCES)[number];

// ---------------------------------------------------------------------------
// Measure

export interface MeasureValue {
  fn: VisualFunction;
  column?: string | undefined;
}

/** The columns a function can work on: a sum needs numbers, a smallest takes numbers or dates. */
export function columnsFor(
  fn: VisualFunction,
  columns: readonly { name: string; type: string }[],
): { name: string; type: string }[] {
  return columns.filter((column) =>
    fn === "count"
      ? false
      : fn === "count_distinct"
        ? true
        : fn === "sum" || fn === "avg"
          ? NUMERIC.has(column.type)
          : NUMERIC.has(column.type) || TEMPORAL.has(column.type),
  );
}

/** "Sum of Total", "Count of rows": a measure as a sentence. */
export function measurePhrase(measure: MeasureValue | undefined): string | undefined {
  if (!measure) return undefined;
  const column = measure.column ? heading(measure.column) : undefined;
  switch (measure.fn) {
    case "count":
      return "Count of rows";
    case "count_distinct":
      return column ? `Count of different ${column}` : "Count of different";
    case "min":
    case "max":
      return column ? `${MEASURE_WORDS[measure.fn]} ${column}` : MEASURE_WORDS[measure.fn];
    default:
      return column ? `${MEASURE_WORDS[measure.fn]} of ${column}` : MEASURE_WORDS[measure.fn];
  }
}

/**
 * The body of the value editor: a function and a column on one line ("Sum ▾ of Total ▾"). Put it
 * in a `DrawerEditor`. Changing the function keeps the column when the new function can work on
 * it, else takes the first it can.
 */
export function MeasureEditor({
  name,
  measure,
  columns,
  onChange,
  onRemove,
}: {
  /** Makes the selects' names unique when a drawer has several. */
  name: string;
  measure: MeasureValue | undefined;
  columns: readonly { name: string; type: string }[];
  onChange: (next: MeasureValue) => void;
  /** "Remove this value", for a widget that takes several. */
  onRemove?: () => void;
}) {
  const fn = measure?.fn ?? "count";
  const allowed = columnsFor(fn, columns);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40 max-w-full">
          <SelectField
            name={`${name}-fn`}
            label="What it works out"
            labelHidden
            value={fn}
            options={MEASURE_FUNCTIONS.map((one) => ({ value: one, label: MEASURE_WORDS[one] }))}
            onChange={(next) => {
              const wanted = next as VisualFunction;
              const options = columnsFor(wanted, columns);
              const keep = measure?.column && options.some((one) => one.name === measure.column);
              onChange({
                fn: wanted,
                ...(wanted === "count"
                  ? {}
                  : { column: keep ? measure?.column : options[0]?.name }),
              });
            }}
          />
        </div>
        {fn === "count" ? null : (
          <>
            <span className="text-body-sm text-ink-muted">of</span>
            <div className="w-40 max-w-full">
              <SelectField
                name={`${name}-column`}
                label="Column it works on"
                labelHidden
                value={measure?.column ?? ""}
                options={allowed.map((column) => ({
                  value: column.name,
                  label: heading(column.name),
                }))}
                onChange={(column) => onChange({ fn, column })}
              />
            </div>
          </>
        )}
      </div>
      <p className="m-0 text-meta text-ink-muted">
        {fn === "count"
          ? "Counts every row that is included."
          : allowed.length === 0
            ? "This table has no column it can be worked out from."
            : fn === "sum" || fn === "avg"
              ? "Works on a column of numbers."
              : fn === "count_distinct"
                ? "Counts each different value once."
                : "Works on a number or a date."}
      </p>
      {onRemove ? (
        <div>
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer text-body-sm text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            Remove this value
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A value of an input as a row: "Value  # Sum of Total ›". */
export function MeasureRow({
  env,
  input,
  at,
  label,
}: {
  env: Env;
  input: string;
  at: number;
  label: string;
}) {
  const visual = visualOf(env.widget.data?.[input]);
  const limits = env.definition.data[input]?.values ?? { min: 1, max: 1 };
  if (!visual) return null;
  const measures = visual.measures ?? [];
  const measure = measures[at];
  if (!measure) return null;
  const columns = columnsOf(env, visual);

  const change = (next: MeasureValue) => {
    const others = measures.filter((_, index) => index !== at).map((one) => one.as);
    const wasAuto = measure.as === measureName(measure.fn, measure.column, others);
    const as = wasAuto ? measureName(next.fn, next.column, others) : measure.as;
    const written = measures.map((one, index) =>
      index === at ? { fn: next.fn, ...(next.column ? { column: next.column } : {}), as } : one,
    );
    const renamed = renameIn(env, input, { ...visual, measures: written }, measure.as, as);
    writeVisual(
      env,
      input,
      renamed.visual,
      "changing the value it works out",
      `measure:${env.widget.id}:${input}:${at}`,
      renamed.widget,
    );
  };
  return (
    <DrawerRow
      label={label}
      icon={Hash}
      value={measurePhrase(measure)}
      editorTitle={label}
      editor={
        <MeasureEditor
          name={`${env.widget.id}-${input}-${at}`}
          measure={measure}
          columns={columns}
          onChange={change}
          {...(measures.length > limits.min
            ? {
                onRemove: () =>
                  writeVisual(
                    env,
                    input,
                    { ...visual, measures: measures.filter((_, index) => index !== at) },
                    "removing a value",
                  ),
              }
            : {})}
        />
      }
    />
  );
}

/** The group "What it shows": a row for each value the input takes, and "+ Add a value". */
export function MeasureGroup({
  env,
  input,
  label,
  help,
}: {
  env: Env;
  input: string;
  label: string;
  help?: string | undefined;
}) {
  const visual = visualOf(env.widget.data?.[input]);
  if (!visual) return null;
  const limits = env.definition.data[input]?.values ?? { min: 1, max: 1 };
  const measures = visual.measures ?? [];
  return (
    <DrawerGroup label="What it shows" note={help}>
      {measures.map((_, at) => (
        <MeasureRow
          // The place keeps the editor open while the value's name changes with what it works out.
          // biome-ignore lint/suspicious/noArrayIndexKey: a part of a query has no identity but its place in the list
          key={`measure-${at}`}
          env={env}
          input={input}
          at={at}
          label={at === 0 ? label : `${label} ${at + 1}`}
        />
      ))}
      {measures.length < limits.max ? (
        <div className="p-2">
          <DashedAdd
            onClick={() =>
              writeVisual(
                env,
                input,
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
            Add a value
          </DashedAdd>
        </div>
      ) : null}
    </DrawerGroup>
  );
}

// ---------------------------------------------------------------------------
// Breakdown

export interface BreakdownValue {
  column: string;
  bucket?: Cadence | undefined;
}

const CADENCE_PLURAL: Record<Cadence, string> = {
  day: "days",
  week: "weeks",
  month: "months",
  quarter: "quarters",
  year: "years",
};

/**
 * The body of the breakdown editor: the columns, the best to group by first, each with what its
 * values are like ("3 values", "a date", "412 values", "every row differs"). A date offers Day,
 * Week, Month or Quarter, and "Include weeks with no …". Put it in a `DrawerEditor`.
 */
export function BreakdownEditor({
  breakdown,
  columns,
  rows,
  onChange,
  fillGaps,
  onRemove,
}: {
  breakdown: BreakdownValue | undefined;
  columns: readonly CatalogColumn[];
  /** How many rows the table has, when known: a column that differs in every row says so. */
  rows?: number | undefined;
  onChange: (next: BreakdownValue) => void;
  /** The chart's `fillGaps`; its words name what is counted: "Include weeks with no invoices". */
  fillGaps?: { value: boolean; onChange: (next: boolean) => void; noun?: string };
  onRemove?: () => void;
}) {
  const ordered = columnsByGrouping(columns, rows);
  const current = columns.find((one) => one.name === breakdown?.column);
  const temporal = current ? TEMPORAL.has(current.type) : false;
  const cadences = BREAKDOWN_CADENCES.filter(
    (one) => one !== "year" || breakdown?.bucket === "year",
  );
  return (
    <div className="flex flex-col gap-3">
      <ChoiceList
        label="Column to break down by"
        value={breakdown?.column}
        options={ordered.map((one) => ({
          value: one.name,
          label: heading(one.name),
          hint: one.hint,
          icon: iconOfType(one.type, one.references),
        }))}
        onChange={(column) => {
          const next = columns.find((one) => one.name === column);
          onChange({
            column,
            ...(next && TEMPORAL.has(next.type) ? { bucket: breakdown?.bucket ?? "week" } : {}),
          });
        }}
      />
      {temporal && breakdown ? (
        <div className="flex flex-col gap-2">
          <SegmentedControl
            label="How often the dates are cut"
            size="small"
            value={breakdown.bucket ?? "week"}
            options={cadences.map((one) => ({
              value: one,
              label: one === "year" ? "Year" : one.charAt(0).toUpperCase() + one.slice(1),
            }))}
            onChange={(bucket) => onChange({ column: breakdown.column, bucket })}
          />
          {fillGaps ? (
            <ToggleRow
              label={`Include ${CADENCE_PLURAL[breakdown.bucket ?? "week"]} with no ${fillGaps.noun ?? "rows"}`}
              help="Shown as zero, so a quiet period is not skipped."
              checked={fillGaps.value}
              onChange={fillGaps.onChange}
            />
          ) : null}
        </div>
      ) : null}
      {onRemove ? (
        <div>
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer text-body-sm text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            Remove this
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A breakdown of an input as a row: "Break down by  Issued on · Weekly ›". */
export function BreakdownRow({
  env,
  input,
  at,
  label,
}: {
  env: Env;
  input: string;
  at: number;
  label: string;
}) {
  const visual = visualOf(env.widget.data?.[input]);
  if (!visual) return null;
  const limits = env.definition.data[input]?.breakdowns ?? { min: 0, max: 1 };
  const groups = visual.groupBy ?? [];
  const one = groups[at];
  if (!one) return null;
  const columns = columnsOf(env, visual);
  const column = columns.find((c) => c.name === one.column);
  const table = env.catalog.tables.find((t) => t.name === visual.table);
  const hasGapSetting = "fillGaps" in env.definition.config.properties;

  const change = (next: BreakdownValue) => {
    const groupBy = groups.map((g, index) =>
      index === at ? { column: next.column, ...(next.bucket ? { bucket: next.bucket } : {}) } : g,
    );
    const renamed = renameIn(
      env,
      input,
      { ...visual, groupBy },
      groupName(one),
      groupName(groupBy[at] ?? one),
    );
    writeVisual(
      env,
      input,
      renamed.visual,
      "changing what it is broken down by",
      `breakdown:${env.widget.id}:${input}:${at}`,
      renamed.widget,
    );
  };
  return (
    <DrawerRow
      label={label}
      icon={iconOfType(column?.type ?? "text", column?.references)}
      value={heading(one.column)}
      hint={one.bucket ? CADENCE_WORDS[one.bucket] : undefined}
      editorTitle={label}
      editor={
        <BreakdownEditor
          breakdown={one}
          columns={columns}
          rows={table?.rows}
          onChange={change}
          {...(hasGapSetting && at === 0
            ? {
                fillGaps: {
                  value: env.config.fillGaps === true,
                  onChange: (next: boolean) =>
                    env.write(
                      { ...env.widget, config: { ...(env.widget.config ?? {}), fillGaps: next } },
                      "changing whether empty periods are shown",
                      `fillGaps:${env.widget.id}`,
                    ),
                  noun: table ? heading(table.name).toLowerCase() : "rows",
                },
              }
            : {})}
          {...(groups.length > limits.min
            ? {
                onRemove: () =>
                  writeVisual(
                    env,
                    input,
                    { ...visual, groupBy: groups.filter((_, index) => index !== at) },
                    "removing a breakdown",
                  ),
              }
            : {})}
        />
      }
    />
  );
}

/** The group of an input's breakdown rows, and "+ Break it down". */
export function BreakdownGroup({
  env,
  input,
  label,
  help,
}: {
  env: Env;
  input: string;
  label: string;
  help?: string | undefined;
}) {
  const visual = visualOf(env.widget.data?.[input]);
  if (!visual) return null;
  const limits = env.definition.data[input]?.breakdowns ?? { min: 0, max: 1 };
  const groups = visual.groupBy ?? [];
  const columns = columnsOf(env, visual);
  const table = env.catalog.tables.find((t) => t.name === visual.table);
  const add = () => {
    const best = columnsByGrouping(
      columns.filter((one) => !groups.some((g) => g.column === one.name)),
      table?.rows,
    )[0];
    if (!best) return;
    writeVisual(
      env,
      input,
      {
        ...visual,
        groupBy: [
          ...groups,
          {
            column: best.name,
            ...(TEMPORAL.has(best.type) ? { bucket: "week" as const } : {}),
          },
        ],
      },
      "adding a breakdown",
    );
  };
  return (
    <DrawerGroup
      label={env.definition.type === "core/chart" ? "What to chart" : "How it is split"}
      note={help}
    >
      {groups.map((one, at) => (
        <BreakdownRow
          // biome-ignore lint/suspicious/noArrayIndexKey: a part of a query has no identity but its place in the list
          key={`breakdown-${at}`}
          env={env}
          input={input}
          at={at}
          label={at === 0 ? label : "Then by"}
        />
      ))}
      {groups.length < limits.max && columns.length > 0 ? (
        <div className="p-2">
          <DashedAdd onClick={add}>{groups.length === 0 ? "Break it down" : "Then by"}</DashedAdd>
        </div>
      ) : null}
    </DrawerGroup>
  );
}

// ---------------------------------------------------------------------------
// Number format

/**
 * "Numbers  # $43,120.00 · Money ›": the one row that opens the number format picker. `sample` is
 * a real number from the widget's data when there is one, as the data stores it.
 */
export function FormatRow({
  label = "Numbers",
  value,
  onChange,
  sample,
}: {
  label?: string;
  value: NumberFormat | undefined;
  onChange: (next: NumberFormat | undefined) => void;
  /** A number as the data holds it (in cents when the format says it is kept in cents). */
  sample?: number | undefined;
}) {
  const shown = sample === undefined ? undefined : value?.minorUnits ? sample / 100 : sample;
  return (
    <NumberFormatRow
      label={label}
      icon={Hash}
      value={value}
      onChange={onChange}
      {...(shown === undefined ? {} : { sample: shown })}
    />
  );
}
