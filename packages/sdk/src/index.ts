import { z } from "zod";
import type { ScriptContext } from "./context.js";
import type { ColumnSpec, InsertOf, RowOf } from "./tables.js";

export type { Logger, RunInfo, ScriptContext } from "./context.js";
export type { Connector, InterfaceWidget, TriggerSource, WidgetContext } from "./extensions.js";
export {
  type HttpClient,
  type HttpConfig,
  HttpError,
  type HttpRequest,
  type HttpResponse,
  httpConnector,
} from "./http.js";
export { type MailMessage, type SmtpClient, type SmtpConfig, smtpConfigSchema } from "./smtp.js";
export {
  type Aggregated,
  type AggregateOptions,
  type ColumnOptions,
  type ColumnSpec,
  column,
  type Filter,
  type FindOptions,
  type InsertOf,
  type RowOf,
  type SystemColumns,
  type TableClient,
} from "./tables.js";
export { z };

/** The version of the SDK, and the core versions a bundle built with it works on. */
export const SDK_VERSION = "0.4.0";
export const CORE_RANGE = { min: "0.4.0", below: "0.5.0" };

/** An authored manifest, before the control plane assigns a workspace, ID and version. */
export interface AuthoredManifest {
  kind: string;
  schemaVersion: number;
  path: string;
  ownership: "code";
  body: Record<string, unknown>;
}

const RESOURCE = "__vynxlabsResource";

/** Something a tenant repository exports for the build to pick up. */
export interface ResourceDefinition {
  readonly [RESOURCE]: true;
  readonly kind: string;
  readonly path: string;
  /** `entry` is the name this definition is exported under. */
  toManifest(entry: string): AuthoredManifest;
}

export function isResourceDefinition(value: unknown): value is ResourceDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)[RESOURCE] === true
  );
}

function resource(kind: string, path: string, body: (entry: string) => Record<string, unknown>) {
  return {
    [RESOURCE]: true as const,
    kind,
    path,
    toManifest: (entry: string): AuthoredManifest => ({
      kind,
      schemaVersion: 1,
      path,
      ownership: "code",
      body: body(entry),
    }),
  };
}

/** Removes keys whose value is undefined, so optional fields stay out of the manifest. */
function compact<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
}

const pathOf = (target: string | { path: string }) =>
  typeof target === "string" ? target : target.path;

export interface ScriptOptions<Input extends z.ZodType, Output extends z.ZodType> {
  /** Unique within the workspace, for example `orders/sync`. */
  path: string;
  description?: string;
  input: Input;
  output: Output;
  /** Connections the script reads, by path or by definition. */
  connections?: (string | { path: string })[];
  /** Connection groups the script may pick a member of when it runs. */
  connectionGroups?: (string | { path: string })[];
  /** Names of the secrets the script reads. */
  secrets?: string[];
  /** Variables the script reads, by path or by definition. */
  variables?: (string | { path: string })[];
  /** Events the script publishes, by name or by definition. */
  events?: (string | { path: string })[];
  /** Custom tables the script reads or writes, by path or by definition. */
  tables?: (string | { path: string })[];
  /** External data sources the script reads or writes, by path or by definition. */
  sources?: (string | { path: string })[];
  /** How long one attempt may run. Default 300, maximum 3600. */
  timeoutSeconds?: number;
  /**
   * Retries after a failed attempt. Delivery is at-least-once even without
   * retries, so a script must be safe to run twice.
   */
  retries?: { limit: number; delaySeconds?: number; backoff?: boolean };
  /** How many runs of this script may be in progress at once. */
  concurrency?: number;
  /**
   * The worker pool this script runs on. Use it for a script that must run in
   * a particular place, such as inside a client's network, and give that
   * place's worker a credential made for the same pool.
   */
  worker?: string;
  /** What happens when a run fails for the last time. */
  onFailure?: { script?: string | { path: string }; notify?: string | { path: string } };
  /**
   * Makes the script a step people can pick in the flow editor. Its input
   * schema becomes the step's form. `takes` says what a step may hand it with
   * `with`: a connection, a table or an event the script does not name itself.
   */
  node?: {
    label: string;
    icon?: string;
    category?: string;
    takes?: ("connection" | "table" | "event")[];
  };
  run(input: z.output<Input>, ctx: ScriptContext): Promise<z.input<Output>> | z.input<Output>;
}

