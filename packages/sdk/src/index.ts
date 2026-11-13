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
export {
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
}

export function defineSchedule(options: ScheduleOptions): ResourceDefinition {
  return resource("schedule", options.path, () =>
    compact({
      script: pathOf(options.script),
      cron: options.cron,
      timezone: options.timezone,
      input: options.input,
      enabled: options.enabled,
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
}

export function defineWebhook(options: WebhookOptions): ResourceDefinition {
  return resource("trigger", options.path, () =>
    compact({
      type: "webhook",
      script: pathOf(options.script),
      enabled: options.enabled,
      input: options.input,
      verify: options.verify,
    }),
  );
}

export interface ConnectionOptions {
  path: string;
  /** The connector to use. `http` is built in. */
  connector?: string;
  description?: string;
}

export interface ConnectionGroupOptions {
  path: string;
  /** The connector every member uses. `http` is built in. */
  connector?: string;
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
    compact({ connector: options.connector ?? "http", description: options.description }),
  );
}

/** Declares a connection. Its address and credentials are set per workspace, not here. */
export function defineConnection(options: ConnectionOptions): ResourceDefinition {
  return resource("connection", options.path, () =>
    compact({ connector: options.connector ?? "http", description: options.description }),
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
  /** Started on a five-field cron schedule. */
  schedule: (cron: string, options: { timezone?: string } = {}): FlowNode => ({
    type: "trigger",
    trigger: compact({ type: "schedule", cron, timezone: options.timezone }),
  }),
  /** Started by a request to the flow's webhook address. */
  webhook: (options: { input?: "body" | "request"; verify?: WebhookVerify } = {}): FlowNode => ({
    type: "trigger",
    trigger: compact({ type: "webhook", input: options.input, verify: options.verify }),
  }),
  /** Started when an event is published. `filter` is CEL over `event.payload`. */
  event: (event: Target, options: { filter?: string } = {}): FlowNode => ({
    type: "trigger",
    trigger: compact({ type: "event", event: pathOf(event), filter: options.filter }),
  }),
};

/**
 * The steps of a flow. Where a step takes an expression, it is CEL, and can
 * read `trigger`, `steps.<node>.output`, and inside a foreach, `item` and `index`.
 */
export const step = {
  /** Runs a script. `input` is an expression giving the script's input. */
  script: (script: Target, options: { input?: string } = {}): FlowNode =>
    compact({ type: "script", script: pathOf(script), input: options.input }) as FlowNode,
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
    options: { script?: Target; flow?: Target; input?: string; concurrency?: number },
  ): FlowNode =>
    compact({
      type: "foreach",
      items,
      script: options.script ? pathOf(options.script) : undefined,
      flow: options.flow ? pathOf(options.flow) : undefined,
      input: options.input,
      concurrency: options.concurrency,
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
  policy?: { owner: Extract<keyof C, string> };
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
      policy: options.policy ? { type: "owner", column: options.policy.owner } : undefined,
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
   */
  source: string;
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
  /** Read by the build. Not part of the manifest. */
  readonly source: string;
}

/**
 * Declares an app: an interface the platform builds from `source` and serves.
 * Who may open it is decided by bindings, like any other resource: bind a role
 * holding `app:read` to members, to `end_users`, or to `anonymous` for a public app.
 */
export function defineApp(options: AppOptions): AppDefinition {
  const definition = resource("app", options.path, () =>
    compact({
      title: options.title,
      description: options.description,
      entry: options.entry ?? "index.html",
      fallback: options.fallback,
    }),
  );
  return { ...definition, kind: "app", source: options.source };
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
