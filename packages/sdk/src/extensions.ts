/**
 * The extension points available in this version. The platform's own
 * connectors and triggers are written against these same interfaces.
 */

/** An adapter for one kind of external system. */
export interface Connector<Config, Client> {
  /** The name a connection resource refers to in its `connector` field. */
  name: string;
  /** JSON Schema for a connection's configuration. */
  configSchema: object;
  /**
   * Builds the client a script receives. `credential` is the connection's
   * secret, when it has one. `signal` aborts when the run is cancelled.
   */
  create(config: Config, credential: string | undefined, signal: AbortSignal): Client;
}

/** A way to start runs. */
export interface TriggerSource<Body> {
  /** The trigger type recorded on each run it starts. */
  type: string;
  /** The script a trigger resource of this source starts. */
  script(body: Body): string;
  /** For sources driven by time: when the trigger next fires after `after`. */
  nextFire?(body: Body, after: Date): Date | null;
  /** For sources driven by a request: the script input for an incoming request. */
  toInput?(body: Body, request: { headers: Record<string, string>; body: unknown }): unknown;
}
