import {
  type DashboardBody,
  type DashboardFilter,
  type DashboardWidget,
  groupName,
  RELATIVE_RANGES,
  type VisualCondition,
  type VisualQuery,
} from "@vynxlabs/manifest";
import {
  Button,
  Chart,
  Dialog,
  Grid,
  Menu,
  Notice,
  Panel,
  SelectField,
  TextField,
} from "@vynxlabs/ui";
import { ArrowDownRight, ArrowUpRight, Ellipsis, Minus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useLoad } from "../../api.ts";
import { count } from "../../kit/format.ts";
import { Loading } from "../../kit/LoadState.tsx";
import {
  chartSpec,
  comparison,
  type DateRange,
  download,
  type FilterSetting,
  formatNumber,
  objects,
  pivot,
  previousRange,
  RANGE_LABELS,
  type Result,
  toCsv,
  toXlsx,
} from "./model.ts";

/** The address of a visual query's result. */
export const visualPath = (root: string, query: VisualQuery, limit?: number) =>
  `${root}/queries/visual?query=${encodeURIComponent(JSON.stringify(query))}${limit ? `&limit=${limit}` : ""}`;

// ----- Filters -----

/** The values a choice filter offers: its own list, or what its table's column holds. */
function useChoices(root: string, filter: DashboardFilter): string[] {
  const from = filter.type === "choice" && !filter.choices ? filter.from : undefined;
  const loaded = useLoad<Result>(
    from ? visualPath(root, { table: from.table, groupBy: [{ column: from.column }] }, 200) : null,
  );
  if (filter.choices) return filter.choices;
  return (loaded.data?.rows ?? [])
    .map((row) => row[0])
    .filter((value) => value !== null)
    .map(String);
}

function FilterControl({
  root,
  filter,
  setting,
  onChange,
}: {
  root: string;
  filter: DashboardFilter;
  setting: FilterSetting;
  onChange: (setting: FilterSetting) => void;
}) {
  const choices = useChoices(root, filter);
  const label = filter.label ?? filter.name;
  if (filter.type === "date_range") {
    const current =
      setting ??
      (typeof filter.default === "string" ? filter.default : filter.default ? "custom" : "all");
    const named = current in RANGE_LABELS || current === "all";
    const [from = "", to = ""] = named ? [] : current.split("..");
    return (
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <SelectField
            name={`filter-${filter.name}`}
            label={label}
            value={named ? current : "custom"}
            options={[
              { value: "all", label: "All time" },
              ...RELATIVE_RANGES.map((name) => ({ value: name, label: RANGE_LABELS[name] })),
              { value: "custom", label: "Between two dates" },
            ]}
            onChange={(value) => onChange(value === "custom" ? ".." : value)}
          />
        </div>
        {named ? null : (
          <>
            <div className="w-40">
              <TextField
                name={`filter-${filter.name}-from`}
                label="From"
                type="date"
                required={false}
                value={from}
                onChange={(value) => onChange(`${value}..${to}`)}
              />
            </div>
            <div className="w-40">
              <TextField
                name={`filter-${filter.name}-to`}
                label="To"
                type="date"
                required={false}
                value={to}
                onChange={(value) => onChange(`${from}..${value}`)}
              />
            </div>
          </>
        )}
      </div>
    );
  }
  if (filter.type === "choice") {
    return (
      <div className="w-44">
        <SelectField
          name={`filter-${filter.name}`}
          label={label}
          value={setting ?? (typeof filter.default === "string" ? filter.default : "")}
          options={[
            { value: "", label: "Any" },
            ...choices.map((value) => ({ value, label: value })),
          ]}
          onChange={(value) => onChange(value === "" && filter.default ? "" : value || undefined)}
        />
      </div>
    );
  }
  return (
    <div className="w-44">
      <TextField
        name={`filter-${filter.name}`}
        label={label}
        required={false}
        {...(filter.type === "number" ? { type: "number" } : {})}
        value={setting ?? (filter.default === undefined ? "" : String(filter.default))}
        onChange={(value) => onChange(value)}
      />
    </div>
  );
}

/** A dashboard's filters, set by whoever reads it. What is set is kept in the address. */
export function FilterBar({
  root,
  filters,
  settings,
  onChange,
}: {
  root: string;
  filters: DashboardFilter[];
  settings: Record<string, FilterSetting>;
  onChange: (settings: Record<string, FilterSetting>) => void;
}) {
  if (filters.length === 0) return null;
  const changed = Object.values(settings).some((value) => value !== undefined);
  return (
    <section aria-label="Filters" className="flex flex-wrap items-end gap-4">
      {filters.map((filter) => (
        <FilterControl
          key={filter.name}
          root={root}
          filter={filter}
          setting={settings[filter.name]}
          onChange={(setting) => {
            const { [filter.name]: _before, ...rest } = settings;
            onChange(setting === undefined ? rest : { ...rest, [filter.name]: setting });
          }}
        />
      ))}
      {changed ? (
        <Button variant="quiet" onClick={() => onChange({})}>
          Reset
        </Button>
      ) : null}
    </section>
  );
}

