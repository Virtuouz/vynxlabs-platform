import type { ManifestIssue } from "./registry.js";
import type { TableBody } from "./table.js";

/**
 * An interface: pages of widgets over a workspace's tables, made in the
 * console with no code. It is the idea of Grist's pages: each widget shows a
 * table, or totals of one, and choosing a row in one widget can decide what
 * another shows.
 */
export interface InterfaceBody {
  title: string;
  description?: string;
  pages: InterfacePage[];
}

export interface InterfacePage {
  id: string;
  title: string;
  widgets: PageWidget[];
  /**
   * Filters over the whole page, set by whoever reads it: a range of dates, or
   * one value. Each narrows every widget whose table has the column.
   */
  filters?: PageFilter[];
}

export const PAGE_FILTER_TYPES = ["date", "value"] as const;
export interface PageFilter {
  id: string;
  label: string;
  column: string;
  type: (typeof PAGE_FILTER_TYPES)[number];
}
export const MAX_PAGE_FILTERS = 4;

export const WIDGET_TYPES = ["table", "card", "cards", "chart", "figure", "form", "text"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
export const SUMMARY_FUNCTIONS = ["count", "sum", "avg", "min", "max"] as const;
export const SUMMARY_BUCKETS = ["day", "week", "month", "year"] as const;
export const LINK_TYPES = ["same", "refersTo", "referredBy", "group"] as const;
export type LinkType = (typeof LINK_TYPES)[number];
export const CHART_MARKS = ["bar", "line", "area", "pie"] as const;

export interface WidgetSummary {
  /** What rows are gathered by. A date or a time can be gathered into periods. */
  groupBy: { column: string; bucket?: (typeof SUMMARY_BUCKETS)[number] }[];
  /** What is worked out for each group, and the name it is shown and charted under. */
  aggregates: { fn: (typeof SUMMARY_FUNCTIONS)[number]; column?: string; as: string }[];
}

export interface WidgetField {
  column: string;
  label?: string;
  /** For a reference: the column of the row it points at to show in place of its ID. */
  show?: string;
  /** Whether the value can be changed here, by someone who may change the row. */
  editable?: boolean;
}

/**
 * What a widget shows follows the row chosen in another widget of the page.
 *
 * - `same`: the chosen row itself, for a card beside a table.
 * - `refersTo`: this widget's rows that point at the chosen row through `via`.
 * - `referredBy`: the row the chosen row points at through its `via`.
 * - `group`: the rows behind the chosen line of a summary.
 */
export interface WidgetLink {
  from: string;
  type: LinkType;
  via?: string;
}

export interface WidgetOptions {
  /** A chart's shape, and which columns or totals it draws. */
  mark?: (typeof CHART_MARKS)[number];
  x?: string;
  y?: string;
  series?: string;
  /** A text widget's words. Plain text. */
  text?: string;
  /** A form's button, and what it says once a row is added. */
  submitLabel?: string;
  success?: string;
  /** Whether rows can be added and deleted from a table or a list of cards. */
  allowAdd?: boolean;
  allowDelete?: boolean;
}

export interface PageWidget {
  id: string;
  title?: string;
  type: WidgetType;
  /** The table it shows. Every kind of widget but text has one. */
  table?: string;
  summary?: WidgetSummary;
  fields?: WidgetField[];
  sort?: { column: string; desc?: boolean }[];
  /** A filter in the rows API's grammar, with literal values. */
  filter?: unknown;
  link?: WidgetLink;
  pageSize?: number;
  options?: WidgetOptions;
  /** Where it sits, on a grid twelve columns wide. */
  at: { x: number; y: number; w: number; h: number };
}

/** The columns every table has. Written here so that this file needs nothing from the kinds. */
const SYSTEM_COLUMNS = ["id", "created_at", "updated_at"];
export const MAX_PAGES = 20;
export const MAX_WIDGETS = 12;
export const MAX_FILTER_CONDITIONS = 20;
const SLUG = "^[a-z][a-z0-9_-]{0,39}$";
const COLUMN = "^[a-z][a-z0-9_]{0,62}$";

const fieldSchema = {
  type: "object",
  properties: {
    column: { type: "string", pattern: COLUMN },
    label: { type: "string", minLength: 1, maxLength: 100 },
    show: { type: "string", pattern: COLUMN },
    editable: { type: "boolean" },
  },
  required: ["column"],
  additionalProperties: false,
};

const widgetSchema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: SLUG },
    title: { type: "string", maxLength: 100 },
    type: { enum: [...WIDGET_TYPES] },
    table: { type: "string", minLength: 1, maxLength: 255 },
    summary: {
      type: "object",
      properties: {
        groupBy: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              column: { type: "string", pattern: COLUMN },
              bucket: { enum: [...SUMMARY_BUCKETS] },
            },
            required: ["column"],
            additionalProperties: false,
          },
        },
        aggregates: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              fn: { enum: [...SUMMARY_FUNCTIONS] },
              column: { type: "string", pattern: COLUMN },
              as: { type: "string", pattern: COLUMN },
            },
            required: ["fn", "as"],
            additionalProperties: false,
          },
        },
      },
      required: ["groupBy", "aggregates"],
      additionalProperties: false,
    },
    fields: { type: "array", maxItems: 50, items: fieldSchema },
    sort: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: { column: { type: "string", pattern: COLUMN }, desc: { type: "boolean" } },
        required: ["column"],
        additionalProperties: false,
      },
    },
    filter: {
      type: "object",
      description:
        "A filter as the rows API takes it: {column, op, value}, or {and: [...]}, or {or: [...]}.",
    },
    link: {
      type: "object",
      properties: {
        from: { type: "string", pattern: SLUG },
        type: { enum: [...LINK_TYPES] },
        via: { type: "string", pattern: COLUMN },
      },
      required: ["from", "type"],
      additionalProperties: false,
    },
    pageSize: { type: "integer", minimum: 5, maximum: 200 },
    options: {
      type: "object",
      properties: {
        mark: { enum: [...CHART_MARKS] },
        x: { type: "string", pattern: COLUMN },
        y: { type: "string", pattern: COLUMN },
        series: { type: "string", pattern: COLUMN },
        text: { type: "string", maxLength: 5000 },
        submitLabel: { type: "string", minLength: 1, maxLength: 60 },
        success: { type: "string", maxLength: 300 },
        allowAdd: { type: "boolean" },
        allowDelete: { type: "boolean" },
      },
      additionalProperties: false,
    },
    at: {
      type: "object",
      properties: {
        x: { type: "integer", minimum: 0, maximum: 11 },
        y: { type: "integer", minimum: 0, maximum: 199 },
        w: { type: "integer", minimum: 1, maximum: 12 },
        h: { type: "integer", minimum: 1, maximum: 40 },
      },
      required: ["x", "y", "w", "h"],
      additionalProperties: false,
    },
  },
  required: ["id", "type", "at"],
  additionalProperties: false,
};

