/**
 * The `pageFilters` control: the filters a Search and filter widget gives the page, as a
 * list. A search looks for words in the text columns each widget shows; a filter by a
 * column is a range of dates, one of a list, a number or text. Adding one binds every
 * widget of the page whose table has the column (a search, the columns it shows);
 * taking one away takes it off every widget that followed it.
 *
 * A filter's name is made when it is added and never changed after, so what follows it
 * keeps following it when it is renamed (only its label is).
 */
import {
  MAX_PAGE_FILTERS,
  type PageFilter,
  type PageFilterType,
  type PageWidget,
  RELATIVE_RANGES,
  type RelativeRange,
  widgetTables,
} from "@volvel/manifest";
import { Button, Dialog, MoveButtons, SelectField, TextField, useFlip } from "@volvel/ui";
import { Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { notify } from "../../ask.tsx";
import type { Env } from "./controls.tsx";
import {
  bindFilter,
  type CatalogColumn,
  type ConfigSetting,
  filterColumn,
  filterTypeFor,
  heading,
  mainTable,
  newColumnFilter,
  newSearch,
  unbindFilter,
  withConfig,
  withSystemColumns,
} from "./model.ts";

/** What a date filter's range is called, in the words a reader sees. */
export const RANGE_WORDS: Record<RelativeRange, string> = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  last_12_months: "Last 12 months",
};

/** What a filter by a column is, in the words of whoever builds the page. A search is its own kind. */
const COLUMN_KINDS: Partial<Record<PageFilterType, string>> = {
  date_range: "A range of dates",
  choice: "One of a list",
  text: "Text to look for",
  number: "A number",
};

const TEMPORAL = new Set(["date", "timestamp"]);
/** Every table has these; a filter on one is the last thing a maker wants first. */
const SYSTEM_COLUMNS = new Set(["id", "created_at", "updated_at"]);

/** A column the page's widgets read, and the table it is read from. */
interface PageColumn extends CatalogColumn {
  table: string;
}

/** The columns of the tables the page's widgets read, each name once. */
function pageColumns(env: Env): PageColumn[] {
  const found = new Map<string, PageColumn>();
  for (const table of widgetTables([...env.widgets])) {
    const columns = env.catalog.tables.find((one) => one.name === table)?.columns ?? [];
    for (const column of withSystemColumns(columns)) {
      if (column.name !== "id" && !found.has(column.name))
        found.set(column.name, { ...column, table });
    }
  }
  return [...found.values()];
}

