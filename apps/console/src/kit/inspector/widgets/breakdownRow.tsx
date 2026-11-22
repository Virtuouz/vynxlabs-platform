import type { PageWidget, VisualQuery } from "@volvel/manifest";
import { groupName } from "@volvel/manifest";
import { DrawerRow } from "@volvel/ui";
import { CADENCE_WORDS } from "@volvel/widgets";
import type { ReactNode } from "react";
import type { Env } from "../controls.tsx";
import { heading, renamedResult } from "../model.ts";
import { columnIcon, type DrawerData, groupings, type Query, TEMPORAL } from "./chartShared.tsx";
import { type Cadence, ColumnPicker } from "./columnPicker.tsx";

type Group = NonNullable<VisualQuery["groupBy"]>[number];

/** How a breakdown reads on its row: "Clinic", "Issued on · by week". */
export function groupWords(group: Group | undefined): string | undefined {
  if (!group) return undefined;
  const words = heading(group.column);
  return group.bucket ? `${words} · by ${group.bucket}` : words;
}

/**
 * The breakdowns of a query with one changed, and the widget following: a result name that
 * changed with it is renamed in the sort and in the settings that name it. `to` left out takes
 * the breakdown away.
 */
export function withBreakdown(
  env: Env,
  query: Query,
  at: number,
  to: Group | undefined,
): { visual: VisualQuery; widget: PageWidget } {
  const groups = query.visual.groupBy ?? [];
  const old = groups[at];
  const next = to
    ? old
      ? groups.map((one, index) => (index === at ? to : one))
      : [...groups, to]
    : groups.filter((_, index) => index !== at);
  let widget = env.widget;
  let sort = query.visual.sort;
  if (old && to && groupName(old) !== groupName(to)) {
    const from = groupName(old);
    const named = groupName(to);
    sort = sort?.map((one) => (one.by === from ? { ...one, by: named } : one));
    widget = renamedResult(env.definition, widget, query.input, from, named);
  }
  return {
    visual: { ...query.visual, groupBy: next, ...(sort ? { sort } : {}) },
    widget,
  };
}

/** A row for the `at`th breakdown: the column it groups by, picked from a list ordered by how well they group. */
export function BreakdownRow({
  env,
  query,
  at,
  label,
  data,
  none,
  after,
  children,
}: {
  env: Env;
  query: Query;
  at: number;
  label: string;
  data?: DrawerData | undefined;
  /** What it reads when there is none to give: "Nothing". The first breakdown of a chart is required. */
  none?: string;
  /** What else changes with it (the chart type a new answer suggests), given the widget and the breakdowns now. */
  after?: (
    widget: PageWidget,
    groups: { column: string; type: string | undefined }[],
  ) => PageWidget;
  /** Under the choices, for a date: what only a date offers. */
  children?: (bucket: Cadence) => ReactNode;
}) {
  const groups = query.visual.groupBy ?? [];
  const here = groups[at];
  const others = groups.filter((_, index) => index !== at).map((one) => one.column);
  const typeOf = (column: string) => query.columns.find((one) => one.name === column)?.type;
  const write = (to: Group | undefined, words: string) => {
    const made = withBreakdown(env, query, at, to);
    const now = (made.visual.groupBy ?? []).map((one) => ({
      column: one.column,
      type: typeOf(one.column),
    }));
    query.write(made.visual, words, undefined, after ? after(made.widget, now) : made.widget);
  };
  const Icon = here ? columnIcon(typeOf(here.column) ?? "text") : undefined;
  const bucket = (here?.bucket ?? "week") as Cadence;
  return (
    <DrawerRow
      label={label}
      {...(Icon ? { icon: Icon } : {})}
      value={
        groupWords(here) ?? (none ? <span className="text-ink-muted">{none}</span> : undefined)
      }
      editorTitle={
        here && TEMPORAL.has(typeOf(here.column) ?? "")
          ? `${label} · ${heading(here.column)}`
          : label
      }
      editorFooter={false}
      editor={
        <ColumnPicker
          label={label}
          groupings={groupings(query.columns, data?.counts, others)}
          value={here?.column}
          bucket={bucket}
          {...(none ? { none } : {})}
          onPick={(column, type) =>
            write(
              column === undefined
                ? undefined
                : { column, ...(type && TEMPORAL.has(type) ? { bucket: "week" as const } : {}) },
              "changing what it is broken down by",
            )
          }
          onBucket={(cut) =>
            here &&
            write(
              { column: here.column, bucket: cut },
              `cutting ${CADENCE_WORDS[cut].toLowerCase()}`,
            )
          }
        >
          {children?.(bucket)}
        </ColumnPicker>
      }
    />
  );
}