export interface ScriptDefinition extends ResourceDefinition {
  readonly kind: "script";
  /** Validates the input, runs the script and validates what it returns. */
  execute(input: unknown, ctx: ScriptContext): Promise<unknown>;
}

/** A failure caused by input or output that does not match the script's schema. */
export class SchemaError extends Error {
  constructor(what: "input" | "output", error: z.ZodError) {
    super(`The script's ${what} does not match its schema:\n${z.prettifyError(error)}`);
    this.name = "SchemaError";
  }
}

export function defineScript<Input extends z.ZodType, Output extends z.ZodType>(
  options: ScriptOptions<Input, Output>,
): ScriptDefinition {
  const definition = resource("script", options.path, (entry) =>
    compact({
      entry,
      description: options.description,
      input: z.toJSONSchema(options.input, { io: "input" }),
      output: z.toJSONSchema(options.output, { io: "output" }),
      timeoutSeconds: options.timeoutSeconds ?? 300,
      retries: {
        limit: options.retries?.limit ?? 0,
        delaySeconds: options.retries?.delaySeconds ?? 30,
        backoff: options.retries?.backoff ?? true,
      },
      concurrency: options.concurrency,
      worker: options.worker,
      uses: {
        connections: (options.connections ?? []).map(pathOf),
        ...(options.connectionGroups
          ? { connectionGroups: options.connectionGroups.map(pathOf) }
          : {}),
        secrets: options.secrets ?? [],
        variables: (options.variables ?? []).map(pathOf),
        ...(options.events ? { events: options.events.map(pathOf) } : {}),
        ...(options.tables ? { tables: options.tables.map(pathOf) } : {}),
        ...(options.sources ? { sources: options.sources.map(pathOf) } : {}),
      },
      onFailure: options.onFailure
        ? compact({
            script: options.onFailure.script ? pathOf(options.onFailure.script) : undefined,
            notify: options.onFailure.notify ? pathOf(options.onFailure.notify) : undefined,
          })
        : undefined,
      node: options.node,
    }),
  );
  return {
    ...definition,
    kind: "script",
    async execute(input, ctx) {
      const parsed = options.input.safeParse(input);
      if (!parsed.success) throw new SchemaError("input", parsed.error);
      const result = await options.run(parsed.data, ctx);
      const output = options.output.safeParse(result);
      if (!output.success) throw new SchemaError("output", output.error);
      return output.data;
    },
  };
}

export interface ScheduleOptions {
  path: string;
  script: string | { path: string };
  /** Five-field cron expression, for example `0 6 * * 1-5`. */
  cron: string;
  /** IANA time zone, for example `Europe/Madrid`. Default UTC. */
  timezone?: string;
  /** The input each scheduled run receives. */
  input?: Record<string, unknown>;
  enabled?: boolean;
  /**
   * A polling trigger source to run on each tick. The script then starts once
   * for each thing the source finds, with that thing as its input.
   */
  source?: string | { path: string };
}

export function defineSchedule(options: ScheduleOptions): ResourceDefinition {
  return resource("schedule", options.path, () =>
    compact({
      script: pathOf(options.script),
      cron: options.cron,
      timezone: options.timezone,
      input: options.input,
      enabled: options.enabled,
      source: options.source ? pathOf(options.source) : undefined,
    }),
  );
}

