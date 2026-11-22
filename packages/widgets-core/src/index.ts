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

/** The nine places a control may take in its cell, by row then column. */
const PLACES = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

/** The tones a badge is drawn in. */
const TONES = ["success", "attention", "danger", "neutral", "action"];

/** An action drawn as a labelled button or row action, with when it may be pressed. */
const LABELLED_ACTIONS = {
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
} as const;

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
            // `badge` draws a choice as a chip with a dot, in the tone `badges` gives its value.
            as: { enum: ["text", "bar", "delta", "badge"] },
            // Each value's tone, for `as: "badge"`. A value left out takes its colour from the column, or is neutral.
            badges: {
              type: "object",
              maxProperties: 50,
              additionalProperties: { enum: TONES },
            },
            // `right` lines the column up at the right; `auto` does so for numbers.
            align: { enum: ["auto", "right"] },
            // `fixed` gives the column one width, with long values cut short.
            width: { enum: ["auto", "fixed"] },
            // Clicking its heading sorts the rows shown (the rows read, in the browser).
            sortable: { type: "boolean" },
            // A total row at the bottom: the sum of the rows shown.
            total: { type: "boolean" },
            // `false` leaves it out of the list a table becomes on a phone.
            phone: { type: "boolean" },
            hidden: { type: "boolean" },
          },
          required: ["column"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "display",
          group: "Columns",
          control: "columns",
          of: "rows",
          label: "Columns",
          help: "Drag to change the order. Or click a column's heading on the page.",
          order: 1,
        }),
      },
      rowHeight: {
        enum: ["comfortable", "compact"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "Row height",
          choices: { comfortable: "Comfortable", compact: "Compact" },
          order: 2,
        }),
      },
      pageSize: {
        type: "integer",
        minimum: 5,
        maximum: 200,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "number",
          label: "Rows at a time",
          order: 3,
        }),
      },
      empty: {
        type: "string",
        maxLength: 200,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "text",
          label: "When empty",
          help: "What the table says when there are no rows.",
          order: 4,
        }),
      },
      stripes: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Stripe rows",
          order: 5,
        }),
      },
      rowActions: {
        ...LABELLED_ACTIONS,
        "x-volvel": hint({
          tab: "actions",
          group: "Row actions",
          control: "actions",
          label: "Row actions",
          help: "At the end of each row, and in its detail. Each says when it may be pressed.",
          order: 2,
        }),
      },
      buttons: {
        type: "array",
        maxItems: 5,
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
          group: "Buttons above the table",
          control: "actions",
          label: "Buttons",
          help: "On the table's heading line. Each says when it may be pressed.",
          order: 3,
        }),
      },
      select: {
        type: "boolean",
        "x-volvel": hint({
          tab: "actions",
          group: "Selecting rows",
          control: "switch",
          label: "Let people select several rows",
          help: "Adds checkboxes and lets a row action run on all of them.",
          order: 4,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { pageSize: 25, rowHeight: "comfortable" },
  events: { rowClick: { gives: "record", label: "When a row is clicked" } },
  layout: { min: { w: 4, h: 4 }, default: { w: 12, h: 8 }, phone: "list" },
});

/** A place of a list's row, filled with a column. */
const slot = (label: string, order: number, help?: string, types?: readonly string[]) => ({
  ...RESULT_COLUMN,
  "x-volvel": hint({
    tab: "display",
    group: "Each row looks like",
    control: "slots",
    of: "rows",
    label,
    ...(help ? { help } : {}),
    ...(types ? { types } : {}),
    order,
  }),
});

/** Records as rows or cards: a lighter way to browse than a table. */
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
      title: slot("Title", 1),
      subtitle: slot("Under the title", 2),
      right: slot("Right", 3, "A figure at the right of the row."),
      badge: slot("Badge", 4, "Drawn as a chip with a dot, in its colour.", ["enum"]),
      picture: slot("Picture", 5, "A column holding a picture's address.", ["text", "url"]),
      look: {
        enum: ["list", "cards"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "Rows",
          choices: { list: "List", cards: "Cards" },
          order: 6,
        }),
      },
      rowActions: {
        ...LABELLED_ACTIONS,
        "x-volvel": hint({
          tab: "actions",
          group: "Row actions",
          control: "actions",
          label: "Row actions",
          help: "On each record, and in its detail. Each says when it may be pressed.",
          order: 2,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { look: "list" },
  events: { rowClick: { gives: "record", label: "When a record is clicked" } },
  layout: { min: { w: 3, h: 4 }, default: { w: 4, h: 8 }, phone: "stack" },
});

/** One number: a total, a count or an average. */
export const stat = defineWidget({
  type: "core/stat",
  version: "1.0.0",
  title: "Stat",
  description: "One number: total, count, average",
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
      caption: {
        type: "string",
        maxLength: 200,
        "x-volvel": hint({
          tab: "display",
          group: "Heading",
          control: "text",
          label: "Caption",
          help: "Such as “Not yet paid”. {previous} is the number for the period before.",
          order: 1,
        }),
      },
      format: {
        ...FORMAT,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "format",
          label: "Numbers",
          order: 2,
        }),
      },
      trendBy: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{0,62}(\\.[a-z][a-z0-9_]{0,62})?$",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          level: "more",
          control: "column",
          of: "value",
          types: ["date", "timestamp"],
          label: "A line of how it went, by",
          order: 3,
        }),
      },
      compare: {
        type: "boolean",
        description:
          "Compare with the period before. The drawer stores it with `compareTo`, the page's date filter it uses (`withCompare`); the server reads `compareTo`.",
        "x-volvel": hint({
          tab: "display",
          group: "Compare",
          control: "switch",
          label: "Compare with the period before",
          help: "The same length of time, ending where the range starts.",
          order: 4,
        }),
      },
      compareTo: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{0,54}$",
        "x-volvel": hint({
          tab: "display",
          group: "Compare",
          level: "more",
          control: "filter",
          label: "The range it is compared across",
          help: "A page filter of dates. Set for you when you switch the comparison on.",
          when: { compare: true },
          order: 5,
        }),
      },
      delta: {
        enum: ["percent", "absolute", "points"],
        "x-volvel": hint({
          tab: "display",
          group: "Compare",
          control: "segmented",
          label: "Show change as",
          choices: { percent: "%", absolute: "$", points: "Points" },
          when: { compare: true },
          order: 6,
        }),
      },
      goodWhen: {
        enum: ["up", "down"],
        "x-volvel": hint({
          tab: "display",
          group: "Compare",
          control: "segmented",
          label: "Going up is",
          choices: { up: "Good", down: "Bad" },
          when: { compare: true },
          order: 7,
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
        { control: "measure", label: "Measure" },
        {
          control: "breakdown",
          label: "For each",
          help: "The first goes along the bottom; a second splits the chart into colors.",
        },
        {
          control: "conditions",
          label: "Only include",
          help: "For example: Status is Unpaid. Adds to the page filters.",
        },
        { control: "sort", label: "Sorted by", level: "more" },
        { control: "limit", label: "Show at most", level: "more" },
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
          group: "Chart type",
          control: "tiles",
          label: "Chart type",
          help: "Types that cannot work with the data are greyed (see `chartFits`).",
          choices: {
            bar: "Bar",
            line: "Line",
            area: "Area",
            pie: "Pie",
            scatter: "Scatter",
            heatmap: "Heatmap",
          },
          order: 1,
        }),
      },
      horizontal: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Chart type",
          control: "switch",
          label: "Bars lie down",
          when: { mark: "bar" },
          order: 2,
        }),
      },
      bars: {
        enum: ["stacked", "grouped"],
        "x-volvel": hint({
          tab: "display",
          group: "Chart type",
          level: "more",
          control: "segmented",
          label: "Several series",
          choices: { stacked: "One on another", grouped: "Side by side" },
          when: { mark: "bar" },
          order: 3,
        }),
      },
      order: {
        enum: ["biggest", "smallest", "label"],
        "x-volvel": hint({
          tab: "data",
          group: "Order",
          control: "choice",
          label: "Bars in order",
          choices: { biggest: "Biggest first", smallest: "Smallest first", label: "By name" },
          help: "Not for a chart over time, which goes in date order.",
          order: 1,
        }),
      },
      fillGaps: {
        type: "boolean",
        "x-volvel": hint({
          tab: "data",
          group: "Over time",
          control: "switch",
          label: "Include periods with nothing",
          help: "Draws them as zero instead of skipping them.",
          order: 2,
        }),
      },
      format: {
        ...FORMAT,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "format",
          label: "Numbers",
          order: 4,
        }),
      },
      colors: {
        enum: ["theme", "cool", "warm", "mono"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "choice",
          label: "Colors",
          choices: { theme: "App theme", cool: "Cool", warm: "Warm", mono: "Greys" },
          order: 5,
        }),
      },
      legend: {
        enum: ["auto", "shown", "hidden"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "choice",
          label: "Legend",
          choices: { auto: "Automatic", shown: "Always", hidden: "Never" },
          order: 6,
        }),
      },
      values: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Show values on bars",
          order: 7,
        }),
      },
      axisTitles: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Show axis titles",
          order: 8,
        }),
      },
      compare: {
        type: "boolean",
        description:
          "Draw the period before. The drawer stores it with `compareTo`, the page's date filter it uses (`withCompare`); the server reads `compareTo`.",
        "x-volvel": hint({
          tab: "display",
          group: "Over time",
          control: "switch",
          label: "Compare with the period before",
          help: "Drawn dashed: the same length of time, ending where this range starts.",
          order: 9,
        }),
      },
      compareTo: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{0,54}$",
        "x-volvel": hint({
          tab: "display",
          group: "Over time",
          level: "more",
          control: "filter",
          label: "The range it is compared across",
          help: "A page filter of dates. Set for you when you switch the comparison on.",
          when: { compare: true },
          order: 10,
        }),
      },
      smooth: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Over time",
          control: "switch",
          label: "Smooth the line",
          order: 11,
        }),
      },
      points: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Over time",
          control: "switch",
          label: "Mark each point",
          order: 12,
        }),
      },
      x: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          level: "more",
          control: "column",
          of: "rows",
          label: "Along the bottom",
          help: "Left out: the first breakdown.",
          order: 13,
        }),
      },
      y: {
        ...RESULT_COLUMN,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          level: "more",
          control: "column",
          of: "rows",
          label: "Up the side",
          help: "Left out: the first value.",
          order: 14,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { mark: "bar", legend: "auto", colors: "theme", axisTitles: true, points: true },
  events: { pointClick: { gives: "group", label: "When someone clicks a point" } },
  layout: { min: { w: 3, h: 4 }, default: { w: 6, h: 6 }, phone: "stack" },
});

