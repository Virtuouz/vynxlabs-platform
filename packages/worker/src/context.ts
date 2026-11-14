import type { BundleManifest } from "@vynxlabs/manifest";
import { type Connector, httpConnector, type ScriptContext, type TableClient } from "@vynxlabs/sdk";
import { smtpConnector } from "./smtp.js";

/** A job as the control plane hands it out. */
export interface Job {
  runId: string;
  attempt: number;
  workspaceId: string;
  script: { path: string; entry: string };
  input: unknown;
  bundle: { id: string; digest: string };
  timeoutSeconds: number;
  heartbeatSeconds: number;
  idempotencyKey: string;
  trigger: { type: string; [detail: string]: unknown };
  /** Absent from a control plane older than 0.4.0. */
  startedBy?: { type: string; id: string | null };
  /** The most memory the script may use. Absent from an older control plane. */
  memoryMb?: number;
}

export interface LogEntry {
  time: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  fields?: Record<string, unknown>;
}

/** A bundle as a runner holds it: what its code exports, and what it says it contains. */
export interface Loaded {
  exports: Record<string, unknown>;
  manifests: BundleManifest[];
}

/** A call to the control plane under the worker protocol, made for the run in hand. */
export type Call = <T>(method: "GET" | "POST", path: string, body?: unknown) => Promise<T>;

/** The connectors every worker has. A bundle may bring more. */
const BUILTIN = new Map<string, Connector<unknown, unknown>>([
  ["http", httpConnector as Connector<unknown, unknown>],
  ["smtp", smtpConnector as Connector<unknown, unknown>],
]);

interface Bound {
  connector: string;
  config: unknown;
  credential?: string;
}

/**
 * What a script is handed as `ctx`. Every reach outside the script goes through
 * `call`, scoped to the script's own run; the worker credential is never here.
 */
