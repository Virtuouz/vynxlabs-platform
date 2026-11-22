/**
 * Search and filter's drawer (board 19, left and middle): every filter in one list, each
 * saying what it does in one line; how the filters sit; and a filter's own editor with its label,
 * kind, starting value and, as checkboxes, every widget on the page that could follow it. The
 * checkboxes write the binding on that widget: one place to see what a filter affects.
 */
import {
  MAX_PAGE_FILTERS,
  type PageFilter,
  type PageFilterType,
  type PageWidget,
  RELATIVE_RANGES,
  widgetTables,
} from "@volvel/manifest";
import {
  Button,
  CheckboxField,
  DrawerBlock,
  DrawerEditor,
  SegmentedControl,
  SelectField,
  type SortableItem,
  SortableRows,
  TextField,
  ToggleRow,
} from "@volvel/ui";
import { Calendar, Hash, List, Search, Type } from "lucide-react";
import { useState } from "react";
import { RANGE_WORDS } from "../filtersControl.tsx";
import {
  bindFilter,
  type CatalogColumn,
  filterColumn,
  filterTypeFor,
  heading,
  mainTable,
  newColumnFilter,
  newSearch,
  unbindFilter,
  visualOf,
  withConfig,
  withSystemColumns,
} from "../model.ts";
import {
  BackHead,
  dashedFace,
  type Env,
  Group,
  LabelledBlock,
  reorderBy,
  setConfig,
} from "./recordShared.tsx";
import { kindWords } from "./sectionDrawer.tsx";

const KIND_WORDS: Record<PageFilterType, string> = {
  search: "Search",
  date_range: "Date range",
  choice: "Choice",
  text: "Text",
  number: "Number",
};

const COLUMN_KINDS: Exclude<PageFilterType, "search">[] = [
  "date_range",
  "choice",
  "text",
  "number",
];

const SYSTEM = new Set(["id", "created_at", "updated_at"]);

export const filtersOfWidget = (env: Env): PageFilter[] =>
  Array.isArray(env.config.filters) ? (env.config.filters as PageFilter[]) : [];

/** The columns a search of this filter looks in, on the widgets that follow it. */
export function searchedColumns(widgets: readonly PageWidget[], name: string): string[] {
  const found = new Set<string>();
  for (const widget of widgets) {
    for (const input of Object.values(widget.data ?? {})) {
      for (const binding of input.filters ?? []) {
        if (binding.filter === name) for (const column of binding.columns ?? []) found.add(column);
      }
    }
  }
  return [...found];
}

/** What a filter does, in one line: "Looks in Number, Client code", "Date range · Last 30 days". */
export function filterLine(widgets: readonly PageWidget[], filter: PageFilter): string {
  if (filter.type === "search") {
    const columns = searchedColumns(widgets, filter.name);
    return columns.length > 0
      ? `Looks in ${columns.map(heading).join(", ")}`
      : "Looks in the text columns each widget shows";
  }
  const start =
    filter.type === "date_range"
      ? typeof filter.default === "string"
        ? (RANGE_WORDS[filter.default as keyof typeof RANGE_WORDS] ?? filter.default)
        : filter.default
          ? "Custom range"
          : "All time"
      : filter.default !== undefined && filter.default !== ""
        ? String(filter.default)
        : "Any";
  return `${KIND_WORDS[filter.type]} · ${start}`;
}

/** A widget of the page that could follow a filter, and the column it would narrow. */
export interface Narrowed {
  widget: PageWidget;
  column: string;
  on: boolean;
}

/** Every widget of the page that could follow a filter, with whether it does. */
export function narrowedBy(env: Env, filter: PageFilter): Narrowed[] {
  const out: Narrowed[] = [];
  for (const widget of env.widgets) {
    if (widget.id === env.widget.id) continue;
    const inputs = Object.values(widget.data ?? {});
    let column: string | undefined;
    let on = false;
    for (const input of inputs) {
      const table = visualOf(input)?.table;
      if (!table) continue;
      const bound = (input.filters ?? []).find((one) => one.filter === filter.name);
      if (bound) {
        on = true;
        column = bound.column ?? bound.columns?.map(heading).join(", ") ?? column;
        continue;
      }
      const columns = withSystemColumns(
        env.catalog.tables.find((one) => one.name === table)?.columns ?? [],
      );
      if (filter.type === "search") {
        if (columns.some((one) => one.type === "text")) column ??= "its text columns";
      } else if (columns.some((one) => one.name === filterColumn(filter))) {
        column ??= filterColumn(filter);
      }
    }
    if (column !== undefined) out.push({ widget, column, on });
  }
  return out;
}

/** What kind of filter a row is, drawn before its name. */
const FILTER_ICONS: Partial<Record<PageFilterType, typeof Type>> = {
  search: Search,
  choice: List,
  date_range: Calendar,
  number: Hash,
  text: Type,
};