/** Values cross-tabulated by two breakdowns. */
export const pivot = defineWidget({
  type: "core/pivot",
  version: "1.0.0",
  title: "Pivot",
  description: "A value across two breakdowns",
  category: "understand",
  icon: "grid",
  surfaces: ["app", "dashboard"],
  data: { rows: { shape: "summary", values: { min: 1, max: 1 }, breakdowns: { min: 2, max: 3 } } },
  dataHints: [
    {
      of: "rows",
      controls: [
        { control: "source", label: "Source" },
        { control: "measure", label: "Measure" },
        {
          control: "breakdown",
          label: "Rows and columns",
          help: "The last one goes across the top.",
        },
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
          group: "Look",
          control: "format",
          label: "Numbers",
          order: 1,
        }),
      },
      shade: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Shade cells by size",
          order: 2,
        }),
      },
      rowTotals: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Total for each row",
          order: 3,
        }),
      },
      columnTotals: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Total for each column",
          order: 4,
        }),
      },
      totals: {
        type: "boolean",
        description: "Older than rowTotals and columnTotals: both together. They win when set.",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          level: "more",
          control: "switch",
          label: "Show totals",
          help: "An older setting: the two switches above say it better.",
          when: { totals: false },
          order: 5,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { rowTotals: true, columnTotals: true },
  events: { cellClick: { gives: "group", label: "When a cell is clicked" } },
  layout: { min: { w: 4, h: 4 }, default: { w: 6, h: 7 }, phone: "stack" },
});

