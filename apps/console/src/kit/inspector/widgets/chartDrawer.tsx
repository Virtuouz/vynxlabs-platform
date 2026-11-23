/**
 * The chart's drawer (boards 10 and 11). Data asks three plain questions (Measure, For each,
 * Split into colors), says how they read and draws them small, then Order. Display shows only
 * what fits: the chart types the data can work with, the look, and, over time, the extra options.
 */

import { groupName, type PageWidget } from "@volvel/manifest";
import {
  DrawerBlock,
  DrawerGroup,
  DrawerRow,
  SegmentedControl,
  type TileOption,
  TilePicker,
  ToggleRow,
} from "@volvel/ui";
import type { ChartKind, ChartShape } from "@volvel/widgets-core/views";
import {
  chartFits,
  isComparing,
  orderRows,
  PALETTES,
  suggestedMark,
  withCompare,
} from "@volvel/widgets-core/views";
import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  ChartScatter,
  Grid2x2,
  List,
  Palette,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Env } from "../controls.tsx";
import { BreakdownRow, MeasureRow, MoreMeasures } from "../measureControls.tsx";
import { heading } from "../model.ts";
import { SortRow } from "../rowsItUses.tsx";
import {
  ChoiceRow,
  CompareAcross,
  ConfigToggle,
  type DrawerData,
  dateFilters,
  groupsOf,
  lower,
  NumberEditor,
  NumbersRow,
  patch,
  type Query,
  queryOf,
  type SectionProps,
  sampleSummary,
  setter,
  TEMPORAL,
  withConfigObject,
} from "./chartShared.tsx";

/** The kinds of chart the type picker offers, in the order of the board. */
const KINDS: { value: ChartKind; label: string; icon: typeof ChartColumn }[] = [
  { value: "bar", label: "Bar", icon: ChartColumn },
  { value: "bar-sideways", label: "Bar, sideways", icon: ChartBar },
  { value: "pie", label: "Pie", icon: ChartPie },
  { value: "line", label: "Line", icon: ChartLine },
  { value: "area", label: "Area", icon: ChartArea },
  { value: "heatmap", label: "Heatmap", icon: Grid2x2 },
  { value: "scatter", label: "Scatter", icon: ChartScatter },
];

/** What a type would need, in the words under its tile. */
const NEEDS: Record<string, string> = {
  "a date": "needs a date",
  "a split": "needs a split",
  "no date": "not for time",
  "a number": "needs a number",
  "a group": "needs a group",
};

/** What the data is as far as the chart's type goes. */
export function shapeOf(query: Query, groups = query.visual.groupBy ?? []): ChartShape {
  return {
    columns: query.columns,
    breakdowns: groups.map((group) => group.column),
  };
}

/** The kind the configuration draws as: bars lying down are their own tile. */
export function kindOf(config: Record<string, unknown>): ChartKind {
  const mark = (config.mark as ChartKind | undefined) ?? "bar";
  return mark === "bar" && config.horizontal === true ? "bar-sideways" : mark;
}

const MARK_WORDS: Record<string, string> = {
  bar: "bars",
  "bar-sideways": "bars lying down",
  line: "a line",
  area: "an area",
  pie: "a pie",
  heatmap: "a heatmap",
  scatter: "points",
};

const plural = (word: string) => (/s$/.test(word) ? word : `${word}s`);

/** The value drawn up the side: the one chosen as "Up the side", else the first. */
export function drawnMeasure(query: Query, config: Record<string, unknown>) {
  const all = query.visual.measures ?? [];
  return all.find((one) => one.as === config.y) ?? all[0];
}

/** The breakdowns, the one chosen as "Along the bottom" (else the first) leading. */
export function drawnGroups(query: Query, config: Record<string, unknown>) {
  const all = groupsOf(query);
  const along = all.find((one) => groupName(one) === config.x) ?? all[0];
  return along ? [along, ...all.filter((one) => one !== along)] : all;
}

