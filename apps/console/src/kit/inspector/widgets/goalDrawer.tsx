/**
 * The goal's drawer (board 14). The bar is previewed above Progress (Value, Goal, Over); Display
 * holds its heading and look: the percentage, and what the bar does when the goal is reached.
 */
import type { PageFilter, VisualQuery } from "@volvel/manifest";
import {
  DrawerBlock,
  DrawerGroup,
  DrawerRow,
  NumberField,
  SegmentedControl,
  SelectField,
} from "@volvel/ui";
import { formatNumber, type SummaryData } from "@volvel/widgets";
import { labsPack } from "@volvel/widgets-labs/views";
import { Calendar, Target } from "lucide-react";
import { HeadingGroup } from "../heading.tsx";
import { MeasureRow } from "../measureControls.tsx";
import { bindFilter, heading, measureName, unbindFilter } from "../model.ts";
import {
  ChoiceRow,
  ConfigToggle,
  type DrawerData,
  NUMERIC,
  NumbersRow,
  PreviewCard,
  queryOf,
  type SectionProps,
  sampleSummary,
  setter,
} from "./chartShared.tsx";

const GoalView = labsPack.views["labs/goal"];

/** The figures the bar is drawn from: the real ones, else a sample a quarter of the way to the goal. */
function figures(env: SectionProps["env"], data: DrawerData | undefined): SummaryData {
  if (data?.summary) return data.summary;
  const query = queryOf(env, "value");
  const target = typeof env.config.target === "number" ? env.config.target : 200_000;
  const sample = sampleSummary(query, data?.counts, {
    value: Math.round(target * 0.259 * 100) / 100,
  });
  const goalName = env.config.goalFrom;
  if (typeof goalName === "string" && sample.rows[0]) {
    return { ...sample, rows: [{ ...sample.rows[0], [goalName]: target }] };
  }
  return sample;
}

export function GoalPreview({ env, data }: SectionProps) {
  const summary = figures(env, data);
  return (
    <DrawerGroup label="Preview">
      <DrawerBlock>
        <PreviewCard label="Preview">
          <p className="m-0 mb-1 text-body-sm font-semibold text-ink">
            {env.widget.title || env.definition.title}
          </p>
          {GoalView ? (
            <GoalView
              config={env.config}
              data={{ value: summary }}
              size={{ w: 3, h: 3, narrow: false }}
              emit={() => undefined}
              building
            />
          ) : null}
        </PreviewCard>
      </DrawerBlock>
    </DrawerGroup>
  );
}

/** "$200,000", or the column it is read from. */
function goalWords(env: SectionProps["env"]): string | undefined {
  const from = env.config.goalFrom;
  const query = queryOf(env, "value");
  if (typeof from === "string") {
    const measure = query?.visual.measures?.find((one) => one.as === from);
    return measure?.column ? `${heading(measure.column)} of each row, added up` : heading(from);
  }
  const target = env.config.target;
  // A whole amount is written whole: "$200,000", not "$200,000.00".
  return typeof target === "number"
    ? formatNumber(target, {
        ...((env.config.format as Parameters<typeof formatNumber>[1]) ?? { style: "number" }),
        ...(Number.isInteger(target) ? { decimals: 0 } : {}),
      })
    : undefined;
}

