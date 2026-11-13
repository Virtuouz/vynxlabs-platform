import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Chart } from "./Chart.tsx";
import { Form, type FormSchema } from "./Form.tsx";
import { Grid, showValue } from "./Grid.tsx";
import { Notice } from "./Notice.tsx";

/** What a screen hands a widget along with its configuration. Every part is optional. */
export interface WidgetContext {
  /** The rows to show, for a widget that shows data. */
  rows?: Record<string, unknown>[];
  /** The record a widget that edits one starts from. */
  values?: Record<string, unknown>;
  /** Messages from the server about what was last submitted, by field name. */
  errors?: Record<string, string>;
  /** Called with what a person submitted. The widget waits for the promise it returns. */
  onSubmit?(values: Record<string, unknown>): void | Promise<void>;
  /** Called with the row a person chose. */
  onRowClick?(row: Record<string, unknown>): void;
  /** The `id` of the row that is chosen, for a widget that lets one be chosen. */
  selectedId?: string;
  /** Called with the row a person chose to look at. Other widgets may follow it. */
  onSelect?(row: Record<string, unknown>): void;
  /** Whether there are more rows than the ones given, and how to ask for them. */
  page?: { hasMore: boolean; onMore(): void };
  /** Saves one changed value of a row. A rejection's message is shown where the value is. */
  onEdit?(row: Record<string, unknown>, column: string, value: unknown): Promise<void>;
  /** Removes a row. */
  onDelete?(row: Record<string, unknown>): Promise<void>;
  /** What to show in place of a value: the name of the row a reference points at. */
  display?(column: string, value: unknown): string | undefined;
  /** True while the rows are being fetched. */
  loading?: boolean;
}

/**
 * The interface widget extension point, as the SDK publishes it in
 * `InterfaceWidget`. It is repeated here so that the kit can be installed
 * without the SDK. A test holds the two to each other.
 */
export interface InterfaceWidget<Config> {
  /** The name a screen refers to the widget by. */
  name: string;
  /** JSON Schema for the widget's configuration. */
  configSchema: object;
  /** Returns the React node to draw. Called on every draw, so it must not keep state itself. */
  render(config: Config, context: WidgetContext): unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: each widget has its own configuration type
const widgets = new Map<string, InterfaceWidget<any>>();

/** Makes a widget available by its name. A widget registered later under the same name replaces it. */
export function registerWidget<Config>(widget: InterfaceWidget<Config>): void {
  widgets.set(widget.name, widget);
}

export function getWidget(name: string): InterfaceWidget<unknown> | undefined {
  return widgets.get(name);
}

/** Every registered widget, in the order they were first registered. */
export function listWidgets(): InterfaceWidget<unknown>[] {
  return [...widgets.values()];
}

export interface WidgetProps {
  /** The registered name: `table`, `form`, `chart` or one an app registered. */
  name: string;
  /** The widget's configuration. It is passed on as it is, not checked against the schema. */
  config: unknown;
  context?: WidgetContext;
}

/** Draws a registered widget. An unknown name is said on the page, not thrown. */
export function Widget({ name, config, context = {} }: WidgetProps) {
  const widget = widgets.get(name);
  if (!widget) return <Notice tone="danger">There is no widget called "{name}".</Notice>;
  return <>{widget.render(config, context) as ReactNode}</>;
}

/** One value a widget shows: where it is in a row, what to call it and what it holds. */
export interface WidgetField {
  /** The key of the value in each row. */
  name: string;
  /** What to call it. The name, when left out. */
  label?: string;
  /** What it holds: text, integer, number, boolean, timestamp and so on. */
  type?: string;
  /** Whether it can be changed in place, when the screen gives a way to save it. */
  editable?: boolean;
}

export interface TableWidgetConfig {
  /** Names the table for screen readers. */
  label?: string;
  /** The columns to show. */
  columns: WidgetField[];
  /** What to say when there are no rows. */
  empty?: string;
}

export interface FormWidgetConfig {
  schema: FormSchema;
  submitLabel?: string;
}

export interface ChartWidgetConfig {
  /** A Vega-Lite spec. The context's rows, when there are any, become its data. */
  spec?: object;
  /**
   * In place of a spec: the chart's shape and the names of the values it draws.
   * `x` is what goes along the bottom, or what a pie is cut by. `y` is how much.
   * `series` draws one line or one colour for each of its values.
   */
  mark?: "bar" | "line" | "area" | "pie";
  x?: string;
  y?: string;
  series?: string;
  /** What `x` holds. A timestamp or a date is drawn along a time axis. */
  xType?: string;
  /** What to call each of the three on the chart. Their names, when left out. */
  xTitle?: string;
  yTitle?: string;
  seriesTitle?: string;
  /** Names the chart for screen readers. */
  title: string;
  description?: string;
  height?: number;
}

export interface CardWidgetConfig {
  /** The values to show, each on its own line. */
  fields: WidgetField[];
  /** What to say when there is no row to show. */
  empty?: string;
}

export interface CardsWidgetConfig {
  /** The values to show on each card. The first is its heading. */
  fields: WidgetField[];
  /** Names the list for screen readers. */
  label?: string;
  empty?: string;
}

const keys = new WeakMap<object, string>();

/** A row's `id` when it has one. Otherwise a key that stays with the row object. */
function rowKey(row: Record<string, unknown>): string {
  if (typeof row.id === "string" || typeof row.id === "number") return String(row.id);
  let key = keys.get(row);
  if (key === undefined) {
    key = crypto.randomUUID();
    keys.set(row, key);
  }
  return key;
}

const fieldSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", description: "The key of the value in each row." },
    label: { type: "string", description: "What to call it." },
    type: {
      type: "string",
      default: "text",
      description: "What it holds: text, integer, number, boolean, timestamp.",
    },
    editable: { type: "boolean", description: "Whether it can be changed in place." },
  },
};

