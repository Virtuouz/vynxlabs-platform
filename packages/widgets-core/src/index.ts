/**
 * The core pack: the widgets Volvel ships, declared against the same contract
 * any pack uses (`@volvel/widgets`). This file holds their definitions only,
 * which are data; their views are in `../views` and are imported by what
 * draws pages.
 */
import { defineWidget, type InspectorHint, WidgetRegistry } from "@volvel/widgets";

const hint = (h: InspectorHint) => h;

const FORMAT = {
  type: "object",
  properties: {
    style: { enum: ["number", "currency", "percent"] },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    minorUnits: { type: "boolean" },
    decimals: { type: "integer", minimum: 0, maximum: 6 },
  },
  required: ["style"],
  additionalProperties: false,
} as const;

const RESULT_COLUMN = { type: "string", minLength: 1, maxLength: 130 } as const;

/** Many rows, dense and sortable. */
export const table = defineWidget({
  type: "core/table",
  version: "1.0.0",
  title: "Table",
  description: "Many records, dense and sortable",
  category: "records",
  icon: "table",
  surfaces: ["app", "dashboard"],
  data: { rows: { shape: "rows" } },
  dataHints: [
    {
      of: "rows",
      controls: [
        { control: "source", label: "Source" },
        { control: "conditions", label: "Only include", help: "For example: Status is Unpaid. Adds to the page filters." },
        { control: "sort", label: "Sorted by", level: "more" },
        { control: "limit", label: "At most", level: "more" },
      ],
    },
  ],
  config: {
    type: "object",
    properties: {
      columns: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            column: RESULT_COLUMN,
            label: { type: "string", maxLength: 60 },
            format: FORMAT,
            as: { enum: ["text", "bar", "delta", "chip"] },
            hidden: { type: "boolean" },
          },
          required: ["column"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "display",
          control: "columns",
          of: "rows",
          label: "Columns",
          help: "Drag to change the order. Or click a column's heading on the page.",
          order: 1,
        }),
      },
      pageSize: {
        type: "integer",
        minimum: 5,
        maximum: 200,
        "x-volvel": hint({ tab: "display", level: "more", control: "number", label: "Rows at a time", order: 2 }),
      },
    },
    additionalProperties: false,
  },
  defaults: { pageSize: 25 },
  events: { rowClick: { gives: "record", label: "When a row is clicked" } },
  layout: { min: { w: 4, h: 4 }, default: { w: 12, h: 8 }, phone: "list" },
});

/** Records as rows of cards: a lighter way to browse than a table. */
export const list = defineWidget({
  type: "core/list",
  version: "1.0.0",
  title: "List",
  description: "Records as rows of cards",
  category: "records",
  icon: "list",
  surfaces: ["app", "dashboard"],
  data: { rows: { shape: "rows", sources: ["table", "query"] } },
  dataHints: [
    {
      of: "rows",
      controls: [
        { control: "source", label: "Source" },
        { control: "conditions", label: "Only include" },
        { control: "sort", label: "Sorted by", level: "more" },
        { control: "limit", label: "At most", level: "more" },
      ],
    },
  ],
  config: {
    type: "object",
    properties: {
      primary: {
        ...RESULT_COLUMN,
        "x-volvel": hint({ tab: "display", control: "column", of: "rows", label: "Heading", order: 1 }),
      },
      secondary: {
        ...RESULT_COLUMN,
        "x-volvel": hint({ tab: "display", control: "column", of: "rows", label: "Under it", order: 2 }),
      },
      meta: {
        type: "array",
        maxItems: 3,
        items: RESULT_COLUMN,
        "x-volvel": hint({ tab: "display", control: "columns", of: "rows", label: "Also shows", level: "more", order: 3 }),
      },
      status: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          control: "column",
          of: "rows",
          types: ["enum"],
          label: "Status",
          help: "Drawn as a chip in its colour.",
          order: 4,
        }),
      },
    },
    additionalProperties: false,
  },
  events: { rowClick: { gives: "record", label: "When a record is clicked" } },
  layout: { min: { w: 3, h: 4 }, default: { w: 4, h: 8 }, phone: "stack" },
});

/** One number: a total, a count or an average. */
export const stat = defineWidget({
  type: "core/stat",
  version: "1.0.0",
  title: "Stat",
  description: "One number: a total, a count or an average",
  category: "understand",
  icon: "hash",
  surfaces: ["app", "dashboard"],
  data: { value: { shape: "summary", values: { min: 1, max: 1 }, breakdowns: { min: 0, max: 0 } } },
  dataHints: [
    {
      of: "value",
      controls: [
        { control: "source", label: "Source" },
        { control: "measure", label: "Value" },
        { control: "conditions", label: "Only include", help: "For example: Status is Unpaid. Adds to the page filters." },
      ],
    },
  ],
  config: {
    type: "object",
    properties: {
      format: {
        ...FORMAT,
        "x-volvel": hint({ tab: "display", control: "format", label: "Numbers look like", order: 1 }),
      },
      caption: {
        type: "string",
        maxLength: 200,
        "x-volvel": hint({
          tab: "display",
          control: "text",
          label: "A line under it",
          help: "Such as “Last 30 days”. {previous} is the number for the period before.",
          order: 2,
        }),
      },
      compareTo: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{0,54}$",
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "filter",
          label: "Compared with the period before",
          help: "The same length of time, ending where this range of dates begins.",
          order: 3,
        }),
      },
      delta: {
        enum: ["percent", "absolute", "points"],
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "choice",
          label: "The change is said as",
          choices: { percent: "A share", absolute: "The amount", points: "Points" },
          order: 4,
        }),
      },
      goodWhen: {
        enum: ["up", "down"],
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "segmented",
          label: "Good news is",
          choices: { up: "Up", down: "Down" },
          order: 5,
        }),
      },
      trendBy: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{0,62}(\\.[a-z][a-z0-9_]{0,62})?$",
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "column",
          of: "value",
          types: ["date", "timestamp"],
          label: "A line of how it went, by",
          order: 6,
        }),
      },
    },
    additionalProperties: false,
  },
  events: { click: { gives: "nothing", label: "When it is clicked" } },
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 }, phone: "stack" },
});