// ----- Widgets -----

const WIDTH: Record<number, string> = {
  3: "md:col-span-6 xl:col-span-3",
  4: "md:col-span-6 xl:col-span-4",
  6: "md:col-span-6",
  8: "md:col-span-12 xl:col-span-8",
  12: "md:col-span-12",
};

/** The address of what a widget shows, with the filters as they are set. */
const dataPath = (
  root: string,
  dashboard: string,
  widget: string,
  values: Record<string, unknown>,
  revision: number,
) =>
  `${root}/dashboards/${dashboard}/widgets/${widget}/data?filters=${encodeURIComponent(JSON.stringify(values))}&limit=2000&v=${revision}`;

/** The first day after a period that begins on `start`. */
function periodEnd(start: string, bucket: string): string {
  const [year, month, date] = start.split("-").map(Number) as [number, number, number];
  const next =
    bucket === "day"
      ? new Date(year, month - 1, date + 1)
      : bucket === "week"
        ? new Date(year, month - 1, date + 7)
        : bucket === "month"
          ? new Date(year, month, date)
          : bucket === "quarter"
            ? new Date(year, month + 2, date)
            : new Date(year + 1, month - 1, date);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/**
 * The rows behind one line of a visual query's result: the same table and
 * filters, without the groups, and narrowed to the values that line has.
 */
export function rowsBehind(
  widget: DashboardWidget,
  body: DashboardBody,
  values: Record<string, unknown>,
  line: Record<string, unknown>,
): VisualQuery | undefined {
  const source = widget.source;
  if (!source || !("visual" in source)) return undefined;
  const visual = source.visual;
  const conditions: VisualCondition[] = [...(visual.filters ?? [])];
  for (const group of visual.groupBy ?? []) {
    const value = line[groupName(group)];
    if (value === undefined) continue;
    if (value === null) conditions.push({ column: group.column, op: "is_null" });
    else if (group.bucket) {
      conditions.push({ column: group.column, op: "gte", value: String(value) });
      conditions.push({
        column: group.column,
        op: "lt",
        value: periodEnd(String(value), group.bucket),
      });
    } else conditions.push({ column: group.column, op: "eq", value });
  }
  // What the dashboard's filters narrow, they narrow here too.
  for (const binding of widget.filters ?? []) {
    const filter = body.filters?.find((one) => one.name === binding.filter);
    const value = values[binding.filter];
    if (!filter || !binding.column || value === undefined) continue;
    if (filter.type === "date_range") {
      const range = value as DateRange;
      if (range.from) conditions.push({ column: binding.column, op: "gte", value: range.from });
      if (range.to) {
        conditions.push({ column: binding.column, op: "lt", value: periodEnd(range.to, "day") });
      }
    } else if (filter.type === "text") {
      conditions.push({ column: binding.column, op: "contains", value: String(value) });
    } else conditions.push({ column: binding.column, op: "eq", value });
  }
  return {
    table: visual.table,
    ...(visual.joins ? { joins: visual.joins } : {}),
    ...(conditions.length > 0 ? { filters: conditions } : {}),
    limit: 200,
  };
}

export function ResultTable({
  result,
  show,
  label,
  onRow,
}: {
  result: Result;
  show?: string[] | undefined;
  label: string;
  onRow?: ((row: Record<string, unknown>) => void) | undefined;
}) {
  const names = (
    show && show.length > 0 ? show : result.columns.map((column) => column.name)
  ).filter((name) => result.columns.some((column) => column.name === name));
  const rows = objects(result).map((row, at) => ({ ...row, __at: String(at) }));
  return (
    <Grid
      label={label}
      columns={names.map((name) => {
        const type = result.columns.find((column) => column.name === name)?.type;
        return { name, type: type === "number" ? "number" : type === "json" ? "json" : "text" };
      })}
      rows={rows}
      rowKey={(row) => String(row.__at)}
      empty="Nothing to show."
      {...(onRow
        ? {
            // What heads a line opens the rows it was worked out from.
            cell: (row, column) =>
              column.name === names[0] ? (
                <button
                  type="button"
                  className="rounded-control text-left text-action hover:underline"
                  aria-label={`${String(row[column.name] ?? "—")}: see the rows behind it`}
                  onClick={() => onRow(row)}
                >
                  {String(row[column.name] ?? "—")}
                </button>
              ) : undefined,
          }
        : {})}
    />
  );
}

function PivotTable({
  widget,
  result,
  onCell,
}: {
  widget: DashboardWidget;
  result: Result;
  onCell?: ((line: Record<string, unknown>) => void) | undefined;
}) {
  const options = widget.options ?? {};
  const turned = pivot(result, options);
  const write = (value: number | null) =>
    value === null ? "" : formatNumber(value, options.format);
  const data = objects(result);
  /** The values of a result row that falls in a cell, for looking at the rows behind it. */
  const lineOf = (headers: string[], column: string | undefined) =>
    data.find(
      (row) =>
        (options.rows ?? []).every((name, at) => String(row[name] ?? "—") === headers[at]) &&
        (column === undefined ||
          (options.columns ?? []).map((name) => String(row[name] ?? "—")).join(" · ") === column),
    );
  const cell = "border-line border-b px-3 py-1.5 text-right tabular-nums";
  return (
    <div className="overflow-auto">
      {/* table-allowed: a pivot heads its rows and its columns alike, which a list of rows does not */}
      <table className="w-full border-separate border-spacing-0 text-body-sm">
        <caption className="sr-only">{widget.title ?? "Pivot"}</caption>
        <thead>
          <tr>
            {turned.rowNames.map((name) => (
              <th key={name} scope="col" className="border-line border-b px-3 py-1.5 text-left">
                {name}
              </th>
            ))}
            {turned.columns.map((name) => (
              <th key={name} scope="col" className={`${cell} font-medium`}>
                {name || (options.value ?? "")}
              </th>
            ))}
            {options.totals === false || turned.columns.length < 2 ? null : (
              <th scope="col" className={`${cell} font-semibold`}>
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {turned.rows.map((row) => (
            <tr key={row.headers.join("\u0001")}>
              {row.headers.map((header, at) => (
                <th
                  key={turned.rowNames[at]}
                  scope="row"
                  className="border-line border-b px-3 py-1.5 text-left font-normal"
                >
                  {header}
                </th>
              ))}
              {row.cells.map((value, at) => {
                const line = onCell ? lineOf(row.headers, turned.columns[at]) : undefined;
                return (
                  <td key={turned.columns[at]} className={cell}>
                    {line && onCell && value !== null ? (
                      <button
                        type="button"
                        className="rounded-control px-1 text-action hover:underline"
                        onClick={() => onCell(line)}
                      >
                        {write(value)}
                      </button>
                    ) : (
                      write(value)
                    )}
                  </td>
                );
              })}
              {options.totals === false || turned.columns.length < 2 ? null : (
                <td className={`${cell} font-semibold`}>{write(row.total)}</td>
              )}
            </tr>
          ))}
        </tbody>
        {options.totals === false ? null : (
          <tfoot>
            <tr>
              <th
                scope="row"
                colSpan={Math.max(1, turned.rowNames.length)}
                className="px-3 py-1.5 text-left font-semibold"
              >
                Total
              </th>
              {turned.totals.cells.map((value, at) => (
                <td
                  key={turned.columns[at]}
                  className="px-3 py-1.5 text-right font-semibold tabular-nums"
                >
                  {write(value)}
                </td>
              ))}
              {turned.columns.length < 2 ? null : (
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                  {write(turned.totals.total)}
                </td>
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Figure({
  widget,
  result,
  before,
}: {
  widget: DashboardWidget;
  result: Result;
  before?: Result | undefined;
}) {
  const options = widget.options ?? {};
  const at = (from: Result) => {
    const named = options.value ? from.columns.findIndex((one) => one.name === options.value) : -1;
    const index = named >= 0 ? named : from.columns.findIndex((one) => one.type === "number");
    return from.rows[0]?.[Math.max(index, 0)];
  };
  const value = at(result);
  const against = before ? comparison(value, at(before)) : undefined;
  const Mark =
    against?.direction === "up"
      ? ArrowUpRight
      : against?.direction === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-display-lg font-semibold tabular-nums">
        {formatNumber(value, options.format)}
      </span>
      {against ? (
        <span className="inline-flex items-center gap-1 text-body-sm text-ink-muted">
          <Mark aria-hidden="true" size={14} /> {against.text}
        </span>
      ) : null}
    </div>
  );
}

/** One widget of a dashboard: its title, what its query gave, and what can be done with that. */
export function WidgetCard({
  root,
  dashboard,
  revision,
  body,
  widget,
  values,
  tools,
}: {
  root: string;
  dashboard: string;
  revision: number;
  body: DashboardBody;
  widget: DashboardWidget;
  values: Record<string, unknown>;
  /** What the dashboard's maker can do to the widget: shown before the widget's own menu. */
  tools?: ReactNode;
}) {
  const asks = widget.type !== "text";
  const loaded = useLoad<Result>(
    asks ? dataPath(root, dashboard, widget.id, values, revision) : null,
  );
  // A figure that is compared asks again, for the period before the one its date filter is set to.
  const compared = widget.type === "figure" ? widget.options?.compareTo : undefined;
  const earlier = compared ? previousRange(values[compared] as DateRange | undefined) : undefined;
  const before = useLoad<Result>(
    compared && earlier
      ? dataPath(root, dashboard, widget.id, { ...values, [compared]: earlier }, revision)
      : null,
  );
  const [behind, setBehind] = useState<VisualQuery>();
  const visual = widget.source && "visual" in widget.source ? widget.source.visual : undefined;
  const drill =
    visual && (visual.groupBy?.length ?? 0) > 0
      ? (line: Record<string, unknown>) => setBehind(rowsBehind(widget, body, values, line))
      : undefined;
  const title = widget.title || (widget.type === "text" ? "" : widget.id);
  const result = loaded.data;
  const file = (title || widget.id).replace(/[^\w-]+/g, "-").toLowerCase();

  return (
    <Panel
      aria-label={title || "Note"}
      padded
      className={`col-span-12 min-w-0 ${WIDTH[widget.width ?? (widget.type === "figure" ? 3 : 6)]}`}
      {...(title ? { title } : {})}
      {...(tools || (asks && result)
        ? {
            action: (
              <span className="flex items-center gap-1">
                {tools}
                {asks && result ? (
                  <Menu
                    ariaLabel={`More for ${title}`}
                    align="end"
                    triggerClassName="inline-flex size-7 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
                    label={<Ellipsis aria-hidden="true" size={16} />}
                    items={[
                      ...(visual
                        ? [
                            {
                              label: "See the rows behind it",
                              onSelect: () => setBehind(rowsBehind(widget, body, values, {})),
                            },
                          ]
                        : []),
                      {
                        label: "Download as CSV",
                        onSelect: () =>
                          download(`${file}.csv`, toCsv(result), "text/csv;charset=utf-8"),
                      },
                      {
                        label: "Download as a spreadsheet",
                        onSelect: () =>
                          download(
                            `${file}.xlsx`,
                            toXlsx(result, title || widget.id),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          ),
                      },
                    ]}
                  />
                ) : null}
              </span>
            ),
          }
        : {})}
    >
      {widget.type === "text" ? (
        <p className="m-0 whitespace-pre-wrap">{widget.options?.text}</p>
      ) : loaded.error ? (
        <Notice tone="danger">{loaded.error.fields?.[0]?.message ?? loaded.error.message}</Notice>
      ) : !result ? (
        <Loading what={title || "the widget"} />
      ) : widget.type === "figure" ? (
        // With no period before to ask for, what was last answered is not shown in its place.
        <Figure widget={widget} result={result} before={earlier ? before.data : undefined} />
      ) : result.rows.length === 0 ? (
        <p className="m-0 text-ink-muted">Nothing to show for these filters.</p>
      ) : widget.type === "chart" ? (
        <Chart
          title={title}
          description={`${widget.options?.mark ?? "bar"} chart of ${result.columns.map((one) => one.name).join(", ")}`}
          spec={chartSpec(widget, result)}
          data={objects(result)}
          height={260}
        />
      ) : widget.type === "pivot" ? (
        <PivotTable widget={widget} result={result} onCell={drill} />
      ) : (
        <ResultTable result={result} show={widget.options?.show} label={title} onRow={drill} />
      )}
      {result?.truncated ? (
        <p className="m-0 text-meta text-ink-muted">
          There is more than is shown: the first {count(result.rows.length)} rows.
        </p>
      ) : null}
      {behind ? (
        <RowsBehind root={root} query={behind} onClose={() => setBehind(undefined)} />
      ) : null}
    </Panel>
  );
}

/** The rows a number was worked out from, as the reader may see them. */
function RowsBehind({
  root,
  query,
  onClose,
}: {
  root: string;
  query: VisualQuery;
  onClose: () => void;
}) {
  const rows = useLoad<Result>(visualPath(root, query));
  return (
    <Dialog open onClose={onClose} title={`Rows of ${query.table}`}>
      <div className="flex flex-col gap-3">
        {rows.error ? (
          <Notice tone="danger">{rows.error.message}</Notice>
        ) : !rows.data ? (
          <Loading what="the rows" />
        ) : (
          <>
            <p className="m-0 text-body-sm text-ink-muted">
              {count(rows.data.rows.length)} {rows.data.rows.length === 1 ? "row" : "rows"}
              {rows.data.truncated ? ", and there are more" : ""}. These are the rows you may see.
            </p>
            <div className="max-h-[60vh] overflow-auto">
              <ResultTable result={rows.data} label={`Rows of ${query.table}`} />
            </div>
          </>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