/** A value as a person reads it: what the screen says to show for it, or the kit's own way. */
function shown(field: WidgetField, value: unknown, context: WidgetContext): ReactNode {
  const display = context.display?.(field.name, value);
  if (display !== undefined) return display;
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-muted/60">empty</span>;
  }
  return showValue(field.type ?? "text", value);
}

function More({ context }: { context: WidgetContext }) {
  if (!context.page?.hasMore) return null;
  return (
    <div className="mt-2 flex justify-center">
      <Button size="small" onClick={() => context.page?.onMore()}>
        Show more
      </Button>
    </div>
  );
}

registerWidget<TableWidgetConfig>({
  name: "table",
  configSchema: {
    type: "object",
    required: ["columns"],
    properties: {
      label: { type: "string", description: "Names the table for screen readers." },
      columns: { type: "array", items: fieldSchema },
      empty: { type: "string", description: "What to say when there are no rows." },
    },
  },
  render(config, context) {
    const open = context.onRowClick;
    const remove = context.onDelete;
    const edit = context.onEdit;
    const display = context.display;
    return (
      <>
        <Grid
          label={config.label ?? "Rows"}
          columns={config.columns.map((column) => ({
            name: column.name,
            label: column.label,
            type: column.type ?? "text",
            editable: column.editable === true && edit !== undefined,
          }))}
          rows={context.rows ?? []}
          rowKey={rowKey}
          empty={context.loading ? "Loading…" : (config.empty ?? "Nothing here yet.")}
          selectedKey={context.selectedId}
          onSelect={context.onSelect}
          {...(edit ? { onEdit: (row, column, value) => edit(row, column, value) } : {})}
          {...(display
            ? {
                cell: (row: Record<string, unknown>, column: { name: string }) =>
                  display(column.name, row[column.name]),
              }
            : {})}
          {...(open || remove
            ? {
                rowActions: (row: Record<string, unknown>) => (
                  <>
                    {open ? (
                      <Button size="small" variant="quiet" onClick={() => open(row)}>
                        Open
                      </Button>
                    ) : null}
                    {remove ? (
                      <Button size="small" variant="quiet" onClick={() => remove(row)}>
                        Delete
                      </Button>
                    ) : null}
                  </>
                ),
              }
            : {})}
        />
        <More context={context} />
      </>
    );
  },
});

registerWidget<FormWidgetConfig>({
  name: "form",
  configSchema: {
    type: "object",
    required: ["schema"],
    properties: {
      schema: {
        type: "object",
        description: "A JSON Schema for a flat object: one property for each field.",
        required: ["type", "properties"],
        properties: {
          type: { const: "object" },
          properties: { type: "object", additionalProperties: { type: "object" } },
          required: { type: "array", items: { type: "string" } },
        },
      },
      submitLabel: { type: "string", default: "Save" },
    },
  },
  render(config, context) {
    return (
      <Form
        schema={config.schema}
        submitLabel={config.submitLabel ?? "Save"}
        onSubmit={(values) => context.onSubmit?.(values)}
        {...(context.values ? { value: context.values } : {})}
        {...(context.errors ? { errors: context.errors } : {})}
      />
    );
  },
});

/**
 * The Vega-Lite spec for a chart described by its shape and the values it
 * draws. A pie is cut by `x` and sized by `y`. Anything else puts `x` along
 * the bottom and `y` up the side, with a colour for each value of `series`.
 */
