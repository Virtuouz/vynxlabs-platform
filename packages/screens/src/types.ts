import type { Step } from "@volvel/manifest";
import type {
  ApprovalsData,
  Choice,
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
  | (ApprovalsData & { followed?: Followed })
  | {
      shape: "rows";
      columns: ColumnInfo[];
      rows: Record<string, unknown>[];
      /** An opaque cursor for the next page, when there is one. */
      next?: string;
      /** With a next page: how many rows there are in all. Sent with the first page. */
      total?: number;
      /** For a reference column: the name of the row each id points to. */
      names?: Record<string, Record<string, string>>;
      followed?: Followed;
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
      followed?: Followed;
    }
  | {
      shape: "record";
      columns: ColumnInfo[];
      record: Record<string, unknown> | null;
      /** For a reference column: the name of the row each id points to, as rows have. */
      names?: Record<string, Record<string, string>>;
      followed?: Followed;
    };

/**
 * A saved query the widget names by a path that answers nothing now, read
 * through the key a deploy recorded (phase 24): `names` is the path the page
 * says, `now` the query's path today.
 */
export interface Followed {
  names: string;
  now: string;
}

/** What the server answers when an action ran: the browser's steps, each with its record as an id. */
export interface ActResponse {
  client: Step[];
  made?: { table: string; id: string };
  message?: string;
}

/**
 * An action that did not run. `fields` says what was wrong with what was typed, by
 * field name; the message is the server's own words.
 */
export class ActionError extends Error {
  readonly status: number | undefined;
  readonly fields: Readonly<Record<string, string>> | undefined;
  constructor(message: string, status?: number, fields?: Record<string, string>) {
    super(message);
    this.name = "ActionError";
    this.status = status;
    this.fields = fields;
  }
}

export interface PageDataClient {
  read(
    widget: string,
    filters: FilterValues,
    options?: {
      input?: string;
      cursor?: string;
      signal?: AbortSignal;
      /**
       * The row last chosen in each table or list of the page, by that widget's id: sent as the
       * `chosen` parameter (JSON) for a widget whose source is `{ selected }`.
       */
      chosen?: Readonly<Record<string, string>>;
      /** A table's rows in the order of this column (`-name` for descending), over all its rows. */
      sort?: string;
      /** With `input`: how many rows to read, in place of the widget's own page (a download reads big ones). */
      size?: number;
    },
  ): Promise<{ inputs: Record<string, WireData> }>;
  /**
   * The values a choice filter offers when the page names a table's column
   * for them (`from`) and lists none: the column's values, as the viewer may
   * read them. Left out, such a filter is typed into.
   */
  options?(filter: string): Promise<readonly (string | { value: string; label: string })[]>;
  /**
   * Runs an action a widget holds, named by where it is (`on/<event>`,
   * `config/<property>`, `config/<property>/<index>/action`), with the records it
   * works on and what was asked. Rejects with an `ActionError` when it did not run.
   * Absent on a host that runs no actions.
   */
  act?(
    widget: string,
    at: string,
    given: {
      records?: { this?: string; event?: string; events?: string[] };
      inputs?: Record<string, unknown>;
    },
  ): Promise<ActResponse>;
  /**
   * Decides a waiting approval an Approvals widget shows, by the item's id; the server checks
   * who may, and records who did. Rejects with an `ActionError` (status 409 when someone
   * decided it first). Absent on a host that decides nothing.
   */
  decide?(
    widget: string,
    id: string,
    decision: "approve" | "reject",
    comment?: string,
  ): Promise<{
    decision: "approve" | "reject";
    title: string;
    flow: { path: string; title: string };
    by: string;
  }>;
  /** What a reference or choice column of a widget's data input offers. */
  choices?(widget: string, input: string, column: string, search: string): Promise<Choice[]>;
  /**
   * The rows behind one group of a summary input, as `rows`, under the page's filters as
   * they are now.
   */
  behind?(
    widget: string,
    input: string,
    group: Readonly<Record<string, unknown>>,
    filters?: FilterValues,
  ): Promise<WireData>;
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
