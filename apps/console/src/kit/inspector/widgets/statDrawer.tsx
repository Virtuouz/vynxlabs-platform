/**
 * The stat's drawer (board 14). Data: the one value it shows. Display: the stat as it is drawn,
 * updating as you choose; its heading; how numbers look; and the comparison with the period
 * before, which is one switch, with its two choices shown only when it is on.
 */
import { DrawerBlock, DrawerGroup, SegmentedControl, ToggleRow } from "@volvel/ui";
import type { SummaryData } from "@volvel/widgets";
import { isComparing, StatView, withCompare } from "@volvel/widgets-core/views";
import type { Env } from "../controls.tsx";
import { HeadingGroup } from "../heading.tsx";
import { MeasureRow } from "../measureControls.tsx";
import {
  CompareAcross,
  type DrawerData,
  dateFilters,
  NumbersRow,
  PreviewCard,
  queryOf,
  type SectionProps,
  sampleSummary,
  setter,
  withConfigObject,
} from "./chartShared.tsx";

/** The summary the preview draws: the real one, with the period before kept or left out as the switch says. */
export function previewSummary(
  env: Env,
  data: DrawerData | undefined,
  comparing: boolean,
): SummaryData {
  const query = queryOf(env, "value");
  const base = data?.summary ?? sampleSummary(query, data?.counts, { previous: comparing });
  if (!comparing) {
    const { previous: _previous, ...rest } = base;
    return rest;
  }
  if (base.previous) return base;
  const name = base.values[0] ?? "";
  return {
    ...base,
    previous: base.rows.map((row) => ({ [name]: (Number(row[name]) || 0) / 1.084 })),
  };
}

export function StatData({ env }: SectionProps) {
  return (
    <DrawerGroup
      label="What it shows"
      note="Count of rows, sum, average, smallest or largest of a column."
    >
      <MeasureRow env={env} input="value" at={0} label="Value" />
    </DrawerGroup>
  );
}

/** The stat as it is drawn, in its card, with its title over it. */
export function StatPreview({ env, data }: SectionProps) {
  const comparing = isComparing(env.config);
  const summary = previewSummary(env, data, comparing);
  return (
    <DrawerGroup label="Preview">
      <DrawerBlock>
        <PreviewCard label="Preview">
          <p className="m-0 mb-1 text-body-sm font-semibold text-ink">
            {env.widget.title || env.definition.title}
          </p>
          <StatView
            config={{ ...env.config, compare: comparing }}
            data={{ value: summary }}
            size={{ w: 3, h: 3, narrow: false }}
            emit={() => undefined}
            building
          />
        </PreviewCard>
      </DrawerBlock>
    </DrawerGroup>
  );
}

export function StatDisplay({ env, data }: SectionProps) {
  const set = setter(env);
  const comparing = isComparing(env.config);
  const filters = dateFilters(env);
  const style = (env.config.format as { style?: string } | undefined)?.style;
  const delta = (env.config.delta as "percent" | "absolute" | "points" | undefined) ?? "percent";
  const goodWhen = (env.config.goodWhen as "up" | "down" | undefined) ?? "up";
  const name = env.widget.title || env.definition.title;
  return (
    <>
      <StatPreview env={env} data={data} />
      <HeadingGroup env={env} />
      <DrawerGroup label="Look">
        <NumbersRow env={env} />
      </DrawerGroup>
      <DrawerGroup
        label="Compare"
        note={
          comparing
            ? `${name} going up is ${goodWhen === "down" ? "bad, so the arrow is red" : "good, so the arrow is green"}. The preview updates as you choose.`
            : undefined
        }
      >
        <ToggleRow
          label="Compare with the period before"
          help={
            filters.length === 0
              ? "Needs a date range filter on the page to compare across."
              : "The same length of time, ending where the range starts."
          }
          checked={comparing}
          onChange={(on) =>
            env.write(
              withConfigObject(env.widget, withCompare(env.widget.config ?? {}, on, filters)),
              "changing the comparison",
            )
          }
        />
        {comparing ? <CompareAcross env={env} /> : null}
        {comparing ? (
          <DrawerBlock>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5 [&_fieldset]:w-full [&_fieldset]:flex-nowrap [&_label]:flex-1 [&_label]:justify-center">
                <p className="m-0 text-body-sm text-ink-muted">Show change as</p>
                <SegmentedControl
                  label="Show change as"
                  options={[
                    { value: "percent", label: "%" },
                    { value: "absolute", label: style === "currency" ? "$" : "Number" },
                    ...(style === "percent" ? [{ value: "points" as const, label: "Points" }] : []),
                  ]}
                  value={delta}
                  onChange={(next) =>
                    set(
                      "delta",
                      next === "percent" ? undefined : next,
                      "changing how the change is shown",
                      false,
                    )
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 [&_fieldset]:w-full [&_fieldset]:flex-nowrap [&_label]:flex-1 [&_label]:justify-center">
                <p className="m-0 text-body-sm text-ink-muted">Going up is</p>
                <SegmentedControl
                  label="Going up is"
                  options={[
                    { value: "up", label: "Good" },
                    { value: "down", label: "Bad" },
                  ]}
                  value={goodWhen}
                  onChange={(next) =>
                    set(
                      "goodWhen",
                      next === "up" ? undefined : next,
                      "changing which way is good",
                      false,
                    )
                  }
                />
              </div>
            </div>
          </DrawerBlock>
        ) : null}
      </DrawerGroup>
    </>
  );
}
