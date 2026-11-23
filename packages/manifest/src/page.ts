import { type WidgetDefinition, WidgetRegistry } from "@volvel/widgets";
import {
  DASHBOARD_REFRESH,
  type DashboardBody,
  type DataInput,
  type InterfaceBody,
  LAST_UNITS,
  type LastValue,
  MAX_PAGE_FILTERS,
  MAX_PAGE_ROWS,
  MAX_PAGE_WIDGETS,
  MAX_PAGES,
  MAX_WIDGET_HEIGHT,
  PAGE_COLUMNS,
  PAGE_FILTER_TYPES,
  PAGE_KINDS,
  PAGE_SIZES,
  type Page,
  type PageFilter,
  type PageWidget,
  VISUAL_BUCKETS,
  VISUAL_FUNCTIONS,
  VISUAL_OPERATORS,
  type VisualCondition,
} from "@volvel/widgets/page";
import { CORE_WIDGETS } from "@volvel/widgets-core";
import { LABS_WIDGETS } from "@volvel/widgets-labs";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  type Action,
  actionSchema,
  type Condition,
  conditionFields,
  type RecordRef,
  widgetRulesSchema,
} from "./action.js";
import * as parts from "./parts.js";
import type { KindDefinition, ManifestIssue } from "./registry.js";
import type { TableBody } from "./table.js";

/**
 * Pages of widgets: what an app made in the console is, and what a dashboard
 * is (S9, decision 0006). An `interface` holds pages; a `dashboard` is one
 * page whose widgets only read.
 *
 * A widget names its `type` from a pack (`core/chart`), and holds:
 * - `data`: each data input its definition declares, as a query (a table read
 *   from menus, a saved query, or SQL on a dashboard), and the page filters
 *   that narrow it. The platform reads it on the server, from the stored page.
 * - `config`: everything else, checked against its definition's schema.
 * - `at`: where it is on the page's twelve columns.
 */

/** Every table has these, as `kinds.ts` says; repeated here so this file is not part of a cycle. */
const SYSTEM_COLUMNS = ["id", "created_at", "updated_at"] as const;

export * from "@volvel/widgets/page";

// ---------------------------------------------------------------------------
// Schemas

const NAME = "^[a-z][a-z0-9_]{0,54}$";
const SLUG = "^[a-z][a-z0-9_-]{0,39}$";
const COLUMN = "^[a-z][a-z0-9_]{0,62}(\\.[a-z][a-z0-9_]{0,62})?$";
const PATH = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";
const TYPE = "^[a-z][a-z0-9-]{0,30}/[a-z][a-z0-9-]{0,40}$";

const visualSchema = {
  type: "object",
  properties: {
    table: { type: "string", pattern: PATH, maxLength: 255 },
    joins: {
      type: "array",
      maxItems: 6,
      items: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" },
    },
    filters: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          column: { type: "string", pattern: COLUMN },
          op: { enum: [...VISUAL_OPERATORS] },
          value: {},
        },
        required: ["column", "op"],
        additionalProperties: false,
      },
    },
    groupBy: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          column: { type: "string", pattern: COLUMN },
          bucket: { enum: [...VISUAL_BUCKETS] },
        },
        required: ["column"],
        additionalProperties: false,
      },
    },
    measures: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          fn: { enum: [...VISUAL_FUNCTIONS] },
          column: { type: "string", pattern: COLUMN },
          as: { type: "string", pattern: NAME },
        },
        required: ["fn", "as"],
        additionalProperties: false,
      },
    },
    columns: { type: "array", maxItems: 50, items: { type: "string", pattern: COLUMN } },
    sort: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          by: { type: "string", pattern: "^[a-z][a-z0-9_.]{0,130}$" },
          descending: { type: "boolean" },
        },
        required: ["by"],
        additionalProperties: false,
      },
    },
    limit: { type: "integer", minimum: 1, maximum: 10000 },
  },
  required: ["table"],
  additionalProperties: false,
} as const;

const sourceSchema = {
  oneOf: [
    {
      type: "object",
      properties: { visual: visualSchema },
      required: ["visual"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        query: {
          type: "string",
          pattern: PATH,
          maxLength: 255,
          description: "A saved query, by its path.",
        },
        values: { type: "object", description: "What its parameters are given, by name." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        sql: {
          type: "string",
          minLength: 1,
          maxLength: 20000,
          description: "One SELECT, on a dashboard, with $1, $2 as parameters.",
        },
        values: { type: "array", maxItems: 20 },
      },
      required: ["sql"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        record: { const: "this", description: "The record the page was opened on." },
      },
      required: ["record"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        selected: {
          type: "string",
          pattern: SLUG,
          description: "The row chosen in a table or list of the page, by that widget's id.",
        },
      },
      required: ["selected"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        own: {
          type: "object",
          description: "The current user's own row of a table.",
          properties: {
            table: { type: "string", pattern: PATH, maxLength: 255, description: "The table." },
            by: {
              type: "string",
              pattern: COLUMN,
              description: "The column that holds the user's email.",
            },
          },
          required: ["table", "by"],
          additionalProperties: false,
        },
      },
      required: ["own"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        approvals: {
          type: "object",
          description:
            "The approval steps of the workspace's flows that wait for a decision, for a member who may read them.",
          properties: {
            flows: {
              type: "array",
              maxItems: 20,
              uniqueItems: true,
              items: { type: "string", pattern: PATH, maxLength: 255 },
              description: "The flows, by path. Left out: every flow with an approval step.",
            },
            whose: {
              enum: ["mine", "all"],
              description:
                "`mine` lists only those the viewer may decide; `all` every one they may read.",
            },
          },
          additionalProperties: false,
        },
      },
      required: ["approvals"],
      additionalProperties: false,
    },
  ],
} as const;

const dataInputSchema = {
  type: "object",
  properties: {
    source: {
      ...sourceSchema,
      description:
        "What it reads: a table from menus, a saved query, SQL on a dashboard, or the page's record.",
    },
    filters: {
      description:
        "The page's filters that narrow it, each by the column it narrows or the parameter it fills.",
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            pattern: NAME,
            description:
              "The filter, by its name, as a Search and filter widget on the page declares it.",
          },
          column: {
            type: "string",
            pattern: COLUMN,
            description: "For a table read from menus: the column the filter narrows.",
          },
          columns: {
            description:
              "For a search over a table read from menus: the columns it looks in. A row is kept when any holds the words.",
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", pattern: COLUMN },
          },
          parameter: {
            type: "string",
            pattern: "^(\\$[0-9]{1,2}|[a-z][a-z0-9_]{0,54})$",
            description: "For a saved query or SQL: the parameter the filter fills.",
          },
          part: {
            enum: ["from", "to"],
            description:
              "For a range of dates filling a query: whether this parameter is its first day or its last.",
          },
        },
        required: ["filter"],
        additionalProperties: false,
      },
    },
  },
  required: ["source"],
  additionalProperties: false,
} as const;