/** "the sum of total": what a measure reads as in a sentence. */
function measureSentence(query: Query, config: Record<string, unknown> = {}): string {
  const measure = drawnMeasure(query, config);
  if (!measure) return "the figures";
  const column = measure.column ? lower(measure.column) : "rows";
  switch (measure.fn) {
    case "count":
      return `the number of ${lower(query.visual.table)}`;
    case "count_distinct":
      return `the number of different ${column}`;
    case "sum":
      return `the sum of ${column}`;
    case "avg":
      return `the average ${column}`;
    case "min":
      return `the smallest ${column}`;
    default:
      return `the largest ${column}`;
  }
}

/** "Reads as the sum of total for each clinic. Drawn as bars; 3 clinics." */
export function readsAs(query: Query, config: Record<string, unknown>, count: number | undefined) {
  const groups = drawnGroups(query, config);
  const first = groups[0];
  const second = groups[1];
  const when = first?.type !== undefined && TEMPORAL.has(first.type);
  const along = first
    ? when
      ? `by ${first.bucket ?? "day"}`
      : `for each ${lower(first.column)}`
    : "";
  const split = second ? `, split by ${lower(second.column)}` : "";
  const noun = first ? (when ? (first.bucket ?? "day") : lower(first.column)) : "";
  const how = MARK_WORDS[kindOf(config)] ?? "bars";
  const tail = count === undefined ? "" : `; ${count} ${count === 1 ? noun : plural(noun)}`;
  return {
    reads: `Reads as ${measureSentence(query, config)} ${along}${split}.`.replace(" .", "."),
    drawn: `Drawn as ${how}${tail}.`,
  };
}

// ---------------------------------------------------------------------------
// The small picture

/** The chart drawn small, from the rows it will be drawn from: bars, a line, an area, a pie or a grid. */
export function MiniChart({ kind, values }: { kind: ChartKind; values: readonly number[] }) {
  const shown = values.slice(0, 8);
  const high = Math.max(1, ...shown);
  const w = 88;
  const h = 56;
  const body = (() => {
    if (kind === "pie") {
      const total = shown.reduce((a, b) => a + b, 0) || 1;
      let from = -Math.PI / 2;
      return shown.map((value, at) => {
        const to = from + (value / total) * Math.PI * 2;
        const r = 26;
        const [cx, cy] = [w / 2, h / 2];
        const large = to - from > Math.PI ? 1 : 0;
        const path = `M${cx},${cy} L${cx + r * Math.cos(from)},${cy + r * Math.sin(from)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(to)},${cy + r * Math.sin(to)} Z`;
        from = to;
        return (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: marks are drawn in order and never reordered
            key={`${at}-${value}`}
            d={path}
            fill="currentColor"
            opacity={0.35 + (at % 3) * 0.3}
            stroke="var(--color-surface)"
            strokeWidth="1"
          />
        );
      });
    }
    if (kind === "line" || kind === "area") {
      const step = shown.length > 1 ? (w - 8) / (shown.length - 1) : 0;
      const points = shown.map(
        (value, at) => [4 + at * step, h - 4 - (value / high) * (h - 10)] as const,
      );
      const line = points.map(([x, y]) => `${x},${y}`).join(" ");
      return (
        <>
          {kind === "area" ? (
            <polygon
              points={`4,${h - 4} ${line} ${4 + (shown.length - 1) * step},${h - 4}`}
              fill="currentColor"
              opacity="0.25"
            />
          ) : null}
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </>
      );
    }
    if (kind === "heatmap") {
      const cols = 4;
      return shown.map((value, at) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: marks are drawn in order and never reordered
          key={`${at}-${value}`}
          x={4 + (at % cols) * 20}
          y={4 + Math.floor(at / cols) * 24}
          width="18"
          height="22"
          rx="2"
          fill="currentColor"
          opacity={0.15 + (value / high) * 0.7}
        />
      ));
    }
    if (kind === "bar-sideways") {
      // A slot for each bar, the bar a part of it with a gap beside: one bar is one bar, not the whole box.
      const slot = (h - 8) / Math.max(shown.length, 1);
      const thick = Math.min(slot - 3, 12);
      const lead = (slot - thick) / 2;
      return shown.map((value, at) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: marks are drawn in order and never reordered
          key={`${at}-${value}`}
          x="4"
          y={4 + at * slot + lead}
          width={Math.max(3, (value / high) * (w - 8))}
          height={thick}
          rx="2"
          fill="currentColor"
          opacity="0.8"
        />
      ));
    }
    // A slot for each bar, the bar a part of it with a gap beside: one bar is one bar, not the whole box.
    const slot = (w - 8) / Math.max(shown.length, 1);
    const wide = Math.min(slot - 4, 16);
    const lead = (slot - wide) / 2;
    return shown.map((value, at) => {
      const tall = Math.max(3, (value / high) * (h - 8));
      return (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: marks are drawn in order and never reordered
          key={`${at}-${value}`}
          x={4 + at * slot + lead}
          y={h - 4 - tall}
          width={wide}
          height={tall}
          rx="2"
          fill="currentColor"
          opacity="0.8"
        />
      );
    });
  })();
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden="true"
      className="shrink-0 text-action"
    >
      {body}
    </svg>
  );
}