/** How a webhook checks that a request was signed with a secret shared with its sender. */
export interface WebhookVerify {
  scheme: "hmac-sha256" | "hmac-sha1";
  /** The header the signature is sent in: `X-Hub-Signature-256`. */
  header: string;
  /** The name of the workspace secret that holds the shared secret. */
  secret: string;
  /** How the signature is written. Default `hex`. */
  encoding?: "hex" | "base64";
  /** Text before the signature in the header, such as `sha256=`. */
  prefix?: string;
  /** What was signed. `{body}` is the raw body, `{timestamp}` the timestamp header. Default `{body}`. */
  signed?: string;
  /** A header holding when the request was sent, in seconds since 1970. */
  timestampHeader?: string;
  /** How old a request may be, by its timestamp header. Default 300. */
  toleranceSeconds?: number;
}

/** What a webhook's script is given when `input` is `request`. */
export interface WebhookRequest<Body = unknown> {
  method: string;
  /** Lower-case names. The sender's own `authorization` and `cookie` are left out. */
  headers: Record<string, string>;
  query: Record<string, string>;
  /** JSON, a form's fields, or text, by the request's content type. */
  body: Body;
  /** The body exactly as it was sent. */
  rawBody: string;
}

export interface WebhookOptions {
  path: string;
  /** The script that receives the request. */
  script: string | { path: string };
  enabled?: boolean;
  /**
   * What the script is given: the parsed body alone, which is the default, or
   * the whole request as a `WebhookRequest`.
   */
  input?: "body" | "request";
  /** Checks each request's signature before anything starts. A request that fails is answered 401. */
  verify?: WebhookVerify;
  /** A trigger source to hand each request to first. What it returns is what the script is given. */
  source?: string | { path: string };
}

/** What a trigger source for webhooks answers. */
export type WebhookSourceResult =
  /** Start nothing. `reason` is kept on the source's run, for whoever looks into it. */
  | { accept: false; reason?: string }
  /** Start the trigger's script or flow once, with this input. */
  | { accept?: true; input: unknown }
  /** Start it once for each of these, up to a hundred. */
  | { accept?: true; inputs: unknown[] };

/** What a polling trigger source is handed on each tick. */
export interface PollTick<Cursor = unknown> {
  /** What the source gave back as `cursor` last time. Null the first time. */
  cursor: Cursor | null;
  /** When this tick was due. */
  scheduledFor: string;
}

/** What a polling trigger source answers. */
export interface PollResult<Cursor = unknown> {
  /** Each starts the trigger's script or flow, up to a hundred. */
  items: unknown[];
  /** Where to pick up from next time. Left out, the place it had is kept. */
  cursor?: Cursor;
}

interface TriggerSourceCommon {
  /** Unique within the workspace, for example `sources/payments`. Triggers name it by this. */
  path: string;
  description?: string;
  /** Connections the source reads, by path or by definition. */
  connections?: (string | { path: string })[];
  /** Names of the secrets the source reads, such as the one a signature is checked against. */
  secrets?: string[];
  variables?: (string | { path: string })[];
  /** How long one run may take. Default 30, at most 300. */
  timeoutSeconds?: number;
  /** The worker pool it runs on. */
  worker?: string;
}

export type TriggerSourceOptions =
  | (TriggerSourceCommon & {
      mode: "webhook";
      run(
        request: WebhookRequest,
        ctx: ScriptContext,
      ): Promise<WebhookSourceResult> | WebhookSourceResult;
    })
  | (TriggerSourceCommon & {
      mode: "poll";
      run(tick: PollTick, ctx: ScriptContext): Promise<PollResult> | PollResult;
    });

export interface TriggerSourceDefinition extends ResourceDefinition {
  readonly kind: "trigger_source";
  execute(input: unknown, ctx: ScriptContext): Promise<unknown>;
}

/**
 * Declares a trigger source: code that stands between the outside and what a
 * trigger starts. It runs on a worker, like a script, and reads only the
 * connections, secrets and variables it lists.
 *
 * A `webhook` source is handed each request to a webhook that names it, and
 * says whether to start anything and with what: this is where a signature in
 * a sender's own format is checked, or one request is split into several. A
 * `poll` source is run on a schedule that names it, with where it had got to,
 * and gives back what is new.
 */