export function chartSpecFor(config: ChartWidgetConfig): object {
  const x = config.x ?? "";
  const y = config.y ?? "";
  const temporal = config.xType === "timestamp" || config.xType === "date";
  if (config.mark === "pie") {
    return {
      mark: { type: "arc", tooltip: true },
      encoding: {
        theta: { field: y, type: "quantitative", stack: true },
        color: { field: x, type: "nominal", title: config.xTitle ?? x },
      },
    };
  }
  return {
    mark: {
      type: config.mark ?? "bar",
      tooltip: true,
      ...(config.mark === "line" ? { point: true } : {}),
    },
    encoding: {
      x: {
        field: x,
        type: temporal ? "temporal" : "nominal",
        title: config.xTitle ?? x,
        // In the order the rows came, with the names level when there is room for them.
        ...(temporal ? {} : { sort: null, axis: { labelAngle: 0, labelOverlap: true } }),
      },
      y: { field: y, type: "quantitative", title: config.yTitle ?? y },
      ...(config.series
        ? {
            color: {
              field: config.series,
              type: "nominal",
              title: config.seriesTitle ?? config.series,
            },
          }
        : {}),
    },
  };
}

registerWidget<ChartWidgetConfig>({
  name: "chart",
  configSchema: {
    type: "object",
    required: ["title"],
    properties: {
      spec: { type: "object", description: "A Vega-Lite spec. Or give mark, x and y." },
      mark: { enum: ["bar", "line", "area", "pie"], description: "The chart's shape." },
      x: { type: "string", description: "The value along the bottom, or what a pie is cut by." },
      y: { type: "string", description: "The value drawn: how tall, how far, how big a slice." },
      series: { type: "string", description: "A value to draw one colour for each of." },
      xType: {
        type: "string",
        description: "What x holds. A timestamp or a date gets a time axis.",
      },
      xTitle: { type: "string", description: "What to call x on the chart." },
      yTitle: { type: "string", description: "What to call y on the chart." },
      seriesTitle: { type: "string", description: "What to call the series on the chart." },
      title: { type: "string", description: "Names the chart for screen readers." },
      description: { type: "string", description: "Says what the chart shows." },
      height: { type: "number", description: "In pixels." },
    },
  },
  render(config, context) {
    if (!config.spec && !(config.mark && config.x && config.y)) {
      return <Notice tone="attention">This chart has not been told what to draw.</Notice>;
    }
    return (
      <Chart
        spec={config.spec ?? chartSpecFor(config)}
        title={config.title}
        {...(config.description ? { description: config.description } : {})}
        {...(config.height ? { height: config.height } : {})}
        {...(context.rows ? { data: context.rows } : {})}
      />
    );
  },
});

registerWidget<CardWidgetConfig>({
  name: "card",
  configSchema: {
    type: "object",
    required: ["fields"],
    properties: {
      fields: { type: "array", items: fieldSchema },
      empty: { type: "string", description: "What to say when there is no row to show." },
    },
  },
  render(config, context) {
    const row = context.rows?.[0];
    if (!row) {
      return (
        <p className="m-0 text-ink-muted">
          {context.loading ? "Loading…" : (config.empty ?? "Nothing to show.")}
        </p>
      );
    }
    return (
      <dl className="m-0 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2">
        {config.fields.map((field) => (
          <div key={field.name} className="contents">
            <dt className="text-[13px] text-ink-muted">{field.label ?? field.name}</dt>
            <dd className="m-0 min-w-0 break-words">{shown(field, row[field.name], context)}</dd>
          </div>
        ))}
      </dl>
    );
  },
});

registerWidget<CardsWidgetConfig>({
  name: "cards",
  configSchema: {
    type: "object",
    required: ["fields"],
    properties: {
      fields: { type: "array", items: fieldSchema },
      label: { type: "string", description: "Names the list for screen readers." },
      empty: { type: "string", description: "What to say when there are no rows." },
    },
  },
  render(config, context) {
    const rows = context.rows ?? [];
    const [heading, ...rest] = config.fields;
    if (rows.length === 0 || !heading) {
      return (
        <p className="m-0 text-ink-muted">
          {context.loading ? "Loading…" : (config.empty ?? "Nothing here yet.")}
        </p>
      );
    }
    const choose = context.onSelect;
    return (
      <>
        <ul
          aria-label={config.label ?? "Cards"}
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 p-0"
        >
          {rows.map((row) => {
            const chosen = context.selectedId !== undefined && rowKey(row) === context.selectedId;
            const body = (
              <>
                <strong className="block truncate">
                  {shown(heading, row[heading.name], context)}
                </strong>
                {rest.map((field) => (
                  <span key={field.name} className="block truncate text-[13px] text-ink-muted">
                    {field.label ?? field.name}: {shown(field, row[field.name], context)}
                  </span>
                ))}
              </>
            );
            const look = `block w-full rounded-control border p-3 text-left ${
              chosen ? "border-action bg-action-soft/50" : "border-line bg-surface"
            }`;
            return (
              <li key={rowKey(row)}>
                {choose ? (
                  <button
                    type="button"
                    aria-pressed={chosen}
                    className={`${look} cursor-pointer text-ink`}
                    onClick={() => choose(row)}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={look}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <More context={context} />
      </>
    );
  },
});
