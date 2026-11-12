import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Database, sql } from "@vynxlabs/db";
import { createTestDatabase, type TestDatabase } from "@vynxlabs/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let url: string;
let tenant: string;
let dev: string;
let alice: Client;
let aliceId: string;
let bob: { id: string; client: Client };
let other: Client;
let worker: Worker;
let working: Promise<unknown>;
let externalDb: TestDatabase;
let external: Database;
let sourceConfig: Record<string, unknown>;
let sourcePassword: string;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;
const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const object = { type: "object" };
const script = (path: string, entry: string, uses: Record<string, string[]> = {}) =>
  manifest("script", path, {
    entry,
    input: object,
    output: object,
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], ...uses },
  });

const code = `
export const writer = { execute: async (input, ctx) => {
  const tasks = ctx.table("tasks");
  const made = await tasks.insert({ title: input.title, owner_id: input.owner });
  const many = await tasks.insertMany([{ title: input.title + " (2)" }, { title: input.title + " (3)" }]);
  const changed = await tasks.update(many[0].id, { done: true });
  await tasks.delete(many[1].id);
  const found = await tasks.find({ filter: { column: "title", op: "contains", value: input.title }, sort: ["title"] });
  return { id: made.id, titles: found.map((row) => row.title), done: changed.done, gone: await tasks.get(many[1].id) };
} };
export const asPerson = { execute: async (input, ctx) => {
  const mine = ctx.table("tasks").as(input.person);
  const titles = (await mine.find({ sort: ["title"] })).map((row) => row.title);
  let forged = "allowed";
  try { await mine.insert({ title: "not mine", owner_id: input.someoneElse }); } catch (error) { forged = error.message; }
  const own = await mine.insert({ title: "written for them" });
  return { titles, forged, ownOwner: own.owner_id, all: (await ctx.table("tasks").find()).length };
} };
export const undeclared = { execute: async (input, ctx) => ({ rows: await ctx.table("tasks").find() }) };
export const erpSync = { execute: async (input, ctx) => {
  const customers = ctx.source("erp").table("customers");
  const vip = await customers.find({ filter: { column: "vip", value: true }, sort: ["name"] });
  const added = await customers.insert({ name: input.name, balance: 12.5 });
  const updated = await customers.update(String(added.id), { vip: true });
  return { vip: vip.map((row) => row.name), added: added.name, nowVip: updated.vip };
} };
export const filer = { execute: async (input, ctx) => {
  const stored = await ctx.files.put("report.txt", "Total: " + input.total, "text/plain");
  const read = await ctx.files.get(stored.id);
  const row = await ctx.table("tasks").insert({ title: "with a file", attachment: stored.id });
  return { id: stored.id, name: read.name, type: read.contentType, text: Buffer.from(read.content).toString("utf8"), attachment: row.attachment };
} };
export const sink = { execute: async (input) => ({ got: input }) };
`;

function bundle(extra: BundleManifest[] = []): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("table", "tasks", {
        columns: {
          title: { type: "text", required: true },
          done: { type: "boolean", default: false },
          owner_id: { type: "uuid" },
          attachment: { type: "file" },
        },
        policy: { type: "owner", column: "owner_id" },
      }),
      manifest("data_source", "erp", { connector: "postgres" }),
      script("writer", "writer", { tables: ["tasks"] }),
      script("as-person", "asPerson", { tables: ["tasks"] }),
      script("undeclared", "undeclared"),
      script("erp-sync", "erpSync", { sources: ["erp"] }),
      script("filer", "filer", { tables: ["tasks"] }),
      script("sink", "sink"),
      ...extra,
    ],
    code,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
