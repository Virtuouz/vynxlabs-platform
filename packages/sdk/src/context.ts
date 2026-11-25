/** What a script writes its log with. Each line is kept with the run, and the secrets the script uses are masked in it. */
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** What a script knows about the run it is in: its ID, which attempt it is, and a key that stays the same across attempts. */
export interface RunInfo {
  id: string;
  /** 1 on the first attempt. A retry is a new attempt of the same run. */
  attempt: number;
  /**
   * Stable across attempts of this run. Pass it to the systems you call, so a
   * retried run does not repeat what the first attempt already did.
   */
  idempotencyKey: string;
  trigger: { type: string; [detail: string]: unknown };
  /**
   * Who started the run: a `member`, an `end_user` or a `service_account`, with
   * their ID, or `system` for a schedule, a webhook or an event. A script started
   * from an app reads and writes for that person with
   * `ctx.table(orders).as(ctx.run.startedBy.id)`.
   */
  startedBy: { type: string; id: string | null };
  /**
   * Labels the run, so it can be found by them: `await ctx.run.tag("order:1234")`.
   * At most 10 per run, each up to 64 characters of `a-z`, `0-9` and `_.:-`. A step
   * of a flow labels its flow run too.
   */
  tag(...tags: string[]): Promise<void>;
}

/**
 * The tables of the workspace, by path, as `volvel build` and `volvel types` write them into
 * `.platform/volvel-env.d.ts`, which adds to this interface. Empty until that file is in the project.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from the generated file.
export interface VolvelTables {}
/** A row of a table, by its path, as the generated file knows it: `Row<"visits">`. */
export type Row<Name extends keyof VolvelTables> = VolvelTables[Name] extends { row: infer R }
  ? R
  : never;
/** What is given to insert a row of a table, by its path: `Insert<"visits">`. */
export type Insert<Name extends keyof VolvelTables> = VolvelTables[Name] extends {
  insert: infer I;
}
  ? I
  : never;
/**
 * A table's types by its path, in the form an app's `table<...>("path")` takes where it
 * took `typeof definition`: `table<TableOf<"visits">>("visits")`.
 */
export interface TableOf<Name extends keyof VolvelTables> {
  readonly __row?: Row<Name>;
  readonly __insert?: Insert<Name>;
}
/** The events of the workspace, by path, each with its payload. Filled by the generated file. */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from the generated file.
export interface VolvelEvents {}
/** The variables of the workspace, by path. Filled by the generated file. */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from the generated file.
export interface VolvelVariables {}
/** The connections of the workspace, by path. Filled by the generated file. */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from the generated file.
export interface VolvelConnections {}
/** The flows of the workspace, by path, each with what a manual start is given. Filled by the generated file. */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from the generated file.
export interface VolvelFlows {}
/** The scripts of the workspace, by path, each with its input and output where it has them. Filled by the generated file. */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging from the generated file.
export interface VolvelScripts {}

/** A name the generated file knows, offered as a completion, or any other text. */
// A name the generated file does not know is not an error: a table or event made in the console later, or declared elsewhere.
type KnownOr<Known> = Known | (string & {});

/** What a script receives when it runs. */
export interface ScriptContext {
  /** A client for a connection the script declared. */
  connection<Client = import("./http.js").HttpClient>(
    path: KnownOr<keyof VolvelConnections>,
  ): Promise<Client>;
  /**
   * A connection group the script declared. Its members are added per
   * workspace in the console, so which one to use is decided by data:
   * `await ctx.connections("shops").get(input.shop)`.
   */
  connections<Client = import("./http.js").HttpClient>(
    group: string | { path: string },
  ): {
    /** A client for the member with this key. Throws when the group has no such member. */
    get(key: string): Promise<Client>;
    /** The members the group has in this workspace. */
    keys(): Promise<{ key: string; label: string }[]>;
  };
  /** The value of a secret the script declared. */
  secret(name: string): Promise<string>;
  /** The value of a variable the script declared. */
  variable(path: KnownOr<keyof VolvelVariables>): Promise<string>;
  /**
   * The rows of a table the script declared. Typed by the table's path when the generated
   * file knows it, and when given the table's definition.
   */
  table<Name extends keyof VolvelTables>(
    table: Name,
  ): import("./tables.js").TableClient<
    VolvelTables[Name] extends { row: infer Row } ? Row : never,
    VolvelTables[Name] extends { insert: infer Insert } ? Insert : never
  >;
  table<Row = Record<string, unknown>, Insert = Partial<Row>>(
    table: string | { path: string; __row?: Row; __insert?: Insert },
  ): import("./tables.js").TableClient<Row, Insert>;
  /** An external data source the script declared. */
  source(path: string | { path: string }): {
    table(name: string): import("./tables.js").TableClient<Record<string, unknown>>;
  };
  files: {
    /** Stores a file in the workspace and gives its ID, for a `file` column or for later. */
    put(name: string, content: Uint8Array | string, contentType?: string): Promise<{ id: string }>;
    get(id: string): Promise<{ name: string; contentType: string; content: Uint8Array }>;
  };
  events: {
    /** Publishes an event the script declared. Its subscribers are started before this returns. */
    publish<Name extends keyof VolvelEvents>(
      event: Name,
      payload: VolvelEvents[Name],
    ): Promise<void>;
    publish<Name extends string>(
      event: Name extends keyof VolvelEvents ? never : Name,
      payload: Record<string, unknown>,
    ): Promise<void>;
  };
  log: Logger;
  run: RunInfo;
  /** Aborts when the run is canceled or runs out of time. Pass it to anything slow. */
  signal: AbortSignal;
}
