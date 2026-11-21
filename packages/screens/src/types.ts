import type {
  ColumnInfo,
  WidgetPack as SdkWidgetPack,
  WidgetDefinition,
  WidgetViewProps,
} from "@volvel/widgets";
import type { ComponentType } from "react";

/** What whoever reads a page set its filters to, by filter name. Absent: the filter's default. `null`: not narrowed. */
export type FilterValues = Record<string, unknown>;

/** What the widget-data endpoint gives for one data input. */
export type WireData =
  | {
      shape: "rows";
      columns: ColumnInfo[];
      rows: Record<string, unknown>[];
      /** An opaque cursor for the next page, when there is one. */
      next?: string;
      /** For a reference column: the name of the row each id points to. */
      names?: Record<string, Record<string, string>>;
    }
  | {
      shape: "summary";
      columns: ColumnInfo[];
      breakdowns: string[];
      values: string[];
      rows: Record<string, unknown>[];
      previous?: Record<string, unknown>[];
      /** For a stat that has a line over time. */
      trend?: { at: string; value: number }[];
    }
  | { shape: "record"; columns: ColumnInfo[]; record: Record<string, unknown> | null };

export interface PageDataClient {
  read(
    widget: string,
    filters: FilterValues,
    options?: { input?: string; cursor?: string; signal?: AbortSignal },
  ): Promise<{ inputs: Record<string, WireData> }>;
  /**
   * The values a choice filter offers when the page names a table's column
   * for them (`from`) and lists none: the column's values, as the viewer may
   * read them. Left out, such a filter is typed into.
   */
  options?(filter: string): Promise<readonly string[]>;
}

/** What a client rejects with when the server said no: its status says which kind of no. */
export class WidgetReadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WidgetReadError";
    this.status = status;
  }
}

/** A pack: the definitions of its widgets, and a view for each. */
// biome-ignore lint/suspicious/noExplicitAny: each view has the configuration type of its own widget
export type WidgetPack = SdkWidgetPack<ComponentType<WidgetViewProps<any>>>;

export interface ViewEntry {
  definition: WidgetDefinition;
  // biome-ignore lint/suspicious/noExplicitAny: each view has the configuration type of its own widget
  View: ComponentType<WidgetViewProps<any>>;
}

/** Every widget type a page may hold, by type: its definition, and the view that draws it. */
export type ViewRegistry = ReadonlyMap<string, ViewEntry>;

/** The registry of the packs given. A type in two packs, or a definition with no view, is a mistake. */
export function viewRegistry(...packs: WidgetPack[]): ViewRegistry {
  const entries = new Map<string, ViewEntry>();
  for (const pack of packs) {
    for (const definition of pack.definitions) {
      if (entries.has(definition.type)) throw new Error(`${definition.type} is in two packs`);
      const View = pack.views[definition.type];
      if (!View) throw new Error(`${definition.type} has a definition but no view`);
      entries.set(definition.type, { definition, View });
    }
  }
  return entries;
}
