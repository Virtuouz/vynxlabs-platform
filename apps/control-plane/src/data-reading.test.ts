import { Database, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * Reading a data source and a saved query on a page: a source that cannot be reached, its health,
 * a saved query's parameters, names that need quoting, the order of columns, and the time zone.
 */

const PASSWORD = "a-good-long-password";
const LONG = `warehouse_inventory_movements_${"x".repeat(45)}`;

let t: TestApp;
let tenant: string;
let dev: string;
let alice: Client;
let externalDb: TestDatabase;
let external: Database;
let sourceConfig: Record<string, unknown>;
let sourcePassword: string;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;
const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: kind === "dashboard" ? 3 : 1,
  path,
  ownership: "code",
  body,
});
function bundle(): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("table", "tasks", { columns: { title: { type: "text", required: true } } }),
      manifest("table", LONG, { columns: { title: { type: "text", required: true } } }),
      manifest("table", "visits", { columns: { at: { type: "timestamp", required: true } } }),
      manifest("data_source", "erp", { connector: "postgres" }),
      manifest("query", "reports/by-title", {
        sql: "select title from tasks where title = $1",
        parameters: [{ name: "title", type: "text", required: true }],
      }),
      manifest("query", "reports/by-count", {
        sql: "select title from tasks limit $1",
        parameters: [{ name: "n", type: "integer", default: 2 }],
      }),
      manifest("query", "reports/old-name", { sql: "select 1 as n" }),
    ],
    code: "",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
const on = (source: object) => ({
  widgets: [
    {
      id: "w",
      type: "core/table",
      at: { x: 0, y: 0, w: 12, h: 6 },
      data: { rows: { source } },
    },
  ],
});
/** What the widget "w" of a member's dashboard over this source reads. */
async function read(source: object, more = "") {
  const made = await alice.post(`${ws()}/dashboards`, { title: "Board" });
  const saved = await alice.put(`${ws()}/dashboards/${made.body.id}`, { body: on(source) });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  return alice.get(
    `${ws()}/widget-data?of=dashboard&path=${made.body.id}&widget=w${more}`,
  ) as Promise<Any>;
}

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const id = (await t.admin.post("/tenants", { slug: "acme", name: "acme" })).body.id as string;
  tenant = id;
  const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${id}/members`, {
    email: "alice@acme.example",
    name: "alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${id}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;

  externalDb = await createTestDatabase();
  external = new Database({ connectionString: externalDb.connectionString });
  const there = external.router.platform();
  await sql`create table customers (id serial primary key, name text not null)`.execute(there);
  await sql`insert into customers (name) select 'c' || n from generate_series(1, 10) n`.execute(
    there,
  );
  await sql`create table "order items" (id serial primary key, what text)`.execute(there);
  await sql`insert into "order items" (what) values ('pen')`.execute(there);
  await sql`create table events (id serial primary key, at timestamptz not null)`.execute(there);
  await sql`insert into events (at) values ('2026-03-01T02:00:00Z')`.execute(there);
  const parsed = new URL(externalDb.connectionString);
  sourceConfig = {
    host: parsed.hostname,
    port: Number(parsed.port),
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
  };
  sourcePassword = decodeURIComponent(parsed.password);
  const uploaded = await alice.post(`${ws()}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  const bound = await alice.put(`${ws()}/data-source-bindings/erp`, {
    config: sourceConfig,
    password: sourcePassword,
  });
  expect(bound.status).toBe(204);
  for (const title of ["a", "b", "c"]) {
    const added = await alice.post(`${ws()}/rows/tasks`, { title });
    expect(added.status, JSON.stringify(added.body)).toBeLessThan(300);
  }
}, 90_000);

afterAll(async () => {
  await t.stop();
  await external.close();
  await externalDb.drop();
});

describe("DAT-12: a widget over a source that cannot be reached", () => {
  test("answers as the rows route does, with the source's own words", async () => {
    await alice.put(`${ws()}/data-source-bindings/nowhere`, {
      config: { ...sourceConfig, host: "127.0.0.1", port: 1 },
    });
    const widget = await read({ visual: { table: "nowhere/customers", columns: ["name"] } });
    expect(widget.status, JSON.stringify(widget.body)).toBe(502);
    expect(widget.body).toMatchObject({
      code: "source_unreachable",
      detail: 'The data source "nowhere" could not be reached. Check its address.',
    });
  });
});

