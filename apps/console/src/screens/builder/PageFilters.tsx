import {
  MAX_PAGE_FILTERS,
  type PageFilter,
  type PageFilterType,
  type PageWidget,
  RELATIVE_RANGES,
  type RelativeRange,
  widgetTables,
} from "@volvel/manifest";
import { Button, Dialog, SelectField, TextField } from "@volvel/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import {
  bindFilter,
  type Catalog,
  heading,
  unbindFilter,
  withSystemColumns,
} from "../../kit/inspector/model.ts";

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

const KIND_WORDS: Record<PageFilterType, string> = {
  date_range: "A range of dates",
  choice: "One of a list",
  text: "Text to look for",
  number: "A number",
};

/** What a column suggests a filter on it is. */
function kindFor(type: string): PageFilterType {
  if (type === "date" || type === "timestamp") return "date_range";
  if (type === "integer" || type === "number") return "number";
  if (type === "enum" || type === "boolean") return "choice";
  return "text";
}

/** A name a filter goes by, made from its column and kept unique. */
function nameFor(column: string, taken: readonly string[]): string {
  const base = column.replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "") || "filter";
  let name = base;
  for (let n = 2; taken.includes(name); n += 1) name = `${base}_${n}`;
  return name;
}

export interface FilterChange {
  filters: PageFilter[];
  widgets: PageWidget[];
}

/**
 * The filters whoever reads the page sets: a range of dates, one of a list,
 * text or a number. Adding one binds it to every data input whose table has
 * its column; taking one away takes it off every input that named it.
 * What a filter is when nobody has set it is what the page opens with.
 */