export function defineTriggerSource(options: TriggerSourceOptions): TriggerSourceDefinition {
  const definition = resource("trigger_source", options.path, (entry) =>
    compact({
      entry,
      description: options.description,
      mode: options.mode,
      timeoutSeconds: options.timeoutSeconds,
      worker: options.worker,
      uses: compact({
        connections: options.connections?.map(pathOf),
        secrets: options.secrets,
        variables: options.variables?.map(pathOf),
      }),
    }),
  );
  const run = options.run as (input: unknown, ctx: ScriptContext) => unknown;
  return {
    ...definition,
    kind: "trigger_source",
    execute: async (input, ctx) => run(input, ctx),
  };
}

export function defineWebhook(options: WebhookOptions): ResourceDefinition {
  return resource("trigger", options.path, () =>
    compact({
      type: "webhook",
      script: pathOf(options.script),
      enabled: options.enabled,
      input: options.input,
      verify: options.verify,
      source: options.source ? pathOf(options.source) : undefined,
    }),
  );
}

export interface ConnectorOptions<Config, Client> {
  /** Unique within the workspace, for example `connectors/shop`. Connections name it by this. */
  path: string;
  description?: string;
  /** A JSON Schema for a connection's configuration. The console draws its form from it. */
  configSchema: object;
  /**
   * Builds the client a script is given for a connection. `credential` is the
   * connection's secret, when it has one. `signal` aborts when the run is cancelled.
   */
  create(config: Config, credential: string | undefined, signal: AbortSignal): Client;
}

export interface ConnectorDefinition<Config, Client> extends ResourceDefinition {
  readonly kind: "connector";
  create(config: Config, credential: string | undefined, signal: AbortSignal): Client;
}

/**
 * Declares a connector: an adapter for one kind of outside system, which
 * turns a connection's configuration and credential into the client a script
 * uses. A connection uses it by naming it: `defineConnection({ connector: shop })`.
 */
export function defineConnector<Config, Client>(
  options: ConnectorOptions<Config, Client>,
): ConnectorDefinition<Config, Client> {
  const definition = resource("connector", options.path, (entry) =>
    compact({ entry, description: options.description, configSchema: options.configSchema }),
  );
  return { ...definition, kind: "connector", create: options.create };
}

export interface ConnectionOptions {
  path: string;
  /** The connector to use: `http` or `smtp`, which are built in, or one of your own. */
  connector?: string | { path: string };
  description?: string;
}

export interface ConnectionGroupOptions {
  path: string;
  /** The connector every member uses: `http` or `smtp`, which are built in, or one of your own. */
  connector?: string | { path: string };
  description?: string;
}

/**
 * Declares a group of connections of one kind, such as every customer's
 * account with the same service. Members are added per workspace in the
 * console, with no deploy. A script that lists the group picks a member when
 * it runs: `await ctx.connections("shops").get(input.shop)`.
 */
export function defineConnectionGroup(options: ConnectionGroupOptions): ResourceDefinition {
  return resource("connection_group", options.path, () =>
    compact({
      connector: options.connector ? pathOf(options.connector) : "http",
      description: options.description,
    }),
  );
}

/** Declares a connection. Its address and credentials are set per workspace, not here. */
export function defineConnection(options: ConnectionOptions): ResourceDefinition {
  return resource("connection", options.path, () =>
    compact({
      connector: options.connector ? pathOf(options.connector) : "http",
      description: options.description,
    }),
  );
}

export interface VariableOptions {
  path: string;
  description?: string;
  /** Used in a workspace that has not set its own value. */
  default?: string;
}

/** Declares a variable. Each workspace can set its own value. */
export function defineVariable(options: VariableOptions): ResourceDefinition {
  return resource("variable", options.path, () =>
    compact({ description: options.description, default: options.default }),
  );
}