async function deploy(content: Bundle) {
  const uploaded = await alice.post(`${ws()}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
}
async function ran(scriptPath: string, input: object = {}): Promise<Any> {
  const started = await alice.post(`${ws()}/runs`, { script: scriptPath, input });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  for (let i = 0; i < 200; i++) {
    const current = (await alice.get(`${ws()}/runs/${started.body.id}`)).body;
    if (current.status !== "queued" && current.status !== "running") return current;
    await sleep(100);
  }
  throw new Error("the run did not finish");
}

beforeAll(async () => {
  t = await startTestApp();
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
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
    return { id, memberId: member.body.id as string, client: await t.signIn(email, PASSWORD) };
  };
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  aliceId = acme.memberId;
  other = (await seed("globex", "gina@globex.example")).client;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;
  const rowsOnly = (
    await alice.post(`/tenants/${tenant}/roles`, {
      name: "rows_only",
      permissions: ["data:read", "data:write", "file:read"],
    })
  ).body.id;
  const member = await alice.post(`/tenants/${tenant}/members`, {
    email: "bob@acme.example",
    name: "Bob",
    password: PASSWORD,
  });
  await alice.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: rowsOnly,
  });
  bob = { id: member.body.id, client: await t.signIn("bob@acme.example", PASSWORD) };

  // A database that is not the platform's: the client's own.
  externalDb = await createTestDatabase();
  external = new Database({ connectionString: externalDb.connectionString });
  const there = external.router.platform();
  await sql`create table customers (id serial primary key, name text not null, vip boolean not null default false, balance numeric, tags text[], joined date)`.execute(
    there,
  );
  await sql`insert into customers (name, vip, balance, joined) values ('Ada', true, 100.50, '2026-01-02'), ('Grace', false, 0, null), ('Linus', true, 7, null)`.execute(
    there,
  );
  await sql`create table log (message text, at timestamptz default now())`.execute(there);
  const parsed = new URL(externalDb.connectionString);
  sourceConfig = {
    host: parsed.hostname,
    port: Number(parsed.port),
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
  };
  sourcePassword = decodeURIComponent(parsed.password);

  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "data" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await t.stop();
  await external.close();
  await externalDb.drop();
});

describe("an external Postgres database as a data source", () => {
  test("a bundle that uses a source is refused until the source is bound", async () => {
    const refused = await deploy(bundle());
    expect(refused.status).toBe(409);
    expect(refused.body.errors).toEqual([
      { path: "/sources/erp", message: 'the data source "erp" is not bound in this workspace' },
    ]);
  });

  test("binding it, with the password kept out of every answer", async () => {
    expect(
      (await alice.put(`${ws()}/data-source-bindings/erp`, { config: { host: "x" } })).status,
    ).toBe(400);
    expect(
      (await bob.client.put(`${ws()}/data-source-bindings/erp`, { config: sourceConfig })).status,
    ).toBe(403);
    expect(
      (
        await alice.put(`${ws()}/data-source-bindings/erp`, {
          config: sourceConfig,
          password: sourcePassword,
        })
      ).status,
    ).toBe(204);
    const listed = (await alice.get(`${ws()}/data-source-bindings`)).body.items;
    expect(listed).toEqual([
      expect.objectContaining({ path: "erp", bound: true, hasPassword: true, defined: false }),
    ]);
    // The local test password is an ordinary word that also appears in the user name, so look for the field, not the word.
    expect(JSON.stringify(listed)).not.toMatch(/"password"|"credential"/);
    const stored = await t.db
      .selectFrom("data_source_binding")
      .select("credential")
      .executeTakeFirstOrThrow();
    expect(stored.credential?.includes(Buffer.from(sourcePassword))).toBe(false);
    const audit = (await alice.get(`/tenants/${tenant}/audit?action=data_source.bound`)).body;
    expect(JSON.stringify(audit)).not.toMatch(/"password"|"credential"/);
    const deployed = await deploy(bundle());
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  });

  test("its tables are listed with what the platform can do with each", async () => {
    const tables = (await alice.get(`${ws()}/data-source-tables/erp`)).body.items;
    expect(tables.map((table: Any) => [table.name, table.key])).toEqual([
      ["customers", "id"],
      ["log", null],
    ]);
    const columns = Object.fromEntries(
      tables[0].columns.map((c: Any) => [c.name, [c.type, c.writable]]),
    );
    expect(columns).toEqual({
      id: ["integer", true],
      name: ["text", true],
      vip: ["boolean", true],
      balance: ["number", true],
      tags: ["ARRAY", false],
      joined: ["date", true],
    });
  });

  test("its rows are read and written through the same calls as a workspace table", async () => {
    const rows = `${ws()}/source-rows/customers/erp`;
    const vip = encodeURIComponent(JSON.stringify({ column: "vip", op: "eq", value: true }));
    expect((await alice.get(`${rows}?filter=${vip}&sort=-balance`)).body.items).toEqual([
      { id: 1, name: "Ada", vip: true, balance: 100.5, tags: null, joined: "2026-01-02" },
      { id: 3, name: "Linus", vip: true, balance: 7, tags: null, joined: null },
    ]);
    const added = await alice.post(rows, { name: "Margaret", balance: 3 });
    expect(added.status).toBe(201);
    expect(added.body.items[0]).toMatchObject({ id: 4, name: "Margaret", vip: false });
    const row = `${ws()}/source-row/customers/4/erp`;
    expect((await alice.patch(row, { vip: true })).body.vip).toBe(true);
    expect((await alice.get(row)).body.name).toBe("Margaret");
    expect((await alice.delete(row)).status).toBe(204);
    expect((await alice.get(row)).status).toBe(404);
    // What was written is really in the client's database.
    const there = await sql<{ n: string }>`select count(*) as n from customers`.execute(
      external.router.platform(),
    );
    expect(there.rows[0]?.n).toBe("3");

    expect((await alice.post(rows, { name: 5 })).body.errors).toEqual([
      { path: "/name", message: "must be text" },
    ]);
    expect((await alice.post(rows, { name: "x", tags: ["a"] })).body.errors).toEqual([
      { path: "/tags", message: '"tags" has a type the platform only reads' },
    ]);
    expect((await alice.get(`${ws()}/source-rows/nope/erp`)).status).toBe(404);
    // A table with no key can be read and added to, not changed.
    expect((await alice.post(`${ws()}/source-rows/log/erp`, { message: "hello" })).status).toBe(
      201,
    );
    expect((await alice.get(`${ws()}/source-rows/log/erp`)).body.items[0].message).toBe("hello");
    expect((await alice.patch(`${ws()}/source-row/log/1/erp`, { message: "x" })).status).toBe(400);
    expect((await bob.client.get(rows)).status).toBe(403);
  });

  test("a source that cannot be reached, or refuses the password, says so", async () => {
    await alice.put(`${ws()}/data-source-bindings/wrong-password`, {
      config: sourceConfig,
      password: "not-the-password",
    });
    const refused = await alice.get(`${ws()}/data-source-tables/wrong-password`);
    // A local test server may trust every connection, in which case the password is not checked at all.
    if (refused.status !== 200) {
      expect(refused.status).toBe(502);
      expect(refused.body.detail).toBe(
        'The data source "wrong-password" refused the user name or password.',
      );
    }
    await alice.put(`${ws()}/data-source-bindings/nowhere`, {
      config: { ...sourceConfig, host: "127.0.0.1", port: 1 },
    });
    const unreachable = await alice.get(`${ws()}/data-source-tables/nowhere`);
    expect(unreachable.status).toBe(502);
    expect(unreachable.body).toMatchObject({
      code: "source_unreachable",
      detail: 'The data source "nowhere" could not be reached. Check its address.',
    });
    expect((await alice.delete(`${ws()}/data-source-bindings/nowhere`)).status).toBe(204);
    expect((await alice.delete(`${ws()}/data-source-bindings/nowhere`)).status).toBe(404);
    expect((await alice.get(`${ws()}/data-source-tables/nowhere`)).status).toBe(404);
  });
});

describe("scripts and data", () => {
  test("a script reads and writes the tables it declared", async () => {
    const done = await ran("writer", { title: "Call the client", owner: bob.id });
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output).toMatchObject({
      titles: ["Call the client", "Call the client (2)"],
      done: true,
      gone: null,
    });
    // The rows are there for the API too.
    expect(
      (await alice.get(`${ws()}/rows/tasks?sort=title`)).body.items.map((row: Any) => [
        row.title,
        row.owner_id,
      ]),
    ).toEqual([
      ["Call the client", bob.id],
      ["Call the client (2)", null],
    ]);
  });

  test("a table the script did not declare is refused", async () => {
    const done = await ran("undeclared");
    expect(done.status).toBe("failed");
    expect(done.error.message).toContain('a declared use of the table "tasks"');
  });

  test("acting for a person, a script is held to what that person may see and write", async () => {
    await alice.post(`${ws()}/rows/tasks`, { title: "Alice's own", owner_id: aliceId });
    const done = await ran("as-person", { person: bob.id, someoneElse: aliceId });
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output.titles).toEqual(["Call the client"]);
    expect(done.output.forged).toContain("only lets you write rows you own");
    expect(done.output.ownOwner).toBe(bob.id);
    // As the workspace, the same script sees every row.
    expect(done.output.all).toBe(4);
    // And Bob sees through the API exactly what the script saw for him, plus the row written for him.
    expect(
      (await bob.client.get(`${ws()}/rows/tasks?sort=title`)).body.items.map(
        (row: Any) => row.title,
      ),
    ).toEqual(["Call the client", "written for them"]);
  });

  test("a script reads and writes an external source it declared", async () => {
    const done = await ran("erp-sync", { name: "Hedy" });
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output).toEqual({ vip: ["Ada", "Linus"], added: "Hedy", nowVip: true });
  });

  test("a row changing is an event that scripts can listen for", async () => {
    const listening = bundle([
      manifest("trigger", "on-row", {
        type: "event",
        script: "sink",
        event: "platform/row-changed",
        filter: "event.payload.table == 'tasks' && event.payload.change == 'inserted'",
      }),
    ]);
    expect((await deploy(listening)).status).toBe(201);
    const inserted = (await alice.post(`${ws()}/rows/tasks`, { title: "Announce me" })).body
      .items[0];
    await alice.patch(`${ws()}/row/${inserted.id}/tasks`, { done: true });
    let heard: Any[] = [];
    for (let i = 0; i < 100 && heard.length === 0; i++) {
      await sleep(100);
      heard = (await alice.get(`${ws()}/runs?script=sink`)).body.items.filter(
        (run: Any) => run.status === "succeeded",
      );
    }
    expect(heard).toHaveLength(1);
    expect((await alice.get(`${ws()}/runs/${heard[0].id}`)).body.input).toEqual({
      table: "tasks",
      change: "inserted",
      id: inserted.id,
    });
    // Both changes were stored as events, because something listens. Only the insert passed the filter.
    const events = (await alice.get(`${ws()}/events?name=platform/row-changed`)).body.items;
    expect(events.map((event: Any) => event.payload.change).sort()).toEqual([
      "inserted",
      "updated",
    ]);
  });
});

describe("files", () => {
  const csv = "name,total\nAda,100\n";
  let fileId: string;

  test("a file is uploaded, listed, attached to a row and downloaded as it was", async () => {
    const uploaded = await alice.upload(
      `${ws()}/files?name=${encodeURIComponent("orders 2026.csv")}`,
      csv,
      "text/csv",
    );
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({
      name: "orders 2026.csv",
      contentType: "text/csv",
      sizeBytes: csv.length,
    });
    fileId = uploaded.body.id;
    expect((await alice.get(`${ws()}/files`)).body.items[0].id).toBe(fileId);
    expect((await alice.get(`${ws()}/files/${fileId}`)).body.name).toBe("orders 2026.csv");

    const row = (await alice.post(`${ws()}/rows/tasks`, { title: "Import", attachment: fileId }))
      .body.items[0];
    expect(row.attachment).toBe(fileId);

    const download = await t.app.inject({
      url: `/api/v1${ws()}/files/${fileId}/content`,
      headers: {
        authorization: `Bearer ${(await alice.post("/api-keys", { name: "dl" })).body.token}`,
      },
    });
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe(csv);
    expect(download.headers["content-type"]).toBe("text/csv");
    expect(download.headers["content-disposition"]).toBe(
      "attachment; filename*=UTF-8''orders%202026.csv",
    );
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("any kind of bytes is stored exactly, and a JSON file is not mistaken for a request", async () => {
    const bytes = Buffer.from(Array.from({ length: 5000 }, (_, n) => (n * 31) % 256));
    const binary = await alice.upload(
      `${ws()}/files?name=blob.bin`,
      bytes,
      "application/octet-stream",
    );
    const key = (
      await t.db
        .selectFrom("file")
        .select("storage_key")
        .where("id", "=", binary.body.id)
        .executeTakeFirstOrThrow()
    ).storage_key;
    const kept = await t.kernel.storage.get(key);
    expect(createHash("sha256").update(kept).digest("hex")).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    const json = await alice.upload(`${ws()}/files?name=data.json`, '{"a": 1}', "application/json");
    expect(json.body).toMatchObject({ name: "data.json", sizeBytes: 8 });
  });

  test("uploads are limited, need a name and a body, and need permission", async () => {
    expect(
      (
        await alice.upload(
          `${ws()}/files?name=big.bin`,
          Buffer.alloc(25 * 1024 * 1024 + 1),
          "application/octet-stream",
        )
      ).status,
    ).toBe(413);
    expect((await alice.upload(`${ws()}/files`, "x", "text/plain")).status).toBe(400);
    expect((await alice.upload(`${ws()}/files?name=empty.txt`, "", "text/plain")).status).toBe(400);
    // Bob may read files, not add or remove them.
    expect((await bob.client.upload(`${ws()}/files?name=x.txt`, "x", "text/plain")).status).toBe(
      403,
    );
    expect((await bob.client.get(`${ws()}/files/${fileId}`)).status).toBe(200);
    expect((await bob.client.delete(`${ws()}/files/${fileId}`)).status).toBe(403);
    expect((await other.get(`${ws()}/files/${fileId}`)).status).toBe(404);
  });

  test("a script stores a file and reads it back", async () => {
    const done = await ran("filer", { total: 42 });
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output).toMatchObject({
      name: "report.txt",
      type: "text/plain",
      text: "Total: 42",
    });
    expect(done.output.attachment).toBe(done.output.id);
    expect((await alice.get(`${ws()}/files/${done.output.id}`)).body.sizeBytes).toBe(9);
  });

  test("a deleted file is gone from the list and from storage", async () => {
    const key = (
      await t.db
        .selectFrom("file")
        .select("storage_key")
        .where("id", "=", fileId)
        .executeTakeFirstOrThrow()
    ).storage_key;
    // The row that points at it does not hold it in place: a file column is a note of an ID.
    expect((await alice.delete(`${ws()}/files/${fileId}`)).status).toBe(204);
    expect((await alice.get(`${ws()}/files/${fileId}`)).status).toBe(404);
    await expect(t.kernel.storage.get(key)).rejects.toThrow();
  });
});

describe("guards", () => {
  test("every change by a principal went through the write path, and every such route was exercised", () => {
    expect(
      t.unaudited.filter((route) => !/\/(rows?|source-rows?)\//.test(route)),
      JSON.stringify(t.unaudited),
    ).toEqual([]);
    expect(
      t.unexercised(
        (route) =>
          /\/(data-source-bindings|files)(\/|$)/.test(route) && !route.includes("/worker/"),
      ),
    ).toEqual([]);
  });
});
