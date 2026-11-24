/**
 * A stand-in for what a script is given when it runs, for tests of a tenant's own code:
 *
 *     import { runScript } from "@volvel/sdk/testing";
 *     const { output, logs } = await runScript(charge, { customerId: "c1" }, {
 *       connections: { shop: fakeShop },
 *       secrets: { "api-key": "k" },
 *     });
 *
 * It holds a script to what the platform holds it to: a connection, secret, variable, table,
 * source or event the script did not declare is refused, one it declared and was not given is
 * said to be missing, and the input and the output are checked against the script's schemas.
 * Nothing leaves the process.
 */
import type { Logger, RunInfo, ScriptContext } from "./context.js";
import type { ScriptDefinition } from "./index.js";
import type { FindOptions, TableClient } from "./tables.js";

// biome-ignore lint/suspicious/noExplicitAny: a stand-in is typed by the test's own rows
type AnyTable = TableClient<any, any>;

/** What a test gives a script to run with. All of it is optional. */
export interface TestOptions {
  /** A client for each connection, by its path: a fake of what the connector would give. */
  connections?: Record<string, unknown>;
  /** The members of each connection group, by the group's path and then the member's key. */
  groups?: Record<string, Record<string, { client: unknown; label?: string }>>;
  secrets?: Record<string, string>;
  variables?: Record<string, string>;
  /** A table as the test wants it to behave: an object that stands in for it, or rows to start from. */
  tables?: Record<string, AnyTable | Record<string, unknown>[]>;
  /** A data source's tables, by the source's path and then the table's name. */
  sources?: Record<string, Record<string, AnyTable | Record<string, unknown>[]>>;
  /** Who started the run. Default: the system. */
  startedBy?: RunInfo["startedBy"];
  trigger?: RunInfo["trigger"];
  attempt?: number;
  /** The run's own signal, to test a script that is canceled. */
  signal?: AbortSignal;
}

/** What a run did, besides what it returned. */
export interface Recorded {
  logs: { level: keyof Logger; message: string; fields?: Record<string, unknown> }[];
  events: { event: string; payload: Record<string, unknown> }[];
  tags: string[];
  files: { id: string; name: string; contentType: string; content: Uint8Array }[];
}

/** A script's context for a test: everything a run has, and what it recorded. */
export type TestContext = ScriptContext & { recorded: Recorded };

/** What a script declared it uses. A context made with no declaration allows what it is given. */
export interface Declared {
  connections?: string[];
  connectionGroups?: string[];
  secrets?: string[];
  variables?: string[];
  events?: string[];
  tables?: string[];
  sources?: string[];
}

/** An in-memory table, for a test that only needs rows to read and write. */
export function memoryTable<Row extends Record<string, unknown>>(
  start: Row[] = [],
): TableClient<Row, Partial<Row>> & { rows: Row[] } {
  const rows: Row[] = start.map((row, at) => ({ id: `row-${at + 1}`, ...row }));
  let made = rows.length;
  const same = (row: Row, id: string) => (row as { id?: unknown }).id === id;
  const table: TableClient<Row, Partial<Row>> & { rows: Row[] } = {
    rows,
    async find(options: FindOptions = {}) {
      const from = options.offset ?? 0;
      return rows.slice(from, from + (options.limit ?? 50));
    },
    async get(id) {
      return rows.find((row) => same(row, id)) ?? null;
    },
    async insert(row) {
      made += 1;
      const stored = { id: `row-${made}`, ...row } as unknown as Row;
      rows.push(stored);
      return stored;
    },
    async insertMany(many) {
      return Promise.all(many.map((row) => table.insert(row)));
    },
    async update(id, changes) {
      const found = rows.find((row) => same(row, id));
      if (!found) throw new Error(`There is no row ${id} in this table.`);
      Object.assign(found, changes);
      return found;
    },
    async delete(id) {
      const at = rows.findIndex((row) => same(row, id));
      if (at >= 0) rows.splice(at, 1);
    },
    async aggregate() {
      return { items: [{ by: {}, values: { count: rows.length } }], truncated: false };
    },
    as: () => table,
  };
  return table;
}

const asTable = (given: AnyTable | Record<string, unknown>[]) =>
  (Array.isArray(given) ? memoryTable(given) : given) as unknown as TableClient<
    Record<string, unknown>
  >;

