import type { InterfaceBody } from "@vynxlabs/manifest";

export type Row = Record<string, unknown>;

/** A condition on rows, as the rows API takes it. */
export type Filter =
  | { and: Filter[] }
  | { or: Filter[] }
  | { column: string; op?: string; value?: unknown };

/** What a screen needs to know of a table before it reads any rows. */
export interface TableInfo {
  /** False when the workspace has no such table. */
  found: boolean;
  canRead: boolean;
  canWrite: boolean;
  columns: { name: string; type: string; required: boolean; references: string | null }[];
}

/** An interface with what its tables hold, as the platform gives it to whoever may open it. */
export interface InterfaceView {
  path: string;
  interface: InterfaceBody;
  tables: Record<string, TableInfo>;
}

export interface Page {
  items: Row[];
  nextCursor: string | null;
}

export interface Totals {
  items: { by: Row; values: Record<string, number | string | null> }[];
  truncated: boolean;
}

/**
 * How a screen reaches rows. The console gives one that calls the API as the
 * member using it, and the app the platform serves gives one made from the
 * app client. Both end at the same routes, so a table's policy decides what
 * each person is given.
 */
export interface DataClient {
  find(
    table: string,
    options: { filter?: Filter; sort?: string[]; limit?: number; cursor?: string },
  ): Promise<Page>;
  aggregate(
    table: string,
    options: {
      group?: string[];
      measures?: string[];
      filter?: Filter;
      sort?: string[];
      limit?: number;
    },
  ): Promise<Totals>;
  insert(table: string, row: Row): Promise<Row>;
  update(table: string, id: string, changes: Row): Promise<Row>;
  remove(table: string, id: string): Promise<void>;
}

/** What a refused request says, read from whatever the client threw. */
export function failure(error: unknown): { message: string; fields: Record<string, string> } {
  const thrown = error as { message?: string; fields?: { path: string; message: string }[] };
  const fields: Record<string, string> = {};
  for (const field of thrown.fields ?? []) {
    const name = field.path.replace(/^\//, "").split("/")[0];
    if (name) fields[name] = field.message;
  }
  return { message: thrown.message ?? "Something went wrong.", fields };
}
