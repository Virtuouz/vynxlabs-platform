/** What the platform tells an app about where it is served and for whom. */
export interface AppContext {
  /** The API's path on this address, for example `/api/v1`. */
  api: string;
  tenant: { id: string; slug: string; name: string };
  workspace: { id: string; slug: string };
  /** `interface` is set on an app made in the console: the path of the interface it shows. */
  app: { path: string; title: string; interface?: string };
  /** The path the app is served under, ending in a slash. Give it to your router. */
  base: string;
  /** Where the tenant's sign-in pages are, as a path on this address. */
  portal: string;
  /** Who the page was served to. */
  principal: Principal;
}

export interface Principal {
  type: "member" | "end_user" | "service_account" | "anonymous";
  id: string | null;
  name: string | null;
  email: string | null;
}

/** A request the API refused, with the server's own code and explanation. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** One entry per field, on a validation error. */
  readonly errors: { path: string; message: string }[];

  constructor(
    status: number,
    problem: {
      code?: string;
      detail?: string;
      title?: string;
      errors?: { path: string; message: string }[];
    },
  ) {
    super(problem.detail ?? problem.title ?? `The request failed (${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.code = problem.code ?? "error";
    this.errors = problem.errors ?? [];
  }
}

let cached: AppContext | undefined;

/**
 * The context the platform put in the page. It is read from an element the
 * platform adds when it serves the app, and when `platform dev` serves it.
 */
export function appContext(): AppContext {
  if (cached) return cached;
  const element = globalThis.document?.getElementById("vx-context");
  if (!element?.textContent) {
    throw new Error(
      "This page was not served by the platform. Open the app at its address, or run it with: platform dev",
    );
  }
  cached = JSON.parse(element.textContent) as AppContext;
  return cached;
}

/** Replaces the context. For tests. */
export function setAppContext(context: AppContext | undefined): void {
  cached = context;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${appContext().api}${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text === "" ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof parsed === "object" && parsed !== null ? parsed : {},
    );
  }
  return parsed as T;
}

/**
 * The platform's public API, for anything the helpers below do not cover.
 * Paths are as in the API description, without the `/api/v1` prefix.
 */
export const api = {
  get: <T = unknown>(path: string) => call<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
  put: <T = unknown>(path: string, body?: unknown) => call<T>("PUT", path, body ?? {}),
  patch: <T = unknown>(path: string, body?: unknown) => call<T>("PATCH", path, body ?? {}),
  delete: <T = unknown>(path: string) => call<T>("DELETE", path),
};

const workspacePath = () => {
  const { tenant, workspace } = appContext();
  return `/tenants/${tenant.id}/workspaces/${workspace.id}`;
};

// ----- Tables -----

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
  /** `nextCursor` from the page before. */
  cursor?: string;
}

export interface Page<Row> {
  items: Row[];
  /** Pass it back as `cursor` for the next page. Null on the last. */
  nextCursor: string | null;
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
  items: { by: Record<string, unknown>; values: Record<string, number | string | null> }[];
  /** True when there were more groups than `limit`. */
  truncated: boolean;
}

/** Anything that carries a table's row types: what `defineTable` returns. */
interface TableTypes {
  readonly __row?: unknown;
  readonly __insert?: unknown;
}
type Known<T> = unknown extends T ? Record<string, unknown> : NonNullable<T>;
type RowOf<T> = T extends { readonly __row?: infer Row } ? Known<Row> : Record<string, unknown>;
type InsertOf<T> = T extends { readonly __insert?: infer Insert }
  ? Known<Insert>
  : Record<string, unknown>;

/** Reads and writes the rows of one table, as the person using the app. */
export interface AppTable<Row, Insert> {
  /** One page of rows. The table's row policy decides which rows the person sees. */
  find(options?: FindOptions): Promise<Page<Row>>;
  /** The row with this ID, or null when there is none the person may see. */
  get(id: string): Promise<Row | null>;
  insert(row: Insert): Promise<Row>;
  /** Up to 1,000 rows. Either all are inserted or none. */
  insertMany(rows: Insert[]): Promise<Row[]>;
  update(id: string, changes: Partial<Insert>): Promise<Row>;
  delete(id: string): Promise<void>;
  /**
   * Counts, sums, averages, the least and the most, over the rows the person
   * may see, or over groups of them.
   */
  aggregate(options?: AggregateOptions): Promise<Aggregated>;
}

/**
 * A table of the app's workspace, by its path. For typed rows, give the type of
 * the table's definition, imported as a type so that none of the repository's
 * server code reaches the browser:
 *
 *     import type { orders } from "../../src/index.ts";
 *     const rows = await table<typeof orders>("orders").find();
 */
export function table<Definition extends TableTypes = TableTypes>(
  path: string,
): AppTable<RowOf<Definition>, InsertOf<Definition>> {
  type Row = RowOf<Definition>;
  type Insert = InsertOf<Definition>;
  const rows = () => `${workspacePath()}/rows/${path}`;
  const row = (id: string) => `${workspacePath()}/row/${encodeURIComponent(id)}/${path}`;
  return {
    find(options = {}) {
      const query = new URLSearchParams();
      if (options.filter) query.set("filter", JSON.stringify(options.filter));
      if (options.sort?.length) query.set("sort", options.sort.join(","));
      if (options.limit !== undefined) query.set("limit", String(options.limit));
      if (options.cursor) query.set("cursor", options.cursor);
      const text = query.toString();
      return api.get<Page<Row>>(`${rows()}${text ? `?${text}` : ""}`);
    },
    async get(id) {
      try {
        return await api.get<Row>(row(id));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    async insert(values: Insert) {
      const created = await api.post<{ items: Row[] }>(rows(), values);
      return created.items[0] as Row;
    },
    async insertMany(values: Insert[]) {
      return (await api.post<{ items: Row[] }>(rows(), { rows: values })).items;
    },
    update: (id, changes) => api.patch<Row>(row(id), changes),
    async delete(id) {
      await api.delete(row(id));
    },
    aggregate(options = {}) {
      const query = new URLSearchParams();
      if (options.group?.length) query.set("group", options.group.join(","));
      if (options.measures?.length) query.set("measure", options.measures.join(","));
      if (options.filter) query.set("filter", JSON.stringify(options.filter));
      if (options.sort?.length) query.set("sort", options.sort.join(","));
      if (options.limit !== undefined) query.set("limit", String(options.limit));
      const text = query.toString();
      return api.get<Aggregated>(`${workspacePath()}/aggregate/${path}${text ? `?${text}` : ""}`);
    },
  };
}

// ----- Scripts -----

export interface Run<Output = unknown> {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  output: Output | null;
  error: { message: string } | null;
}

/** A run that ended without succeeding. */
export class RunError extends Error {
  readonly run: Run;
  constructor(run: Run) {
    super(run.error?.message ?? `The run ended as ${run.status}.`);
    this.name = "RunError";
    this.run = run;
  }
}

const ENDED = new Set(["succeeded", "failed", "cancelled"]);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts a script and waits for what it returns. The script runs on a worker,
 * as itself. It can read who started it from `ctx.run.startedBy` and act for
 * that person. The person needs `run:write` on the script.
 *
 * Throws `RunError` when the run fails, and when it has not ended after
 * `timeoutMs` (default 60 seconds). The run itself goes on.
 */
export async function runScript<Output = unknown>(
  script: string,
  input: unknown = {},
  options: { timeoutMs?: number; idempotencyKey?: string } = {},
): Promise<Output> {
  const runs = `${workspacePath()}/runs`;
  let run = await api.post<Run<Output>>(runs, {
    script,
    input,
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
  });
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let pause = 200;
  while (!ENDED.has(run.status)) {
    if (Date.now() > deadline) {
      throw new RunError({
        ...run,
        error: { message: "The script is still running. Try again in a moment." },
      });
    }
    await wait(pause);
    pause = Math.min(pause * 1.5, 2000);
    run = await api.get<Run<Output>>(`${runs}/${run.id}`);
  }
  if (run.status !== "succeeded") throw new RunError(run);
  return run.output as Output;
}

/** A flow run as an app sees it: how it ended and what it gave. */
export interface FlowRun<Output = unknown> {
  id: string;
  flow: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  output?: Output;
  error?: { message: string } | null;
}

/** Thrown by `runFlow` when the flow fails, is cancelled, or has not ended in time. */
export class FlowRunError extends Error {
  constructor(readonly flowRun: FlowRun) {
    super(flowRun.error?.message ?? `The flow ended as ${flowRun.status}.`);
    this.name = "FlowRunError";
  }
}

/**
 * Starts a flow from its manual trigger and returns at once, with the flow
 * run's ID. A flow can wait for hours, for an approval or a delay, so an app
 * usually starts one and says that it has started. Read it later with
 * `flowRun`. The person needs `flow_run:write` on the flow.
 */
export async function startFlow(
  flow: string,
  input: unknown = {},
  options: { idempotencyKey?: string } = {},
): Promise<FlowRun> {
  return api.post<FlowRun>(`${workspacePath()}/flow-runs`, {
    flow,
    input,
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
  });
}

/** A flow run this person started: whether it has ended, and what it gave. */
export async function flowRun<Output = unknown>(id: string): Promise<FlowRun<Output>> {
  return api.get<FlowRun<Output>>(`${workspacePath()}/flow-runs/${id}`);
}

/**
 * Starts a flow and waits for what it gives. For a flow that ends within
 * seconds. Throws `FlowRunError` when it fails, and when it has not ended
 * after `timeoutMs` (default 60 seconds). The flow itself goes on.
 */
export async function runFlow<Output = unknown>(
  flow: string,
  input: unknown = {},
  options: { timeoutMs?: number; idempotencyKey?: string } = {},
): Promise<Output> {
  let run = (await startFlow(flow, input, options)) as FlowRun<Output>;
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let pause = 200;
  while (run.status === "running") {
    if (Date.now() > deadline) {
      throw new FlowRunError({
        ...run,
        error: { message: "The flow is still running. Look again in a moment." },
      });
    }
    await wait(pause);
    pause = Math.min(pause * 1.5, 2000);
    run = await flowRun<Output>(run.id);
  }
  if (run.status !== "succeeded") throw new FlowRunError(run);
  return run.output as Output;
}

// ----- Who is using the app -----

export interface Session {
  principal: Principal;
  /** Whether people may make their own account in this tenant. */
  signUp: boolean;
}

/** Who is using the app now. The page's own context says who it was served to. */
export function session(): Promise<Session> {
  return api.get<Session>(`/tenants/${appContext().tenant.id}/session`);
}

const here = () => `${globalThis.location.pathname}${globalThis.location.search}`;

/** The address of the sign-in page, which sends the person back to where they are now. */
export function signInUrl(returnTo: string = here()): string {
  return `${appContext().portal}/sign-in?return=${encodeURIComponent(returnTo)}`;
}

/** The address that signs a member of staff in to this app. */
export function staffSignInUrl(returnTo: string = here()): string {
  return `${appContext().portal}/staff?return=${encodeURIComponent(returnTo)}`;
}

/** Ends the person's sign-in to this tenant's apps. A member's console session is left alone. */
export async function signOut(): Promise<void> {
  await api.post(`/tenants/${appContext().tenant.id}/end-user-auth/sign-out`);
}

/** The tenant's logo, if it has set one. */
export function logoUrl(): string {
  const context = appContext();
  return `${context.api}/tenants/${context.tenant.id}/portal/logo`;
}