/**
 * The context of a run for a test. Give `declared` (as `runScript` does, from the script) to
 * hold it to the script's own declarations.
 */
export function testContext(options: TestOptions = {}, declared?: Declared): TestContext {
  const recorded: Recorded = { logs: [], events: [], tags: [], files: [] };
  const abort = new AbortController();
  const must = (kind: string, name: string, list: string[] | undefined) => {
    if (list && !list.includes(name)) {
      throw new Error(
        `The script did not declare the ${kind} "${name}". Add it to the script's definition.`,
      );
    }
  };
  const missing = (kind: string, name: string, where: string): never => {
    throw new Error(`The ${kind} "${name}" has no stand-in in this test. Give one under ${where}.`);
  };
  const pathOf = (value: string | { path: string }) =>
    typeof value === "string" ? value : value.path;
  const log = (level: keyof Logger) => (message: string, fields?: Record<string, unknown>) => {
    recorded.logs.push({ level, message, ...(fields ? { fields } : {}) });
  };
  let files = 0;
  const context: TestContext = {
    recorded,
    async connection(path) {
      must("connection", path, declared?.connections);
      if (!options.connections || !(path in options.connections))
        missing("connection", path, "connections");
      return (options.connections as Record<string, unknown>)[path] as never;
    },
    connections(group) {
      const path = pathOf(group);
      must("connection group", path, declared?.connectionGroups);
      const members = () => {
        const found = options.groups?.[path];
        if (!found) missing("connection group", path, "groups");
        return found as NonNullable<TestOptions["groups"]>[string];
      };
      return {
        async get(key) {
          const member = members()[key];
          if (!member) {
            throw new Error(`The group "${path}" has no member "${key}" in this test.`);
          }
          return member.client as never;
        },
        async keys() {
          return Object.entries(members()).map(([key, member]) => ({
            key,
            label: member.label ?? key,
          }));
        },
      };
    },
    async secret(name) {
      must("secret", name, declared?.secrets);
      const value = options.secrets?.[name];
      if (value === undefined) missing("secret", name, "secrets");
      return value as string;
    },
    async variable(path) {
      must("variable", path, declared?.variables);
      const value = options.variables?.[path];
      if (value === undefined) missing("variable", path, "variables");
      return value as string;
    },
    table(table: string | { path: string }) {
      const path = pathOf(table);
      must("table", path, declared?.tables);
      const given = options.tables?.[path];
      if (given === undefined) missing("table", path, "tables");
      return asTable(given as never) as never;
    },
    source(source) {
      const path = pathOf(source);
      must("data source", path, declared?.sources);
      return {
        table: (name: string) => {
          const given = options.sources?.[path]?.[name];
          if (given === undefined) missing("table", `${path}/${name}`, "sources");
          return asTable(given as never);
        },
      };
    },
    files: {
      async put(name, content, contentType = "application/octet-stream") {
        files += 1;
        const id = `file-${files}`;
        const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
        recorded.files.push({ id, name, contentType, content: bytes });
        return { id };
      },
      async get(id) {
        const found = recorded.files.find((file) => file.id === id);
        if (!found) throw new Error(`There is no file ${id} in this test.`);
        return { name: found.name, contentType: found.contentType, content: found.content };
      },
    },
    events: {
      async publish(event: string, payload: Record<string, unknown>) {
        must("event", event, declared?.events);
        recorded.events.push({ event, payload });
      },
    },
    log: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
    run: {
      id: "test-run",
      attempt: options.attempt ?? 1,
      idempotencyKey: "test-run-key",
      trigger: options.trigger ?? { type: "test" },
      startedBy: options.startedBy ?? { type: "system", id: null },
      async tag(...tags) {
        recorded.tags.push(...tags);
      },
    },
    signal: options.signal ?? abort.signal,
  };
  return context;
}

/**
 * Runs a script as the platform would, with input checked, output checked and its declarations
 * held to, in the process of the test. What it returned, and what it logged, published and
 * tagged, come back.
 */
export async function runScript(
  script: ScriptDefinition,
  input: unknown,
  options: TestOptions = {},
): Promise<{ output: unknown } & Recorded> {
  const uses = (script.toManifest("script").body as { uses?: Declared }).uses ?? {};
  const context = testContext(options, uses);
  const output = await script.execute(input, context);
  return { output, ...context.recorded };
}
