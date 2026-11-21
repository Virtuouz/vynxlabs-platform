/**
 * The core pack: the widgets Volvel ships, declared against the same contract
 * any pack uses (`@volvel/widgets`). This file holds their definitions only,
 * which are data; their views are in `../views` and are imported by what
 * draws pages.
 */
import { defineWidget, FORMAT_SCHEMA, type InspectorHint, WidgetRegistry } from "@volvel/widgets";

const hint = (h: InspectorHint) => h;

const FORMAT = FORMAT_SCHEMA;

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
        {
          control: "conditions",
          label: "Only include",
          help: "For example: Status is Unpaid. Adds to the page filters.",
        },
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
      rowActions: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,39}$" },
            label: { type: "string", minLength: 1, maxLength: 40 },
            tone: { enum: ["default", "danger"] },
            action: { type: "object" },
          },
          required: ["id", "label", "action"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "actions",
          control: "actions",
          label: "Row actions",
          help: "At the end of each row, and in its detail. Each says when it may be pressed.",
          order: 2,
        }),
      },
      pageSize: {
        type: "integer",
        minimum: 5,
        maximum: 200,
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "number",
          label: "Rows at a time",
          order: 2,
        }),
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
        "x-volvel": hint({
          tab: "display",
          control: "column",
          of: "rows",
          label: "Heading",
          order: 1,
        }),
      },
      secondary: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          control: "column",
          of: "rows",
          label: "Under it",
          order: 2,
        }),
      },
      meta: {
        type: "array",
        maxItems: 3,
        items: RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          control: "columns",
          of: "rows",
          label: "Also shows",
          level: "more",
          order: 3,
        }),
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
      rowActions: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,39}$" },
            label: { type: "string", minLength: 1, maxLength: 40 },
            tone: { enum: ["default", "danger"] },
            action: { type: "object" },
          },
          required: ["id", "label", "action"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "actions",
          control: "actions",
          label: "Row actions",
          help: "On each record, and in its detail. Each says when it may be pressed.",
          order: 2,
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
        {
          control: "conditions",
          label: "Only include",
          help: "For example: Status is Unpaid. Adds to the page filters.",
        },
      ],
    },
  ],
  config: {
    type: "object",
    properties: {
      format: {
        ...FORMAT,
        "x-volvel": hint({
          tab: "display",
          control: "format",
          label: "Numbers look like",
          order: 1,
        }),
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
        {
          control: "conditions",
          label: "Only include",
          help: "For example: Status is Unpaid. Adds to the page filters.",
        },
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
          choices: {
            line: "Line",
            bar: "Bar",
            area: "Area",
            pie: "Pie",
            scatter: "Scatter",
            heatmap: "Heatmap",
          },
          order: 1,
        }),
      },
      format: {
        ...FORMAT,
        "x-volvel": hint({
          tab: "display",
          control: "format",
          label: "Numbers look like",
          order: 2,
        }),
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
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "switch",
          label: "Bars lie down",
          when: { mark: "bar" },
          order: 4,
        }),
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
        "x-volvel": hint({
          tab: "display",
          control: "format",
          label: "Numbers look like",
          order: 1,
        }),
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

/** One action: update a record, open a page, run a flow. */
export const button = defineWidget({
  type: "core/button",
  version: "1.0.0",
  title: "Button",
  description: "One action: update, open, run a workflow",
  category: "action",
  icon: "button",
  surfaces: ["app"],
  data: {},
  config: {
    type: "object",
    properties: {
      label: {
        type: "string",
        minLength: 1,
        maxLength: 40,
        "x-volvel": hint({ tab: "display", control: "text", label: "It says", order: 1 }),
      },
      tone: {
        enum: ["primary", "default", "danger"],
        "x-volvel": hint({
          tab: "display",
          control: "segmented",
          label: "It looks",
          choices: { primary: "Main", default: "Plain", danger: "Careful" },
          order: 2,
        }),
      },
    },
    required: ["label"],
    additionalProperties: false,
  },
  defaults: { label: "Do it", tone: "primary" },
  events: { click: { gives: "nothing", label: "When clicked" } },
  layout: { min: { w: 2, h: 1 }, default: { w: 3, h: 1 }, max: { w: 12, h: 2 }, phone: "stack" },
});