/** The figures a preview is drawn from: the real summary when the host gave it, else a sample. */
function figures(query: Query, data: DrawerData | undefined, order?: unknown) {
  const summary = data?.summary ?? sampleSummary(query, data?.counts);
  const name = summary.values[0] ?? "";
  return {
    // In the chart's own order, so that the small one is the shape of the one on the page.
    values: (order === "biggest" || order === "smallest" || order === "label"
      ? orderRows([...summary.rows], summary.breakdowns[0] ?? "", [name], order)
      : summary.rows
    ).map((row) => Number(row[name]) || 0),
    // How many different values are drawn along the bottom, not how many rows the answer has.
    count: new Set(summary.rows.map((row) => row[summary.breakdowns[0] ?? ""])).size,
    real: data?.summary !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Data

export function ChartData({ env, data }: SectionProps) {
  const query = queryOf(env, "rows");
  if (!query) return null;
  const set = setter(env);
  const groups = groupsOf(query);
  const first = groups[0];
  const dated = first?.type !== undefined && TEMPORAL.has(first.type);
  const noun = first ? (dated ? (first.bucket ?? "day") : lower(first.column)) : "rows";
  const shown = figures(query, data, dated ? undefined : env.config.order);
  // What the chart draws is counted: its own rows when they are read, else how many values the
  // column has, when that is known; a made-up sample says nothing of how many there are.
  const known = first && !dated ? data?.counts?.[first.column] : undefined;
  const words = readsAs(query, env.config, shown.real ? shown.count : known);
  const kind = kindOf(env.config);
  const order = (env.config.order as string | undefined) ?? "came";

  // A new answer to "For each" may make the chosen type fit no more, or suit another: the type follows.
  const suggest = (widget: PageWidget, now: { column: string; type: string | undefined }[]) => {
    const shape: ChartShape = { columns: query.columns, breakdowns: now.map((one) => one.column) };
    const was = first?.type !== undefined && TEMPORAL.has(first.type);
    const is = now[0]?.type !== undefined && TEMPORAL.has(now[0].type);
    const current = kindOf(widget.config ?? {});
    if (chartFits(current, shape).fits && was === is) return widget;
    return patch(widget, { mark: suggestedMark(shape), horizontal: undefined });
  };

  return (
    <>
      <DrawerGroup
        label="What to chart"
        note="Three questions in plain words. The chart type is suggested from the answers."
      >
        <MeasureRow env={env} input="rows" at={0} label="Measure" />
        <MoreMeasures env={env} input="rows" label="Measure" />
        <BreakdownRow env={env} input="rows" at={0} label="For each" after={suggest} />
        {first ? (
          <BreakdownRow
            env={env}
            input="rows"
            at={1}
            label="Split into colors"
            none="Nothing"
            after={suggest}
          />
        ) : null}
        <DrawerBlock>
          <div className="flex items-center gap-4">
            <MiniChart kind={kind} values={shown.values} />
            <p className="m-0 text-body-sm text-ink" data-testid="reads-as">
              Reads as <b className="font-semibold">{words.reads.replace(/^Reads as /, "")}</b>{" "}
              {words.drawn}
            </p>
          </div>
        </DrawerBlock>
      </DrawerGroup>
      <DrawerGroup label="Order">
        <SortRow
          env={env}
          input="rows"
          visual={query.visual}
          columns={query.columns}
          withSort
          withLimit={false}
        />
        {dated ? null : (
          <ChoiceRow
            idPrefix={env.widget.id}
            label="Bars in order"
            value={order}
            options={[
              { value: "biggest", label: "Biggest first" },
              { value: "smallest", label: "Smallest first" },
              { value: "label", label: "By name" },
              { value: "came", label: "As it came" },
            ]}
            onChange={(next) =>
              set("order", next === "came" ? undefined : next, "changing the order")
            }
          />
        )}
        <DrawerRow
          label="Show at most"
          value={query.visual.limit ? String(query.visual.limit) : `All ${plural(noun)}`}
          editorTitle="Show at most"
          editorFooter={false}
          editor={
            <NumberEditor
              name={`${env.widget.id}-limit`}
              label="Show at most"
              placeholder={`All ${plural(noun)}`}
              hint="Leave empty to show all of them."
              value={query.visual.limit}
              onChange={(limit) => {
                const { limit: _before, ...rest } = query.visual;
                query.write(
                  limit === undefined ? rest : { ...rest, limit: Math.round(limit) },
                  "changing how many",
                  `limit:${env.widget.id}`,
                );
              }}
            />
          }
        />
      </DrawerGroup>
    </>
  );
}

// ---------------------------------------------------------------------------
// Display

const THEME_SWATCHES = ["var(--color-action)", "var(--color-success)", "var(--color-attention)"];

export function ChartDisplay({ env, data }: SectionProps) {
  const query = queryOf(env, "rows");
  const set = setter(env);
  const config = env.config;
  const shape = query ? shapeOf(query) : { columns: [], breakdowns: [] };
  const groups = groupsOf(query);
  const dated = groups[0]?.type !== undefined && TEMPORAL.has(groups[0].type);
  const kind = kindOf(config);
  const mark = (config.mark as string | undefined) ?? "bar";
  const filters = dateFilters(env);
  const measure = query ? drawnMeasure(query, config) : undefined;
  const along = query ? drawnGroups(query, config)[0] : undefined;
  // A heatmap's side is the column it splits into rows; every other chart's is the measure.
  const side =
    mark === "heatmap" && query
      ? (drawnGroups(query, config)[1]?.column ?? "")
      : (measure?.column ?? measure?.as ?? "");

  const tiles: TileOption<ChartKind>[] = KINDS.map((one) => {
    const fit = chartFits(one.value, shape);
    return {
      value: one.value,
      label: one.label,
      icon: one.icon,
      ...(fit.fits ? {} : { disabled: true, reason: NEEDS[fit.needs ?? ""] ?? "does not fit" }),
    };
  });
  const comparing = isComparing(config);
  const colors = (config.colors as string | undefined) ?? "theme";
  const palette = (name: string) =>
    name === "theme" ? THEME_SWATCHES : (PALETTES[name as keyof typeof PALETTES] ?? []).slice(0, 3);
  void data;

  return (
    <>
      <DrawerGroup
        label="Chart type"
        note="Grayed types don't fit this data; the note says what they would need."
      >
        <DrawerBlock>
          <TilePicker
            label="Chart type"
            options={tiles}
            value={KINDS.some((one) => one.value === kind) ? kind : undefined}
            onChange={(next) =>
              env.write(
                patch(env.widget, {
                  mark: next === "bar-sideways" ? "bar" : next,
                  horizontal: next === "bar-sideways" ? true : undefined,
                }),
                "changing the chart type",
                `config:${env.widget.id}:mark`,
              )
            }
          />
        </DrawerBlock>
        {mark === "bar" && kind !== "pie" && groups.length > 1 ? (
          <DrawerBlock>
            <p className="m-0 mb-2 text-body-sm text-ink-muted">Several series</p>
            <SegmentedControl
              label="Several series"
              options={[
                { value: "stacked", label: "One on another" },
                { value: "grouped", label: "Side by side" },
              ]}
              value={(config.bars as "stacked" | "grouped" | undefined) ?? "stacked"}
              onChange={(next) => set("bars", next, "changing how several series sit")}
            />
          </DrawerBlock>
        ) : null}
      </DrawerGroup>
      <DrawerGroup label="Look">
        <NumbersRow env={env} />
        {query ? <AxisRows env={env} query={query} /> : null}
        <ChoiceRow
          idPrefix={env.widget.id}
          label="Colors"
          icon={Palette}
          value={colors}
          options={[
            { value: "theme", label: "App theme", swatches: palette("theme") },
            { value: "cool", label: "Cool", swatches: palette("cool") },
            { value: "warm", label: "Warm", swatches: palette("warm") },
            { value: "mono", label: "Grays", swatches: palette("mono") },
          ]}
          onChange={(next) =>
            set("colors", next === "theme" ? undefined : next, "changing the colors")
          }
        />
        {mark === "bar" && kind !== "pie" ? (
          <ConfigToggle env={env} name="values" label="Show values on bars" />
        ) : null}
        {mark === "pie" ? null : (
          <ConfigToggle
            env={env}
            name="axisTitles"
            label="Show axis titles"
            on={config.axisTitles !== false}
            help={
              along && measure
                ? `${heading(along.column)} along the bottom, ${heading(side)} up the side`
                : undefined
            }
          />
        )}

        {mark === "pie" ||
        mark === "heatmap" ||
        groups.length > 1 ||
        (query?.visual.measures?.length ?? 0) > 1 ? (
          <ChoiceRow
            idPrefix={env.widget.id}
            label="Legend"
            icon={List}
            value={(config.legend as "auto" | "hidden" | undefined) ?? "auto"}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "hidden", label: "Never" },
            ]}
            onChange={(next) => set("legend", next, "changing the legend")}
          />
        ) : null}
      </DrawerGroup>
      {dated && (mark === "line" || mark === "area" || mark === "bar") ? (
        <DrawerGroup label="Over time">
          <ToggleOverTime
            comparing={comparing}
            noFilters={filters.length === 0}
            onChange={(on) =>
              env.write(
                withConfigObject(env.widget, withCompare(env.widget.config ?? {}, on, filters)),
                "changing the comparison",
              )
            }
          />
          {comparing ? <CompareAcross env={env} /> : null}
          {mark === "line" || mark === "area" ? (
            <>
              <ConfigToggle env={env} name="smooth" label="Smooth the line" />
              <ConfigToggle
                env={env}
                name="points"
                label="Mark each point"
                on={mark === "line" ? config.points !== false : config.points === true}
              />
            </>
          ) : null}
        </DrawerGroup>
      ) : null}
    </>
  );
}