export interface EventOptions<Payload extends z.ZodType> {
  /** The event's name, for example `orders/placed`. */
  path: string;
  description?: string;
  /** Every published payload must match this. */
  payload: Payload;
}

/** Declares an event that scripts and flows can publish and listen for. */
export function defineEvent<Payload extends z.ZodType>(
  options: EventOptions<Payload>,
): ResourceDefinition {
  return resource("event", options.path, () =>
    compact({
      description: options.description,
      payload: z.toJSONSchema(options.payload, { io: "input" }),
    }),
  );
}

export interface EventTriggerOptions {
  path: string;
  /** The event to listen for, by name or by definition. */
  event: string | { path: string };
  /** The script that receives the event's payload as its input. */
  script: string | { path: string };
  /** A CEL expression over `event.payload`. The script runs only when it is true. */
  filter?: string;
  enabled?: boolean;
}

/** Starts a script each time an event is published. */
export function defineEventTrigger(options: EventTriggerOptions): ResourceDefinition {
  return resource("trigger", options.path, () =>
    compact({
      type: "event",
      script: pathOf(options.script),
      event: pathOf(options.event),
      filter: options.filter,
      enabled: options.enabled,
    }),
  );
}

type Target = string | { path: string };

/** A node of a flow, as the manifest stores it. */
export type FlowNode = Record<string, unknown> & { type: string };

/** The entry points of a flow. A flow may have several, each leading into its own part of the graph. */
export const trigger = {
  /** Started by hand, from the API, or as a sub-flow. */
  manual: (): FlowNode => ({ type: "trigger", trigger: { type: "manual" } }),
  /**
   * Started on a five-field cron schedule. With `source`, each tick runs that
   * trigger source, and the flow starts once for each thing it finds.
   */
  schedule: (cron: string, options: { timezone?: string; source?: Target } = {}): FlowNode => ({
    type: "trigger",
    trigger: compact({
      type: "schedule",
      cron,
      timezone: options.timezone,
      source: options.source ? pathOf(options.source) : undefined,
    }),
  }),
  /**
   * Started by a request to the flow's webhook address. With `source`, each
   * request is handed to that trigger source, which decides what starts.
   */
  webhook: (
    options: {
      input?: "body" | "request";
      verify?: WebhookVerify;
      source?: Target;
      /** `flow` holds the request open, for up to 25 seconds, for a respond step to answer. */
      respond?: "now" | "flow";
    } = {},
  ): FlowNode => ({
    type: "trigger",
    trigger: compact({
      type: "webhook",
      input: options.input,
      verify: options.verify,
      source: options.source ? pathOf(options.source) : undefined,
      respond: options.respond,
    }),
  }),
  /** Started when an event is published. `filter` is CEL over `event.payload`. */
  event: (event: Target, options: { filter?: string } = {}): FlowNode => ({
    type: "trigger",
    trigger: compact({ type: "event", event: pathOf(event), filter: options.filter }),
  }),
};

/** What a step hands the script it runs, by path or by definition. */
export interface StepGrants {
  connections?: Target[];
  tables?: Target[];
  events?: Target[];
}

const grantsOf = (grants: StepGrants | undefined) =>
  grants
    ? compact({
        connections: grants.connections?.map(pathOf),
        tables: grants.tables?.map(pathOf),
        events: grants.events?.map(pathOf),
      })
    : undefined;

/**
 * The steps of a flow. Where a step takes an expression, it is CEL, and can
 * read `trigger`, `steps.<node>.output`, and inside a foreach, `item` and `index`.
 */