/** Headings, instructions and help, in Markdown. */
export const text = defineWidget({
  type: "core/text",
  version: "1.0.0",
  title: "Text",
  description: "Notes and help",
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
      look: {
        enum: ["plain", "note", "warning", "tip"],
        "x-volvel": hint({
          tab: "display",
          group: "Style",
          control: "tiles",
          label: "Style",
          choices: { plain: "Plain", note: "Note", warning: "Warning", tip: "Tip" },
          order: 0,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { text: "", look: "plain" },
  events: {},
  layout: { min: { w: 2, h: 1 }, default: { w: 6, h: 2 }, phone: "stack" },
});

/** One action: update a record, open a page, run a flow. */
export const button = defineWidget({
  type: "core/button",
  version: "1.0.0",
  title: "Button",
  description: "One action",
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
        "x-volvel": hint({
          tab: "display",
          group: "Label",
          control: "text",
          label: "Says",
          order: 1,
        }),
      },
      icon: {
        type: "string",
        maxLength: 40,
        "x-volvel": hint({
          tab: "display",
          group: "Label",
          control: "icon",
          label: "Icon",
          order: 2,
        }),
      },
      tone: {
        enum: ["primary", "default", "quiet", "danger"],
        "x-volvel": hint({
          tab: "display",
          group: "Style",
          control: "tiles",
          label: "Style",
          choices: { primary: "Main", default: "Normal", quiet: "Quiet", danger: "Danger" },
          order: 3,
        }),
      },
      full: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Style",
          control: "switch",
          label: "Full width",
          order: 4,
        }),
      },
      place: {
        enum: PLACES,
        "x-volvel": hint({
          tab: "display",
          group: "Style",
          control: "position",
          label: "Place in its cell",
          help: "Where the button sits when its cell is bigger than it.",
          order: 5,
        }),
      },
    },
    required: ["label"],
    additionalProperties: false,
  },
  defaults: { label: "Do it", tone: "primary", place: "middle-left" },
  events: { click: { gives: "nothing", label: "When clicked" } },
  layout: {
    min: { w: 2, h: 1 },
    default: { w: 3, h: 1 },
    max: { w: 12, h: 2 },
    phone: "stack",
    frame: "none",
  },
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
          group: "Fields",
          label: "Fields",
          help: "Drag to change the order. A section starts a new group.",
          order: 3,
        }),
      },
      across: {
        enum: [1, 2, 3],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "Fields across",
          choices: { "1": "1", "2": "2", "3": "3" },
          order: 4,
        }),
      },
      edit: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Let people edit fields in place",
          help: "Otherwise editing goes through the Edit button.",
          order: 5,
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
            tone: { enum: ["primary", "default", "quiet", "danger"] },
            icon: { type: "string", maxLength: 40 },
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
  defaults: { across: 2 },
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
            format: FORMAT,
            /** What the field starts with when a record is made: today, the person filling it in, or a fixed value. */
            initial: {
              type: "object",
              properties: {
                kind: { enum: ["today", "me", "value"] },
                as: { enum: ["email", "name", "id"] },
                value: {},
              },
              required: ["kind"],
              additionalProperties: false,
            },
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

