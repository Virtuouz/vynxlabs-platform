export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

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
}

/** What a script receives when it runs. */
export interface ScriptContext {
  /** A client for a connection the script declared. */
  connection<Client = import("./http.js").HttpClient>(path: string): Promise<Client>;
  /** The value of a secret the script declared. */
  secret(name: string): Promise<string>;
  /** The value of a variable the script declared. */
  variable(path: string): Promise<string>;
  /** The rows of a table the script declared. Typed when given the table's definition. */
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
    publish(event: string, payload: Record<string, unknown>): Promise<void>;
  };
  log: Logger;
  run: RunInfo;
  /** Aborts when the run is cancelled or runs out of time. Pass it to anything slow. */
  signal: AbortSignal;
}