export const step = {
  /**
   * Runs a script. `input` is one expression giving the script's input, or
   * `inputs` gives an expression for each field. `with` hands the script
   * connections, tables or events for this step, when the script takes them.
   */
  script: (
    script: Target,
    options: { input?: string; inputs?: Record<string, string>; with?: StepGrants } = {},
  ): FlowNode =>
    compact({
      type: "script",
      script: pathOf(script),
      input: options.input,
      inputs: options.inputs,
      with: grantsOf(options.with),
    }) as FlowNode,
  /** Computes named values. Its output is an object of the results. */
  set: (values: Record<string, string>): FlowNode => ({ type: "set", values }),
  /** Follows the first case whose condition is true, or the edge marked `otherwise`. */
  branch: (cases: Record<string, string>): FlowNode => ({
    type: "branch",
    cases: Object.entries(cases).map(([name, when]) => ({ name, when })),
  }),
  /** Runs a script or a flow once per item. Its output is the list of results, in order. */
  foreach: (
    items: string,
    options: {
      script?: Target;
      flow?: Target;
      input?: string;
      concurrency?: number;
      with?: StepGrants;
    },
  ): FlowNode =>
    compact({
      type: "foreach",
      items,
      script: options.script ? pathOf(options.script) : undefined,
      flow: options.flow ? pathOf(options.flow) : undefined,
      input: options.input,
      concurrency: options.concurrency,
      with: grantsOf(options.with),
    }) as FlowNode,
  /** Waits for every path that leads into it. */
  join: (): FlowNode => ({ type: "join" }),
  /** Waits this many seconds. */
  delay: (seconds: number): FlowNode => ({ type: "delay", seconds }),
  /** Pauses until a person approves. Rejecting, or the timeout passing, fails the step. */
  approval: (title: string, options: { detail?: string; timeoutSeconds?: number } = {}): FlowNode =>
    compact({
      type: "approval",
      title,
      detail: options.detail,
      timeoutSeconds: options.timeoutSeconds,
    }) as FlowNode,
  /** Runs another flow from its manual trigger and waits for it. */
  subflow: (flow: Target, options: { input?: string } = {}): FlowNode =>
    compact({ type: "subflow", flow: pathOf(flow), input: options.input }) as FlowNode,
  /**
   * Answers the request that started the flow, for a webhook trigger with
   * `respond: "flow"`. `body` and each header are expressions. The first
   * respond step to run is the answer, and the flow carries on after it.
   */
  respond: (
    options: { status?: number; headers?: Record<string, string>; body?: string } = {},
  ): FlowNode => compact({ type: "respond", ...options }) as FlowNode,
  /** Fails on purpose, with a message. */
  fail: (message: string): FlowNode => ({ type: "fail", message }),
};

/** An edge: `[from, to]`, or with an option naming a branch case or marking the error path. */
export type FlowEdge<Node extends string> =
  | [from: Node, to: Node]
  | [from: Node, to: Node, options: { when?: string; error?: boolean }];

export interface FlowOptions<Nodes extends Record<string, FlowNode>> {
  path: string;
  description?: string;
  nodes: Nodes;
  /** Each edge names two of the nodes above. */
  edges: FlowEdge<Extract<keyof Nodes, string>>[];
}

/**
 * Declares a flow: a graph of steps the platform runs durably. The nodes and
 * edges written here are exactly what is deployed and shown.
 */
export function defineFlow<Nodes extends Record<string, FlowNode>>(
  options: FlowOptions<Nodes>,
): ResourceDefinition {
  return resource("flow", options.path, () =>
    compact({
      description: options.description,
      nodes: options.nodes,
      edges: options.edges.map(([from, to, edge]) =>
        compact({ from, to, output: edge?.when, error: edge?.error ? true : undefined }),
      ),
    }),
  );
}