export const pageFilterSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      pattern: NAME,
      description: "What the page's widgets name the filter by, and its key in the address.",
    },
    label: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      description: "What the reader sees above the filter. Left out, the name.",
    },
    type: {
      enum: [...PAGE_FILTER_TYPES],
      description: "What is chosen: a stretch of days, a choice, a number or text.",
    },
    default: { description: "What the filter holds until the reader changes it." },
    choices: {
      description: "The values a choice filter offers, when they are listed here.",
      type: "array",
      maxItems: 200,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
    from: {
      description: "The column a choice filter offers the values of, read as the reader may.",
      type: "object",
      properties: {
        table: {
          type: "string",
          pattern: PATH,
          maxLength: 255,
          description: "The table of that column.",
        },
        column: {
          type: "string",
          pattern: "^[a-z][a-z0-9_]{0,62}$",
          description: "The column whose values are offered.",
        },
      },
      required: ["table", "column"],
      additionalProperties: false,
    },
  },
  required: ["name", "type"],
  additionalProperties: false,
} as const;

/** A place on a grid of twelve columns, in cells. */
const placeSchema = {
  type: "object",
  properties: {
    x: {
      type: "integer",
      minimum: 0,
      maximum: PAGE_COLUMNS - 1,
      description: "The column it starts at, from 0.",
    },
    y: {
      type: "integer",
      minimum: 0,
      maximum: MAX_PAGE_ROWS - 1,
      description: "The row it starts at, from 0.",
    },
    w: {
      type: "integer",
      minimum: 1,
      maximum: PAGE_COLUMNS,
      description: "How many columns wide it is.",
    },
    h: {
      type: "integer",
      minimum: 1,
      maximum: MAX_WIDGET_HEIGHT,
      description: "How many rows tall it is.",
    },
  },
  required: ["x", "y", "w", "h"],
  additionalProperties: false,
} as const;

export const pageWidgetSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      pattern: SLUG,
      description: "Names the widget on its page: what an action and a filter point at.",
    },
    type: {
      type: "string",
      pattern: TYPE,
      description: "The widget, by its pack and name, as core/chart.",
    },
    title: {
      type: "string",
      maxLength: 100,
      description: "The heading drawn on the widget. Left out, it has none.",
    },
    subtitle: { type: "string", maxLength: 200, description: "A line under the heading." },
    at: {
      ...placeSchema,
      description: "Where it sits on the page's grid of twelve columns, and its size.",
    },
    data: {
      description:
        "What the widget reads, by the name of each input its definition declares, read on the server as the reader may.",
      type: "object",
      maxProperties: 4,
      propertyNames: { pattern: "^[a-z][a-zA-Z0-9]{0,40}$" },
      additionalProperties: dataInputSchema,
    },
    config: {
      type: "object",
      description: "The widget's settings, checked against its definition's schema.",
    },
    on: {
      description:
        "What happens when the widget raises an event (a row clicked, a point clicked): an action, by the event's name.",
      type: "object",
      maxProperties: 10,
      propertyNames: { pattern: "^[a-z][a-zA-Z0-9]{0,40}$" },
      additionalProperties: actionSchema,
    },
    rules: {
      ...widgetRulesSchema,
      description:
        "When the widget is shown. Hiding a widget isn't security: the rows a person gets are decided by the tables' row rules.",
    },
    layout: {
      type: "object",
      description:
        "How it is placed on smaller screens: tablet and phone made from the desktop or placed by hand, what narrow screens do with it, and its priority when the page stacks.",
      properties: {
        tablet: {
          type: "object",
          description:
            "Placed by hand on a tablet. Left out, its place is made from the desktop's.",
          properties: { at: { ...placeSchema, description: "Its place on a tablet." } },
          required: ["at"],
          additionalProperties: false,
        },
        phone: {
          type: "object",
          description: "Placed by hand on a phone. Left out, its place is made from the desktop's.",
          properties: { at: { ...placeSchema, description: "Its place on a phone." } },
          required: ["at"],
          additionalProperties: false,
        },
        narrow: {
          enum: ["keep", "full", "stack", "hide"],
          description:
            "On narrow screens: keep its share of the row, take the full width, be stacked below the rest, or be hidden. Left out, it is automatic.",
        },
        priority: {
          type: "integer",
          minimum: -10,
          maximum: 10,
          description: "When the page stacks, what is higher is kept nearer the top.",
        },
      },
      additionalProperties: false,
    },
    in: {
      type: "object",
      description:
        "The Section, or the tab of Tabs, the widget is placed in. Its place is then on that container's own grid.",
      properties: {
        widget: { type: "string", pattern: SLUG, description: "The container, by its id." },
        tab: {
          type: "string",
          pattern: SLUG,
          description: "For Tabs: the tab it is on, by its id.",
        },
      },
      required: ["widget"],
      additionalProperties: false,
    },
  },
  required: ["id", "type", "at"],
  additionalProperties: false,
} as const;

