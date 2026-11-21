import type { InterfaceBody, InterfacePage, WidgetAction, WidgetType } from "@volvel/manifest";
import type { DataClient, TableInfo } from "@volvel/screens";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api.ts";

export interface Listed {
  path: string;
  title: string;
  deployed: boolean;
  draft: boolean;
  removing: boolean;
  /** `code` when the repository manages it: it is changed and removed there. */
  ownership?: string;
  app: string | null;
  pages?: number;
  version?: number | null;
  tables?: string[];
  editedAt?: string | null;
}
export interface DraftAnswer {
  revision: number;
  body: InterfaceBody;
  problems?: { path: string; message: string }[];
}
export interface Column {
  name: string;
  type: string;
  required: boolean;
  references: string | null;
  status?: string;
}

export const SYSTEM: Column[] = [
  { name: "id", type: "uuid", required: true, references: null },
  { name: "created_at", type: "timestamp", required: true, references: null },
  { name: "updated_at", type: "timestamp", required: true, references: null },
];
export const TYPES: { type: WidgetType; label: string; about: string }[] = [
  { type: "table", label: "Table", about: "Rows and columns, or totals" },
  { type: "card", label: "Card", about: "One row, a value a line" },
  { type: "cards", label: "Cards", about: "Each row as a card to choose" },
  { type: "chart", label: "Chart", about: "Bars, lines or a pie" },
  { type: "figure", label: "Figure", about: "One total, large: a count, a sum" },
  { type: "form", label: "Form", about: "Adds a row" },
  { type: "text", label: "Text", about: "Words on the page" },
  { type: "action", label: "Action", about: "A button that starts a script or a flow" },
];
export const FUNCTIONS = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Least" },
  { value: "max", label: "Most" },
];
export const BUCKETS = [
  { value: "", label: "Each value" },
  { value: "day", label: "By day" },
  { value: "week", label: "By week" },
  { value: "month", label: "By month" },
  { value: "year", label: "By year" },
];
export const OPERATORS = [
  { value: "eq", label: "is" },
  { value: "ne", label: "is not" },
  { value: "gt", label: "is more than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "contains", label: "contains" },
  { value: "is_null", label: "is empty" },
];

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * Rows for the builder's preview, read as the member who is building, or as
 * someone in a chosen group would read them.
 */
export function clientFor(root: string, asGroup?: string): DataClient {
  const query = (options: Record<string, unknown>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
      params.set(
        key,
        Array.isArray(value)
          ? value.join(",")
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value),
      );
    }
    const text = params.toString();
    return text ? `?${text}` : "";
  };
  return {
    find: (table, options) =>
      api.get(`${root}/rows/${table}${query({ ...options, ...(asGroup ? { asGroup } : {}) })}`),
    aggregate: (table, options) =>
      api.get(
        `${root}/aggregate/${table}${query({
          group: options.group,
          measure: options.measures,
          filter: options.filter,
          sort: options.sort,
          limit: options.limit,
          ...(asGroup ? { asGroup } : {}),
        })}`,
      ),
    insert: async (table, row) =>
      (await api.post<{ items: Record<string, unknown>[] }>(`${root}/rows/${table}`, row))
        .items[0] as Record<string, unknown>,
    update: (table, id, changes) => api.patch(`${root}/row/${id}/${table}`, changes),
    remove: async (table, id) => {
      await api.delete(`${root}/row/${id}/${table}`);
    },
    // In the builder an action starts for real, as the member building: in a dev workspace.
    start: async (target, input) => {
      const started =
        target.kind === "script"
          ? await api.post<{ id: string }>(`${root}/runs`, { script: target.path, input })
          : await api.post<{ id: string }>(`${root}/flow-runs`, { flow: target.path, input });
      return { kind: target.kind, id: started.id };
    },
    run: (started) =>
      api.get(`${root}/${started.kind === "script" ? "runs" : "flow-runs"}/${started.id}`),
  };
}

/** Every action on a page, with the widget it is on. */
export function pageActions(page: InterfacePage): WidgetAction[] {
  return page.widgets.flatMap((widget) => [
    ...(widget.action ? [widget.action] : []),
    ...(widget.actions ?? []),
  ]);
}
export const keyOf = (action: WidgetAction) => `${action.target.kind}:${action.target.path}`;

/** What each of the named tables holds, fetched once each and kept. */
export function useTables(root: string, names: string[]): Record<string, TableInfo> {
  const [known, setKnown] = useState<Record<string, TableInfo>>({});
  const asked = useRef(new Set<string>());
  const wanted = names.join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `wanted` is the names as one value
  useEffect(() => {
    for (const name of names) {
      if (asked.current.has(name)) continue;
      asked.current.add(name);
      api.get<{ columns: Column[] }>(`${root}/tables/${name}`).then(
        (detail) =>
          setKnown((before) => ({
            ...before,
            [name]: {
              found: true,
              canRead: true,
              canWrite: true,
              columns: [
                ...SYSTEM,
                ...detail.columns
                  .filter((column) => column.status === undefined || column.status === "active")
                  .map((column) => ({
                    name: column.name,
                    type: column.type,
                    required: column.required,
                    references: column.references ?? null,
                  })),
              ],
            },
          })),
        () =>
          setKnown((before) => ({
            ...before,
            [name]: { found: false, canRead: false, canWrite: false, columns: [] },
          })),
      );
    }
  }, [root, wanted]);
  return known;
}

/** Every table a body shows, and every table those refer to, so references can be shown by name. */
export function tablesOf(
  body: InterfaceBody | undefined,
  known: Record<string, TableInfo>,
): string[] {
  const names = new Set<string>();
  for (const page of body?.pages ?? []) {
    for (const widget of page.widgets) {
      if (!widget.table) continue;
      names.add(widget.table);
      for (const column of known[widget.table]?.columns ?? []) {
        if (column.references) names.add(column.references);
      }
    }
  }
  return [...names].sort();
}

// ----- What a widget can follow -----
