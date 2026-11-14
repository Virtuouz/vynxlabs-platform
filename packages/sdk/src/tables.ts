/** A condition on rows. Combine conditions with `and` and `or`. */
export type Filter =
  | { and: Filter[] }
  | { or: Filter[] }
  | {
      column: string;
      /** Default `eq`. */
      op?: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "is_null";
      value?: unknown;
    };

export interface FindOptions {
  filter?: Filter;
  /** Column names. A leading minus sorts that column downwards. */
  sort?: string[];
  /** At most 1,000. Default 50. */
  limit?: number;
  offset?: number;
}

export interface AggregateOptions {
  /**
   * Columns to group by, up to three. A date or a time can be gathered into
   * periods: `"created_at:month"`, with `day`, `week`, `month` or `year`.
   */
  group?: string[];
  /**
   * Totals to work out, up to five: `"count"`, `"count:column"`, `"sum:column"`,
   * `"avg:column"`, `"min:column"`, `"max:column"`. Without any, rows are counted.
   */
  measures?: string[];
  filter?: Filter;
  /** Names as they come back, a group's or a total's. A leading minus sorts downwards. */
  sort?: string[];
  /** The most groups to return. At most 1,000. Default 200. */
  limit?: number;
}

/** Totals, one item for each group. With no groups there is one item. */
export interface Aggregated {
  items: {
    /** The group's values, under the names in `group`. */
    by: Record<string, unknown>;
    /** The totals, under the names in `measures`. */
    values: Record<string, number | string | null>;
  }[];
  /** True when there were more groups than `limit`. */
  truncated: boolean;
}

/** What every row of a custom table has, whatever its definition. */
export interface SystemColumns {
  id: string;
  created_at: string;
  updated_at: string;
}

/** Reads and writes the rows of one table. */
export interface TableClient<Row, Insert = Partial<Row>> {
  find(options?: FindOptions): Promise<Row[]>;
  /** The row with this ID, or null. */
  get(id: string): Promise<Row | null>;
  insert(row: Insert): Promise<Row>;
  /** Up to 1,000 rows. Either all are inserted or none. */
  insertMany(rows: Insert[]): Promise<Row[]>;
  update(id: string, changes: Partial<Insert>): Promise<Row>;
  delete(id: string): Promise<void>;
  /** Counts, sums, averages, the least and the most, over the rows or over groups of them. */
  aggregate(options?: AggregateOptions): Promise<Aggregated>;
  /**
   * The same table as one person sees it: its row policy applies as it would
   * to them. Without this, a script acts as the workspace and reaches every row.
   */
  as(principalId: string): TableClient<Row, Insert>;
}

export interface ColumnOptions<Required extends boolean = boolean> {
  /** A row must have a value. */
  required?: Required;
  /** No two rows may share a value. */
  unique?: boolean;
  /** Used when a row gives no value, and for existing rows when the column is added. */
  default?: unknown;
  /** The column's previous name. Its data is kept. Without this, a new name is a new, empty column. */
  renamedFrom?: string;
}

/** One column of a table definition. `Value` is its type in a row. */
export interface ColumnSpec<Value, Required extends boolean, Defaulted extends boolean = false> {
  readonly manifest: Record<string, unknown>;
  /** Only for type inference. Never set. */
  readonly __value?: Value;
  readonly __required?: Required;
  /** Whether the column has a default, so a row may be written without it. */
  readonly __defaulted?: Defaulted;
}

/**
 * Whether a column's options make it required. Read from the options object
 * itself: inferring `Required` from the call's expected type would widen it to
 * `boolean` inside `defineTable`, and every column would read as nullable.
 */
type IsRequired<Options> = Options extends { required: true } ? true : false;
/** Whether a column's options give it a default. */
type IsDefaulted<Options> = Options extends { default: NonNullable<unknown> } ? true : false;

function spec<Value>(type: string) {
  return <const Options extends ColumnOptions = Record<never, never>>(
    options: Options = {} as Options,
  ): ColumnSpec<Value, IsRequired<Options>, IsDefaulted<Options>> => ({
    manifest: Object.fromEntries(
      Object.entries({ type, ...options }).filter(([, value]) => value !== undefined),
    ),
  });
}

/** The kinds of column a table can have. */
export const column = {
  text: spec<string>("text"),
  /** A whole number. */
  integer: spec<number>("integer"),
  /** Any number. Store money as an integer of its smallest unit. */
  number: spec<number>("number"),
  boolean: spec<boolean>("boolean"),
  /** A date and time, as an ISO 8601 string. */
  timestamp: spec<string>("timestamp"),
  /** A calendar date, as `YYYY-MM-DD`. */
  date: spec<string>("date"),
  /** Any JSON value. */
  json: spec<unknown>("json"),
  uuid: spec<string>("uuid"),
  /** The ID of a row in another table. */
  reference: <const Options extends ColumnOptions = Record<never, never>>(
    table: string | { path: string },
    options: Options = {} as Options,
  ): ColumnSpec<string, IsRequired<Options>, IsDefaulted<Options>> => ({
    manifest: Object.fromEntries(
      Object.entries({
        type: "reference",
        references: typeof table === "string" ? table : table.path,
        ...options,
      }).filter(([, value]) => value !== undefined),
    ),
  }),
  /** The ID of a stored file. */
  file: spec<string>("file"),
};

type Columns = Record<string, ColumnSpec<unknown, boolean, boolean>>;
type ValueOf<Spec> = Spec extends ColumnSpec<infer Value, boolean, boolean> ? Value : never;
type RequiredKeys<C extends Columns> = {
  [K in keyof C]: C[K] extends ColumnSpec<unknown, true, boolean> ? K : never;
}[keyof C];

/** A row as it is read: every declared column, null where it has no value. */
export type RowOf<C extends Columns> = SystemColumns & {
  [K in keyof C]: K extends RequiredKeys<C> ? ValueOf<C[K]> : ValueOf<C[K]> | null;
};

/** Required columns with no default: a row cannot be written without them. */
type MustGiveKeys<C extends Columns> = {
  [K in keyof C]: C[K] extends ColumnSpec<unknown, true, false> ? K : never;
}[keyof C];

/**
 * A row as it is written: required columns without a default must be given.
 * A required column with a default may be left out, and takes its default.
 */
export type InsertOf<C extends Columns> = { [K in MustGiveKeys<C>]: ValueOf<C[K]> } & {
  [K in Exclude<keyof C, MustGiveKeys<C>>]?: K extends RequiredKeys<C>
    ? ValueOf<C[K]>
    : ValueOf<C[K]> | null;
};
