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

/** What a screen hands a widget along with its configuration. Every part is optional. */
export interface WidgetContext {
  /** The rows to show, for a widget that shows data. */
  rows?: Record<string, unknown>[];
  /** The record a widget that edits one starts from. */
  values?: Record<string, unknown>;
  /** Messages from the server about what was last submitted, by field name. */
  errors?: Record<string, string>;
  /** Called with what a person submitted. The widget waits for the promise it returns. */
  onSubmit?(values: Record<string, unknown>): void | Promise<void>;
  /** Called with the row a person chose. */
  onRowClick?(row: Record<string, unknown>): void;
}

/** A component for apps and generated screens. */
export interface InterfaceWidget<Config> {
  /** The name a screen refers to the widget by. */
  name: string;
  /** JSON Schema for the widget's configuration. */
  configSchema: object;
  /**
   * Returns what the interface kit draws: a React node. It is typed as
   * `unknown` so that the SDK does not depend on React. It is called on
   * every draw, so it must not keep state itself: components it returns can.
   */
  render(config: Config, context: WidgetContext): unknown;
}