export function FiltersControl({
  env,
  field,
  setting,
}: {
  env: Env;
  field: string;
  setting: ConfigSetting;
}) {
  const own = Array.isArray(env.config.filters) ? (env.config.filters as PageFilter[]) : [];
  const taken = [
    ...new Set([...env.filters.map((one) => one.name), ...own.map((one) => one.name)]),
  ];
  const columns = pageColumns(env);
  const holder = useFlip<HTMLUListElement>(own.map((one) => one.name).join(" "));
  const [adding, setAdding] = useState(false);
  const [column, setColumn] = useState("");
  const full = taken.length >= MAX_PAGE_FILTERS;

  /** Writes this widget's filters, and with them the widgets that follow them. */
  const commit = (
    filters: PageFilter[],
    widgets: readonly PageWidget[],
    label: string,
    key?: string,
  ) => {
    const mine = withConfig(env.widget, "filters", filters);
    env.writeAll(
      widgets.map((one) => (one.id === env.widget.id ? mine : one)),
      label,
      key,
    );
  };
  const change = (
    name: string,
    patch: Partial<PageFilter>,
    drop: (keyof PageFilter)[] = [],
    key?: string,
  ) =>
    commit(
      own.map((one) => {
        if (one.name !== name) return one;
        const next: Record<string, unknown> = { ...one, ...patch };
        for (const dropped of drop) delete next[dropped];
        for (const [each, value] of Object.entries(next))
          if (value === undefined || value === "") delete next[each];
        return next as unknown as PageFilter;
      }),
      env.widgets,
      `changing the filter ${own.find((one) => one.name === name)?.label ?? name}`,
      key,
    );
  /** A new filter is followed by every widget whose table has its column (a search, its text). */
  const add = (filter: PageFilter) => {
    commit(
      [...own, filter],
      env.widgets.map((one) =>
        bindFilter(
          one,
          filter,
          env.catalog,
          env.widgets.filter((other) => other.id !== one.id),
        ),
      ),
      `adding the filter ${filter.label ?? filter.name}`,
    );
  };
  const remove = (filter: PageFilter) => {
    commit(
      own.filter((one) => one.name !== filter.name),
      env.widgets.map((one) => unbindFilter(one, filter.name)),
      `removing the filter ${filter.label ?? filter.name}`,
    );
    notify.success(`Removed ${filter.label ?? heading(filter.name)}.`, {
      ...(env.undo ? { action: { label: "Undo", onClick: env.undo } } : {}),
    });
  };
  const move = (at: number, by: -1 | 1) => {
    const next = [...own];
    const [taking] = next.splice(at, 1);
    if (taking) next.splice(at + by, 0, taking);
    commit(next, env.widgets, "moving a filter");
  };

  const open = () => {
    const first =
      columns.find((one) => TEMPORAL.has(one.type) && !SYSTEM_COLUMNS.has(one.name)) ??
      columns.find((one) => one.type === "enum") ??
      columns.find((one) => one.type === "timestamp" && one.name !== "updated_at") ??
      columns[0];
    setColumn(first?.name ?? "");
    setAdding(true);
  };
  const chosen = columns.find((one) => one.name === column);
  const pageTable = mainTable(env.widgets, env.catalog);

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">{setting.hint.label}</legend>
      <p className="m-0 text-body-sm text-ink-muted">{setting.hint.help}</p>
      <ul ref={holder} className="m-0 flex list-none flex-col gap-3 p-0">
        {own.map((filter, at) => {
          const name = filter.label ?? heading(filter.name);
          const id = `${field}-${filter.name}`;
          return (
            <li
              key={filter.name}
              data-flip-key={filter.name}
              aria-label={name}
              className="flex flex-col gap-2 rounded-control border border-line p-2"
            >
              <div className="flex items-end gap-1">
                <div className="min-w-0 flex-1">
                  <TextField
                    label="Called"
                    name={`${id}-label`}
                    required={false}
                    maxLength={100}
                    value={filter.label ?? ""}
                    placeholder={heading(filter.name)}
                    onChange={(label) =>
                      change(filter.name, { label }, [], `filter:${filter.name}`)
                    }
                  />
                </div>
                <MoveButtons
                  label={name}
                  at={at}
                  count={own.length}
                  onMove={(by) => move(at, by)}
                />
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Remove ${name}`}
                  disabled={own.length <= 1}
                  tooltip={
                    own.length <= 1
                      ? "A Search and filter holds at least one. Remove the widget to take them all off."
                      : undefined
                  }
                  onClick={() => remove(filter)}
                >
                  <X aria-hidden="true" size={14} />
                </Button>
              </div>
              {filter.type === "search" ? (
                <p className="m-0 text-body-sm text-ink-muted">
                  Looks for the words in the text columns each widget shows. Change them under the
                  widget's Data tab.
                </p>
              ) : (
                <>
                  <SelectField
                    label="It is"
                    name={`${id}-type`}
                    value={filter.type}
                    options={Object.entries(COLUMN_KINDS).map(([value, label]) => ({
                      value,
                      label: label ?? value,
                    }))}
                    onChange={(type) => {
                      const table =
                        filter.from?.table ??
                        columns.find((one) => one.name === filterColumn(filter))?.table ??
                        pageTable;
                      change(
                        filter.name,
                        {
                          type: type as PageFilterType,
                          ...(type === "choice" && table
                            ? { from: { table, column: filterColumn(filter) } }
                            : {}),
                        },
                        type === "choice" ? ["default", "choices"] : ["default", "choices", "from"],
                      );
                    }}
                  />
                  {filter.type === "date_range" ? (
                    <SelectField
                      label="When nobody has set it"
                      name={`${id}-default`}
                      value={typeof filter.default === "string" ? filter.default : ""}
                      options={[
                        { value: "", label: "All time" },
                        ...RELATIVE_RANGES.map((range) => ({
                          value: range,
                          label: RANGE_WORDS[range],
                        })),
                      ]}
                      onChange={(value) => change(filter.name, { default: value || undefined })}
                    />
                  ) : filter.type === "choice" ? (
                    <TextField
                      label="The values, with commas"
                      name={`${id}-choices`}
                      required={false}
                      hint={
                        filter.from
                          ? `Left empty, they are the values of ${heading(filter.from.column)} in ${heading(filter.from.table)}.`
                          : ""
                      }
                      value={(filter.choices ?? []).join(", ")}
                      onChange={(text) => {
                        const choices = text
                          .split(",")
                          .map((one) => one.trim())
                          .filter(Boolean);
                        change(
                          filter.name,
                          { choices },
                          choices.length === 0 ? ["choices"] : [],
                          `filter:${filter.name}:choices`,
                        );
                      }}
                    />
                  ) : (
                    <TextField
                      label="When nobody has set it"
                      name={`${id}-default`}
                      required={false}
                      value={filter.default === undefined ? "" : String(filter.default)}
                      onChange={(value) =>
                        change(
                          filter.name,
                          {
                            default:
                              filter.type === "number" &&
                              value.trim() !== "" &&
                              Number.isFinite(Number(value))
                                ? Number(value)
                                : value,
                          },
                          [],
                          `filter:${filter.name}:default`,
                        )
                      }
                    />
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          disabled={full}
          tooltip={full ? `A page has at most ${MAX_PAGE_FILTERS} filters.` : undefined}
          onClick={() => add(newSearch(pageTable, taken))}
        >
          <Search aria-hidden="true" size={14} /> Add a search
        </Button>
        <Button
          size="small"
          disabled={full || columns.length === 0}
          tooltip={
            full
              ? `A page has at most ${MAX_PAGE_FILTERS} filters.`
              : columns.length === 0
                ? "Add a widget that reads a table first: a filter narrows the columns of the tables on the page."
                : undefined
          }
          onClick={open}
        >
          <Plus aria-hidden="true" size={14} /> Add a filter by a column
        </Button>
      </div>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a filter by a column"
        description="Whoever reads the page sets it, and it narrows every widget whose table has this column."
      >
        <div className="flex flex-col gap-4">
          <SelectField
            label="Column"
            name={`${field}-new-column`}
            value={column}
            options={columns.map((one) => ({
              value: one.name,
              label: heading(one.name),
            }))}
            onChange={setColumn}
          />
          {chosen ? (
            <p className="m-0 text-body-sm text-ink-muted">
              Readers pick {COLUMN_KINDS[filterTypeFor(chosen)]?.toLowerCase()}.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                add(newColumnFilter(chosen, chosen.table, taken));
                setAdding(false);
              }}
            >
              Add the filter
            </Button>
          </div>
        </div>
      </Dialog>
    </fieldset>
  );
}