const widgetsSchema = {
  type: "array",
  maxItems: MAX_PAGE_WIDGETS,
  items: pageWidgetSchema,
} as const;

export const pageSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      pattern: SLUG,
      description: "Names the page in the app's address and in an action that opens it.",
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      description: "The page's name in the menu and over its sheet or modal.",
    },
    kind: {
      enum: [...PAGE_KINDS],
      description:
        "A page in the menu, or one that opens on a record: a record page, a side sheet or a modal.",
    },
    record: {
      description: "The table whose row a record page, side sheet or modal opens on.",
      type: "object",
      properties: {
        table: { type: "string", pattern: PATH, maxLength: 255, description: "The table." },
      },
      required: ["table"],
      additionalProperties: false,
    },
    help: {
      type: "string",
      minLength: 1,
      maxLength: 255,
      description: "A topic of the workspace's documentation, shown by the page's Help button.",
    },
    size: {
      enum: [...PAGE_SIZES],
      description: "For a side sheet or a modal: how big it opens.",
    },
    icon: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{0,40}$",
      description: "The icon beside the page in the app's menu, by its name in the kit's set.",
    },
    widgets: { ...widgetsSchema, description: "What is on the page." },
  },
  required: ["id", "title", "widgets"],
  additionalProperties: false,
} as const;

export const interfaceBodySchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      description: "The app's name, over its pages.",
    },
    description: {
      type: "string",
      maxLength: 500,
      description: "What the app is for, for those who build it.",
    },
    pages: {
      type: "array",
      minItems: 1,
      maxItems: MAX_PAGES,
      items: pageSchema,
      description: "The app's pages, in the order of its menu.",
    },
  },
  required: ["title", "pages"],
  additionalProperties: false,
} as const;

export const dashboardBodySchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100, description: "The dashboard's name." },
    description: {
      type: "string",
      maxLength: 500,
      description: "What the dashboard is for, under its name.",
    },
    refresh: {
      enum: [...DASHBOARD_REFRESH],
      description: "How often an open dashboard reads its widgets again.",
    },
    widgets: { ...widgetsSchema, description: "What is on the dashboard." },
  },
  required: ["widgets"],
  additionalProperties: false,
} as const;

/** Pages built in the console with no code, served by an app that names the interface. */
export const interfaceKind: KindDefinition = {
  kind: "interface",
  schemaVersion: 2,
  body: interfaceBodySchema,
};

/** A dashboard kept as a resource: versioned, deployed and promoted with the rest of a workspace. */
export const dashboardKind: KindDefinition = {
  kind: "dashboard",
  schemaVersion: 3,
  body: dashboardBodySchema,
};

// ---------------------------------------------------------------------------
// Checks beyond the schema

/** The widgets the platform knows: the core pack and the platform's other packs (labs). */
const platformPacks = (): WidgetRegistry => new WidgetRegistry([...CORE_WIDGETS, ...LABS_WIDGETS]);
let platformWidgets: WidgetRegistry = platformPacks();

/** The registry pages are checked against. A pack the platform ships is added once, at start. */
export function widgetRegistry(): WidgetRegistry {
  return platformWidgets;
}

/** Adds a pack's definitions to the registry pages are checked against. */
export function registerWidgets(definitions: Iterable<WidgetDefinition>): void {
  for (const definition of definitions) {
    if (!platformWidgets.get(definition.type)) platformWidgets.add(definition);
  }
}

/** For tests: back to the platform's packs alone. */
export function resetWidgets(): void {
  platformWidgets = platformPacks();
}

const configAjv = new Ajv2020({ allErrors: true, strict: false });
configAjv.addKeyword("x-volvel");
const configCheckers = new WeakMap<WidgetDefinition, ReturnType<typeof configAjv.compile>>();
function configChecker(definition: WidgetDefinition) {
  let check = configCheckers.get(definition);
  if (!check) {
    check = configAjv.compile(definition.config);
    configCheckers.set(definition, check);
  }
  return check;
}

// Compiled when first needed: a module that only imports this file for its types or helpers
// compiles nothing (a served app's policy refuses eval).
let actionCompiled: ReturnType<typeof configAjv.compile> | undefined;
const actionChecker = (value: unknown) => {
  actionCompiled ??= configAjv.compile(actionSchema);
  const ok = actionCompiled(value) as boolean;
  actionChecker.errors = actionCompiled.errors;
  return ok;
};
actionChecker.errors = undefined as typeof configAjv.errors;
/** Whether an action kept in a widget's configuration has an action's shape; what is wrong is said. */
function validAction(
  value: unknown,
  at: string,
  say: (path: string, message: string) => void,
): boolean {
  if (actionChecker(value)) return true;
  for (const error of actionChecker.errors ?? [])
    say(`${at}${error.instancePath}`, error.message ?? "is not allowed");
  return false;
}

/** The name a group has in a visual query's result: its column, and its period when it has one. */
export function groupName(group: { column: string; bucket?: string }): string {
  const base = group.column.replace(".", "_");
  return group.bucket ? `${base}_${group.bucket}` : base;
}

/** Every table a data input reads from menus. A saved query or SQL names its own. */
export function inputTables(input: DataInput): string[] {
  if ("own" in input.source) return [input.source.own.table];
  return "visual" in input.source ? [input.source.visual.table] : [];
}