/** "Along the bottom" and "Up the side": which of the result's columns each axis draws; left out is the first. */
function AxisRows({ env, query }: { env: Env; query: Query }) {
  const set = setter(env);
  const across = groupsOf(query).map((one) => groupName(one));
  const up = (query.visual.measures ?? []).map((one) => one.as);
  const rows = [
    { name: "x", label: "Along the bottom", first: "First breakdown", names: across },
    { name: "y", label: "Up the side", first: "First value", names: up },
  ] as const;
  return (
    <>
      {rows.map((row) =>
        row.names.length < 2 ? null : (
          <ChoiceRow
            key={row.name}
            idPrefix={env.widget.id}
            label={row.label}
            value={
              row.names.includes(env.config[row.name] as string)
                ? (env.config[row.name] as string)
                : ""
            }
            options={[
              { value: "", label: row.first },
              ...row.names.map((name) => ({ value: name, label: heading(name) })),
            ]}
            onChange={(next) =>
              set(
                row.name,
                next === "" ? undefined : next,
                `changing what is ${row.label.toLowerCase()}`,
              )
            }
          />
        ),
      )}
    </>
  );
}

function ToggleOverTime({
  comparing,
  noFilters,
  onChange,
}: {
  comparing: boolean;
  noFilters: boolean;
  onChange: (on: boolean) => void;
}): ReactNode {
  return (
    <ToggleRow
      label="Compare with the period before"
      help={
        noFilters
          ? "Needs a date range filter on the page to compare across."
          : "Drawn dashed: the same length of time, ending where this range starts."
      }
      checked={comparing}
      onChange={onChange}
    />
  );
}