const ID = "^[a-z][a-z0-9_-]{0,39}$";

/** A heading over widgets placed in it, on its own grid; it may fold. */
export const section = defineWidget({
  type: "core/section",
  version: "1.0.0",
  title: "Section",
  description: "Heading over widgets",
  category: "organize",
  icon: "section",
  surfaces: ["app", "dashboard"],
  role: "container",
  data: {},
  config: {
    type: "object",
    properties: {
      look: {
        enum: ["plain", "card"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "Style",
          choices: { plain: "Plain", card: "Card" },
          order: 1,
        }),
      },
      folds: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Can be collapsed",
          help: "Whoever reads the page may fold it away. A reload keeps it as they left it.",
          order: 2,
        }),
      },
      folded: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          control: "switch",
          label: "Starts folded",
          when: { folds: true },
          order: 3,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { folds: false, look: "plain" },
  events: {},
  layout: { min: { w: 3, h: 2 }, default: { w: 12, h: 6 }, phone: "stack" },
});

/** Views of one place, one at a time: each tab holds its own widgets. */
export const tabs = defineWidget({
  type: "core/tabs",
  version: "1.0.0",
  title: "Tabs",
  description: "Views in one place",
  category: "organize",
  icon: "tabs",
  surfaces: ["app", "dashboard"],
  role: "container",
  data: {},
  config: {
    type: "object",
    properties: {
      tabs: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            id: { type: "string", pattern: ID },
            title: { type: "string", minLength: 1, maxLength: 40 },
          },
          required: ["id", "title"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "display",
          control: "tabs",
          label: "Tabs",
          group: "Tabs",
          help: "Each tab holds its own widgets. Drag a widget onto a tab to put it there.",
          order: 1,
        }),
      },
      opensFirst: {
        type: "string",
        pattern: ID,
        "x-volvel": hint({
          tab: "display",
          group: "Tabs",
          control: "text",
          label: "Opens first",
          help: "The id of the tab that opens when the address and memory say nothing.",
          order: 2,
        }),
      },
      look: {
        enum: ["underline", "pills"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "Style",
          choices: { underline: "Underline", pills: "Pills" },
          order: 3,
        }),
      },
      remember: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Remember the last tab",
          help: "Per person, on this device.",
          order: 4,
        }),
      },
    },
    required: ["tabs"],
    additionalProperties: false,
  },
  defaults: {
    tabs: [
      { id: "first", title: "First" },
      { id: "second", title: "Second" },
    ],
    look: "underline",
  },
  events: {},
  layout: { min: { w: 4, h: 3 }, default: { w: 12, h: 8 }, phone: "stack" },
});

