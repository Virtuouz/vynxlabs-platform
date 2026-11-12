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
}

/** What a script receives when it runs. */
export interface ScriptContext {
  /** A client for a connection the script declared. */
  connection<Client = import("./http.js").HttpClient>(path: string): Promise<Client>;
  /** The value of a secret the script declared. */
  secret(name: string): Promise<string>;
  /** The value of a variable the script declared. */
  variable(path: string): Promise<string>;
  events: {
    /** Publishes an event the script declared. Its subscribers are started before this returns. */
    publish(event: string, payload: Record<string, unknown>): Promise<void>;
  };
  log: Logger;
  run: RunInfo;
  /** Aborts when the run is cancelled or runs out of time. Pass it to anything slow. */
  signal: AbortSignal;
}