describe("DAT-13: a source's health", () => {
  const health = async (path: string) =>
    (await alice.get(`${ws()}/data-source-bindings`)).body.items.find(
      (one: Any) => one.path === path,
    )?.health;

  test("is forgotten when the source is changed or unbound", async () => {
    await alice.put(`${ws()}/data-source-bindings/hop`, {
      config: sourceConfig,
      password: sourcePassword,
    });
    expect((await alice.post(`${ws()}/data-source-checks/hop`)).body.ok).toBe(true);
    expect(await health("hop")).toMatchObject({ ok: true });
    await alice.put(`${ws()}/data-source-bindings/hop`, {
      config: { ...sourceConfig, host: "127.0.0.1", port: 1 },
    });
    expect(await health("hop")).toBeNull();
    await alice.post(`${ws()}/data-source-checks/hop`);
    expect(await health("hop")).toMatchObject({ ok: false });
    await alice.delete(`${ws()}/data-source-bindings/hop`);
    await alice.put(`${ws()}/data-source-bindings/hop`, { config: sourceConfig });
    expect(await health("hop")).toBeNull();
  });

  test("is not kept for a path that is not bound", async () => {
    const checked = await alice.post(`${ws()}/data-source-checks/never/declared`);
    expect(checked.status).toBe(404);
    const kept = await t.db
      .selectFrom("health_check")
      .select("path")
      .where("workspace_id", "=", dev)
      .where("path", "=", "never/declared")
      .execute();
    expect(kept).toEqual([]);
  });
});

describe("DAT-17: a widget over a saved query", () => {
  test("refuses a required parameter with no value, as the saved route does", async () => {
    const saved = await alice.get(`${ws()}/queries/saved/reports/by-title`);
    expect(saved.status).toBe(400);
    const widget = await read({ query: "reports/by-title" });
    expect(widget.status, JSON.stringify(widget.body)).toBe(400);
    expect(JSON.stringify(widget.body)).toContain("title");
    const given = await read({ query: "reports/by-title", values: { title: "a" } });
    expect(given.status, JSON.stringify(given.body)).toBe(200);
    expect(given.body.inputs.rows.rows.length).toBe(1);
  });

  test("refuses a value that does not fit, naming the parameter", async () => {
    const widget = await read({ query: "reports/by-count", values: { n: "abc" } });
    expect(widget.status, JSON.stringify(widget.body)).toBe(400);
    expect(JSON.stringify(widget.body)).toContain("n");
    expect(JSON.stringify(widget.body)).toContain("whole number");
  });

  test("refuses a name the query does not have", async () => {
    const widget = await read({ query: "reports/by-count", values: { m: 1 } });
    expect(widget.status, JSON.stringify(widget.body)).toBe(400);
    expect(JSON.stringify(widget.body)).toContain("m");
  });
});

describe("DAT-19: a list over a source's table", () => {
  test("has no next page past its own limit", async () => {
    const page = await read(
      { visual: { table: "erp/customers", columns: ["name"], sort: [{ by: "name" }], limit: 3 } },
      "&input=rows&size=3",
    );
    expect(page.status, JSON.stringify(page.body)).toBe(200);
    expect(page.body.inputs.rows.rows.length).toBe(3);
    expect(page.body.inputs.rows.next ?? null).toBeNull();
  });
});

describe("DAT-20: a table whose path is over 63 bytes", () => {
  test("can be put on a page", async () => {
    expect(Buffer.byteLength(LONG)).toBeGreaterThan(63);
    await alice.post(`${ws()}/rows/${LONG}`, { title: "long one" });
    const widget = await read({ visual: { table: LONG, columns: ["title"] } });
    expect(widget.status, JSON.stringify(widget.body)).toBe(200);
    expect(widget.body.inputs.rows.rows.length).toBe(1);
  });

  test("is offered to a page, and said to be one SQL cannot name", async () => {
    const schema = await alice.get(`${ws()}/queries/schema`);
    const offered = schema.body.tables.find((one: Any) => one.name === LONG);
    expect(offered, "listed").toBeDefined();
    expect(offered.inSql).toBe(false);
    expect(schema.body.tables.find((one: Any) => one.name === "tasks").inSql).toBe(true);
  });
});