/** One record: its fields, and what can be done with it. */
export const detail = defineWidget({
  type: "core/detail",
  version: "1.0.0",
  title: "Record detail",
  description: "One record: fields and actions",
  category: "records",
  icon: "detail",
  surfaces: ["app"],
  data: { record: { shape: "record", label: "Record", sources: ["table"] } },
  dataHints: [{ of: "record", controls: [{ control: "source", label: "Record" }] }],
  config: {
    type: "object",
    properties: {
      heading: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          control: "column",
          of: "record",
          label: "Heading",
          order: 1,
        }),
      },
      status: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          control: "column",
          of: "record",
          types: ["enum"],
          label: "Status",
          help: "Drawn as a chip beside the heading.",
          order: 2,
        }),
      },
      fields: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            column: RESULT_COLUMN,
            label: { type: "string", maxLength: 60 },
            format: FORMAT,
            section: { type: "string", maxLength: 60 },
            hidden: { type: "boolean" },
          },
          required: ["column"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "display",
          control: "fields",
          of: "record",
          label: "Fields",
          help: "Drag to change the order. A section starts a new group.",
          order: 3,
        }),
      },
      actions: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,39}$" },
            label: { type: "string", minLength: 1, maxLength: 40 },
            tone: { enum: ["primary", "default", "danger"] },
            action: { type: "object" },
          },
          required: ["id", "label", "action"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "actions",
          control: "actions",
          label: "Actions",
          help: "Buttons on the record. Each says when it may be pressed.",
          order: 1,
        }),
      },
    },
    additionalProperties: false,
  },
  events: {},
  layout: { min: { w: 3, h: 4 }, default: { w: 6, h: 8 }, phone: "stack" },
});

/** Create or edit a record: its fields from the table, checked as the table says. */
export const form = defineWidget({
  type: "core/form",
  version: "1.0.0",
  title: "Form",
  description: "Create or edit a record",
  category: "records",
  icon: "form",
  surfaces: ["app"],
  data: {
    record: {
      shape: "record",
      label: "Record",
      sources: ["table"],
    },
  },
  dataHints: [{ of: "record", controls: [{ control: "source", label: "Table" }] }],
  config: {
    type: "object",
    properties: {
      mode: {
        enum: ["create", "edit"],
        "x-volvel": hint({
          tab: "data",
          control: "segmented",
          label: "It",
          choices: { create: "Makes a new record", edit: "Changes the record that is open" },
          order: 1,
        }),
      },
      fields: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            column: RESULT_COLUMN,
            label: { type: "string", maxLength: 60 },
            help: { type: "string", maxLength: 200 },
            section: { type: "string", maxLength: 60 },
            required: { type: "boolean" },
          },
          required: ["column"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "display",
          control: "fields",
          of: "record",
          label: "Fields",
          help: "Drag to change the order. The control for each is picked from its column's type.",
          order: 1,
        }),
      },
      submitLabel: {
        type: "string",
        minLength: 1,
        maxLength: 40,
        "x-volvel": hint({ tab: "display", control: "text", label: "The button says", order: 2 }),
      },
      submit: {
        type: "object",
        "x-volvel": hint({
          tab: "actions",
          control: "action",
          label: "When it is sent",
          help: "Saves the fields, then does what follows: close, say something, open a page.",
          order: 1,
        }),
      },
    },
    required: ["mode", "fields", "submit"],
    additionalProperties: false,
  },
  defaults: { mode: "create", submitLabel: "Save" },
  events: {},
  layout: { min: { w: 3, h: 4 }, default: { w: 6, h: 8 }, phone: "stack" },
});

export const CORE_WIDGETS = [table, list, detail, form, button, stat, chart, pivot, text] as const;

/** A registry of the core pack, to add other packs to. */
export function coreRegistry(): WidgetRegistry {
  return new WidgetRegistry(CORE_WIDGETS);
}
