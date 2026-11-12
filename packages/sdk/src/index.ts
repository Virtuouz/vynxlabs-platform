import { z } from "zod";
import type { ScriptContext } from "./context.js";

export type { Logger, RunInfo, ScriptContext } from "./context.js";
export type { Connector, TriggerSource } from "./extensions.js";
export {
  type HttpClient,
  type HttpConfig,
  HttpError,
  type HttpRequest,
  type HttpResponse,
  httpConnector,
} from "./http.js";
export { z };

/** The version of the SDK, and the core versions a bundle built with it works on. */
export const SDK_VERSION = "0.2.0";
export const CORE_RANGE = { min: "0.2.0", below: "0.3.0" };

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
  /** Names of the secrets the script reads. */
  secrets?: string[];
  /** Variables the script reads, by path or by definition. */
  variables?: (string | { path: string })[];
  /** How long one attempt may run. Default 300, maximum 3600. */
  timeoutSeconds?: number;
  /**
   * Retries after a failed attempt. Delivery is at-least-once even without
   * retries, so a script must be safe to run twice.
   */
  retries?: { limit: number; delaySeconds?: number; backoff?: boolean };
  /** How many runs of this script may be in progress at once. */
  concurrency?: number;
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
      uses: {
        connections: (options.connections ?? []).map(pathOf),
        secrets: options.secrets ?? [],
        variables: (options.variables ?? []).map(pathOf),
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

export interface WebhookOptions {
  path: string;
  /** The script that receives the request body as its input. */
  script: string | { path: string };
  enabled?: boolean;
}

export function defineWebhook(options: WebhookOptions): ResourceDefinition {
  return resource("trigger", options.path, () =>
    compact({ type: "webhook", script: pathOf(options.script), enabled: options.enabled }),
  );
}

export interface ConnectionOptions {
  path: string;
  /** The connector to use. `http` is built in. */
  connector?: string;
  description?: string;
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
