import { z } from "zod";
import type { ScriptContext } from "./context.js";
import type { ConnectionTest } from "./extensions.js";
import type * as Kinds from "./generated/kinds.js";
import type { ColumnSpec, InsertOf, RowOf } from "./tables.js";

export * from "@volvel/widgets";

import { tenantDefinitionProblems, type WidgetDefinition } from "@volvel/widgets";

export type {
  DashboardBody,
  DataInput,
  InterfaceBody,
  Page,
  PageFilter,
  PageWidget,
} from "@volvel/widgets/page";

import type { DashboardBody, InterfaceBody } from "@volvel/widgets/page";

export type {
  Logger,
  RunInfo,
  ScriptContext,
  VolvelConnections,
  VolvelEvents,
  VolvelFlows,
  VolvelScripts,
  VolvelTables,
  VolvelVariables,
} from "./context.js";
export type {
  ConnectionTest,
  Connector,
  TriggerSource,
} from "./extensions.js";
/** The body of each kind's file, as its schema says it. Made by `pnpm emit:schemas`; the `*Options` of the `define*` are built on them. */
export type * as KindBodies from "./generated/kinds.js";
export {
  type HttpClient,
  type HttpConfig,
  HttpError,
  type HttpRequest,
  type HttpResponse,
  httpConnector,
} from "./http.js";
export { type OAuth2Config, oauth2Connector } from "./oauth2.js";
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
export const SDK_VERSION = "0.5.0";
/** The core versions a bundle built with this SDK works on: from `min` up to, not including, `below`. */
export const CORE_RANGE = { min: "0.5.0", below: "0.6.0" };

/**
 * The names every resource has beside its path. The path is its address and can
 * change. The key is its identity and never does.
 */
export interface ResourceNames {
  /**
   * The resource's identity. Leave it out: it is the path the resource is made at.
   * Say it only when you move a resource to another path, as the path it had, so
   * that it stays the same resource with its history, its data and what was bound to it.
   */
  key?: string;
  /** What people read, in the console and in lists. */
  title?: string;
}

/**
 * The name of the tool an agent is offered for a script or a flow. Without it
 * the name is made from the path (`run_orders__sync`), and so changes when the
 * path does. Choose one for anything an agent is configured to call: lowercase
 * letters, digits and underscores, starting with a letter, at most 64.
 */
export interface ToolName {
  name: string;
}

/** An authored manifest, before the control plane assigns a workspace, ID and version. */
export interface AuthoredManifest {
  kind: string;
  schemaVersion: number;
  path: string;
  key?: string;
  title?: string;
  mcp?: ToolName;
  ownership: "code";
  body: Record<string, unknown>;
}

const RESOURCE = "__volvelResource";
const WIDGET_ENTRY = /^[A-Za-z0-9_@.-]+(\/[A-Za-z0-9_@.-]+)*$/;

/** Something a tenant repository exports for the build to pick up. */
export interface ResourceDefinition {
  readonly [RESOURCE]: true;
  readonly kind: string;
  readonly path: string;
  /** `entry` is the name this definition is exported under. */
  toManifest(entry: string): AuthoredManifest;
}

/** Whether a value is a resource made with one of the `define` functions, as the build finds them in a repository's exports. */
export function isResourceDefinition(value: unknown): value is ResourceDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)[RESOURCE] === true
  );
}

/**
 * Where the build keeps count of what a repository defines. The build makes the
 * list before it loads the repository's code, and compares it with what the code
 * exports: a definition nobody exported would otherwise go missing without a word.
 * It is on `globalThis` because the build loads a copy of the SDK bundled into the
 * repository's code, not the one it imports itself. Nothing is kept anywhere else.
 */
const DEFINITIONS = Symbol.for("volvel.definitions");

function resource(
  kind: string,
  named: string | (ResourceNames & { path: string; mcp?: ToolName | undefined }),
  body: (entry: string) => Record<string, unknown>,
  schemaVersion = 1,
) {
  const { path, key, title, mcp } = typeof named === "string" ? { path: named } : named;
  const defined = (globalThis as Record<symbol, unknown>)[DEFINITIONS];
  if (Array.isArray(defined)) defined.push({ kind, path });
  return {
    [RESOURCE]: true as const,
    kind,
    path,
    toManifest: (entry: string): AuthoredManifest => ({
      kind,
      schemaVersion,
      path,
      // Said only when it is not the path: most resources never say it.
      ...(key !== undefined && key !== path ? { key } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(mcp !== undefined ? { mcp: { name: mcp.name } } : {}),
      ownership: "code",
      body: body(entry),
    }),
  };
}

/**
 * The names of a resource whose body has a title of its own: an app, an interface, a
 * form. That title is the resource's title, and is not said a second time beside it.
 */
const named = (options: { path: string; key?: string | undefined }) => ({
  path: options.path,
  ...(options.key !== undefined ? { key: options.key } : {}),
});

/** Removes keys whose value is undefined, so optional fields stay out of the manifest. */
function compact<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
}