export interface TableOptions<C extends Record<string, ColumnSpec<unknown, boolean>>> {
  /** The table's name, for example `crm/orders`. */
  path: string;
  description?: string;
  columns: C;
  /**
   * Who may see which rows. With `owner`, a person sees and changes only the
   * rows whose owner column holds their ID. Without a policy, permissions alone decide.
   */
  policy?:
    | { owner: Extract<keyof C, string> }
    | {
        /**
         * Rules that match a row's columns against the person asking. A person
         * sees a row when any rule lets them, and changes it when a `write` or
         * `all` rule does.
         */
        rules: {
          allow: "read" | "write" | "all";
          when:
            | { everyone: true }
            /** The column holds the person's own ID. */
            | { column: Extract<keyof C, string>; is: "principal" }
            /** The column names a group the person is in: its ID, or its name in a text column. */
            | { column: Extract<keyof C, string>; in: "groups" }
            /** The column equals one of the person's attributes. */
            | { column: Extract<keyof C, string>; equals: { attribute: string } };
        }[];
      };
  /** Columns to index, each entry one index. */
  indexes?: Extract<keyof C, string>[][];
  /** The table's previous path. Its rows are kept. */
  renamedFrom?: string;
}

export interface TableDefinition<Row, Insert> extends ResourceDefinition {
  readonly kind: "table";
  /** Only for type inference. Never set. */
  readonly __row?: Row;
  readonly __insert?: Insert;
}

/**
 * Declares a custom table. A deploy changes the workspace's table to match:
 * new columns are added, and a column that is no longer declared is retired
 * with its data kept, never dropped.
 */
export function defineTable<C extends Record<string, ColumnSpec<unknown, boolean>>>(
  options: TableOptions<C>,
): TableDefinition<RowOf<C>, InsertOf<C>> {
  const definition = resource("table", options.path, () =>
    compact({
      description: options.description,
      columns: Object.fromEntries(
        Object.entries(options.columns).map(([name, spec]) => [name, spec.manifest]),
      ),
      policy: !options.policy
        ? undefined
        : "rules" in options.policy
          ? { type: "rules", rules: options.policy.rules }
          : { type: "owner", column: options.policy.owner },
      indexes: options.indexes,
      renamedFrom: options.renamedFrom,
    }),
  );
  return { ...definition, kind: "table" };
}

export interface DataSourceOptions {
  path: string;
  description?: string;
}

/** Declares an external Postgres database. Where it is, and its password, are set per workspace. */
export function defineDataSource(options: DataSourceOptions): ResourceDefinition {
  return resource("data_source", options.path, () =>
    compact({ connector: "postgres", description: options.description }),
  );
}

/** The theme tokens a workspace may set. Each is the CSS variable `--vx-<name>` in the component kit. */
export type ThemeToken =
  | "canvas"
  | "surface"
  | "sunken"
  | "line"
  | "ink"
  | "ink-muted"
  | "action"
  | "action-ink"
  | "action-soft"
  | "attention"
  | "attention-soft"
  | "danger"
  | "danger-soft"
  | "success"
  | "success-soft"
  | "radius-control"
  | "radius-panel"
  | "font"
  | "font-code";

export interface ThemeOptions {
  /** Default `theme`. A workspace has one theme. */
  path?: string;
  description?: string;
  /** Values that replace the tenant's: plain colours, lengths and font lists. */
  tokens?: Partial<Record<ThemeToken, string>>;
  /** The same, for when the viewer prefers a dark scheme. */
  dark?: Partial<Record<ThemeToken, string>>;
}

/**
 * Declares how this workspace's apps look, where it differs from the tenant's
 * branding. Tokens that are not set keep the tenant's value.
 */
export function defineTheme(options: ThemeOptions): ResourceDefinition {
  return resource("theme", options.path ?? "theme", () =>
    compact({ description: options.description, tokens: options.tokens, dark: options.dark }),
  );
}

export interface AppOptions {
  /** Unique within the workspace. It is part of the app's address, for example `orders`. */
  path: string;
  title: string;
  description?: string;
  /**
   * The app's own directory in the repository, holding its `index.html`. The build
   * compiles it with Vite. Relative to the repository root, for example `apps/orders`.
   * Leave it out for an app that serves an interface.
   */
  source?: string;
  /**
   * The path of an interface to serve as this app, in place of code of its own.
   * An app has a `source` or an `interface`, never both.
   */
  interface?: string;
  /** The page inside the built app. Default `index.html`. */
  entry?: string;
  /**
   * Whether an address under the app that names no file answers with the page,
   * for apps that route in the browser. Default true.
   */
  fallback?: boolean;
}