describe("DAT-21: a source's table with a space in its name", () => {
  test("is listed and its rows can be read", async () => {
    const tables = await alice.get(`${ws()}/data-source-tables/erp`);
    expect(tables.body.items.map((one: Any) => one.name)).toContain("order items");
    const rows = await alice.get(`${ws()}/source-rows/${encodeURIComponent("order items")}/erp`);
    expect(rows.status, JSON.stringify(rows.body)).toBe(200);
    expect(rows.body.items[0].what).toBe("pen");
  });
});

describe("DAT-22: the columns of a SQL result", () => {
  const run = (text: string) => alice.post(`${ws()}/queries/run`, { sql: text });

  test("keep the order they were written in", async () => {
    const result = await run(`select 'x' as name, 1 as "2025", 2 as "2024"`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.columns.map((one: Any) => one.name)).toEqual(["name", "2025", "2024"]);
    expect(result.body.rows).toEqual([["x", 1, 2]]);
  });

  test("keep a whole number past 2^53 whole, and columns of one name", async () => {
    const big = await run("select 9007199254740993 as big");
    expect(big.body.rows).toEqual([["9007199254740993"]]);
    const same = await run("select 1 as a, 2 as a");
    expect(same.body.columns.map((one: Any) => one.name)).toEqual(["a", "a"]);
    expect(same.body.rows).toEqual([[1, 2]]);
  });

  test("are named when there are no rows", async () => {
    const none = await run("select 1 as a, 'x' as b where false");
    expect(none.body.columns.map((one: Any) => one.name)).toEqual(["a", "b"]);
    expect(none.body.rows).toEqual([]);
  });
});

describe("DAT-25: a query renamed and not yet deployed", () => {
  test("is listed once, at its new path", async () => {
    const url = `${ws()}/drafts/reports/old-name`;
    const seen = await alice.get(url);
    const renamed = await alice.put(url, {
      kind: "query",
      schemaVersion: 1,
      body: { sql: "select 1 as n" },
      path: "reports/new-name",
      ...(seen.status === 200 ? { revision: seen.body.revision } : {}),
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBeLessThan(300);
    const items = (await alice.get(`${ws()}/queries`)).body.items.filter((one: Any) =>
      /reports\/(old|new)-name/.test(one.path),
    );
    expect(items.map((one: Any) => [one.path, one.draft])).toEqual([
      ["reports/new-name", "changed"],
    ]);
    expect(items[0].renamedFrom).toBe("reports/old-name");
  });
});

describe("DAT-16: days are UTC", () => {
  test("rows of a source are read in UTC whatever the database's zone", async () => {
    await sql
      .raw(`alter database "${sourceConfig.database}" set timezone to 'America/New_York'`)
      .execute(external.router.platform());
    // A binding made now opens its connections after the setting.
    await alice.put(`${ws()}/data-source-bindings/east`, {
      config: sourceConfig,
      password: sourcePassword,
    });
    const filter = encodeURIComponent(
      JSON.stringify({ column: "at", op: "gte", value: "2026-03-01" }),
    );
    const rows = await alice.get(`${ws()}/source-rows/events/east?filter=${filter}`);
    expect(rows.status, JSON.stringify(rows.body)).toBe(200);
    expect(rows.body.items.length).toBe(1);
  });

  test("a workspace table's days are UTC whatever the database's zone", async () => {
    const database = (await sql<{ d: string }>`select current_database() as d`.execute(t.db))
      .rows[0]?.d;
    await sql.raw(`alter database "${database}" set timezone to 'America/New_York'`).execute(t.db);
    await sql`select pg_terminate_backend(pid) from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()`.execute(t.db);
    await alice.post(`${ws()}/rows/visits`, { at: "2026-03-01T02:00:00Z" });
    const by = await alice.get(
      `${ws()}/queries/visual?query=${encodeURIComponent(
        JSON.stringify({
          table: "visits",
          groupBy: [{ column: "at", bucket: "month" }],
          measures: [{ fn: "count", as: "n" }],
        }),
      )}`,
    );
    expect(by.status, JSON.stringify(by.body)).toBe(200);
    expect(JSON.stringify(by.body.rows)).toContain("2026-03");
  });
});
