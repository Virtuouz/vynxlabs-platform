/**
 * "Group rows by", of a List and of a Table: the column whose value (or day, week or month) heads
 * each group, and which group is first. One row of the drawer that opens a small editor. Only rows
 * read from a table can be grouped: a saved query's are in the order its own SQL gives.
 */
import { DrawerRow, SegmentedControl, SelectField } from "@volvel/ui";
import { Rows3 } from "lucide-react";
import type { Env } from "./controls.tsx";
import { columnOptions } from "./controls.tsx";
import {
  type CatalogColumn,
  heading,
  isChoiceLike,
  tableOfInput,
  visualOf,
  withConfig,
  withSystemColumns,
} from "./model.ts";
import { FullSegments } from "./widgets/FullSegments.tsx";

const TYPES = ["date", "timestamp", "enum", "text", "boolean"] as const;
const PERIODS = { day: "Day", week: "Week", month: "Month" } as const;
type Period = keyof typeof PERIODS;

export interface GroupRowsSetting {
  column: string;
  by?: Period;
  descending?: boolean;
}

export const groupRowsOf = (config: Readonly<Record<string, unknown>>) => {
  const given = config.groupRows as GroupRowsSetting | undefined;
  return typeof given?.column === "string" && given.column !== "" ? given : undefined;
};

const isTime = (type: string | undefined) => type === "date" || type === "timestamp";

/** What the two orders of groups are called, by what the column holds. */
function orderWords(type: string | undefined): { asc: string; desc: string } {
  if (isTime(type)) return { asc: "Earliest", desc: "Latest" };
  if (type === "enum") return { asc: "As listed", desc: "Reversed" };
  if (type === "boolean") return { asc: "No", desc: "Yes" };
  return { asc: "A to Z", desc: "Z to A" };
}

/** The columns rows may be grouped by: dates, then choices, then the rest. */
function groupable(env: Env, of: string): CatalogColumn[] {
  const named = tableOfInput(env.widget.data?.[of], env.page, env.widgets);
  const table = named ? env.catalog.tables.find((one) => one.name === named) : undefined;
  const offered = new Set(columnOptions(env, of, TYPES).map((one) => one.value));
  const rank = (column: CatalogColumn) =>
    // The table's own dates before when a row was made and last changed.
    isTime(column.type)
      ? column.name === "created_at" || column.name === "updated_at"
        ? 4
        : 0
      : column.type === "enum"
        ? 1
        : isChoiceLike(column)
          ? 2
          : 3;
  return (table ? withSystemColumns(table.columns) : [])
    .filter((one) => offered.has(one.name) && one.references === null)
    .sort((a, b) => rank(a) - rank(b));
}

export function GroupRowsRow({ env, of = "rows" }: { env: Env; of?: string }) {
  const visual = visualOf(env.widget.data?.[of]);
  const totals = (visual?.groupBy?.length ?? 0) > 0 || (visual?.measures?.length ?? 0) > 0;
  const columns = totals ? [] : groupable(env, of);
  const now = groupRowsOf(env.config);
  const column = columns.find((one) => one.name === now?.column);
  const time = isTime(column?.type);
  const words = orderWords(column?.type);
  const put = (next: GroupRowsSetting | undefined) =>
    env.write(
      withConfig(env.widget, "groupRows", next),
      "changing how rows are grouped",
      `config:${env.widget.id}:groupRows`,
    );
  const change = (patch: Partial<GroupRowsSetting>) => {
    if (!now) return;
    const next = { ...now, ...patch };
    put({
      column: next.column,
      ...(next.by ? { by: next.by } : {}),
      ...(next.descending ? { descending: true } : {}),
    });
  };
  const choose = (name: string) => {
    const chosen = columns.find((one) => one.name === name);
    if (!chosen) return put(undefined);
    // It starts in the order the rows are already in, when that is by this column.
    const sorted = visual?.sort?.[0];
    put({
      column: name,
      ...(isTime(chosen.type) ? { by: now?.by ?? "day" } : {}),
      ...(sorted?.by === name && sorted.descending ? { descending: true } : {}),
    });
  };
  // Nothing to group by: rows of a saved query, or totals. Said only when something was chosen.
  if (columns.length === 0 && !now) return null;
  return (
    <DrawerRow
      label="Group rows by"
      icon={Rows3}
      value={
        now ? (
          `${heading(now.column)}${time ? `, by ${(now.by ?? "day").toLowerCase()}` : ""}`
        ) : (
          <span className="text-ink-muted">Nothing</span>
        )
      }
      editorTitle="Group rows by"
      editor={
        <div className="flex flex-col gap-4">
          <SelectField
            name={`${env.widget.id}-groupRows`}
            label="Column"
            value={now?.column ?? ""}
            hint="Each day, week, month or value gets a heading, with how many rows it has."
            {...(now && !column
              ? { error: `${heading(now.column)} can't group these rows any more.` }
              : {})}
            options={[
              { value: "", label: "Nothing: one list" },
              ...(now && !column ? [{ value: now.column, label: heading(now.column) }] : []),
              ...columns.map((one) => ({ value: one.name, label: heading(one.name) })),
            ]}
            onChange={choose}
          />
          {now && time ? (
            <div className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-ink">Each group is a</span>
              <FullSegments>
                <SegmentedControl
                  label="Each group is a"
                  value={now.by ?? "day"}
                  options={Object.entries(PERIODS).map(([value, label]) => ({ value, label }))}
                  onChange={(next) => change({ by: next as Period })}
                />
              </FullSegments>
              {column?.type === "timestamp" ? (
                <p className="m-0 text-body-sm text-ink-muted">
                  Days are those of whoever reads it, where they are.
                </p>
              ) : null}
            </div>
          ) : null}
          {now ? (
            <div className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-ink">First</span>
              <FullSegments>
                <SegmentedControl
                  label="First"
                  value={now.descending ? "desc" : "asc"}
                  options={[
                    { value: "asc", label: words.asc },
                    { value: "desc", label: words.desc },
                  ]}
                  onChange={(next) => change({ descending: next === "desc" })}
                />
              </FullSegments>
              <p className="m-0 text-body-sm text-ink-muted">
                Within a group, rows are as “Sorted by” says
                {time ? ", or by their time when it says nothing." : "."}
              </p>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