export function FilterDisplaySection({ env }: { env: Env }) {
  const own = filtersOfWidget(env);
  const [open, setOpen] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const taken = [
    ...new Set([...env.filters.map((one) => one.name), ...own.map((one) => one.name)]),
  ];
  const full = taken.length >= MAX_PAGE_FILTERS;
  const pageTable = mainTable(env.widgets, env.catalog);

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
  const add = (filter: PageFilter) =>
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

  const columns: (CatalogColumn & { table: string })[] = [];
  for (const table of widgetTables([...env.widgets])) {
    for (const column of withSystemColumns(
      env.catalog.tables.find((one) => one.name === table)?.columns ?? [],
    )) {
      if (!SYSTEM.has(column.name) && !columns.some((one) => one.name === column.name)) {
        columns.push({ ...column, table });
      }
    }
  }

  const current = own.find((one) => one.name === open);
  if (current) {
    return (
      <FilterEditor
        env={env}
        filter={current}
        onBack={() => setOpen(undefined)}
        change={(patch, drop = [], key) =>
          commit(
            own.map((one) => {
              if (one.name !== current.name) return one;
              const next: Record<string, unknown> = { ...one, ...patch };
              for (const dropped of drop) delete next[dropped];
              for (const [each, value] of Object.entries(next)) {
                if (value === undefined || value === "") delete next[each];
              }
              return next as unknown as PageFilter;
            }),
            env.widgets,
            `changing the filter ${current.label ?? current.name}`,
            key,
          )
        }
        follow={(widget, on) =>
          env.writeAll(
            env.widgets.map((one) => {
              if (one.id !== widget.id) return one;
              return on
                ? bindFilter(
                    one,
                    current,
                    env.catalog,
                    env.widgets.filter((other) => other.id !== one.id),
                  )
                : unbindFilter(one, current.name);
            }),
            `${on ? "following" : "no longer following"} ${current.label ?? current.name} on ${widget.title ?? widget.id}`,
          )
        }
        remove={() => {
          commit(
            own.filter((one) => one.name !== current.name),
            env.widgets.map((one) => unbindFilter(one, current.name)),
            `removing the filter ${current.label ?? current.name}`,
          );
          setOpen(undefined);
        }}
        last={own.length <= 1}
        columns={columns}
        table={pageTable}
      />
    );
  }

  const items: SortableItem[] = own.map((one) => ({
    id: one.name,
    label: one.label ?? heading(one.name),
    icon: FILTER_ICONS[one.type] ?? Type,
    sub: filterLine(env.widgets, one),
  }));
  return (
    <>
      <Group
        label="Filters"
        note="Widgets choose which of these they follow, on their own Data tab."
      >
        <SortableRows
          label="Filters"
          items={items}
          onReorder={(ids) =>
            commit(
              reorderBy(
                own.map((one) => ({ ...one, id: one.name })),
                ids,
              ).map(({ id: _id, ...rest }) => rest as PageFilter),
              env.widgets,
              "moving a filter",
            )
          }
          onOpen={setOpen}
        />
        <div className="px-3 py-2">
          <DrawerEditor
            title="Add a filter"
            footer={false}
            open={adding}
            onOpenChange={setAdding}
            trigger={
              <button
                type="button"
                disabled={full}
                title={full ? `A page has at most ${MAX_PAGE_FILTERS} filters.` : undefined}
                className={`${dashedFace} disabled:cursor-default disabled:opacity-60`}
              >
                <span aria-hidden="true">+</span>
                Filter
              </button>
            }
          >
            <ul aria-label="What to filter by" className="m-0 flex list-none flex-col p-0">
              <li>
                <button
                  type="button"
                  className="flex h-9 w-full cursor-pointer items-center rounded-control px-2 text-left text-body-sm text-ink hover:bg-selected"
                  onClick={() => {
                    add(newSearch(pageTable, taken));
                    setAdding(false);
                  }}
                >
                  A search box
                </button>
              </li>
              {columns.map((column) => (
                <li key={column.name}>
                  <button
                    type="button"
                    className="flex h-9 w-full cursor-pointer items-center justify-between rounded-control px-2 text-left text-body-sm text-ink hover:bg-selected"
                    onClick={() => {
                      add(newColumnFilter(column, column.table, taken));
                      setAdding(false);
                    }}
                  >
                    <span>{heading(column.name)}</span>
                    <span className="text-meta text-ink-muted">
                      {KIND_WORDS[filterTypeFor(column)]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DrawerEditor>
        </div>
      </Group>
      <Group label="Look">
        <LabelledBlock label="Filters sit">
          <SegmentedControl<"row" | "button">
            label="Filters sit"
            value={env.config.sit === "button" ? "button" : "row"}
            options={[
              { value: "row", label: "In a row" },
              { value: "button", label: "Behind a button" },
            ]}
            onChange={(next) => setConfig(env, "sit", next, "where the filters sit")}
          />
        </LabelledBlock>
        <ToggleRow
          label="Offer “Clear”"
          help="A button that puts every filter here back to how it starts."
          checked={env.config.reset === true}
          onChange={(next) => setConfig(env, "reset", next ? true : undefined, "the Clear button")}
        />
      </Group>
    </>
  );
}

function FilterEditor({
  env,
  filter,
  onBack,
  change,
  follow,
  remove,
  last,
  columns,
  table,
}: {
  env: Env;
  filter: PageFilter;
  onBack: () => void;
  change: (patch: Partial<PageFilter>, drop?: (keyof PageFilter)[], key?: string) => void;
  follow: (widget: PageWidget, on: boolean) => void;
  remove: () => void;
  last: boolean;
  columns: readonly (CatalogColumn & { table: string })[];
  table: string | undefined;
}) {
  const id = `${env.widget.id}-${filter.name}`;
  const name = filter.label ?? heading(filter.name);
  const narrowed = narrowedBy(env, filter);
  return (
    <div className="flex flex-col gap-4">
      <BackHead onBack={onBack} title={`Filter · ${name}`} kind={KIND_WORDS[filter.type]} />
      <Group label="Filter">
        <DrawerBlock>
          <TextField
            name={`${id}-label`}
            label="Label"
            required={false}
            maxLength={100}
            value={filter.label ?? ""}
            placeholder={heading(filter.name)}
            onChange={(label) => change({ label }, [], `filter:${filter.name}`)}
          />
          {filter.type === "search" ? (
            <p className="m-0 text-meta text-ink-muted">
              A search box. It looks for the words in the text columns each widget shows.
            </p>
          ) : (
            <>
              <SelectField
                name={`${id}-type`}
                label="Kind"
                value={filter.type}
                options={COLUMN_KINDS.map((value) => ({ value, label: KIND_WORDS[value] }))}
                onChange={(type) => {
                  const from =
                    filter.from?.table ??
                    columns.find((one) => one.name === filterColumn(filter))?.table ??
                    table;
                  change(
                    {
                      type: type as PageFilterType,
                      ...(type === "choice" && from
                        ? { from: { table: from, column: filterColumn(filter) } }
                        : {}),
                    },
                    type === "choice" ? ["default", "choices"] : ["default", "choices", "from"],
                  );
                }}
              />
              {filter.type === "date_range" ? (
                <SelectField
                  name={`${id}-default`}
                  label="Starts as"
                  value={typeof filter.default === "string" ? filter.default : ""}
                  options={[
                    { value: "", label: "All time" },
                    ...RELATIVE_RANGES.map((range) => ({
                      value: range,
                      label: RANGE_WORDS[range],
                    })),
                  ]}
                  onChange={(value) => change({ default: value || undefined })}
                />
              ) : filter.type === "choice" ? (
                <TextField
                  name={`${id}-choices`}
                  label="The values, with commas"
                  required={false}
                  value={(filter.choices ?? []).join(", ")}
                  onChange={(text) => {
                    const choices = text
                      .split(",")
                      .map((one) => one.trim())
                      .filter(Boolean);
                    change(
                      { choices },
                      choices.length === 0 ? ["choices"] : [],
                      `filter:${filter.name}:choices`,
                    );
                  }}
                />
              ) : (
                <TextField
                  name={`${id}-default`}
                  label="Starts as"
                  required={false}
                  value={filter.default === undefined ? "" : String(filter.default)}
                  onChange={(value) =>
                    change(
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
        </DrawerBlock>
      </Group>
      <Group
        label="Narrows"
        note="One place to see every widget a filter affects, instead of checking each widget."
      >
        <DrawerBlock>
          {narrowed.length === 0 ? (
            <p className="m-0 text-body-sm text-ink-muted">
              No widget on this page reads a table with this column.
            </p>
          ) : (
            <ul
              aria-label="Widgets this filter narrows"
              className="m-0 flex list-none flex-col gap-2 p-0"
            >
              {narrowed.map(({ widget, column, on }) => (
                <li key={widget.id}>
                  <CheckboxField
                    name={`${id}-narrows-${widget.id}`}
                    label={`${widget.title ?? kindWords(widget.type)} · ${heading(column)}`}
                    checked={on}
                    onChange={(next) => follow(widget, next)}
                  />
                </li>
              ))}
            </ul>
          )}
        </DrawerBlock>
      </Group>
      <div>
        <Button size="small" variant="quiet" disabled={last} onClick={remove}>
          Remove the filter
        </Button>
        {last ? (
          <p className="m-0 mt-1 text-meta text-ink-muted">
            A Search and filter holds at least one.
          </p>
        ) : null}
      </div>
    </div>
  );
}