/** One page. A member's own dashboard is one of these. */
export const interfacePageSchema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: SLUG },
    title: { type: "string", minLength: 1, maxLength: 100 },
    widgets: { type: "array", maxItems: MAX_WIDGETS, items: widgetSchema },
    filters: {
      type: "array",
      maxItems: MAX_PAGE_FILTERS,
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: SLUG },
          label: { type: "string", minLength: 1, maxLength: 60 },
          column: { type: "string", pattern: COLUMN },
          type: { enum: [...PAGE_FILTER_TYPES] },
        },
        required: ["id", "label", "column", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["id", "title", "widgets"],
  additionalProperties: false,
};

export const interfaceBodySchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", maxLength: 500 },
    pages: { type: "array", minItems: 1, maxItems: MAX_PAGES, items: interfacePageSchema },
  },
  required: ["title", "pages"],
  additionalProperties: false,
};

const NUMERIC = new Set(["integer", "number"]);
const FILTER_OPS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "is_null"]);

/** The names a widget's rows come back under: its table's columns, or its summary's. */
export function summaryNames(summary: WidgetSummary): string[] {
  return [
    ...summary.groupBy.map((group) => group.column),
    ...summary.aggregates.map((aggregate) => aggregate.as),
  ];
}

/**
 * What is wrong with one page that its shape alone does not show: a widget
 * linked to one that is not there, a link that goes round in a circle, a
 * column the table does not have. `tableOf` gives a table's definition when
 * it is known. A table that is not known is not checked: it may have been
 * made in the console, where no bundle carries it.
 */
