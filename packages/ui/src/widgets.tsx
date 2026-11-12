import type { ComponentChildren } from "preact";
import { Button } from "./Button.tsx";
import { Chart } from "./Chart.tsx";
import { Form, type FormSchema } from "./Form.tsx";
import { Grid } from "./Grid.tsx";
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
  /** Returns the Preact node to draw. Called on every draw, so it must not keep state itself. */
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
  return <>{widget.render(config, context) as ComponentChildren}</>;
}

export interface TableWidgetConfig {
  /** Names the table for screen readers. */
  label?: string;
  /** The columns to show. `type` is one the grid knows: text, number, boolean, timestamp and so on. */
  columns: { name: string; type?: string }[];
  /** What to say when there are no rows. */
  empty?: string;
}

export interface FormWidgetConfig {
  schema: FormSchema;
  submitLabel?: string;
}

export interface ChartWidgetConfig {
  /** A Vega-Lite spec. The context's rows, when there are any, become its data. */
  spec: object;
  /** Names the chart for screen readers. */
  title: string;
  description?: string;
  height?: number;
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

registerWidget<TableWidgetConfig>({
  name: "table",
  configSchema: {
    type: "object",
    required: ["columns"],
    properties: {
      label: { type: "string", description: "Names the table for screen readers." },
      columns: {
        type: "array",
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "The key of the value in each row." },
            type: {
              type: "string",
              default: "text",
              description: "What the column holds: text, integer, number, boolean, timestamp.",
            },
          },
        },
      },
      empty: { type: "string", description: "What to say when there are no rows." },
    },
  },
  render(config, context) {
    const open = context.onRowClick;
    return (
      <Grid
        label={config.label ?? "Rows"}
        columns={config.columns.map((column) => ({
          name: column.name,
          type: column.type ?? "text",
        }))}
        rows={context.rows ?? []}
        rowKey={rowKey}
        empty={config.empty ?? "Nothing here yet."}
        {...(open
          ? {
              rowActions: (row: Record<string, unknown>) => (
                <Button size="small" variant="quiet" onClick={() => open(row)}>
                  Open
                </Button>
              ),
            }
          : {})}
      />
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

registerWidget<ChartWidgetConfig>({
  name: "chart",
  configSchema: {
    type: "object",
    required: ["spec", "title"],
    properties: {
      spec: { type: "object", description: "A Vega-Lite spec." },
      title: { type: "string", description: "Names the chart for screen readers." },
      description: { type: "string", description: "Says what the chart shows." },
      height: { type: "number", description: "In pixels." },
    },
  },
  render(config, context) {
    return (
      <Chart
        spec={config.spec}
        title={config.title}
        {...(config.description ? { description: config.description } : {})}
        {...(config.height ? { height: config.height } : {})}
        {...(context.rows ? { data: context.rows } : {})}
      />
    );
  },
});