const pathOf = (target: string | { path: string }) =>
  typeof target === "string" ? target : target.path;

/** A resource named by its path, or by the definition that has one. */
type Ref = string | { path: string };

/**
 * What a `define*` takes: the body of the kind's file, as the kind's schema says it (the types in
 * `generated/`, made by `pnpm emit:schemas`), with `Over` standing where the SDK takes a field in
 * another form (a reference by its definition, a schema as zod, a list written flat), and without
 * the fields in `Skip`, which the SDK says itself. A field added to a kind is a field of its
 * `define*` with no change here; the parity test (`parity.types.ts`) fails when it is not.
 */
type Take<Body, Over = unknown, Skip extends string = never> = Omit<Body, keyof Over | Skip> & Over;

/**
 * The fields of an options object that go into the body as they are written: what a kind adds
 * is passed on without this file listing it. `refs` are fields that name a resource, `lists` the
 * same in a list; both are turned into paths. `omit` are the fields the options say beside the body.
 */
function bodyOf(
  options: object,
  how: {
    refs?: readonly string[];
    lists?: readonly string[];
    omit?: readonly string[];
    /** The body has a title of its own: an app, an interface, a form. */
    title?: boolean;
  } = {},
): Record<string, unknown> {
  const left = new Set([
    "path",
    "key",
    "mcp",
    ...(how.title ? [] : ["title"]),
    ...(how.omit ?? []),
  ]);
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(options)) {
    if (left.has(name) || value === undefined) continue;
    out[name] = how.refs?.includes(name)
      ? pathOf(value as Ref)
      : how.lists?.includes(name)
        ? (value as Ref[]).map(pathOf)
        : value;
  }
  return out;
}

/** A path into a script's input, as a concurrency key names it: `input.customerId`, or deeper. */
export type InputKey<I> =
  I extends Record<string, unknown>
    ? `input.${Extract<keyof I, string>}` | `input.${Extract<keyof I, string>}.${string}`
    : `input.${string}`;

/** What a script's `uses` takes, written flat beside the other options: the secrets by name, the rest by path or by definition. */
type FlatUses<Uses> = {
  [Name in keyof NonNullable<Uses>]?: Name extends "secrets" ? string[] : Ref[];
};
type ScriptUses = FlatUses<Kinds.ScriptBody["uses"]>;

/** The fields of a script's `uses`, which `defineScript` takes flat. Listing them all is checked by the compiler. */
const SCRIPT_USES = [
  "connections",
  "connectionGroups",
  "secrets",
  "variables",
  "events",
  "tables",
  "sources",
] as const satisfies readonly (keyof ScriptUses)[];
type AllUsed = Exclude<keyof ScriptUses, (typeof SCRIPT_USES)[number]> extends never ? true : never;
const _everyUse: AllUsed = true;
void _everyUse;

/** What `defineScript` takes: the script's path, the schemas of its input and its output, what it uses and the function that runs. */
export type ScriptOptions<Input extends z.ZodType, Output extends z.ZodType> = ResourceNames &
  Take<
    Kinds.ScriptBody,
    {
      /** The name of the tool an agent sees for it, if it should not follow the path. */
      mcp?: ToolName;
      /** Unique within the workspace, for example `orders/sync`. */
      path: string;
      input: Input;
      output: Output;
      /** How long one attempt may run. Default 300, maximum 3600. */
      timeoutSeconds?: number;
      /**
       * Retries after a failed attempt. Delivery is at-least-once even without
       * retries, so a script must be safe to run twice.
       */
      retries?: { limit: number; delaySeconds?: number; backoff?: boolean };
      /**
       * How many runs of this script may be in progress at once: a number for the
       * script as a whole, or `{ key, limit }` for each value of a field of its
       * input, such as `{ key: "input.customerId", limit: 1 }` for one run at a
       * time per customer. Runs for other customers go ahead.
       */
      concurrency?: number | { key: InputKey<z.input<Input>>; limit: number };
      /**
       * What happens when a run fails for the last time. It replaces the workspace's default alert for
       * this script, as a whole: a script that names only `notify` does not also start the default's
       * `script`.
       */
      onFailure?: { script?: Ref; notify?: Ref };
      run(input: z.output<Input>, ctx: ScriptContext): Promise<z.input<Output>> | z.input<Output>;
    } & ScriptUses,
    "uses" | "schemaSource"
  >;

/** A script made with `defineScript`. The build finds it among a repository's exports. */
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

