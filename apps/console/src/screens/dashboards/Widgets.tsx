import {
  type DashboardBody,
  type DashboardFilter,
  type DashboardWidget,
  groupName,
  RELATIVE_RANGES,
  type TableCell,
  type VisualCondition,
  type VisualQuery,
  type WidgetPlace,
} from "@vynxlabs/manifest";
import {
  Button,
  Chart,
  Closing,
  Dialog,
  Menu,
  Notice,
  Panel,
  SelectField,
  Sparkline,
  TextField,
} from "@vynxlabs/ui";
import { ArrowDownRight, ArrowUpRight, Ellipsis, Minus } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLoad } from "../../api.ts";
import { count } from "../../kit/format.ts";
import { Loading } from "../../kit/LoadState.tsx";
import { ReadTable } from "../../kit/ReadTable.tsx";
import { Tag } from "../../kit/status.tsx";
import {
  chartSpec,
  comparison,
  type DateRange,
  download,
  type FilterSetting,
  formatNumber,
  measureOf,
  objects,
  pivot,
  previousRange,
  RANGE_LABELS,
  type Result,
  toCsv,
  toXlsx,
  trendOf,
  trendWords,
  withBefore,
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
  onShow,
  note,
  cells,
  totals = false,
}: {
  result: Result;
  show?: string[] | undefined;
  label: string;
  onRow?: ((row: Record<string, unknown>) => void) | undefined;
  /** Told of the columns its reader chose, where they are kept: a widget being changed. */
  onShow?: ((show: string[] | undefined) => void) | undefined;
  note?: ReactNode;
  /** How some columns are headed, written and drawn. */
  cells?: TableCell[] | undefined;
  /** A last row that adds up each column of numbers. */
  totals?: boolean;
}) {
  const rows: Record<string, unknown>[] = objects(result).map((row, at) => ({
    ...row,
    __at: String(at),
  }));
  const first = (show && show.length > 0 ? show : result.columns.map((column) => column.name))[0];
  const how = new Map((cells ?? []).map((one) => [one.column, one]));
  const numbers = result.columns.filter((column) => column.type === "number");
  // A bar is its share of the column's largest.
  const most = new Map(
    numbers.map((column) => [
      column.name,
      Math.max(0, ...rows.map((row) => Math.abs(Number(row[column.name]) || 0))),
    ]),
  );
  const total: Record<string, unknown> | undefined =
    totals && rows.length > 0
      ? {
          __at: "total",
          ...(first ? { [first]: "Total" } : {}),
          ...Object.fromEntries(
            numbers
              // A change or a rate does not add up.
              .filter(
                (column) =>
                  column.name !== first &&
                  how.get(column.name)?.as !== "delta" &&
                  how.get(column.name)?.format?.style !== "percent",
              )
              .map((column) => [
                column.name,
                rows.reduce((sum, row) => sum + (Number(row[column.name]) || 0), 0),
              ]),
          ),
        }
      : undefined;
  return (
    <ReadTable<Record<string, unknown>>
      label={label}
      columns={result.columns.map((column) => ({
        name: column.name,
        label: how.get(column.name)?.label,
        type: column.type === "number" ? "number" : column.type === "json" ? "json" : "text",
      }))}
      rows={rows}
      rowKey={(row) => String(row.__at)}
      shown={show}
      onColumns={onShow}
      note={note}
      pinned={total ? [total] : undefined}
      cell={(row, column) => {
        const value = row[column.name];
        const drawn = how.get(column.name);
        if (row.__at === "total") {
          return (
            <strong className="font-semibold tabular-nums">
              {value === undefined ? "" : formatNumber(value, drawn?.format)}
            </strong>
          );
        }
        // What heads a line opens the rows it was worked out from.
        if (onRow && column.name === first) {
          return (
            <button
              type="button"
              className="rounded-control text-left text-action hover:underline"
              aria-label={`${String(value ?? "—")}: see the rows behind it`}
              onClick={() => onRow(row)}
            >
              {String(value ?? "—")}
            </button>
          );
        }
        if (!drawn) return undefined;
        const written = formatNumber(value, drawn.format);
        const size = Number(value);
        if (drawn.as === "bar" && Number.isFinite(size)) {
          const share = (Math.abs(size) / (most.get(column.name) || 1)) * 100;
          return (
            <span className="flex min-w-24 items-center gap-2">
              <span aria-hidden="true" className="h-1.5 min-w-10 flex-1 rounded-full bg-sunken">
                <span
                  className="block h-full rounded-full bg-action"
                  style={{ width: `${Math.min(100, share)}%` }}
                />
              </span>
              <span className="tabular-nums">{written}</span>
            </span>
          );
        }
        if (drawn.as === "delta" && Number.isFinite(size)) {
          const Way = size > 0 ? ArrowUpRight : size < 0 ? ArrowDownRight : Minus;
          return (
            <span
              className={`inline-flex items-center gap-0.5 tabular-nums ${
                size > 0 ? "text-success" : size < 0 ? "text-danger" : "text-ink-muted"
              }`}
            >
              <Way aria-hidden="true" size={14} />
              <span className="sr-only">{size > 0 ? "up" : size < 0 ? "down" : "no change"} </span>
              {formatNumber(Math.abs(size), drawn.format)}
            </span>
          );
        }
        if (drawn.as === "chip") {
          return value === null || value === undefined ? "—" : <Tag>{written}</Tag>;
        }
        return drawn.format ? <span className="tabular-nums">{written}</span> : undefined;
      }}
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
  title,
  result,
  before,
  trend,
}: {
  widget: DashboardWidget;
  title: string;
  result: Result;
  before?: Result | undefined;
  /** Its number over the time it covers, oldest first. */
  trend?: number[] | undefined;
}) {
  const options = widget.options ?? {};
  // A figure whose trend is its own rows shows the last of them: the latest period.
  const own = options.trend !== undefined && !(widget.source && "visual" in widget.source);
  const at = (from: Result) => {
    const named = options.value ? from.columns.findIndex((one) => one.name === options.value) : -1;
    const index = named >= 0 ? named : from.columns.findIndex((one) => one.type === "number");
    return (own ? from.rows.at(-1) : from.rows[0])?.[Math.max(index, 0)];
  };
  const value = at(result);
  const earlier = before ? at(before) : undefined;
  const against = before
    ? comparison(value, earlier, { delta: options.delta, format: options.format })
    : undefined;
  const Mark =
    against?.direction === "up"
      ? ArrowUpRight
      : against?.direction === "down"
        ? ArrowDownRight
        : Minus;
  // Up is good news unless the figure says otherwise: fewer overdue is better.
  const good =
    against && against.direction !== "same"
      ? (against.direction === "up") === (options.goodWhen !== "down")
      : undefined;
  const caption = options.caption?.replace("{previous}", formatNumber(earlier, options.format));
  const line = trend && trend.length > 1 ? trend : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-display-lg font-semibold tabular-nums">
          {formatNumber(value, options.format)}
        </span>
        {against ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-control px-1.5 py-0.5 text-body-sm font-medium tabular-nums ${
              good === undefined
                ? "bg-sunken text-ink-muted"
                : good
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger"
            }`}
          >
            <Mark aria-hidden="true" size={14} />
            <span aria-hidden="true">{against.short}</span>
            {/* Said once: here when the line below is in the maker's own words. */}
            {caption ? <span className="sr-only">{against.text}</span> : null}
          </span>
        ) : null}
      </span>
      {line ? (
        <Sparkline
          values={line}
          label={trendWords(title, line, options.format)}
          className="my-1 text-action"
        />
      ) : null}
      {caption || against ? (
        <span className="text-body-sm text-ink-muted">{caption ?? against?.text}</span>
      ) : null}
    </div>
  );
}

/** How tall an element is, kept as it changes: for a chart that fills the widget it is in. */
function useHeight<E extends HTMLElement>(): [(node: E | null) => void, number] {
  const [height, setHeight] = useState(0);
  const watching = useRef<ResizeObserver | undefined>(undefined);
  const ref = useCallback((node: E | null) => {
    watching.current?.disconnect();
    if (!node || typeof ResizeObserver !== "function") return;
    // The room inside its padding: what is drawn to this height fits, and nothing scrolls.
    watching.current = new ResizeObserver(() => {
      const style = getComputedStyle(node);
      const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      setHeight(Math.floor(node.clientHeight - (padding || 0)));
    });
    watching.current.observe(node);
  }, []);
  return [ref, height];
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
  at,
  placed,
  held = false,
  onGrab,
  onShow,
  every,
  onAsOf,
}: {
  root: string;
  dashboard: string;
  revision: number;
  body: DashboardBody;
  widget: DashboardWidget;
  values: Record<string, unknown>;
  /** What the dashboard's maker can do to the widget: shown before the widget's own menu. */
  tools?: ReactNode;
  /** Where it is on the dashboard's grid, and how big. */
  at: WidgetPlace;
  /** The page is wide enough for the grid: the widget has the height its place gives it. */
  placed: boolean;
  /** It is being dragged or stretched. */
  held?: boolean;
  /** How often it asks again, in milliseconds. Not at all while the dashboard is being changed. */
  every?: number | undefined;
  /** Told when what it shows was read. */
  onAsOf?: ((id: string, at: number) => void) | undefined;
  /** While the dashboard is being changed: the columns chosen for its table are kept. */
  onShow?: ((show: string[] | undefined) => void) | undefined;
  /** While the dashboard is being changed: its heading drags it and its corner stretches it. */
  onGrab?: ((event: PointerEvent<HTMLElement>, how: "move" | "stretch") => void) | undefined;
}) {
  const asks = widget.type !== "text";
  const loaded = useLoad<Result>(
    asks ? dataPath(root, dashboard, widget.id, values, revision) : null,
    { every },
  );
  // The dashboard says how old its numbers are: as old as the widget read longest ago.
  const { updatedAt } = loaded;
  const asOf = useRef(onAsOf);
  asOf.current = onAsOf;
  useEffect(() => {
    if (asks && updatedAt) asOf.current?.(widget.id, updatedAt);
  }, [asks, widget.id, updatedAt]);
  // A figure that is compared asks again, for the period before the one its date filter is set to.
  // So does a chart that draws the period before.
  const compared =
    widget.type === "figure" || (widget.type === "chart" && widget.options?.compare)
      ? widget.options?.compareTo
      : undefined;
  const earlier = compared ? previousRange(values[compared] as DateRange | undefined) : undefined;
  const before = useLoad<Result>(
    compared && earlier
      ? dataPath(root, dashboard, widget.id, { ...values, [compared]: earlier }, revision)
      : null,
    { every },
  );
  // A figure's trend. Built from menus, the same question is asked a period at a time; from
  // a saved query or SQL, the widget's own rows are the line.
  const trend = widget.type === "figure" ? widget.options?.trend : undefined;
  const menus = Boolean(widget.source && "visual" in widget.source);
  const over = useLoad<Result>(
    trend && menus ? `${dataPath(root, dashboard, widget.id, values, revision)}&part=trend` : null,
    { every },
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
  const [inside, room] = useHeight<HTMLDivElement>();

  return (
    <Panel
      aria-label={title || "Note"}
      data-flip-key={widget.id}
      style={
        {
          "--col": `${at.x + 1} / span ${at.w}`,
          "--row": `${at.y + 1} / span ${at.h}`,
        } as CSSProperties
      }
      className={`relative flex min-w-0 flex-col @3xl:[grid-column:var(--col)] @3xl:[grid-row:var(--row)] ${
        held ? "layer-sticky opacity-90 shadow-overlay" : ""
      }`}
    >
      {title || tools ? (
        <header
          className={`flex items-start justify-between gap-3 px-4 pt-3 pb-2 ${
            onGrab ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
          }`}
          {...(onGrab
            ? {
                title: "Drag to move",
                onPointerDown: (event: PointerEvent<HTMLElement>) => onGrab(event, "move"),
              }
            : {})}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="m-0 truncate text-title font-semibold">{title}</h3>
            {widget.subtitle ? (
              <p className="m-0 text-body-sm text-ink-muted">{widget.subtitle}</p>
            ) : null}
          </div>
          <span className="flex shrink-0 items-center gap-1">
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
        </header>
      ) : null}
      <div
        ref={inside}
        // A body that scrolls can be reached and scrolled by keyboard too.
        {...(placed ? { tabIndex: 0 } : {})}
        className={`flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset ${
          title || tools ? "" : "pt-4"
        } ${placed ? "overflow-auto" : ""}`}
      >
        {widget.type === "text" ? (
          <p className="m-0 whitespace-pre-wrap">{widget.options?.text}</p>
        ) : loaded.error ? (
          <Notice tone="danger">{loaded.error.fields?.[0]?.message ?? loaded.error.message}</Notice>
        ) : !result ? (
          <Loading what={title || "the widget"} />
        ) : widget.type === "figure" ? (
          // With no period before to ask for, what was last answered is not shown in its place.
          <Figure
            widget={widget}
            title={title}
            result={result}
            before={earlier ? before.data : undefined}
            trend={trend ? trendOf(menus ? over.data : result, widget.options?.value) : undefined}
          />
        ) : result.rows.length === 0 ? (
          <p className="m-0 text-ink-muted">Nothing to show for these filters.</p>
        ) : widget.type === "chart" ? (
          <Chart
            title={title}
            description={`${widget.options?.mark ?? "bar"} chart of ${result.columns.map((one) => one.name).join(", ")}`}
            // On the grid the height it is given holds its axes and legend too, so nothing is cut.
            spec={{
              ...chartSpec(widget, result, Boolean(earlier && before.data)),
              ...(placed ? { autosize: { type: "fit", contains: "padding" } } : {}),
            }}
            data={
              earlier && before.data
                ? withBefore(result, before.data, measureOf(widget, result))
                : objects(result)
            }
            // On the grid a chart is as tall as its widget; in one column, a height of its own.
            height={placed && room > 0 ? Math.max(120, room) : 260}
            // A bar, a point or a slice opens the rows it was worked out from.
            onPick={drill}
          />
        ) : widget.type === "pivot" ? (
          <PivotTable widget={widget} result={result} onCell={drill} />
        ) : (
          <ResultTable
            result={result}
            show={widget.options?.show}
            label={title}
            onRow={drill}
            onShow={onShow}
            cells={widget.options?.cells}
            totals={widget.options?.totals === true}
          />
        )}
        {result?.truncated ? (
          <p className="m-0 text-meta text-ink-muted">
            There is more than is shown: the first {count(result.rows.length)} rows.
          </p>
        ) : null}
      </div>
      {onGrab ? (
        <span
          aria-hidden="true"
          title="Drag to change its size"
          className="absolute right-0 bottom-0 layer-sticky hidden size-4 cursor-nwse-resize touch-none rounded-br-[inherit] border-action border-r-2 border-b-2 @3xl:block"
          onPointerDown={(event) => onGrab(event, "stretch")}
        />
      ) : null}
      <Closing subject={behind}>
        {(behind, shown) => (
          <RowsBehind
            open={shown}
            root={root}
            query={behind}
            onClose={() => setBehind(undefined)}
          />
        )}
      </Closing>
    </Panel>
  );
}

/** The rows a number was worked out from, as the reader may see them. */
function RowsBehind({
  root,
  query,
  open,
  onClose,
}: {
  root: string;
  query: VisualQuery;
  open: boolean;
  onClose: () => void;
}) {
  const rows = useLoad<Result>(visualPath(root, query));
  return (
    <Dialog open={open} size="table" onClose={onClose} title={`Rows of ${query.table}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {rows.error ? (
          <Notice tone="danger">{rows.error.message}</Notice>
        ) : !rows.data ? (
          <Loading what="the rows" />
        ) : (
          <ResultTable
            result={rows.data}
            label={`Rows of ${query.table}`}
            note={`${count(rows.data.rows.length)} ${rows.data.rows.length === 1 ? "row" : "rows"}${
              rows.data.truncated ? ", and there are more" : ""
            }. These are the rows you may see.`}
          />
        )}
        <div className="mt-auto flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