/** A trend or a comparison. */
export const chart = defineWidget({
  type: "core/chart",
  version: "1.0.0",
  title: "Chart",
  description: "A trend or a comparison",
  category: "understand",
  icon: "chart",
  surfaces: ["app", "dashboard"],
  data: { rows: { shape: "summary", values: { min: 1, max: 6 }, breakdowns: { min: 1, max: 2 } } },
  dataHints: [
    {
      of: "rows",
      controls: [
        { control: "source", label: "Source" },
        { control: "measure", label: "Value" },
        { control: "breakdown", label: "Break down by" },
        { control: "conditions", label: "Only include", help: "For example: Status is Unpaid. Adds to the page filters." },
        { control: "sort", label: "Sorted by", level: "more" },
        { control: "limit", label: "At most", level: "more" },
      ],
    },
  ],
  config: {
    type: "object",
    properties: {
      mark: {
        enum: ["line", "bar", "area", "pie", "scatter", "heatmap"],
        "x-volvel": hint({
          tab: "display",
          control: "segmented",
          label: "Chart type",
          choices: { line: "Line", bar: "Bar", area: "Area", pie: "Pie", scatter: "Scatter", heatmap: "Heatmap" },
          order: 1,
        }),
      },
      format: {
        ...FORMAT,
        "x-volvel": hint({ tab: "display", control: "format", label: "Numbers look like", order: 2 }),
      },
      legend: {
        enum: ["auto", "shown", "hidden"],
        "x-volvel": hint({
          tab: "display",
          control: "choice",
          label: "Legend",
          choices: { auto: "Automatic", shown: "Always", hidden: "Never" },
          order: 3,
        }),
      },
      horizontal: {
        type: "boolean",
        "x-volvel": hint({ tab: "display", level: "more", control: "switch", label: "Bars lie down", when: { mark: "bar" }, order: 4 }),
      },
      bars: {
        enum: ["stacked", "grouped"],
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "segmented",
          label: "Several series",
          choices: { stacked: "One on another", grouped: "Side by side" },
          when: { mark: "bar" },
          order: 5,
        }),
      },
      compareTo: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{0,54}$",
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "filter",
          label: "Also draw the period before",
          help: "Drawn as a dashed line: the same length of time, ending where this range begins.",
          order: 6,
        }),
      },
      x: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "column",
          of: "rows",
          label: "Along the bottom",
          help: "Left out: the first breakdown.",
          order: 7,
        }),
      },
      y: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "column",
          of: "rows",
          label: "Up the side",
          help: "Left out: the first value.",
          order: 8,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { mark: "bar", legend: "auto" },
  events: { pointClick: { gives: "group", label: "When someone clicks a point" } },
  layout: { min: { w: 3, h: 4 }, default: { w: 6, h: 6 }, phone: "stack" },
});

/** Values cross-tabulated by two breakdowns. */
export const pivot = defineWidget({
  type: "core/pivot",
  version: "1.0.0",
  title: "Pivot",
  description: "A value across two breakdowns, as a grid",
  category: "understand",
  icon: "grid",
  surfaces: ["app", "dashboard"],
  data: { rows: { shape: "summary", values: { min: 1, max: 1 }, breakdowns: { min: 2, max: 3 } } },
  dataHints: [
    {
      of: "rows",
      controls: [
        { control: "source", label: "Source" },
        { control: "measure", label: "In each cell" },
        { control: "breakdown", label: "Break down by", help: "The last one goes across the top." },
        { control: "conditions", label: "Only include" },
      ],
    },
  ],
  config: {
    type: "object",
    properties: {
      format: {
        ...FORMAT,
        "x-volvel": hint({ tab: "display", control: "format", label: "Numbers look like", order: 1 }),
      },
      totals: {
        type: "boolean",
        "x-volvel": hint({ tab: "display", control: "switch", label: "Show totals", order: 2 }),
      },
    },
    additionalProperties: false,
  },
  defaults: { totals: true },
  events: { cellClick: { gives: "group", label: "When a cell is clicked" } },
  layout: { min: { w: 4, h: 4 }, default: { w: 6, h: 7 }, phone: "stack" },
});

/** Headings, instructions and help, in Markdown. */
export const text = defineWidget({
  type: "core/text",
  version: "1.0.0",
  title: "Text",
  description: "Headings, instructions, help",
  category: "content",
  icon: "text",
  surfaces: ["app", "dashboard"],
  data: {},
  config: {
    type: "object",
    properties: {
      text: {
        type: "string",
        maxLength: 10000,
        "x-volvel": hint({
          tab: "display",
          control: "markdown",
          label: "Text",
          help: "Markdown, with the documentation's alerts, steps, tabs and folds.",
          order: 1,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { text: "" },
  events: {},
  layout: { min: { w: 2, h: 1 }, default: { w: 6, h: 2 }, phone: "stack" },
});

export const CORE_WIDGETS = [table, list, stat, chart, pivot, text] as const;

/** A registry of the core pack, to add other packs to. */
export function coreRegistry(): WidgetRegistry {
  return new WidgetRegistry(CORE_WIDGETS);
}