/**
 * A search box and filters whoever reads the page sets. Every widget of the page whose
 * data is bound to one of its filters is narrowed by it. A page's filters are only here.
 */
export const filter = defineWidget({
  type: "core/filter",
  version: "1.0.0",
  title: "Search and filter",
  description: "Narrow the page",
  category: "organize",
  icon: "filter",
  surfaces: ["app", "dashboard"],
  role: "filters",
  data: {},
  config: {
    type: "object",
    properties: {
      filters: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        // Each one's shape is checked by the manifest, as a page filter.
        items: { type: "object" },
        "x-volvel": hint({
          tab: "display",
          control: "pageFilters",
          group: "Filters",
          label: "Filters",
          help: "A search box, or a filter by a column. Widgets whose table has the column follow it.",
          order: 1,
        }),
      },
      sit: {
        enum: ["row", "button"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "Filters sit",
          choices: { row: "In a row", button: "Behind a button" },
          order: 0,
        }),
      },
      reset: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          control: "switch",
          label: "Offer \u201cClear\u201d",
          help: "A button that puts every filter here back to how it starts.",
          order: 1,
        }),
      },
    },
    required: ["filters"],
    additionalProperties: false,
  },
  defaults: {
    filters: [{ name: "search", type: "search", label: "Search" }],
    reset: true,
    sit: "row",
  },
  events: {},
  layout: {
    min: { w: 3, h: 1 },
    default: { w: 12, h: 2 },
    max: { w: 12, h: 4 },
    phone: "stack",
    frame: "none",
  },
});

/** Related buttons as one toolbar; those that don't fit go under "More". */
export const actions = defineWidget({
  type: "core/actions",
  version: "1.0.0",
  title: "Action group",
  description: "Buttons as a toolbar",
  category: "action",
  icon: "actions",
  surfaces: ["app"],
  data: {},
  config: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            id: { type: "string", pattern: ID },
            label: { type: "string", minLength: 1, maxLength: 40 },
            tone: { enum: ["primary", "default", "quiet", "danger"] },
            icon: { type: "string", maxLength: 40 },
            action: { type: "object" },
          },
          required: ["id", "label", "action"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "display",
          group: "Buttons",
          control: "actions",
          label: "Buttons",
          help: "In order; the first is the main one. Each says when it may be pressed.",
          order: 1,
        }),
      },
      lineUp: {
        enum: ["left", "right", "spread"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "Line up",
          choices: { left: "Left", right: "Right", spread: "Spread" },
          order: 1,
        }),
      },
      showUpTo: {
        type: "integer",
        minimum: 1,
        maximum: 8,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "number",
          label: "Show up to",
          help: "This many buttons, the rest in a \u22ef menu.",
          order: 2,
        }),
      },
      place: {
        enum: PLACES,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "position",
          label: "Place in its cell",
          order: 3,
        }),
      },
    },
    required: ["actions"],
    additionalProperties: false,
  },
  defaults: {
    actions: [
      {
        id: "first",
        label: "Do it",
        tone: "primary",
        action: { steps: [{ do: "message", text: "Done" }] },
      },
    ],
    lineUp: "left",
    showUpTo: 3,
    place: "middle-left",
  },
  events: {},
  layout: {
    min: { w: 2, h: 1 },
    default: { w: 6, h: 1 },
    max: { w: 12, h: 2 },
    phone: "stack",
    frame: "none",
  },
});