export function PageFilterSettings({
  filters,
  widgets,
  catalog,
  onChange,
}: {
  filters: readonly PageFilter[];
  widgets: readonly PageWidget[];
  catalog: Catalog;
  onChange: (next: FilterChange, label: string, key?: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [column, setColumn] = useState("");
  const [kind, setKind] = useState<PageFilterType>("date_range");
  const tables = widgetTables(widgets);
  const columns = [
    ...new Map(
      tables.flatMap((table) =>
        withSystemColumns(catalog.tables.find((one) => one.name === table)?.columns ?? []).map(
          (one) => [one.name, { ...one, table }] as const,
        ),
      ),
    ).values(),
  ];
  const keep = (next: PageFilter[], label: string, key?: string) =>
    onChange({ filters: next, widgets: [...widgets] }, label, key);

  const open = () => {
    const first =
      columns.find((one) => one.type === "timestamp" && one.name !== "updated_at") ?? columns[0];
    setColumn(first?.name ?? "");
    setKind(kindFor(first?.type ?? "text"));
    setAdding(true);
  };
  const add = () => {
    const chosen = columns.find((one) => one.name === column);
    if (!chosen) return;
    const filter: PageFilter = {
      name: nameFor(column, filters.map((one) => one.name)),
      label: heading(column.replace(/_at$/, "")),
      type: kind,
      ...(kind === "date_range" ? { default: "last_30_days" } : {}),
      ...(kind === "choice" ? { from: { table: chosen.table, column } } : {}),
    };
    onChange(
      {
        filters: [...filters, filter],
        // Every data input whose table has the column now follows it.
        widgets: widgets.map((widget) => bindFilter(widget, filter, catalog)),
      },
      `adding the filter ${filter.label}`,
    );
    setAdding(false);
  };
  const change = (at: number, patch: Partial<PageFilter>, drop: (keyof PageFilter)[] = [], key?: string) =>
    keep(
      filters.map((one, index) => {
        if (index !== at) return one;
        const next: Record<string, unknown> = { ...one, ...patch };
        for (const name of drop) delete next[name];
        for (const [name, value] of Object.entries(next)) if (value === undefined || value === "") delete next[name];
        return next as unknown as PageFilter;
      }),
      `changing the filter ${filters[at]?.label ?? filters[at]?.name ?? ""}`,
      key,
    );

  return (
    <section aria-labelledby="page-filters" className="mt-4 flex flex-col gap-3 rounded-panel border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="page-filters" className="m-0 text-label text-ink-subtle uppercase">
          Filters for whoever reads this page
        </h2>
        <Button
          size="small"
          disabled={filters.length >= MAX_PAGE_FILTERS || columns.length === 0}
          tooltip={
            columns.length === 0
              ? "Add a widget that reads a table first: a filter narrows the columns of the tables on the page."
              : undefined
          }
          onClick={open}
        >
          <Plus aria-hidden="true" size={14} /> Add a filter
        </Button>
      </div>
      {filters.length === 0 ? (
        <p className="m-0 text-body-sm text-ink-muted">
          None. A filter narrows every widget whose table has its column, and the reader sets it above the page.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {filters.map((filter, at) => (
            <li key={filter.name} className="flex flex-wrap items-end gap-2">
              <div className="w-40 max-w-full">
                <TextField
                  label="Called"
                  name={`filter-${filter.name}-label`}
                  required={false}
                  value={filter.label ?? ""}
                  placeholder={heading(filter.name)}
                  onChange={(label) => change(at, { label }, [], `filter:${filter.name}`)}
                />
              </div>
              <div className="w-44 max-w-full">
                <SelectField
                  label="It is"
                  name={`filter-${filter.name}-type`}
                  value={filter.type}
                  options={Object.entries(KIND_WORDS).map(([value, label]) => ({ value, label }))}
                  onChange={(type) => change(at, { type: type as PageFilterType }, ["default", "choices", "from"])}
                />
              </div>
              {filter.type === "date_range" ? (
                <div className="w-44 max-w-full">
                  <SelectField
                    label="When nobody has set it"
                    name={`filter-${filter.name}-default`}
                    value={typeof filter.default === "string" ? filter.default : ""}
                    options={[
                      { value: "", label: "All time" },
                      ...RELATIVE_RANGES.map((range) => ({ value: range, label: RANGE_WORDS[range] })),
                    ]}
                    onChange={(value) => change(at, { default: value || undefined }, value ? [] : ["default"])}
                  />
                </div>
              ) : filter.type === "text" || filter.type === "number" ? (
                <div className="w-40 max-w-full">
                  <TextField
                    label="When nobody has set it"
                    name={`filter-${filter.name}-default`}
                    required={false}
                    value={filter.default === undefined ? "" : String(filter.default)}
                    onChange={(value) =>
                      change(
                        at,
                        {
                          default:
                            filter.type === "number" && value.trim() !== "" && Number.isFinite(Number(value))
                              ? Number(value)
                              : value,
                        },
                        value === "" ? ["default"] : [],
                        `filter:${filter.name}:default`,
                      )
                    }
                  />
                </div>
              ) : (
                <div className="min-w-48 flex-1">
                  <TextField
                    label="The choices, with commas"
                    name={`filter-${filter.name}-choices`}
                    required={false}
                    hint={filter.from ? `Left empty, they are the values of ${heading(filter.from.column)} in ${heading(filter.from.table)}.` : ""}
                    value={(filter.choices ?? []).join(", ")}
                    onChange={(text) => {
                      const choices = text
                        .split(",")
                        .map((one) => one.trim())
                        .filter(Boolean);
                      change(at, { choices }, choices.length === 0 ? ["choices"] : [], `filter:${filter.name}:choices`);
                    }}
                  />
                </div>
              )}
              <Button
                size="small"
                variant="danger"
                onClick={() =>
                  onChange(
                    {
                      filters: filters.filter((_, index) => index !== at),
                      widgets: widgets.map((widget) => unbindFilter(widget, filter.name)),
                    },
                    `removing the filter ${filter.label ?? filter.name}`,
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a filter" description="Whoever reads the page sets it, and it narrows every widget whose table has this column.">
        <div className="flex flex-col gap-4">
          <SelectField
            label="Column"
            name="new-filter-column"
            value={column}
            options={columns.map((one) => ({ value: one.name, label: heading(one.name) }))}
            onChange={(next) => {
              setColumn(next);
              setKind(kindFor(columns.find((one) => one.name === next)?.type ?? "text"));
            }}
          />
          <SelectField
            label="Reader picks"
            name="new-filter-kind"
            value={kind}
            options={Object.entries(KIND_WORDS).map(([value, label]) => ({ value, label }))}
            onChange={(next) => setKind(next as PageFilterType)}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" disabled={column === ""} onClick={add}>
              Add the filter
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