/** Every flow a set of widgets asks the approvals of, by path. */
export function widgetFlows(widgets: readonly PageWidget[]): string[] {
  return [
    ...new Set(
      widgets.flatMap((widget) =>
        Object.values(widget.data ?? {}).flatMap((input) =>
          "approvals" in input.source ? (input.source.approvals.flows ?? []) : [],
        ),
      ),
    ),
  ];
}

/**
 * Flows an approvals widget names that have no approval step, so that nothing will ever wait
 * there. Not an error (the flow may gain a step); for the Publish check to say.
 */
export function flowsWithoutApprovals(
  widgets: readonly PageWidget[],
  flowOf: (path: string) => { nodes: readonly { type: string }[] } | null | undefined,
): string[] {
  return widgetFlows(widgets).filter((path) => {
    const flow = flowOf(path);
    return flow ? !flow.nodes.some((node) => node.type === "approval") : false;
  });
}

/** Every table the widgets read from menus. */
export function widgetTables(widgets: readonly PageWidget[]): string[] {
  return [
    ...new Set(widgets.flatMap((widget) => Object.values(widget.data ?? {}).flatMap(inputTables))),
  ];
}

/** Every table an interface's pages read from menus. */
export function interfaceTables(body: InterfaceBody): string[] {
  return widgetTables(body.pages.flatMap((page) => page.widgets));
}