/** Defines a script: a function with a checked input and a checked output, that runs on a worker. */
export function defineScript<Input extends z.ZodType, Output extends z.ZodType>(
  options: ScriptOptions<Input, Output>,
): ScriptDefinition {
  const definition = resource("script", options, (entry) =>
    compact({
      // What the kind adds is passed on as it is written.
      ...bodyOf(options, {
        omit: ["run", "input", "output", "onFailure", "retries", ...SCRIPT_USES],
      }),
      entry,
      input: z.toJSONSchema(options.input, { io: "input" }),
      output: z.toJSONSchema(options.output, { io: "output" }),
      timeoutSeconds: options.timeoutSeconds ?? 300,
      retries: {
        limit: options.retries?.limit ?? 0,
        delaySeconds: options.retries?.delaySeconds ?? 30,
        backoff: options.retries?.backoff ?? true,
      },
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

/** What `defineSchedule` takes: when it fires and what it starts. */
export type ScheduleOptions = ResourceNames & {
  path: string;
} & Take<
    Kinds.ScheduleBody,
    {
      /**
       * A polling trigger source to run on each tick. The script then starts once
       * for each thing the source finds, with that thing as its input.
       */
      source?: Ref;
      /** The input each scheduled run receives. */
      input?: Record<string, unknown>;
    },
    "script" | "flow"
  > &
  // It starts a script or a flow, not both.
  ({ script: Ref; flow?: never } | { flow: Ref; script?: never });

/** Defines a schedule: a script or a flow started at times given as a cron line. */
export function defineSchedule(options: ScheduleOptions): ResourceDefinition {
  return resource("schedule", options, () =>
    compact(bodyOf(options, { refs: ["script", "flow", "source"] })),
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

/** What `defineWebhook` takes: the script that receives a request, and how the request is checked. */
export type WebhookOptions = ResourceNames & {
  path: string;
} & Take<
    Extract<Kinds.TriggerBody, { type: "webhook" }>,
    {
      /** The script that receives the request. */
      script: Ref;
      /** A trigger source to hand each request to first. What it returns is what the script is given. */
      source?: Ref;
      /** Checks each request's signature before anything starts. A request that fails is answered 401. */
      verify?: WebhookVerify;
    },
    "type"
  >;

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
  /**
   * Each starts the trigger's script or flow. At most 100 a tick: a tick that gives more fails,
   * starts nothing and keeps the cursor it had, so give fewer, and the rest on the next tick.
   */
  items: unknown[];
  /** Where to pick up from next time. Left out, the place it had is kept. */
  cursor?: Cursor;
}

type TriggerSourceUses = FlatUses<Kinds.TriggerSourceBody["uses"]>;
const SOURCE_USES = [
  "connections",
  "secrets",
  "variables",
] as const satisfies readonly (keyof TriggerSourceUses)[];
const _everySourceUse: Exclude<keyof TriggerSourceUses, (typeof SOURCE_USES)[number]> extends never
  ? true
  : never = true;
void _everySourceUse;

type TriggerSourceCommon = ResourceNames &
  Take<
    Kinds.TriggerSourceBody,
    TriggerSourceUses & {
      /** Unique within the workspace, for example `sources/payments`. Triggers name it by this. */
      path: string;
    },
    "uses" | "mode"
  >;

/** What `defineTriggerSource` takes: code of your own that turns requests, or a poll, into starts of a script or a flow. */
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

/** A trigger source made with `defineTriggerSource`. */
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
  const definition = resource("trigger_source", options, (entry) =>
    compact({
      ...bodyOf(options, { omit: ["run", ...SOURCE_USES] }),
      entry,
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

/** Defines a webhook: an address that starts a script when a request is made to it. */
export function defineWebhook(options: WebhookOptions): ResourceDefinition {
  return resource("trigger", options, () =>
    compact({ type: "webhook", ...bodyOf(options, { refs: ["script", "source"] }) }),
  );
}

type FormBody = Extract<Kinds.TriggerBody, { type: "form" }>;

/** One field of a form. Its value is in the input under `name`. */
export type FormField = FormBody["fields"][number];

/** A form the platform serves as a page. What is sent starts the script or the flow. */
export type FormOptions = Take<FormBody, unknown, "type" | "script" | "enabled">;

/**
 * Declares a form that starts a script. The platform serves it at an address
 * of its own under the tenant's portal, with no code of yours.
 */
export function defineForm(
  options: FormOptions & {
    path: string;
    /** The form's identity, said only when it is moved to another path. See `ResourceNames`. */
    key?: string;
    script: Ref;
    enabled?: boolean;
  },
): ResourceDefinition {
  return resource("trigger", named(options), () =>
    compact({ type: "form", ...bodyOf(options, { refs: ["script"], title: true }) }),
  );
}

/** What `defineConnector` takes: the connector's name, the schema of a connection's configuration and how its client is made. */
export type ConnectorOptions<Config, Client> = ResourceNames &
  Take<
    Kinds.ConnectorBody,
    {
      /** Unique within the workspace, for example `connectors/shop`. Connections name it by this. */
      path: string;
      /** A JSON Schema for a connection's configuration. The console draws its form from it. */
      configSchema: object;
      /**
       * Builds the client a script is given for a connection. `credential` is the
       * connection's secret, when it has one. `signal` aborts when the run is canceled.
       */
      create(config: Config, credential: string | undefined, signal: AbortSignal): Client;
      /**
       * Tries a connection without doing anything with it: what the console's Test
       * button runs. Resolves with what it found, or throws why it could not reach it.
       * A connector without it is tested by building its client.
       */
      test?(
        config: Config,
        credential: string | undefined,
        signal: AbortSignal,
      ): Promise<ConnectionTest>;
    }
  >;

/** A connector made with `defineConnector`, which connections of your own name. */
export interface ConnectorDefinition<Config, Client> extends ResourceDefinition {
  readonly kind: "connector";
  create(config: Config, credential: string | undefined, signal: AbortSignal): Client;
  test?(
    config: Config,
    credential: string | undefined,
    signal: AbortSignal,
  ): Promise<ConnectionTest>;
}

/**
 * Declares a connector: an adapter for one kind of outside system, which
 * turns a connection's configuration and credential into the client a script
 * uses. A connection uses it by naming it: `defineConnection({ connector: shop })`.
 */
export function defineConnector<Config, Client>(
  options: ConnectorOptions<Config, Client>,
): ConnectorDefinition<Config, Client> {
  const definition = resource("connector", options, (entry) =>
    compact({ ...bodyOf(options, { omit: ["create", "test"] }), entry }),
  );
  return {
    ...definition,
    kind: "connector",
    create: options.create,
    ...(options.test ? { test: options.test } : {}),
  };
}

/** What `defineConnection` takes: the connector it uses, its configuration and the name of the secret that holds the credential. */
export type ConnectionOptions = ResourceNames & {
  path: string;
} & Take<
    Kinds.ConnectionBody,
    {
      /** The connector to use: `http`, `smtp` or `oauth2`, which are built in, or one of your own. Default `http`. */
      connector?: Ref;
    }
  >;

/** What `defineConnectionGroup` takes: the connector every member uses, and the connections that are members. */
export type ConnectionGroupOptions = ResourceNames & {
  path: string;
} & Take<
    Kinds.ConnectionGroupBody,
    {
      /** The connector every member uses: `http` or `smtp`, which are built in, or one of your own. Default `http`. */
      connector?: Ref;
    }
  >;

/**
 * Declares a group of connections of one kind, such as every customer's
 * account with the same service. Members are added per workspace in the
 * console, with no deploy. A script that lists the group picks a member when
 * it runs: `await ctx.connections("shops").get(input.shop)`.
 */
export function defineConnectionGroup(options: ConnectionGroupOptions): ResourceDefinition {
  return resource("connection_group", options, () =>
    compact({ ...bodyOf(options, { refs: ["connector"] }), connector: connectorOf(options) }),
  );
}

const connectorOf = (options: { connector?: Ref | undefined }) =>
  options.connector ? pathOf(options.connector) : "http";

/** Declares a connection. Its address and credentials are set per workspace, not here. */
export function defineConnection(options: ConnectionOptions): ResourceDefinition {
  return resource("connection", options, () =>
    compact({ ...bodyOf(options, { refs: ["connector"] }), connector: connectorOf(options) }),
  );
}

/** What `defineVariable` takes: its path, what it is for and the value used in a workspace that has not set its own. */
export type VariableOptions = ResourceNames & { path: string } & Take<Kinds.VariableBody>;

/** Declares a variable. Each workspace can set its own value. */
export function defineVariable(options: VariableOptions): ResourceDefinition {
  return resource("variable", options, () => compact(bodyOf(options)));
}

/** What `defineQuery` takes: its path, one SELECT over the workspace's tables and the parameters it is given. */
export type QueryOptions = ResourceNames & {
  /** The query's name, for example `reports/fees`. */
  path: string;
} & Take<Kinds.QueryBody>;

/**
 * Declares a query the workspace keeps by name. It only reads. Whoever runs it
 * needs to be allowed to read each table it names, and each table's row policy
 * applies to them: a dashboard built on it shows each person their own rows.
 */
export function defineQuery(options: QueryOptions): ResourceDefinition {
  return resource("query", options, () => compact(bodyOf(options)));
}

/** What `defineEvent` takes: the event's name and the schema of its payload. */
export type EventOptions<Payload extends z.ZodType> = ResourceNames & {
  /** The event's name, for example `orders/placed`. */
  path: string;
} & Take<
    Kinds.EventBody,
    {
      /** Every published payload must match this. */
      payload: Payload;
    }
  >;

/** Declares an event that scripts and flows can publish and listen for. */
export function defineEvent<Payload extends z.ZodType>(
  options: EventOptions<Payload>,
): ResourceDefinition {
  return resource("event", options, () =>
    compact({
      ...bodyOf(options),
      payload: z.toJSONSchema(options.payload, { io: "input" }),
    }),
  );
}

/** What `defineEventTrigger` takes: the event to listen for, what it starts and an optional filter. */
export type EventTriggerOptions = ResourceNames & {
  path: string;
} & Take<
    Extract<Kinds.TriggerBody, { type: "event" }>,
    {
      /** The event to listen for, by name or by definition. */
      event: Ref;
      /** The script that receives the event's payload as its input. */
      script: Ref;
    },
    "type"
  >;

/** Starts a script each time an event is published. */
export function defineEventTrigger(options: EventTriggerOptions): ResourceDefinition {
  return resource("trigger", options, () =>
    compact({ type: "event", ...bodyOf(options, { refs: ["script", "event"] }) }),
  );
}

type Target = string | { path: string };

/** A node of a flow, as the manifest stores it. */
export type FlowNode = Record<string, unknown> & { type: string };

const keyed = (key: string | undefined) => (key ? { key } : {});

/** The entry points of a flow. A flow may have several, each leading into its own part of the graph. */
export const trigger = {
  /**
   * Started by hand, from the API, by an agent, or as a sub-flow. With `input`,
   * what it is started with must match that schema; it is also the schema an
   * agent is shown for the flow's tool.
   */
  manual: (options: { input?: z.ZodType } = {}): FlowNode => ({
    type: "trigger",
    trigger: compact({
      type: "manual",
      input: options.input ? z.toJSONSchema(options.input, { io: "input" }) : undefined,
    }),
  }),
  /**
   * Started on a five-field cron schedule. With `source`, each tick runs that
   * trigger source, and the flow starts once for each thing it finds.
   */
  schedule: (
    cron: string,
    options: {
      timezone?: string;
      source?: Target;
      /**
       * What names this start for as long as the flow lives. Its address, its pause and
       * when it last fired follow the key when the step is renamed. Left out, the step's
       * own name is the key.
       */
      key?: string;
      /**
       * `skip`, the default, passes over a time while the flow's last run from this
       * trigger is still going. `allow` starts another beside it.
       */
      overlap?: "allow" | "skip";
      /** CEL expressions over `trigger` that tag each run it starts. */
      tags?: string[];
    } = {},
  ): FlowNode => ({
    type: "trigger",
    ...keyed(options.key),
    trigger: compact({
      type: "schedule",
      tags: options.tags,
      cron,
      timezone: options.timezone,
      source: options.source ? pathOf(options.source) : undefined,
      overlap: options.overlap,
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
      /** CEL expressions over `trigger` that tag each run it starts. */
      tags?: string[];
      /**
       * What names this start for as long as the flow lives. Its address, its pause and
       * when it last fired follow the key when the step is renamed. Left out, the step's
       * own name is the key.
       */
      key?: string;
    } = {},
  ): FlowNode => ({
    type: "trigger",
    ...keyed(options.key),
    trigger: compact({
      type: "webhook",
      tags: options.tags,
      input: options.input,
      verify: options.verify,
      source: options.source ? pathOf(options.source) : undefined,
      respond: options.respond,
    }),
  }),
  /** Started when someone sends the form, which the platform serves as a page. The input is the fields. */
  form: ({ key, ...options }: FormOptions & { key?: string }): FlowNode => ({
    type: "trigger",
    ...keyed(key),
    trigger: compact({ type: "form", ...options }),
  }),
  /** Started when an event is published. `filter` is CEL over `event.payload`. */
  event: (
    event: Target,
    options: { filter?: string; key?: string; tags?: string[] } = {},
  ): FlowNode => ({
    type: "trigger",
    ...keyed(options.key),
    trigger: compact({
      type: "event",
      event: pathOf(event),
      filter: options.filter,
      tags: options.tags,
    }),
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
 * read `trigger`, `steps.<node>.output`, `now` (the current time, as a
 * timestamp), and inside a foreach, `item` and `index`. A timestamp reads as
 * ISO 8601 text: `string(now - duration('336h')).substring(0, 10)` is the
 * date two weeks ago.
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
  /**
   * Runs a script or a flow once per item. Its output is the list of results, in
   * order. One failed item fails the step, unless `continueOnError` is set: then
   * a failed item is `{ error: { message } }` in the list and the others carry on.
   */
  foreach: (
    items: string,
    options: {
      input?: string;
      concurrency?: number;
      continueOnError?: boolean;
      with?: StepGrants;
    } & (
      | { script: Target; flow?: undefined; flowFrom?: undefined; allow?: undefined }
      | { flow: Target; script?: undefined; flowFrom?: undefined; allow?: undefined }
      | { flowFrom: string; allow: Target[]; script?: undefined; flow?: undefined }
    ),
  ): FlowNode =>
    compact({
      type: "foreach",
      items,
      script: options.script ? pathOf(options.script) : undefined,
      flow: options.flow ? pathOf(options.flow) : undefined,
      flowFrom: options.flowFrom,
      allow: options.allow?.map(pathOf),
      input: options.input,
      concurrency: options.concurrency,
      continueOnError: options.continueOnError,
      with: grantsOf(options.with),
    }) as FlowNode,
  /** Waits for every path that leads into it. */
  join: (): FlowNode => ({ type: "join" }),
  /** Waits this many seconds. */
  delay: (seconds: number): FlowNode => ({ type: "delay", seconds }),
  /**
   * Pauses until a person approves. Rejecting, or the timeout passing, fails the
   * step. `approvers` names who may decide: members of these groups, or holders
   * of these roles. Without it, anyone who may decide approvals here may.
   * It is listed in its workspace; `surface: "tenant"` lists it on the tenant's
   * page too.
   */
  approval: (
    title: string,
    options: {
      detail?: string;
      timeoutSeconds?: number;
      approvers?: { groups?: string[]; roles?: string[] };
      surface?: "workspace" | "tenant";
    } = {},
  ): FlowNode =>
    compact({
      type: "approval",
      title,
      detail: options.detail,
      timeoutSeconds: options.timeoutSeconds,
      approvers: options.approvers,
      surface: options.surface,
    }) as FlowNode,
  /**
   * Runs another flow from its manual trigger and waits for it. Name it, or give
   * `flowFrom`, an expression that chooses one of the flows in `allow`.
   */
  subflow: (
    flow: Target | { flowFrom: string; allow: Target[]; input?: string },
    options: { input?: string } = {},
  ): FlowNode => {
    const chosen =
      typeof flow === "object" && "flowFrom" in flow
        ? { flowFrom: flow.flowFrom, allow: flow.allow.map(pathOf), input: flow.input }
        : { flow: pathOf(flow) };
    return compact({
      type: "subflow",
      ...chosen,
      input: options.input ?? ("input" in chosen ? chosen.input : undefined),
    }) as FlowNode;
  },
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

/** What `defineFlow` takes: its steps and the edges between them. */
export type FlowOptions<Nodes extends Record<string, FlowNode>> = ResourceNames & {
  /** The name of the tool an agent sees for it, if it should not follow the path. */
  mcp?: ToolName;
  path: string;
} & Take<
    Kinds.FlowBody,
    {
      nodes: Nodes;
      /** Each edge names two of the nodes above. */
      edges: FlowEdge<Extract<keyof Nodes, string>>[];
      /** Where each node sits in the editor, so positions survive a pull and a deploy. */
      layout?: Partial<Record<Extract<keyof Nodes, string>, { x: number; y: number }>>;
    }
  >;

/**
 * Declares a flow: a graph of steps the platform runs durably. The nodes and
 * edges written here are exactly what is deployed and shown.
 */
export function defineFlow<Nodes extends Record<string, FlowNode>>(
  options: FlowOptions<Nodes>,
): ResourceDefinition {
  return resource("flow", options, () =>
    compact({
      ...bodyOf(options, { omit: ["edges"] }),
      edges: options.edges.map(([from, to, edge]) =>
        compact({ from, to, output: edge?.when, error: edge?.error ? true : undefined }),
      ),
    }),
  );
}

/** What `defineTable` takes: the table's path, its columns and who may read and change its rows. */
export type TableOptions<C extends Record<string, ColumnSpec<unknown, boolean, boolean>>> =
  ResourceNames & {
    /** The table's name, for example `crm/orders`. */
    path: string;
  } & Take<
      Kinds.TableBody,
      {
        columns: C;
        /**
         * The column that stands for a row where another table refers to it: a
         * device's name in place of its ID.
         */
        display?: Extract<keyof C, string>;
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
                  /** The column names a group the person is in: its ID, or its key in a text column (its name too, in rows written before groups had keys). */
                  | { column: Extract<keyof C, string>; in: "groups" }
                  /** The column equals one of the person's attributes. */
                  | { column: Extract<keyof C, string>; equals: { attribute: string } };
              }[];
            };
        /** Columns to index, each entry one index. `id`, `created_at` and `updated_at` may be named. */
        indexes?: (Extract<keyof C, string> | "id" | "created_at" | "updated_at")[][];
      }
    >;

/** A table made with `defineTable`, which carries the type of its rows. */
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
export function defineTable<C extends Record<string, ColumnSpec<unknown, boolean, boolean>>>(
  options: TableOptions<C>,
): TableDefinition<RowOf<C>, InsertOf<C>> {
  const definition = resource("table", options, () =>
    compact({
      ...bodyOf(options, { omit: ["columns", "policy"] }),
      columns: Object.fromEntries(
        Object.entries(options.columns).map(([name, spec]) => [name, spec.manifest]),
      ),
      policy: !options.policy
        ? undefined
        : "rules" in options.policy
          ? { type: "rules", rules: options.policy.rules }
          : { type: "owner", column: options.policy.owner },
    }),
  );
  return { ...definition, kind: "table" };
}

/** What `defineDataSource` takes: its path and what it is for. */
export type DataSourceOptions = ResourceNames & { path: string } & Take<
    Kinds.DataSourceBody,
    unknown,
    "connector"
  >;

/** Declares an external Postgres database. Where it is, and its password, are set per workspace. */
export function defineDataSource(options: DataSourceOptions): ResourceDefinition {
  return resource("data_source", options, () =>
    compact({ ...bodyOf(options), connector: "postgres" }),
  );
}

/**
 * The theme tokens a workspace may set, each the CSS variable `--vx-<name>` in the
 * component kit. The manifest's own list (`THEME_TOKENS`) is the same: a test holds them equal.
 */
export const THEME_TOKENS = [
  "canvas",
  "surface",
  "sunken",
  "line",
  "ink",
  "ink-muted",
  "action",
  "action-ink",
  "action-soft",
  "attention",
  "attention-soft",
  "danger",
  "danger-soft",
  "success",
  "success-soft",
  "structure",
  "raised",
  "selected",
  "line-strong",
  "line-control",
  "ink-subtle",
  "code-bg",
  "focus",
  "radius-control",
  "radius-panel",
  "font",
  "font-code",
] as const;

/** One of the theme tokens a workspace may set. */
export type ThemeToken = (typeof THEME_TOKENS)[number];

/** What `defineTheme` takes: the values that replace the tenant's theme for this workspace. */
export type ThemeOptions = ResourceNames &
  Take<
    Kinds.ThemeBody,
    {
      /** Default `theme`. A workspace has one theme. */
      path?: string;
    }
  >;

/**
 * Declares how this workspace's apps look, where it differs from the tenant's
 * branding. Tokens that are not set keep the tenant's value.
 */
export function defineTheme(options: ThemeOptions): ResourceDefinition {
  return resource("theme", { ...options, path: options.path ?? "theme" }, () =>
    compact(bodyOf(options)),
  );
}

/** What `defineApp` takes: the app's path and title, and the interface or the code it serves. */
export type AppOptions = ResourceNames &
  Take<
    Kinds.AppBody,
    {
      /** Unique within the workspace. It is part of the app's address, for example `orders`. */
      path: string;
      title: string;
      /**
       * The app's own directory in the repository, holding its `index.html`. The build
       * compiles it with Vite. Relative to the repository root, for example `apps/orders`.
       * Leave it out for an app that serves an interface.
       */
      source?: string;
    }
  >;

/** An app made with `defineApp`. */
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
  const given = [options.source, options.interface, options.docs].filter(
    (one) => one !== undefined,
  ).length;
  if (given !== 1) {
    throw new Error(
      `The app "${options.path}" needs a source, an interface or docs, and only one of them.`,
    );
  }
  if (options.feedback !== undefined && options.docs === undefined) {
    throw new Error(
      `The app "${options.path}" asks for feedback: only an app that serves docs can.`,
    );
  }
  const fields = bodyOf(options, { title: true, omit: ["source"] });
  const definition = resource("app", named(options), () =>
    compact(
      options.docs !== undefined || options.interface !== undefined
        ? fields
        : { ...fields, entry: options.entry ?? "index.html" },
    ),
  );
  return {
    ...definition,
    kind: "app",
    ...(options.source !== undefined ? { source: options.source } : {}),
  };
}

/** What `defineInterface` takes: its path and the pages it is made of. */
export interface InterfaceOptions extends Omit<ResourceNames, "title">, InterfaceBody {
  /** Unique within the workspace, for example `screens/invoices`. */
  path: string;
}

/**
 * Declares an interface: pages of widgets (`core/table`, `core/chart`, and the rest of
 * the pack) over the workspace's tables, with no code. Each widget names its data
 * inputs and its `config`; see the `interface` schema. Serve it with
 * `defineApp({ interface })`.
 */
export function defineInterface(options: InterfaceOptions): ResourceDefinition {
  return resource("interface", named(options), () => compact(bodyOf(options, { title: true })), 2);
}

/** What `defineDashboard` takes: its path and the widgets it is made of. */
export interface DashboardOptions extends Omit<ResourceNames, "title">, DashboardBody {
  /** Unique within the workspace, for example `boards/clinic-visits`. */
  path: string;
}

/**
 * Declares a dashboard: one page of widgets that only read, kept as a resource so it is
 * versioned, deployed and promoted with the rest of a workspace.
 */
export function defineDashboard(options: DashboardOptions): ResourceDefinition {
  return resource("dashboard", named(options), () => compact(bodyOf(options, { title: true })), 3);
}

/** What `defineWidget` takes: the widget's declaration (what "Add to page" and the inspector are drawn from) and the file of its view. */
export type WidgetOptions = WidgetDefinition & {
  /** The file in the repository that is the view, for example `widgets/goal/view.tsx`: a module that draws with `@volvel/widget-frame`. Relative to the repository root. */
  entry: string;
  /** Keep the widget's identity when its type changes. Leave it out. */
  key?: string;
};

/** A widget made with `defineWidget`. */
export interface WidgetResource<D extends WidgetOptions = WidgetOptions>
  extends ResourceDefinition {
  readonly kind: "widget";
  /** What was declared. */
  readonly definition: D;
}

/**
 * Declares a widget of your own, for pages and dashboards: its type (`x/<name>`), the data it
 * reads, its settings (a JSON Schema with an `x-volvel` hint on each, from which the inspector
 * is drawn), the events it raises, and the file of its view. The view runs in a sandboxed frame
 * with no network and is given only what the platform read for it under the viewer's permissions.
 * Throws when the declaration is wrong, so `volvel build` says so before anything is deployed.
 * Scaffold one with `volvel widget new <name>`.
 */
export function defineWidget<const D extends WidgetOptions>(options: D): WidgetResource<D> {
  const { entry: _entry, key: _key, ...declared } = options;
  const problems = tenantDefinitionProblems(declared as WidgetDefinition);
  if (!WIDGET_ENTRY.test(options.entry) || /(^|\/)\.\.(\/|$)/.test(options.entry)) {
    problems.push(`${options.type}: entry "${options.entry}" is not a file inside the repository`);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const made = resource(
    "widget",
    { path: options.type, ...(options.key !== undefined ? { key: options.key } : {}) },
    () =>
      compact({
        type: declared.type,
        version: declared.version,
        title: declared.title,
        description: declared.description,
        category: declared.category,
        icon: declared.icon,
        surfaces: declared.surfaces,
        data: declared.data,
        dataHints: declared.dataHints,
        config: declared.config,
        words: declared.words,
        defaults: declared.defaults,
        events: declared.events,
        layout: declared.layout,
        entry: options.entry,
      }),
  );
  return { ...made, kind: "widget", definition: options };
}

/** What `defineRole` takes: the role's path, the name bindings refer to and the permissions it holds. */
export type RoleOptions = ResourceNames & {
  /** Unique within the workspace, for example `roles/order-reader`. */
  path: string;
} & Take<Kinds.RoleBody>;

/** Declares a custom role for this workspace. */
export function defineRole(options: RoleOptions): ResourceDefinition & { readonly name: string } {
  const definition = resource("role", options, () => compact(bodyOf(options)));
  return { ...definition, name: options.name };
}

/** Who a binding gives a role to: a member, a group of members, an end-user group or a service account. */
export type BindingPrincipal =
  | { type: "member"; email: string }
  /** A group of members, by its key: `tech-desk`. What it is called can change freely. */
  | { type: "group"; key: string }
  | { type: "service_account"; key: string }
  | { type: "end_user_group"; key: string }
  /** By its title, as before keys. It stops working when the title changes: name it by `key`. */
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

/** What `defineBinding` takes: the role, who holds it and where. */
export type BindingOptions = ResourceNames & {
  /** Unique within the workspace, for example `bindings/portal-orders`. */
  path: string;
} & Take<
    Kinds.BindingBody,
    {
      /** A role by name or by definition: built-in, the tenant's, or one this workspace defines. */
      role: string | { name: string };
      principal: BindingPrincipal;
      /** Bind at one resource, by path or by definition. Omit to bind at the whole workspace. */
      resource?: Ref;
    }
  >;

/**
 * Grants a role to a principal, at the workspace or at one resource. This is
 * how a repository says who may open an app and whose rows it shows.
 */
export function defineBinding(options: BindingOptions): ResourceDefinition {
  return resource("binding", options, () =>
    compact({
      ...bodyOf(options, { refs: ["resource"] }),
      role: typeof options.role === "string" ? options.role : options.role.name,
    }),
  );
}