export function checkPage(
  page: InterfacePage,
  tableOf: (path: string) => TableBody | undefined,
  at = "/body",
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const byId = new Map<string, PageWidget>();
  page.widgets.forEach((widget, index) => {
    if (byId.has(widget.id)) {
      issues.push({ path: `${at}/widgets/${index}/id`, message: `"${widget.id}" is used twice` });
    }
    byId.set(widget.id, widget);
  });

  /** A column's type, `undefined` when the table has no such column, `null` when the table is not known. */
  const typeOf = (table: string | undefined, name: string): string | null | undefined => {
    const known = table === undefined ? undefined : tableOf(table);
    if (!known) return null;
    if (SYSTEM_COLUMNS.includes(name)) {
      return name === "id" ? "uuid" : "timestamp";
    }
    return known.columns[name]?.type;
  };

  page.widgets.forEach((widget, index) => {
    const here = `${at}/widgets/${index}`;
    const problem = (path: string, message: string) =>
      issues.push({ path: `${here}${path}`, message });
    const column = (path: string, name: string) => {
      const type = typeOf(widget.table, name);
      if (type === undefined) {
        problem(path, `there is no column "${name}" in the table "${widget.table}"`);
      }
      return type;
    };

    if (widget.type === "text") {
      if (!widget.options?.text) problem("/options/text", "a text widget needs its text");
      for (const key of ["table", "summary", "fields", "sort", "filter", "link"] as const) {
        if (widget[key] !== undefined) problem(`/${key}`, "a text widget shows no table");
      }
      return;
    }
    if (widget.table === undefined) {
      problem("/table", `a ${widget.type} widget needs a table`);
      return;
    }
    if (
      widget.summary &&
      widget.type !== "table" &&
      widget.type !== "chart" &&
      widget.type !== "figure"
    ) {
      problem(
        "/summary",
        `only a table, a chart or a figure can show totals, not a ${widget.type} widget`,
      );
    }

    const summary = widget.summary;
    if (summary) {
      const names = summaryNames(summary);
      if (new Set(names).size !== names.length) {
        problem("/summary", "two of its groups and totals have the same name");
      }
      summary.groupBy.forEach((group, n) => {
        const type = column(`/summary/groupBy/${n}/column`, group.column);
        if (type === "json" || type === "file") {
          problem(`/summary/groupBy/${n}/column`, `rows cannot be grouped by a ${type} column`);
        }
        if (group.bucket && type && type !== "timestamp" && type !== "date") {
          problem(
            `/summary/groupBy/${n}/bucket`,
            `"${group.column}" is not a date or a time, so it has no ${group.bucket}s`,
          );
        }
      });
      summary.aggregates.forEach((aggregate, n) => {
        const path = `/summary/aggregates/${n}`;
        if (aggregate.column === undefined) {
          if (aggregate.fn !== "count") problem(path, `"${aggregate.fn}" needs a column`);
          return;
        }
        const type = column(`${path}/column`, aggregate.column);
        if ((aggregate.fn === "sum" || aggregate.fn === "avg") && type && !NUMERIC.has(type)) {
          problem(
            `${path}/column`,
            `"${aggregate.fn}" works on numbers, and "${aggregate.column}" holds ${type}`,
          );
        }
      });
    }
    /** A name the widget's rows have: one of the summary's, or a column of the table. */
    const shown = (path: string, name: string) => {
      if (!summary) return column(path, name);
      if (!summaryNames(summary).includes(name)) {
        problem(path, `"${name}" is not one of this widget's groups or totals`);
      }
      return null;
    };

    (widget.fields ?? []).forEach((field, n) => {
      const type = shown(`/fields/${n}/column`, field.column);
      if (field.show !== undefined) {
        if (type && type !== "reference") {
          problem(`/fields/${n}/show`, `"${field.column}" does not refer to another table`);
        }
        const target = tableOf(widget.table as string)?.columns[field.column]?.references;
        if (target && typeOf(target, field.show) === undefined) {
          problem(
            `/fields/${n}/show`,
            `there is no column "${field.show}" in the table "${target}"`,
          );
        }
      }
      if (field.editable && summary) {
        problem(`/fields/${n}/editable`, "totals cannot be changed");
      }
    });
    (widget.sort ?? []).forEach((entry, n) => {
      shown(`/sort/${n}/column`, entry.column);
    });
    if (widget.filter !== undefined) {
      const count = { n: 0 };
      const walk = (node: unknown, path: string, depth: number) => {
        if (typeof node !== "object" || node === null || Array.isArray(node) || depth > 5) {
          problem(path, "is not a filter");
          return;
        }
        const one = node as Record<string, unknown>;
        for (const joiner of ["and", "or"]) {
          if (joiner in one) {
            const parts = one[joiner];
            if (!Array.isArray(parts) || parts.length === 0) {
              problem(`${path}/${joiner}`, "needs a list of conditions");
            } else {
              parts.forEach((part, n) => {
                walk(part, `${path}/${joiner}/${n}`, depth + 1);
              });
            }
            return;
          }
        }
        count.n += 1;
        if (typeof one.column !== "string") problem(`${path}/column`, "is needed");
        else column(`${path}/column`, one.column);
        if (one.op !== undefined && !FILTER_OPS.has(String(one.op))) {
          problem(`${path}/op`, `there is no operator "${String(one.op)}"`);
        }
      };
      walk(widget.filter, "/filter", 0);
      if (count.n > MAX_FILTER_CONDITIONS) {
        problem(
          "/filter",
          `a widget's filter can have at most ${MAX_FILTER_CONDITIONS} conditions`,
        );
      }
    }

    if (widget.type === "form") {
      if (!widget.fields?.length) problem("/fields", "a form needs at least one field");
    }
    if (widget.type === "figure") {
      if (!summary || summary.aggregates.length === 0)
        problem("/summary", "a figure needs a total to show");
      else if (summary.groupBy.length > 0)
        problem("/summary/groupBy", "a figure shows one total, not one per group");
    }
    if (widget.type === "chart") {
      const options = widget.options ?? {};
      if (!options.mark) problem("/options/mark", "a chart needs a shape");
      for (const key of ["x", "y"] as const) {
        const name = options[key];
        if (!name) problem(`/options/${key}`, `a chart needs what to draw along ${key}`);
        else shown(`/options/${key}`, name);
      }
      if (options.series) shown("/options/series", options.series);
    }

    const link = widget.link;
    if (!link) return;
    const source = byId.get(link.from);
    if (!source || source.id === widget.id) {
      problem("/link/from", `there is no other widget "${link.from}" on this page`);
      return;
    }
    if (
      source.type === "form" ||
      source.type === "text" ||
      source.type === "chart" ||
      source.type === "figure"
    ) {
      problem("/link/from", `a row cannot be chosen in a ${source.type} widget`);
      return;
    }
    if (widget.type === "form" && link.type !== "refersTo") {
      problem("/link/type", "a form can only be linked to the row its new rows will refer to");
    }
    if (link.type === "group") {
      if (!source.summary) problem("/link/from", `"${source.id}" shows rows, not totals`);
      if (source.table !== widget.table) {
        problem("/link/from", `"${source.id}" is over another table`);
      }
      if (summary) problem("/link/type", "totals cannot follow a line of other totals");
      return;
    }
    if (source.summary) {
      problem("/link/type", `"${source.id}" shows totals, which only a "group" link can follow`);
      return;
    }
    if (link.type === "same") {
      if (source.table !== widget.table) {
        problem("/link/from", `"${source.id}" is over another table`);
      }
      if (summary) problem("/link/type", "totals cannot show one chosen row");
      return;
    }
    if (!link.via) {
      problem("/link/via", "says which column joins the two tables");
      return;
    }
    // The column is in this widget's table for `refersTo`, and in the other's for `referredBy`.
    const [holder, target] =
      link.type === "refersTo" ? [widget.table, source.table] : [source.table, widget.table];
    const type = typeOf(holder, link.via);
    if (type === undefined) {
      problem("/link/via", `there is no column "${link.via}" in the table "${holder}"`);
    } else if (type !== null) {
      const points = tableOf(holder as string)?.columns[link.via]?.references;
      if (type !== "reference" || points !== target) {
        problem(
          "/link/via",
          `"${link.via}" of "${holder}" does not refer to the table "${target}"`,
        );
      }
    }
  });

  // A widget that follows another that follows it would never settle.
  for (const widget of page.widgets) {
    const seen = new Set<string>();
    let current: PageWidget | undefined = widget;
    while (current?.link) {
      if (seen.has(current.id)) {
        issues.push({
          path: `${at}/widgets/${page.widgets.indexOf(widget)}/link`,
          message: "its links go round in a circle",
        });
        break;
      }
      seen.add(current.id);
      current = byId.get(current.link.from);
    }
  }
  return issues;
}

/** Every table an interface shows. */
export function interfaceTables(body: InterfaceBody): string[] {
  return [
    ...new Set(
      body.pages.flatMap((page) =>
        page.widgets.map((widget) => widget.table).filter((table): table is string => !!table),
      ),
    ),
  ];
}

export function checkInterface(
  body: InterfaceBody,
  tableOf: (path: string) => TableBody | undefined,
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const seen = new Set<string>();
  body.pages.forEach((page, index) => {
    if (seen.has(page.id)) {
      issues.push({ path: `/body/pages/${index}/id`, message: `"${page.id}" is used twice` });
    }
    seen.add(page.id);
    issues.push(...checkPage(page, tableOf, `/body/pages/${index}`));
  });
  return issues;
}