export interface AppDefinition extends ResourceDefinition {
  readonly kind: "app";
  /** Read by the build. Not part of the manifest. Absent for an app that serves an interface. */
  readonly source?: string;
}

/**
 * Declares an app: an interface the platform builds from `source` and serves.
 * Who may open it is decided by bindings, like any other resource: bind a role
 * holding `app:read` to members, to `end_users`, or to `anonymous` for a public app.
 */
export function defineApp(options: AppOptions): AppDefinition {
  if ((options.source === undefined) === (options.interface === undefined)) {
    throw new Error(`The app "${options.path}" needs a source or an interface, and not both.`);
  }
  const definition = resource("app", options.path, () =>
    options.interface !== undefined
      ? compact({
          title: options.title,
          description: options.description,
          interface: options.interface,
        })
      : compact({
          title: options.title,
          description: options.description,
          entry: options.entry ?? "index.html",
          fallback: options.fallback,
        }),
  );
  return {
    ...definition,
    kind: "app",
    ...(options.source !== undefined ? { source: options.source } : {}),
  };
}

export interface InterfaceOptions {
  /** Unique within the workspace, for example `screens/invoices`. */
  path: string;
  title: string;
  description?: string;
  /**
   * The pages, each a set of widgets over the workspace's tables. Most
   * interfaces are made in the console, which writes this for you: see the
   * `interface` schema for every field.
   */
  pages: Record<string, unknown>[];
}

/**
 * Declares an interface: pages of tables, cards, charts and forms over the
 * workspace's tables, with no code. Serve it with `defineApp({ interface })`.
 */
export function defineInterface(options: InterfaceOptions): ResourceDefinition {
  return resource("interface", options.path, () =>
    compact({ title: options.title, description: options.description, pages: options.pages }),
  );
}

export interface RoleOptions {
  /** Unique within the workspace, for example `roles/order-reader`. */
  path: string;
  /** The name bindings refer to. Lower case letters, digits and underscores. */
  name: string;
  description?: string;
  /** Each is `kind:read`, `kind:write` or `kind:*`, for example `data:read`. */
  permissions: string[];
}

/** Declares a custom role for this workspace. */
export function defineRole(options: RoleOptions): ResourceDefinition & { readonly name: string } {
  const definition = resource("role", options.path, () =>
    compact({
      name: options.name,
      description: options.description,
      permissions: options.permissions,
    }),
  );
  return { ...definition, name: options.name };
}

export type BindingPrincipal =
  | { type: "member"; email: string }
  | { type: "group"; name: string }
  | { type: "service_account"; name: string }
  /** One person in the tenant's end-user pool. */
  | { type: "end_user"; email: string }
  /** A group of end users, by its name. */
  | { type: "end_user_group"; name: string }
  /** Every signed-in end user of the tenant. */
  | { type: "end_users" }
  /** Anyone, signed in or not. This is what makes something public. */
  | { type: "anonymous" };

export interface BindingOptions {
  /** Unique within the workspace, for example `bindings/portal-orders`. */
  path: string;
  /** A role by name or by definition: built-in, the tenant's, or one this workspace defines. */
  role: string | { name: string };
  principal: BindingPrincipal;
  /** Bind at one resource, by path or by definition. Omit to bind at the whole workspace. */
  resource?: string | { path: string };
}

/**
 * Grants a role to a principal, at the workspace or at one resource. This is
 * how a repository says who may open an app and whose rows it shows.
 */
export function defineBinding(options: BindingOptions): ResourceDefinition {
  return resource("binding", options.path, () =>
    compact({
      role: typeof options.role === "string" ? options.role : options.role.name,
      principal: options.principal,
      resource: options.resource === undefined ? undefined : pathOf(options.resource),
    }),
  );
}