/**
 * Requests waiting for a decision: the approval steps of the workspace's flows, to approve or
 * reject from the page. It reads for a member only, by their own standing, and decides through
 * its own route (decision 0007); who may decide is set on the flow's step, not here.
 */
export const approvals = defineWidget({
  type: "core/approvals",
  version: "1.0.0",
  title: "Approvals",
  description: "Requests waiting for a decision",
  category: "action",
  icon: "approvals",
  surfaces: ["app"],
  data: { requests: { shape: "approvals", label: "Which requests", sources: ["approvals"] } },
  initialData: { requests: { source: { approvals: { whose: "mine" } } } },
  config: {
    type: "object",
    properties: {
      look: {
        enum: ["rows", "cards", "queue"],
        "x-volvel": hint({
          tab: "display",
          group: "Looks like",
          control: "tiles",
          label: "Looks like",
          choices: { rows: "Rows", cards: "Cards", queue: "Queue" },
          order: 1,
        }),
      },
      fields: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            label: { type: "string", maxLength: 60 },
            hidden: { type: "boolean" },
          },
          required: ["name"],
          additionalProperties: false,
        },
        "x-volvel": hint({
          tab: "display",
          group: "What each shows",
          control: "fields",
          label: "What each shows",
          help: "The step's own details, in order. Left alone, the first four.",
          order: 2,
        }),
      },
      opens: {
        enum: ["sheet", "modal", "nothing"],
        "x-volvel": hint({
          tab: "display",
          group: "Looks like",
          control: "segmented",
          label: "A click opens",
          choices: { sheet: "Side sheet", modal: "Modal", nothing: "Nothing" },
          order: 1.5,
        }),
      },
      decided: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Decided ones",
          control: "switch",
          label: "Show decided ones",
          help: "A Waiting and Decided switch, with who decided and why.",
          order: 4,
        }),
      },
      empty: {
        type: "string",
        maxLength: 120,
        "x-volvel": hint({
          tab: "display",
          group: "Decided ones",
          control: "text",
          label: "When nothing waits",
          order: 5,
        }),
      },
      approveLabel: {
        type: "string",
        minLength: 1,
        maxLength: 30,
        "x-volvel": hint({
          tab: "actions",
          group: "Deciding",
          control: "text",
          label: "Approve says",
          order: 1,
        }),
      },
      rejectLabel: {
        type: "string",
        minLength: 1,
        maxLength: 30,
        "x-volvel": hint({
          tab: "actions",
          group: "Deciding",
          control: "text",
          label: "Reject says",
          order: 2,
        }),
      },
      askWhy: {
        enum: ["never", "rejecting", "always"],
        "x-volvel": hint({
          tab: "actions",
          group: "Deciding",
          control: "segmented",
          label: "Ask why",
          choices: { never: "Never", rejecting: "When rejecting", always: "Always" },
          order: 3,
        }),
      },
      confirm: {
        type: "boolean",
        "x-volvel": hint({
          tab: "actions",
          group: "Deciding",
          control: "switch",
          label: "Ask before approving",
          order: 4,
        }),
      },
      advance: {
        type: "boolean",
        "x-volvel": hint({
          tab: "actions",
          group: "Deciding",
          control: "switch",
          label: "Go to the next one",
          help: "Open the next request once one is decided.",
          order: 5,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: {
    look: "rows",
    opens: "sheet",
    askWhy: "rejecting",
    approveLabel: "Approve",
    rejectLabel: "Reject",
    advance: true,
  },
  events: {},
  layout: { min: { w: 4, h: 5 }, default: { w: 6, h: 9 }, phone: "stack" },
});

export const CORE_WIDGETS = [
  table,
  list,
  detail,
  form,
  button,
  actions,
  approvals,
  stat,
  chart,
  pivot,
  section,
  tabs,
  filter,
  text,
] as const;

/** A registry of the core pack, to add other packs to. */
export function coreRegistry(): WidgetRegistry {
  return new WidgetRegistry(CORE_WIDGETS);
}
