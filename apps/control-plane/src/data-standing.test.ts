import { Database, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * Who may put a data source's table, or SQL, on a page; where a source's stored password may go;
 * what a stranger is told by the query routes; and a dashboard saved twice at once.
 */

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let alice: Client;
let gina: Client;
let plain: Client;
let reader: Client;
let author: Client;
let nodata: Client;
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
      manifest("data_source", "erp", { connector: "postgres" }),
      manifest("query", "reports/open", {
        sql: "select title from tasks where title = $1",
        parameters: [{ name: "title", type: "text", required: true }],
      }),
    ],
    code: "",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
const widget = (source: object) => ({
  id: "w",
  type: "core/table",
  at: { x: 0, y: 0, w: 12, h: 6 },
  data: { rows: { source } },
});
const board = (source: object) => ({ widgets: [widget(source)] });
const onSource = { visual: { table: "erp/customers", columns: ["name"] } };
const withSql = { sql: "select 1 as n" };

async function signedIn(email: string, permissions: string[]) {
  const made = await alice.post(`/tenants/${tenant}/roles`, {
    name: email.split("@")[0],
    permissions,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const role = made.body.id;
  const member = await alice.post(`/tenants/${tenant}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  await alice.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: role,
  });
  return t.signIn(email, PASSWORD);
}

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const seed = async (slug: string, email: string) => {
    const id = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
    const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const member = await t.admin.post(`/tenants/${id}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${id}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
    await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
    return { id, client: await t.signIn(email, PASSWORD) };
  };
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  gina = (await seed("globex", "gina@globex.example")).client;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;
  const common = [
    "dashboard:read",
    "dashboard:write",
    "data:read",
    "resource:read",
    "resource:write",
    "deployment:read",
    "deployment:write",
  ];
  plain = await signedIn("plain@acme.example", common);
  reader = await signedIn("reader@acme.example", [...common, "data_source:read"]);
  author = await signedIn("author@acme.example", [...common, "data_source:read", "sql:read"]);
  nodata = await signedIn("nodata@acme.example", ["dashboard:read"]);

  externalDb = await createTestDatabase();
  external = new Database({ connectionString: externalDb.connectionString });
  await sql`create table customers (id serial primary key, name text not null)`.execute(
    external.router.platform(),
  );
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
}, 60_000);

afterAll(async () => {
  await t.stop();
  await external.close();
  await externalDb.drop();
});

const draft = (client: Client, path: string, kind: string, body: object, more: object = {}) =>
  client.put(`${ws()}/drafts/${path}`, {
    kind,
    schemaVersion: kind === "dashboard" ? 3 : 1,
    body,
    ...more,
  });

describe("a data source's table on a page", () => {
  test("is saved in a member's dashboard only by whoever may read the source", async () => {
    const made = await plain.post(`${ws()}/dashboards`, { title: "Customers" });
    expect(made.status).toBe(201);
    const refused = await plain.put(`${ws()}/dashboards/${made.body.id}`, {
      body: board(onSource),
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.detail).toContain("data_source:read");
    const mine = await reader.post(`${ws()}/dashboards`, { title: "Customers" });
    const saved = await reader.put(`${ws()}/dashboards/${mine.body.id}`, {
      body: board(onSource),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  });

  test("is drafted, deployed and put as a resource only by whoever may read the source", async () => {
    expect((await draft(plain, "boards/customers", "dashboard", board(onSource))).status).toBe(403);
    expect(
      (
        await plain.put(`${ws()}/resources/boards/customers`, {
          kind: "dashboard",
          schemaVersion: 3,
          ownership: "ui",
          body: board(onSource),
        })
      ).status,
    ).toBe(403);
    // A table of the workspace is not a source's.
    expect(
      (
        await draft(
          plain,
          "boards/tasks",
          "dashboard",
          board({ visual: { table: "tasks", columns: ["title"] } }),
        )
      ).status,
    ).toBe(200);
    expect((await draft(reader, "boards/customers", "dashboard", board(onSource))).status).toBe(
      200,
    );
    // A draft made by someone who could, deployed by someone who could not.
    expect(
      (await plain.post(`${ws()}/changes/deploy`, { paths: ["boards/customers"] })).status,
    ).toBe(403);
    expect(
      (await reader.post(`${ws()}/changes/deploy`, { paths: ["boards/customers"] })).status,
    ).toBe(201);
  });
});

describe("SQL written in the console", () => {
  test("is drafted by whoever holds sql:read, and not by anyone else", async () => {
    expect((await draft(reader, "boards/sql", "dashboard", board(withSql))).status).toBe(403);
    expect((await draft(reader, "reports/new", "query", { sql: "select 1" })).status).toBe(403);
    expect((await draft(author, "boards/sql", "dashboard", board(withSql))).status).toBe(200);
    expect((await draft(author, "reports/new", "query", { sql: "select 1" })).status).toBe(200);
    // Restoring an earlier version of SQL is writing it.
    const saved = await draft(author, "boards/sql", "dashboard", board({ sql: "select 2 as n" }));
    expect(saved.status).toBe(200);
    const history = await author.get(`${ws()}/draft-history?path=boards/sql`);
    for (const one of history.body.items ?? []) {
      expect((await reader.post(`${ws()}/draft-history/${one.id}/restore`)).status).toBe(403);
    }
  });

  test("is deployed from the console only by whoever holds sql:read", async () => {
    expect((await reader.post(`${ws()}/changes/deploy`, { paths: ["reports/new"] })).status).toBe(
      403,
    );
    expect((await author.post(`${ws()}/changes/deploy`, { paths: ["reports/new"] })).status).toBe(
      201,
    );
  });

  test("a query changed only in its description needs no sql:read", async () => {
    const same = await draft(reader, "reports/new", "query", {
      sql: "select 1",
      description: "One",
    });
    expect(same.status, JSON.stringify(same.body)).toBe(200);
    expect((await draft(reader, "reports/new", "query", { sql: "select 3" })).status).toBe(403);
  });
});

describe("a source's stored password", () => {
  const put = (body: object) => alice.put(`${ws()}/data-source-bindings/erp`, body);

  test("is kept for the same host, port and user, and for a new database", async () => {
    expect((await put({ config: { ...sourceConfig, schema: "public" } })).status).toBe(204);
    expect(
      (await alice.get(`${ws()}/data-source-bindings`)).body.items.find(
        (row: Any) => row.path === "erp",
      ).hasPassword,
    ).toBe(true);
  });

  test("is dropped for another host, port or user, or a connection no longer encrypted", async () => {
    const held = async () =>
      (await alice.get(`${ws()}/data-source-bindings`)).body.items.find(
        (row: Any) => row.path === "erp",
      ).hasPassword;
    const restore = { config: { ...sourceConfig, ssl: true }, password: sourcePassword };
    for (const changed of [{ host: "db.other.example" }, { port: 5999 }, { user: "someone" }]) {
      expect((await put(restore)).status).toBe(204);
      expect(await held()).toBe(true);
      const answer = await put({ config: { ...sourceConfig, ssl: true, ...changed } });
      expect(answer.status, JSON.stringify(changed)).toBe(204);
      expect(await held(), JSON.stringify(changed)).toBe(false);
    }
    // Typed again, it goes with the new address.
    const typed = { config: { ...sourceConfig, port: 5999 }, password: "typed-again" };
    expect((await put(typed)).status).toBe(204);
    expect(await held()).toBe(true);
    // Encryption turned off sends it nowhere it was not given for.
    expect((await put(restore)).status).toBe(204);
    expect((await put({ config: { ...sourceConfig, ssl: false } })).status).toBe(204);
    expect(await held()).toBe(false);
  });
});

describe("what the query routes tell a stranger", () => {
  const asked = [
    () => `${ws()}/queries/schema`,
    () => `${ws()}/queries/visual?query=${encodeURIComponent(JSON.stringify({ table: "tasks" }))}`,
    () => `${ws()}/queries/visual?query=${encodeURIComponent(JSON.stringify({ table: "nope" }))}`,
    () =>
      `${ws()}/queries/visual?query=${encodeURIComponent(JSON.stringify({ table: "tasks", columns: ["nope"] }))}`,
    () => `${ws()}/queries/saved/reports/open`,
    () => `${ws()}/queries/saved/reports/open?params=${encodeURIComponent('{"extra":1}')}`,
    () => `${ws()}/queries/saved/reports/missing`,
  ];

  test("a member of another tenant is given one answer for all", async () => {
    const answers = await Promise.all(asked.map((url) => gina.get(url())));
    expect(answers.map((one) => one.status)).toEqual(asked.map(() => 404));
    expect(new Set(answers.map((one) => one.body.detail)).size).toBe(1);
  });

  test("a member with no data:read cannot tell a table from one that is not there", async () => {
    const answers = await Promise.all([1, 2, 3].map((n) => nodata.get(asked[n]?.() as string)));
    // A table they may not read, a table that is not there, and a column of the first.
    expect(answers[0]?.status).toBe(400);
    expect(answers[1]?.status).toBe(400);
    const words = (answer: Any) => answer?.body.errors.map((one: Any) => one.message);
    expect(words(answers[0])).toEqual([expect.stringMatching(/^there is no table "tasks"/)]);
    expect(words(answers[1])).toEqual([expect.stringMatching(/^there is no table "nope"/)]);
    expect(words(answers[2])).toEqual(words(answers[0]));
    // And the saved query names no parameter before it refuses.
    const saved = await nodata.get(asked[5]?.() as string);
    expect(saved.status).toBe(403);
  });
});

describe("a dashboard saved twice with one revision", () => {
  test("is accepted once", async () => {
    const made = await reader.post(`${ws()}/dashboards`, { title: "Race" });
    const url = `${ws()}/dashboards/${made.body.id}`;
    const answers = await Promise.all(
      [1, 2, 3, 4].map((n) => reader.put(url, { revision: 1, title: `Title ${n}` })),
    );
    expect(answers.map((one) => one.status).sort()).toEqual([200, 409, 409, 409]);
    expect((await reader.get(url)).body.revision).toBe(2);
  });
});