/** Every saved query a set of widgets reads. */
export function widgetQueries(widgets: readonly PageWidget[]): string[] {
  return [
    ...new Set(
      widgets.flatMap((widget) =>
        Object.values(widget.data ?? {}).flatMap((input) =>
          "query" in input.source ? [input.source.query] : [],
        ),
      ),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Filters and containers: what a page's widgets give it

let filterCompiled: ReturnType<typeof configAjv.compile> | undefined;
/** Whether a filter a Search and filter widget declares has a filter's shape. */
function validFilter(value: unknown, at: string, say: (path: string, message: string) => void) {
  filterCompiled ??= configAjv.compile(pageFilterSchema);
  if (filterCompiled(value)) return true;
  for (const error of filterCompiled.errors ?? [])
    say(`${at}${error.instancePath}`, error.message ?? "is not allowed");
  return false;
}

export {
  CONTAINER_HEAD_ROWS,
  childrenOf,
  containerHeight,
  FILTER_WIDGET,
  headRows,
  tabsOf,
  topLevel,
} from "./parts.js";

/** The widgets of a page that set its filters: those whose definition's role is `filters`. */
export const filterWidgets = (
  widgets: readonly PageWidget[],
  registry: WidgetRegistry = platformWidgets,
): PageWidget[] => parts.filterWidgets(widgets, registry);

/** The filters whoever reads the page sets, from its Search and filter widgets. */
export const filtersOf = (
  widgets: readonly PageWidget[],
  registry: WidgetRegistry = platformWidgets,
): PageFilter[] => parts.filtersOf(widgets, registry);

/** Whether a widget holds others: its definition's role is `container`. */
export const isContainer = (
  widget: Pick<PageWidget, "type">,
  registry: WidgetRegistry = platformWidgets,
): boolean => parts.isContainer(widget, registry);

export interface CheckContext {
  /** The page the widgets are on, and the interface's other pages: what actions open and read. */
  page?: Page;
  pages?: readonly Page[];
  /** Where the page is offered: an app's, or a dashboard's. */
  surface: "app" | "dashboard";
  /** A table's definition, when it is known. A table made in the console is in no bundle, and is not checked. */
  tableOf?: (path: string) => TableBody | undefined;
  registry?: WidgetRegistry;
  /**
   * A flow by its path, when the bundle or workspace knows it: its nodes. `null` when it is
   * known not to be there. Left out, flows are not checked.
   */
  flowOf?: (path: string) => { nodes: readonly { type: string }[] } | null | undefined;
  /**
   * The page is being made, not deployed: a widget still waiting for its source is
   * allowed, and drawn as waiting. A member's own dashboard is kept this way; what is
   * deployed is not.
   */
  incomplete?: boolean;
}

const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/;
const isDayText = (value: unknown) =>
  typeof value === "string" &&
  DAY_TEXT.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** What is wrong with a `last` or `between` condition's value or column, or nothing. `type` is null or undefined when not known. */
export function conditionProblem(
  condition: VisualCondition,
  type: string | null | undefined,
): string | undefined {
  const { op, value } = condition;
  if (op === "last") {
    const v = value as Partial<LastValue> | null | undefined;
    if (
      typeof v !== "object" ||
      v === null ||
      !Number.isInteger(v.count) ||
      (v.count as number) < 1 ||
      (v.count as number) > 1000 ||
      !(LAST_UNITS as readonly unknown[]).includes(v.unit)
    ) {
      return '"last" needs { count: 1 to 1000, unit: day, week, month, quarter or year }';
    }
    if (type && type !== "date" && type !== "timestamp") {
      return `"last" is for a date or a time, and "${condition.column}" is of type ${type}`;
    }
  } else if (op === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      return '"between" needs [from, to]';
    }
    const [from, to] = value as unknown[];
    const days = isDayText(from) && isDayText(to);
    const numbers =
      typeof from === "number" && typeof to === "number" && Number.isFinite(from + to);
    if (!days && !numbers) return '"between" needs two days (YYYY-MM-DD) or two numbers';
    if ((from as string | number) > (to as string | number))
      return '"between" ends before it begins';
    if (type) {
      const temporal = type === "date" || type === "timestamp";
      const numeric = type === "integer" || type === "number";
      if ((days && !temporal) || (numbers && !numeric)) {
        return `${days ? "days" : "numbers"} do not fit a column of type ${type}`;
      }
      if (!temporal && !numeric)
        return `"between" is for a date, a time or a number, not a column of type ${type}`;
    }
  }
  return undefined;
}

/**
 * What is wrong with a page's widgets and filters that their shape alone does
 * not show: a type no pack declares, a widget offered elsewhere, a
 * configuration its definition refuses, a data input missing or extra, a
 * filter that isn't there, a column a known table doesn't have.
 */
export function checkWidgets(
  widgets: readonly PageWidget[],
  context: CheckContext,
  at = "/body",
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const registry = context.registry ?? platformWidgets;
  const filters = filtersOf(widgets, registry);
  const byName = new Map<string, PageFilter>();
  // Each filter is declared once on the page, whichever widget declares it; and no more than eight.
  widgets.forEach((widget, index) => {
    if (registry.get(widget.type)?.role !== "filters") return;
    const declared = widget.config?.filters;
    if (!Array.isArray(declared)) return;
    declared.forEach((filter, which) => {
      const path = `${at}/widgets/${index}/config/filters/${which}`;
      const say = (where: string, message: string) => issues.push({ path: where, message });
      if (!validFilter(filter, path, say)) return;
      const one = filter as PageFilter;
      if (byName.has(one.name)) say(`${path}/name`, `the page has another filter "${one.name}"`);
      else byName.set(one.name, one);
      if (one.type === "search" && one.default !== undefined && typeof one.default !== "string")
        say(`${path}/default`, "a search starts with words, or with none");
    });
  });
  if (filters.length > MAX_PAGE_FILTERS) {
    issues.push({ path: at, message: `a page has at most ${MAX_PAGE_FILTERS} filters` });
  }
  // What a widget is placed in is a container on this page, one level deep, and on one of its tabs.
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  for (const [index, widget] of widgets.entries()) {
    if (!widget.in) continue;
    const path = `${at}/widgets/${index}/in`;
    const say = (where: string, message: string) => issues.push({ path: where, message });
    const holder = byId.get(widget.in.widget);
    if (!holder) {
      say(`${path}/widget`, `there is no widget "${widget.in.widget}" on the page`);
      continue;
    }
    if (registry.get(holder.type)?.role !== "container") {
      say(`${path}/widget`, `"${holder.id}" holds no widgets: only a Section or Tabs do`);
      continue;
    }
    if (holder.in) {
      say(path, "a container's widgets are one level deep: it is in another");
      continue;
    }
    if (registry.get(widget.type)?.role === "container")
      say(path, "a Section or Tabs is never placed in another");
    const tabs = parts.tabsOf(holder);
    if (tabs.length > 0) {
      if (!widget.in.tab) say(path, `says which tab of "${holder.id}" it is on`);
      else if (!tabs.some((tab) => tab.id === widget.in?.tab))
        say(`${path}/tab`, `"${holder.id}" has no tab "${widget.in.tab}"`);
    } else if (widget.in.tab) say(`${path}/tab`, `"${holder.id}" has no tabs`);
  }

  const columnType = (table: string, column: string): string | null | undefined => {
    const known = context.tableOf?.(table);
    if (!known) return null;
    if ((SYSTEM_COLUMNS as readonly string[]).includes(column))
      return column === "id" ? "uuid" : "timestamp";
    if (column.includes(".")) return null; // a joined table's column is checked when the query is compiled
    return known.columns[column]?.type;
  };

  /** A record an action or a condition names is there: `this` on a page opened on one, `event` from an event that gives one. */
  const recordThere = (of: RecordRef, eventGivesRecord: boolean) =>
    of === "this" ? context.page?.record !== undefined : eventGivesRecord;
  const tableOfRef = (of: RecordRef, eventTable: string | undefined) =>
    of === "this" ? context.page?.record?.table : eventTable;

  function checkConditions(
    conditions: readonly Condition[] | undefined,
    path: string,
    eventGivesRecord: boolean,
    say: (path: string, message: string) => void,
  ) {
    for (const [index, one] of (conditions ?? []).entries()) {
      if ("user" in one) continue;
      const of = one.of ?? "this";
      if (!recordThere(of, eventGivesRecord)) {
        say(
          `${path}/${index}`,
          of === "this" ? "this page opens on no record" : "this event gives no record",
        );
      }
    }
    void conditionFields;
  }

  function checkAction(
    action: Action,
    path: string,
    eventGivesRecord: boolean,
    say: (path: string, message: string) => void,
    /** What else is asked for: a form's fields, by their columns. */
    typed: readonly string[] = [],
    /** Whether the event clicks a group (a point, a cell): `narrow` takes its value from one. */
    eventGivesGroup = false,
    /** Whether the widget reads a table, which is all that has rows behind a figure. */
    readsTable = true,
  ) {
    checkConditions(action.when, `${path}/when`, eventGivesRecord, say);
    // An unfinished action is kept in a draft; it is said here, and publishing refuses it.
    if (action.steps.length === 0) say(`${path}/steps`, "must NOT have fewer than 1 items");
    const asked = new Set([...(action.confirm?.ask ?? []).map((field) => field.name), ...typed]);
    action.steps.forEach((step, index) => {
      const at = `${path}/steps/${index}`;
      if (
        context.surface === "dashboard" &&
        step.do !== "rows" &&
        step.do !== "narrow" &&
        step.do !== "message"
      ) {
        say(at, "a dashboard only reads: it can narrow, say, or show the rows behind a number");
        return;
      }
      const values =
        step.do === "update" || step.do === "create"
          ? step.set
          : step.do === "flow" || step.do === "script"
            ? (step.input ?? {})
            : {};
      for (const [name, value] of Object.entries(values)) {
        if ("asked" in value && !asked.has(value.asked)) {
          say(
            `${at}/${step.do === "update" || step.do === "create" ? "set" : "input"}/${name}`,
            `asks for "${value.asked}", which the confirmation doesn't`,
          );
        }
        if ("record" in value && !recordThere(value.of ?? "this", eventGivesRecord)) {
          say(`${at}/set/${name}`, "reads a record that isn't there");
        }
      }
      if (step.do === "update" || step.do === "delete") {
        if (!recordThere(step.record, eventGivesRecord)) {
          say(
            `${at}/record`,
            step.record === "this" ? "this page opens on no record" : "this event gives no record",
          );
        }
        const table = tableOfRef(step.record, undefined);
        if (step.do === "update" && table) {
          for (const field of Object.keys(step.set)) {
            if (columnType(table, field) === undefined) {
              say(`${at}/set/${field}`, `there is no column "${field}" in the table "${table}"`);
            }
          }
        }
      }
      if (step.do === "create") {
        for (const field of Object.keys(step.set)) {
          if (columnType(step.table, field) === undefined) {
            say(`${at}/set/${field}`, `there is no column "${field}" in the table "${step.table}"`);
          }
        }
      }
      if (step.do === "open") {
        const target = context.pages?.find((one) => one.id === step.page);
        if (context.pages && !target) {
          say(`${at}/page`, `there is no page "${step.page}"`);
        } else if (
          target &&
          (target.kind === "record" || target.kind === "sheet") &&
          !step.record
        ) {
          say(`${at}/record`, `"${target.title}" opens on a record: say which`);
        } else if (step.record && !recordThere(step.record, eventGivesRecord)) {
          say(
            `${at}/record`,
            step.record === "this" ? "this page opens on no record" : "this event gives no record",
          );
        }
      }
      if (
        step.do === "close" &&
        (context.page?.kind ?? "page") !== "sheet" &&
        context.page?.kind !== "modal"
      ) {
        say(at, "only a side sheet or a modal can be closed");
      }
      if (step.do === "rows" && !readsTable) {
        say(
          at,
          "shows the rows behind a figure, and this widget reads a saved query or SQL: only a table has rows behind it",
        );
      }
      if (step.do === "narrow" && !eventGivesGroup) {
        say(
          at,
          "narrows the page by what was clicked, and this event clicks no group (a point or a cell does)",
        );
      }
      if (step.do === "narrow" && !byName.has(step.filter)) {
        say(`${at}/filter`, `the page has no filter "${step.filter}"`);
      }
    });
  }

  const ids = new Set<string>();
  widgets.forEach((widget, index) => {
    const here = `${at}/widgets/${index}`;
    const say = (path: string, message: string) => issues.push({ path: `${here}${path}`, message });
    if (ids.has(widget.id)) say("/id", `"${widget.id}" is used twice`);
    ids.add(widget.id);
    if (widget.at.x + widget.at.w > PAGE_COLUMNS) {
      say(
        "/at",
        `it starts at column ${widget.at.x + 1} and is ${widget.at.w} wide, which is past the twelfth`,
      );
    }

    const definition = registry.get(widget.type);
    if (!definition) {
      say("/type", `there is no widget called "${widget.type}"`);
      return;
    }
    if (!definition.surfaces.includes(context.surface)) {
      say(
        "/type",
        `${definition.title} can't be used on ${context.surface === "app" ? "an app's page" : "a dashboard"}`,
      );
    }
    const { min, max } = definition.layout;
    if (widget.at.w < min.w || widget.at.h < min.h) {
      say("/at", `${definition.title} is at least ${min.w} wide and ${min.h} high`);
    }
    if (max && (widget.at.w > max.w || widget.at.h > max.h)) {
      say("/at", `${definition.title} is at most ${max.w} wide and ${max.h} high`);
    }

    const check = configChecker(definition);
    if (!check(widget.config ?? {})) {
      for (const error of check.errors ?? []) {
        say(`/config${error.instancePath}`, error.message ?? "is not allowed");
      }
    }

    const data = widget.data ?? {};
    for (const name of Object.keys(data)) {
      if (!(name in definition.data))
        say(`/data/${name}`, `${definition.title} takes no data called "${name}"`);
    }
    for (const [name, declared] of Object.entries(definition.data)) {
      const input = data[name];
      const where = `/data/${name}`;
      if (!input) {
        if (declared.required !== false && !context.incomplete)
          say(where, `${definition.title} needs ${declared.label ?? "a source"} to show`);
        continue;
      }
      const source = input.source;
      if ("record" in source) {
        // The record the page is open on: only a page opened on a record has one.
        if (!context.page?.record) {
          say(
            `${where}/source`,
            "reads the record the page is open on, and this page opens on none",
          );
        } else if (declared.shape !== "record") {
          say(`${where}/source`, `${definition.title} reads ${declared.shape}, not one record`);
        }
        continue;
      }
      if ("selected" in source || "own" in source) {
        // One record: the row chosen in a table or list of this page, or the user's own row.
        if (declared.shape !== "record") {
          say(`${where}/source`, `${definition.title} reads ${declared.shape}, not one record`);
        } else if ("selected" in source) {
          const from = widgets.find((one) => one.id === source.selected);
          const picks = from && (from.type === "core/table" || from.type === "core/list");
          if (!picks)
            say(
              `${where}/source/selected`,
              `there is no table or list "${source.selected}" on the page`,
            );
          else if (context.surface !== "app")
            say(`${where}/source`, "a dashboard has no row to choose");
        } else {
          if (context.surface !== "app")
            say(`${where}/source`, "a dashboard is read by members, not by a user's own row");
          known2(`${where}/source/own/by`, source.own.table, source.own.by);
        }
        continue;
      }
      if ("approvals" in source) {
        if (declared.shape !== "approvals") {
          say(`${where}/source`, `${definition.title} can't read approvals`);
        } else if (context.surface !== "app") {
          say(`${where}/source`, "approvals are decided in an app, not on a dashboard");
        } else {
          (source.approvals.flows ?? []).forEach((path, which) => {
            if (context.flowOf?.(path) === null)
              say(`${where}/source/approvals/flows/${which}`, `there is no flow "${path}"`);
          });
        }
        continue;
      }
      if (declared.shape === "approvals") {
        say(`${where}/source`, `${definition.title} reads approvals: choose which`);
        continue;
      }
      const kind = "visual" in source ? "table" : "query" in source ? "query" : "sql";
      const allowed = declared.sources ?? ["table", "query", "sql"];
      if (!allowed.includes(kind) || (kind === "sql" && context.surface === "app")) {
        say(
          `${where}/source`,
          kind === "sql"
            ? "SQL is written on dashboards, not on an app's page"
            : `${definition.title} can't read a ${kind}`,
        );
      }
      if ("visual" in source) {
        const visual = source.visual;
        const measures = visual.measures ?? [];
        const groups = visual.groupBy ?? [];
        if (declared.shape === "summary") {
          const values = declared.values ?? { min: 1, max: 1 };
          const breakdowns = declared.breakdowns ?? { min: 0, max: 1 };
          // While a page is being made, too few is a widget not finished, not a mistake.
          const few = (count: number, least: number) => count < least && !context.incomplete;
          if (few(measures.length, values.min) || measures.length > values.max) {
            say(
              `${where}/source/visual/measures`,
              values.min === values.max
                ? `works out ${values.min === 1 ? "one value" : `${values.min} values`}`
                : `works out ${values.min} to ${values.max} values`,
            );
          }
          if (few(groups.length, breakdowns.min) || groups.length > breakdowns.max) {
            say(
              `${where}/source/visual/groupBy`,
              breakdowns.max === 0
                ? "isn't broken down"
                : `is broken down ${breakdowns.min === breakdowns.max ? `${breakdowns.min}` : `${breakdowns.min} to ${breakdowns.max}`} way${breakdowns.max === 1 ? "" : "s"}`,
            );
          }
        } else if (measures.length > 0 && declared.shape === "record") {
          say(`${where}/source/visual/measures`, "one record has no values worked out");
        }
        const names = measures.map((measure) => measure.as);
        if (new Set(names).size !== names.length)
          say(`${where}/source/visual/measures`, "two values have the same name");
        measures.forEach((measure, which) => {
          if (measure.fn !== "count" && !measure.column) {
            say(`${where}/source/visual/measures/${which}`, `${measure.fn} is of a column`);
          }
        });
        const table = visual.table;
        const known = (path: string, column: string) => {
          if (columnType(table, column) === undefined)
            say(path, `there is no column "${column}" in the table "${table}"`);
        };
        for (const [which, measure] of measures.entries()) {
          if (measure.column)
            known(`${where}/source/visual/measures/${which}/column`, measure.column);
        }
        for (const [which, group] of groups.entries()) {
          known(`${where}/source/visual/groupBy/${which}/column`, group.column);
        }
        for (const [which, condition] of (visual.filters ?? []).entries()) {
          known(`${where}/source/visual/filters/${which}/column`, condition.column);
          const problem = conditionProblem(condition, columnType(table, condition.column));
          if (problem) say(`${where}/source/visual/filters/${which}`, problem);
        }
        for (const [which, column] of (visual.columns ?? []).entries()) {
          known(`${where}/source/visual/columns/${which}`, column);
        }
      }
      (input.filters ?? []).forEach((binding, bound) => {
        const path = `${where}/filters/${bound}`;
        const filter = byName.get(binding.filter);
        if (!filter) {
          say(`${path}/filter`, `the page has no filter "${binding.filter}"`);
          return;
        }
        if ("visual" in source) {
          if (filter.type === "search") {
            const looked = binding.columns ?? (binding.column ? [binding.column] : []);
            if (looked.length === 0) say(path, "says which columns the search looks in");
            for (const column of looked) known2(path, source.visual.table, column);
          } else if (binding.columns)
            say(`${path}/columns`, "only a search looks in several columns");
          else if (!binding.column) say(path, "says which column the filter narrows");
          else known2(path, source.visual.table, binding.column);
        } else if (!binding.parameter) {
          say(path, "says which parameter the filter fills");
        } else if (filter.type === "date_range" && !binding.part) {
          say(path, "a range of dates fills two parameters: say whether this is `from` or `to`");
        }
      });
    }
    const compared = widget.config?.compareTo;
    if (typeof compared === "string" && byName.get(compared)?.type !== "date_range") {
      say("/config/compareTo", `is compared across a range of dates, and "${compared}" is not one`);
    }

    // What it does: events it declares, mapped to actions that make sense where they are.
    for (const [event, action] of Object.entries(widget.on ?? {})) {
      const declared = definition.events[event];
      if (!declared) {
        say(`/on/${event}`, `${definition.title} has no event "${event}"`);
        continue;
      }
      checkAction(
        action,
        `/on/${event}`,
        declared.gives === "record",
        say,
        [],
        declared.gives === "group",
        readsTables(widget.data),
      );
    }
    for (const [property, schema] of Object.entries(definition.config.properties)) {
      const control = schema["x-volvel"]?.control;
      const held = widget.config?.[property];
      if (control === "fields" && Array.isArray(held)) {
        // What a form's field starts with must be a value its column can hold.
        const of = schema["x-volvel"]?.of;
        const visual = of
          ? (data[of]?.source as { visual?: { table: string } })?.visual
          : undefined;
        held.forEach((field, index) => {
          const one = field as {
            column?: string;
            initial?: { kind: string; as?: string; value?: unknown };
          };
          if (!one.initial || !visual || typeof one.column !== "string") return;
          const type = columnType(visual.table, one.column);
          if (type === undefined || type === null) return;
          const at = `/config/${property}/${index}/initial`;
          if (one.initial.kind === "today" && type !== "date" && type !== "timestamp")
            say(at, `"today" starts a date or a timestamp, and "${one.column}" is ${type}`);
          else if (one.initial.kind === "me" && type !== "text" && type !== "uuid")
            say(
              at,
              `the person filling it in goes in a text column, and "${one.column}" is ${type}`,
            );
          else if (one.initial.kind === "value" && !startFits(type, one.initial.value))
            say(at, `the value does not fit the ${type} column "${one.column}"`);
        });
      }
      if (control === "action" && held && typeof held === "object") {
        // A form's submit asks for what is typed into its fields: their columns.
        const typed = Object.entries(definition.config.properties)
          .filter(([, one]) => one["x-volvel"]?.control === "fields")
          .flatMap(([name]) => {
            const list = widget.config?.[name];
            return Array.isArray(list)
              ? list.flatMap((one) =>
                  typeof (one as { column?: unknown }).column === "string"
                    ? [(one as { column: string }).column]
                    : [],
                )
              : [];
          });
        if (validAction(held, `/config/${property}`, say)) {
          checkAction(held as Action, `/config/${property}`, false, say, typed);
          // What is typed into a form's fields is saved by its submit, or the form only pretends.
          const saves = (held as Action).steps.some(
            (step) => step.do === "create" || step.do === "update",
          );
          if (typed.length > 0 && !saves) {
            say(
              `/config/${property}`,
              "saves nothing that is typed: add a step that makes or changes the record",
            );
          }
        }
      } else if (control === "actions" && Array.isArray(held)) {
        held.forEach((one, index) => {
          const action = (one as { action?: unknown }).action;
          const at = `/config/${property}/${index}/action`;
          if (action && validAction(action, at, say)) checkAction(action as Action, at, true, say);
        });
      }
    }
    checkConditions(widget.rules?.showWhen, "/rules/showWhen", false, say);

    function known2(path: string, table: string, column: string) {
      if (columnType(table, column) === undefined)
        say(`${path}/column`, `there is no column "${column}" in the table "${table}"`);
    }
  });
  return issues;
}

/** Whether a widget's data comes from a table (or a data source's table): what has rows behind it. */
function readsTables(data: Record<string, { source?: object }> | undefined): boolean {
  const inputs = Object.values(data ?? {});
  return inputs.length === 0 || inputs.some((one) => one.source && "visual" in one.source);
}

/** Whether a form field may start with this value in a column of this type. */
function startFits(type: string, value: unknown): boolean {
  switch (type) {
    case "text":
    case "uuid":
    case "enum":
      return typeof value === "string";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "timestamp":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "integer":
      return Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "enum_list":
      return Array.isArray(value) && value.every((one) => typeof one === "string");
    default:
      return true;
  }
}

/** Checks an interface's pages beyond their schema. */
export function checkInterface(
  body: InterfaceBody,
  tableOf?: (path: string) => TableBody | undefined,
  registry?: WidgetRegistry,
  flowOf?: CheckContext["flowOf"],
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const seen = new Set<string>();
  body.pages.forEach((page, index) => {
    if (seen.has(page.id))
      issues.push({ path: `/body/pages/${index}/id`, message: `"${page.id}" is used twice` });
    seen.add(page.id);
    const kind = page.kind ?? "page";
    if ((kind === "record" || kind === "sheet") && !page.record) {
      issues.push({
        path: `/body/pages/${index}/record`,
        message: "a record page or a side sheet says the table of its record",
      });
    }
    if (kind === "page" && page.record) {
      issues.push({
        path: `/body/pages/${index}/record`,
        message: "a page in the app's menu opens on no record",
      });
    }
    issues.push(
      ...checkWidgets(
        page.widgets,
        {
          surface: "app",
          page,
          pages: body.pages,
          ...(tableOf ? { tableOf } : {}),
          ...(registry ? { registry } : {}),
          ...(flowOf ? { flowOf } : {}),
        },
        `/body/pages/${index}`,
      ),
    );
  });
  return issues;
}

/** Checks a dashboard beyond its schema. */
export function checkDashboard(
  body: DashboardBody,
  tableOf?: (path: string) => TableBody | undefined,
  registry?: WidgetRegistry,
  how: { incomplete?: boolean } = {},
): ManifestIssue[] {
  return checkWidgets(body.widgets, {
    surface: "dashboard",
    ...(tableOf ? { tableOf } : {}),
    ...(registry ? { registry } : {}),
    ...(how.incomplete ? { incomplete: true } : {}),
  });
}

/**
 * A widget of `type` as "Add to page" places it: the definition's default
 * size and configuration, below everything else on the page.
 */
export function newWidget(
  definition: WidgetDefinition,
  id: string,
  below: readonly PageWidget[],
): PageWidget {
  const y = below.reduce((low, widget) => Math.max(low, widget.at.y + widget.at.h), 0);
  return {
    id,
    type: definition.type,
    title: definition.title,
    at: { x: 0, y, w: definition.layout.default.w, h: definition.layout.default.h },
    ...(definition.initialData
      ? { data: structuredClone(definition.initialData) as Record<string, DataInput> }
      : {}),
    ...(definition.defaults ? { config: { ...definition.defaults } } : {}),
  };
}