export function buildContext({
  job,
  call,
  loaded,
  signal,
  write,
}: {
  job: Job;
  call: Call;
  loaded: Loaded;
  signal: AbortSignal;
  write: (entry: LogEntry) => void;
}): ScriptContext {
  const runPath = `/runs/${job.runId}`;
  const log = (level: LogEntry["level"]) => (message: string, fields?: Record<string, unknown>) =>
    write({
      time: new Date().toISOString(),
      level,
      message: String(message),
      ...(fields ? { fields } : {}),
    });

  const data = async <T>(
    table: string,
    source: string | undefined,
    as: string | undefined,
    op: string,
    args: object,
  ) =>
    (
      await call<{ result: T }>("POST", `${runPath}/data`, {
        attempt: job.attempt,
        table,
        ...(source ? { source } : {}),
        ...(as ? { as } : {}),
        op,
        args,
      })
    ).result;
  const tableClient = <Row, Insert>(
    table: string,
    source: string | undefined,
    as: string | undefined,
  ): TableClient<Row, Insert> => ({
    find: async (options = {}) =>
      (await data<{ items: Row[] }>(table, source, as, "find", options)).items,
    get: (id) => data<Row | null>(table, source, as, "get", { id }),
    insert: async (row) =>
      (await data<Row[]>(table, source, as, "insert", { rows: [row] }))[0] as Row,
    insertMany: (rows) => data<Row[]>(table, source, as, "insert", { rows }),
    update: (id, patch) => data<Row>(table, source, as, "update", { id, patch }),
    delete: async (id) => {
      await data<null>(table, source, as, "delete", { id });
    },
    aggregate: (options = {}) =>
      data(table, source, as, "aggregate", {
        group: options.group,
        measure: options.measures,
        filter: options.filter,
        sort: options.sort,
        limit: options.limit,
      }),
    as: (principalId) => tableClient<Row, Insert>(table, source, principalId),
  });
  const read = async <T>(path: string) =>
    call<T>("GET", `${runPath}${path}?attempt=${job.attempt}`);
  /**
   * The client for a bound connection. Its connector is one every worker has,
   * or one the run's own bundle carries, so a run uses the connector code it
   * was deployed with.
   */
  const connect = (bound: Bound) => {
    const builtin = BUILTIN.get(bound.connector);
    if (builtin) return builtin.create(bound.config, bound.credential, signal);
    const manifest = loaded.manifests.find(
      (candidate) => candidate.kind === "connector" && candidate.path === bound.connector,
    );
    const entry = (manifest?.body as { entry?: string } | undefined)?.entry;
    const own = entry
      ? (loaded.exports[entry] as Partial<Connector<unknown, unknown>> | undefined)
      : undefined;
    if (typeof own?.create !== "function") {
      throw new Error(
        `There is no connector "${bound.connector}": it is not one every worker has, and this run's bundle does not carry it.`,
      );
    }
    return own.create(bound.config, bound.credential, signal);
  };

  return {
    connection: async <Client>(path: string) =>
      connect(await read<Bound>(`/connections/${path}`)) as Client,
    connections: <Client>(group: string | { path: string }) => {
      const path = typeof group === "string" ? group : group.path;
      return {
        get: async (key: string) =>
          connect(
            await read<Bound>(`/connection-group-members/${encodeURIComponent(key)}/${path}`),
          ) as Client,
        keys: async () =>
          (await read<{ items: { key: string; label: string }[] }>(`/connection-groups/${path}`))
            .items,
      };
    },
    secret: async (name) =>
      (await read<{ value: string }>(`/secrets/${encodeURIComponent(name)}`)).value,
    variable: async (path) => (await read<{ value: string }>(`/variables/${path}`)).value,
    table: <Row, Insert>(table: string | { path: string }) =>
      tableClient<Row, Insert>(
        typeof table === "string" ? table : table.path,
        undefined,
        undefined,
      ),
    source: (source) => ({
      table: (name) =>
        tableClient<Record<string, unknown>, Partial<Record<string, unknown>>>(
          name,
          typeof source === "string" ? source : source.path,
          undefined,
        ),
    }),
    files: {
      put: async (name, content, contentType) => {
        const bytes =
          typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
        const stored = await call<{ id: string }>("POST", `${runPath}/files`, {
          attempt: job.attempt,
          name,
          ...(contentType ? { contentType } : {}),
          base64: bytes.toString("base64"),
        });
        return { id: stored.id };
      },
      get: async (id) => {
        const file = await read<{ name: string; contentType: string; base64: string }>(
          `/files/${id}`,
        );
        return {
          name: file.name,
          contentType: file.contentType,
          content: new Uint8Array(Buffer.from(file.base64, "base64")),
        };
      },
    },
    events: {
      publish: async (event, payload) => {
        await call("POST", `${runPath}/events`, { attempt: job.attempt, event, payload });
      },
    },
    log: {
      debug: log("debug"),
      info: log("info"),
      warn: log("warn"),
      error: log("error"),
    },
    run: {
      id: job.runId,
      attempt: job.attempt,
      idempotencyKey: job.idempotencyKey,
      trigger: job.trigger,
      startedBy: job.startedBy ?? { type: "system", id: null },
    },
    signal,
  };
}

/**
 * The calls a runner may ask its worker to make: reads and writes of its own
 * run's connections, secrets, variables, data, files and events. Never its
 * heartbeat, logs or result, which only the worker reports, and never another run.
 */
export function allowedCall(job: Job, method: string, path: string): boolean {
  const own = `/runs/${job.runId}/`;
  if (!path.startsWith(own)) return false;
  const rest = path.slice(own.length).split("?")[0] as string;
  // A URL folds `..`, `%2e%2e` and, for http, `\` into a path elsewhere. None is allowed.
  if (rest.includes("\\")) return false;
  for (const segment of rest.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return false;
    }
    // An encoded slash stays encoded in a URL; only the dot segments move it.
    if (decoded === "." || decoded === "..") return false;
  }
  const [first] = rest.split("/");
  if (method === "GET") {
    return [
      "connections",
      "connection-group-members",
      "connection-groups",
      "secrets",
      "variables",
      "files",
    ].includes(first as string);
  }
  if (method === "POST") return ["data", "files", "events"].includes(rest);
  return false;
}