/** The goal: a fixed amount, or a column of the table the figure is read from. */
function GoalRow({ env }: SectionProps) {
  const query = queryOf(env, "value");
  const set = setter(env);
  const from = env.config.goalFrom;
  const fromColumn = typeof from === "string";
  const numeric = query?.columns.filter((column) => NUMERIC.has(column.type)) ?? [];
  const fixed = typeof env.config.target === "number" ? env.config.target : undefined;
  const takeColumn = (column: string) => {
    if (!query) return;
    const [first, ...rest] = query.visual.measures ?? [];
    if (!first) return;
    const wasGoal = rest[0];
    const as = wasGoal?.as ?? measureName("sum", column, [first.as]);
    const visual: VisualQuery = {
      ...query.visual,
      measures: [first, { fn: "sum", column, as }],
    };
    query.write(visual, "taking the goal from a column", undefined, {
      ...env.widget,
      config: { ...(env.widget.config ?? {}), goalFrom: as },
    });
  };
  const takeAmount = () => {
    if (!query) return;
    const [first] = query.visual.measures ?? [];
    const { goalFrom: _from, ...config } = env.widget.config ?? {};
    query.write(
      { ...query.visual, measures: first ? [first] : [] },
      "using a fixed goal",
      undefined,
      {
        ...env.widget,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      },
    );
  };
  return (
    <DrawerRow
      label="Goal"
      icon={Target}
      value={goalWords(env)}
      editorTitle="Goal"
      editorFooter={false}
      editor={
        <div className="flex flex-col gap-3">
          <SegmentedControl
            label="The goal is"
            options={[
              { value: "amount", label: "A fixed amount" },
              { value: "column", label: "From a column" },
            ]}
            value={fromColumn ? "column" : "amount"}
            onChange={(next) => {
              if (next === "amount") takeAmount();
              else {
                // Not the column the value is already of: a goal is usually another one.
                const own = query?.visual.measures?.[0]?.column;
                const other = numeric.find((column) => column.name !== own) ?? numeric[0];
                if (other) takeColumn(other.name);
              }
            }}
          />
          {fromColumn ? (
            <SelectField
              name={`${env.widget.id}-goal-column`}
              label="Column"
              value={query?.visual.measures?.find((one) => one.as === from)?.column ?? ""}
              options={numeric.map((column) => ({
                value: column.name,
                label: heading(column.name),
              }))}
              onChange={takeColumn}
            />
          ) : (
            <NumberField
              name={`${env.widget.id}-goal-amount`}
              label="Amount"
              required={false}
              min={1}
              value={fixed}
              onChange={(next) => set("target", next, "changing the goal")}
            />
          )}
        </div>
      }
    />
  );
}

/** The period the goal counts over: one of the page's date filters, which the value follows. */
function OverRow({ env }: SectionProps) {
  const dates = env.filters.filter((filter: PageFilter) => filter.type === "date_range");
  const input = env.widget.data?.value;
  const followed = dates.find((filter) =>
    (input?.filters ?? []).some((binding) => binding.filter === filter.name),
  );
  const nameOf = (filter: PageFilter) => filter.label ?? heading(filter.name);
  if (dates.length === 0) {
    return <DrawerRow label="Over" icon={Calendar} value="No date filter on the page" />;
  }
  const choose = (name: string | undefined) => {
    let next = env.widget;
    for (const filter of dates) next = unbindFilter(next, filter.name);
    const chosen = dates.find((filter) => filter.name === name);
    if (chosen) next = bindFilter(next, chosen, env.catalog, env.neighbours);
    env.write(next, name ? "counting over a period" : "counting over all time");
  };
  return (
    <DrawerRow
      label="Over"
      icon={Calendar}
      value={followed ? `The ${nameOf(followed)} filter` : "All time"}
      editorTitle="Over"
      editorFooter={false}
      editor={
        <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
          <legend className="sr-only">Over</legend>
          {[
            { name: undefined, label: "All time" },
            ...dates.map((one) => ({ name: one.name, label: nameOf(one) })),
          ].map((option) => {
            const on = (followed?.name ?? undefined) === option.name;
            return (
              <label
                key={option.name ?? "all"}
                className={`flex h-10 cursor-pointer items-center rounded-control border px-3 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                  on ? "border-action bg-selected" : "border-transparent hover:bg-selected"
                }`}
              >
                <input
                  type="radio"
                  name={`${env.widget.id}-over`}
                  checked={on}
                  onChange={() => choose(option.name)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </fieldset>
      }
    />
  );
}

/** Board 14: the Data tab reads Preview, Progress (value, goal, over), then Look (the percentage, when reached). */
export function GoalData({ env }: SectionProps) {
  const set = setter(env);
  return (
    <>
      <DrawerGroup
        label="Progress"
        note="The goal can be a fixed amount or come from a column, such as a monthly target table."
      >
        <MeasureRow env={env} input="value" at={0} label="Value" />
        <GoalRow env={env} />
        <OverRow env={env} />
      </DrawerGroup>
      <DrawerGroup label="Look">
        <ConfigToggle
          env={env}
          name="percent"
          label="Show the percentage"
          on={env.config.percent !== false}
        />
        <ChoiceRow
          idPrefix={env.widget.id}
          label="When reached"
          value={(env.config.reached as "green" | "none" | undefined) ?? "green"}
          options={[
            { value: "green", label: "Bar turns green" },
            { value: "none", label: "Bar stays" },
          ]}
          onChange={(next) =>
            set("reached", next, "changing what happens when the goal is reached")
          }
        />
      </DrawerGroup>
    </>
  );
}

export function GoalDisplay({ env, data }: SectionProps) {
  const set = setter(env);
  return (
    <>
      <GoalPreview env={env} data={data} />
      <HeadingGroup env={env} caption="label" />
      <DrawerGroup label="Numbers">
        <NumbersRow env={env} />
      </DrawerGroup>
    </>
  );
}
