import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Database, newId, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { Worker } from "@volvel/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { pruneOnce } from "./kernel/retention.js";
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
  const totals = await tasks.aggregate({ group: ["done"], measures: ["count"], sort: ["-count"] });
  return { id: made.id, titles: found.map((row) => row.title), done: changed.done, gone: await tasks.get(many[1].id), totals: totals.items };
} };
export const asPerson = { execute: async (input, ctx) => {
  const mine = ctx.table("tasks").as(input.person);
  const titles = (await mine.find({ sort: ["title"] })).map((row) => row.title);
  let forged = "allowed";
  try { await mine.insert({ title: "not mine", owner_id: input.someoneElse }); } catch (error) { forged = error.message; }
  const own = await mine.insert({ title: "written for them" });
  return { titles, forged, ownOwner: own.owner_id, all: (await ctx.table("tasks").find()).length };
} };
export const asGroup = { execute: async (input, ctx) => {
  const notes = ctx.table("notes");
  const theirs = (await notes.as(input.person).find({ sort: ["title"] })).map((row) => row.title);
  let wrote = "allowed";
  try { await notes.as(input.person).insert({ title: "by them", team: "ops" }); } catch (error) { wrote = error.message; }
  return { theirs, wrote, all: (await notes.find()).length };
} };
export const attacher = { execute: async (input, ctx) => {
  const said = async (work) => { try { await work(); return "allowed"; } catch (error) { return error.message; } };
  const mine = ctx.table("tasks").as(input.person);
  return {
    insert: await said(() => mine.insert({ title: "with a file", attachment: input.file })),
    update: await said(() => mine.update(input.row, { attachment: input.file })),
    workspace: await said(() => ctx.table("tasks").insert({ title: "as the workspace", attachment: input.file })),
  };
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
export const swapper = { execute: async (input, ctx) => {
  const row = await ctx.table("tasks").update(input.row, { attachment: input.file });
  return { attachment: row.attachment };
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
      manifest("table", "notes", {
        columns: { title: { type: "text", required: true }, team: { type: "text" } },
        policy: {
          type: "rules",
          rules: [{ allow: "read", when: { column: "team", in: "groups" } }],
        },
      }),
      manifest("data_source", "erp", { connector: "postgres" }),
      script("writer", "writer", { tables: ["tasks"] }),
      script("as-person", "asPerson", { tables: ["tasks"] }),
      script("attacher", "attacher", { tables: ["tasks"] }),
      script("as-group", "asGroup", { tables: ["notes"] }),
      script("undeclared", "undeclared"),
      script("erp-sync", "erpSync", { sources: ["erp"] }),
      script("filer", "filer", { tables: ["tasks"] }),
      script("swapper", "swapper", { tables: ["tasks"] }),
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
      // Its triggers are exercised here: a dev workspace would otherwise start them paused.
      triggersPaused: false,
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
  test("a dev workspace takes a bundle that uses a source not bound yet, and says so", async () => {
    const deployed = await deploy(bundle());
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.summary.warnings).toEqual([
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
      expect.objectContaining({ path: "erp", bound: true, hasPassword: true, defined: true }),
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

    // An internal address the operator did not allow is never connected to.
    await alice.put(`${ws()}/data-source-bindings/metadata`, {
      config: { ...sourceConfig, host: "169.254.169.254", port: 5432 },
    });
    const guarded = await alice.get(`${ws()}/data-source-tables/metadata`);
    expect(guarded.status).toBe(400);
    expect(guarded.body).toMatchObject({ code: "egress_refused" });
    expect(guarded.body.detail).toMatch(/169\.254\.169\.254 is a private or internal address/);
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
    // A script counts and sums through the same call an app does.
    expect(done.output.totals).toHaveLength(2);
    expect(done.output.totals.map((item: Any) => item.values.count)).toEqual([1, 1]);
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

  test("acting for a person, a script is held to a table's rules through that person's groups", async () => {
    await alice.post(`${ws()}/rows/notes`, {
      rows: [
        { title: "For ops", team: "ops" },
        { title: "For sales", team: "sales" },
      ],
    });
    const group = await alice.post(`/tenants/${tenant}/groups`, { name: "ops" });
    const asBob = () => ran("as-group", { person: bob.id });
    // Before he is in the group, the rules give him nothing.
    expect((await asBob()).output.theirs).toEqual([]);
    await alice.put(`/tenants/${tenant}/groups/${group.body.id}/members/${bob.id}`);
    const done = await asBob();
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output.theirs).toEqual(["For ops"]);
    // The rule lets his group read. Nothing lets it write.
    expect(done.output.wrote).toContain(
      "only lets you write rows you own, or rows its rules give you",
    );
    expect(done.output.all).toBe(2);

    // The group is renamed. A row holds its key, which did not change, so it is still its row.
    expect(group.body.key).toBe("ops");
    const renamed = await alice.patch(`/tenants/${tenant}/groups/${group.body.id}`, {
      name: "Operations",
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect((await asBob()).output.theirs).toEqual(["For ops"]);
    // A row that holds what the group is called now matches too, as rows written by name do.
    await alice.post(`${ws()}/rows/notes`, { title: "By its name", team: "Operations" });
    expect((await asBob()).output.theirs.sort()).toEqual(["By its name", "For ops"]);
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
    // Bob may read files, not add or remove them. A file is read through a row he may read: the
    // row that names it is Alice's, so it is none of his, and is said not to exist.
    expect((await bob.client.upload(`${ws()}/files?name=x.txt`, "x", "text/plain")).status).toBe(
      403,
    );
    expect((await bob.client.get(`${ws()}/files/${fileId}`)).status).toBe(404);
    expect((await bob.client.get(`${ws()}/files`)).status).toBe(403);
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

  test("a replaced or removed file stays while the row's history does, and goes when that history has run out", async () => {
    const upload = async (name: string) => {
      const made = await alice.upload(`${ws()}/files?name=${name}`, name, "text/plain");
      return made.body.id as string;
    };
    const keyOf = async (id: string) =>
      (
        await t.db
          .selectFrom("file")
          .select("storage_key")
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).storage_key;
    const first = await upload("first.txt");
    const second = await upload("second.txt");
    const row = (await alice.post(`${ws()}/rows/tasks`, { title: "Kept", attachment: first })).body
      .items[0];
    const at = `${ws()}/row/${row.id}/tasks`;

    // Replaced: the row names the new file, and the old one is still there.
    expect((await alice.patch(at, { attachment: second })).body.attachment).toBe(second);
    expect((await alice.get(`${ws()}/files/${first}`)).status).toBe(200);
    await t.kernel.storage.get(await keyOf(first));
    // Removed: the row names none, and the second is kept as well.
    expect((await alice.patch(at, { attachment: null })).body.attachment).toBeNull();
    expect((await alice.get(`${ws()}/files/${second}`)).status).toBe(200);
    const notes = await t.db
      .selectFrom("row_file_history")
      .select(["file_id", "row_id", "column_name"])
      .where("file_id", "in", [first, second])
      .execute();
    expect(notes.map((note) => note.file_id).sort()).toEqual([first, second].sort());
    expect(notes[0]).toMatchObject({ row_id: row.id, column_name: "attachment" });

    // A pass finds the history still within what is kept: nothing goes.
    await pruneOnce(t.kernel);
    expect((await alice.get(`${ws()}/files/${first}`)).status).toBe(200);

    // The note of the first file runs out, and the file goes with it. The second stays.
    const firstKey = await keyOf(first);
    await t.db
      .updateTable("row_file_history")
      .set({ replaced_at: new Date(Date.now() - 500 * 86_400_000) })
      .where("file_id", "=", first)
      .execute();
    const pruned = await pruneOnce(t.kernel);
    expect(pruned !== "busy" && pruned.files).toBe(1);
    expect((await alice.get(`${ws()}/files/${first}`)).status).toBe(404);
    await expect(t.kernel.storage.get(firstKey)).rejects.toThrow();
    expect((await alice.get(`${ws()}/files/${second}`)).status).toBe(200);

    // A file named by a row again is no longer noted, so it does not go.
    expect((await alice.patch(at, { attachment: second })).body.attachment).toBe(second);
    expect(
      await t.db
        .selectFrom("row_file_history")
        .select("id")
        .where("file_id", "=", second)
        .execute(),
    ).toEqual([]);
  });

  test("a file a script's update replaces is kept and removed the same way", async () => {
    const upload = async (name: string) =>
      (await alice.upload(`${ws()}/files?name=${name}`, name, "text/plain")).body.id as string;
    const old = await upload("old.txt");
    const fresh = await upload("fresh.txt");
    const row = (await alice.post(`${ws()}/rows/tasks`, { title: "Swapped", attachment: old })).body
      .items[0];
    const done = await ran("swapper", { row: row.id, file: fresh });
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output.attachment).toBe(fresh);

    // The replaced file is noted, and a pass inside the window leaves it.
    const notes = await t.db
      .selectFrom("row_file_history")
      .select(["row_id", "column_name", "replaced_by_type"])
      .where("file_id", "=", old)
      .execute();
    expect(notes).toEqual([
      { row_id: row.id, column_name: "attachment", replaced_by_type: "script" },
    ]);
    await pruneOnce(t.kernel);
    expect((await alice.get(`${ws()}/files/${old}`)).status).toBe(200);

    // Once the note has run out the file goes. The one the row names stays.
    await t.db
      .updateTable("row_file_history")
      .set({ replaced_at: new Date(Date.now() - 500 * 86_400_000) })
      .where("file_id", "=", old)
      .execute();
    await pruneOnce(t.kernel);
    expect((await alice.get(`${ws()}/files/${old}`)).status).toBe(404);
    expect((await alice.get(`${ws()}/files/${fresh}`)).status).toBe(200);
  });

  test("a deleted file is gone from the list and from storage", async () => {
    const key = (
      await t.db
        .selectFrom("file")
        .select("storage_key")
        .where("id", "=", fileId)
        .executeTakeFirstOrThrow()
    ).storage_key;
    // A row that names it holds it in place: it goes once no row does.
    expect((await alice.delete(`${ws()}/files/${fileId}`)).status).toBe(409);
    const naming = (
      await alice.post(`${ws()}/row-deletions/tasks`, {
        ids: (
          await alice.get(
            `${ws()}/rows/tasks?filter=${encodeURIComponent(JSON.stringify({ column: "attachment", op: "eq", value: fileId }))}`,
          )
        ).body.items.map((row: Any) => row.id),
      })
    ).body.deleted;
    expect(naming.length).toBeGreaterThan(0);
    expect((await alice.delete(`${ws()}/files/${fileId}`)).status).toBe(204);
    expect((await alice.get(`${ws()}/files/${fileId}`)).status).toBe(404);
    await expect(t.kernel.storage.get(key)).rejects.toThrow();
  });
});

describe("files follow the rows that name them (D22)", () => {
  let carol: Client;
  let carolId: string;
  const upload = async (who: Client, name: string) => {
    const made = await who.upload(`${ws()}/files?name=${name}`, name, "text/plain");
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    return made.body.id as string;
  };
  const exists = async (id: string) =>
    (await t.db.selectFrom("file").select("id").where("id", "=", id).executeTakeFirst()) !==
    undefined;
  const notesOf = (id: string) =>
    t.db.selectFrom("row_file_history").select("id").where("file_id", "=", id).execute();
  const age = (id: string) =>
    t.db
      .updateTable("row_file_history")
      .set({ replaced_at: new Date(Date.now() - 500 * 86_400_000) })
      .where("file_id", "=", id)
      .execute();

  beforeAll(async () => {
    const role = (
      await alice.post(`/tenants/${tenant}/roles`, {
        name: "rows_and_files",
        permissions: ["data:read", "data:write", "file:read", "file:write"],
      })
    ).body.id;
    const made = await alice.post(`/tenants/${tenant}/members`, {
      email: "carol@acme.example",
      name: "Carol",
      password: PASSWORD,
    });
    carolId = made.body.id;
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: carolId,
      roleId: role,
    });
    carol = await t.signIn("carol@acme.example", PASSWORD);
  });

  test("DAT-05: listing and deleting every file need the permission past the row policy", async () => {
    const mine = await upload(carol, "mine.txt");
    const hers = await upload(alice, "alices.txt");
    expect((await carol.get(`${ws()}/files`)).status).toBe(403);
    expect((await carol.delete(`${ws()}/files/${mine}`)).status).toBe(403);
    expect((await alice.get(`${ws()}/files`)).status).toBe(200);
    // One she uploaded she reads; one only another person's row names, she does not.
    expect((await carol.get(`${ws()}/files/${mine}`)).status).toBe(200);
    expect((await carol.get(`${ws()}/files/${hers}/content`)).status).toBe(404);
    await alice.post(`${ws()}/rows/tasks`, { title: "Hers", attachment: hers });
    expect((await carol.get(`${ws()}/files/${hers}`)).status).toBe(404);
    expect((await carol.delete(`${ws()}/files/${hers}`)).status).toBe(403);
    // A row she may read names a file she did not upload: she reads it.
    const given = await upload(alice, "given.txt");
    await alice.post(`${ws()}/rows/tasks`, {
      title: "Given",
      attachment: given,
      owner_id: carolId,
    });
    expect((await carol.get(`${ws()}/files/${given}`)).status).toBe(200);
    expect((await carol.get(`${ws()}/files/${given}/content`)).status).toBe(200);
  });

  test("a row is given only a file the caller could already read, as an unknown file is refused", async () => {
    const hers = await upload(alice, "kept-from-carol.txt");
    await alice.post(`${ws()}/rows/tasks`, { title: "Alice's", attachment: hers });
    const mine = await upload(carol, "carols.txt");
    const row = (await carol.post(`${ws()}/rows/tasks`, { title: "Carol's" })).body.items[0];
    const at = `${ws()}/row/${row.id}/tasks`;

    const refused = await carol.patch(at, { attachment: hers });
    const unknown = await carol.patch(at, { attachment: newId() });
    expect(refused.status).toBe(400);
    expect(refused.body.detail).toBe(unknown.body.detail);
    expect((await carol.post(`${ws()}/rows/tasks`, { title: "X", attachment: hers })).status).toBe(
      400,
    );
    expect(
      (await carol.post(`${ws()}/rows/tasks`, { rows: [{ title: "Y", attachment: hers }] })).status,
    ).toBe(400);
    // Her own upload is hers to name, and naming it again changes nothing, so is not asked again.
    expect((await carol.patch(at, { attachment: mine })).status).toBe(200);
    expect((await carol.patch(at, { attachment: mine, title: "Again" })).status).toBe(200);
    // Whoever may read every row may name any file.
    expect((await alice.post(`${ws()}/rows/tasks`, { title: "Z", attachment: mine })).status).toBe(
      201,
    );
  });

  test("a script acting for a person names only a file that person may read; as the workspace it names any", async () => {
    const hidden = await upload(alice, "script-hidden.txt");
    await alice.post(`${ws()}/rows/tasks`, { title: "Alice's", attachment: hidden });
    const shown = await upload(alice, "script-shown.txt");
    await alice.post(`${ws()}/rows/tasks`, { title: "Bob's", attachment: shown, owner_id: bob.id });
    const row = (await alice.post(`${ws()}/rows/tasks`, { title: "Bob's blank", owner_id: bob.id }))
      .body.items[0];

    const refused = await ran("attacher", { person: bob.id, file: hidden, row: row.id });
    expect(refused.status, JSON.stringify(refused.error)).toBe("succeeded");
    expect(refused.output.insert).toContain("not a file of this workspace");
    expect(refused.output.update).toContain("not a file of this workspace");
    expect(refused.output.workspace).toBe("allowed");

    const accepted = await ran("attacher", { person: bob.id, file: shown, row: row.id });
    expect(accepted.output).toEqual({
      insert: "allowed",
      update: "allowed",
      workspace: "allowed",
    });
  });

  test("DAT-10: a file a row names is not deleted, and the answer says so", async () => {
    const id = await upload(alice, "named.txt");
    const row = (await alice.post(`${ws()}/rows/tasks`, { title: "Names", attachment: id })).body
      .items[0];
    const refused = await alice.delete(`${ws()}/files/${id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toContain("A row still names this file");
    expect(await exists(id)).toBe(true);
    // The row lets go of it: it is noted, and can be deleted.
    await alice.patch(`${ws()}/row/${row.id}/tasks`, { attachment: null });
    expect((await alice.delete(`${ws()}/files/${id}`)).status).toBe(204);
    expect(await exists(id)).toBe(false);
  });

  test("a deleted row's files are kept for the audit period, as a replaced one is", async () => {
    const one = await upload(alice, "gone-one.txt");
    const two = await upload(alice, "gone-two.txt");
    const a = (await alice.post(`${ws()}/rows/tasks`, { title: "A", attachment: one })).body
      .items[0];
    const b = (await alice.post(`${ws()}/rows/tasks`, { title: "B", attachment: two })).body
      .items[0];
    expect((await alice.delete(`${ws()}/row/${a.id}/tasks`)).status).toBe(204);
    expect((await alice.post(`${ws()}/row-deletions/tasks`, { ids: [b.id] })).body.deleted).toEqual(
      [b.id],
    );
    for (const id of [one, two]) expect(await notesOf(id)).toHaveLength(1);
    await pruneOnce(t.kernel);
    expect(await exists(one)).toBe(true);
    expect(await exists(two)).toBe(true);
    await age(one);
    await pruneOnce(t.kernel);
    expect(await exists(one)).toBe(false);
    expect(await exists(two)).toBe(true);
  });

  test("TAB-09: a file a row still names is not removed by the retention pass", async () => {
    // (a) replaced in row A, then row B is inserted naming it.
    const first = await upload(alice, "again.txt");
    const second = await upload(alice, "again-2.txt");
    const a = (await alice.post(`${ws()}/rows/tasks`, { title: "A", attachment: first })).body
      .items[0];
    await alice.patch(`${ws()}/row/${a.id}/tasks`, { attachment: second });
    expect(await notesOf(first)).toHaveLength(1);
    await alice.post(`${ws()}/rows/tasks`, { title: "B", attachment: first });
    expect(await notesOf(first)).toHaveLength(0);

    // (b) two rows name one file, and one lets go: the note ages while the other names it.
    const shared = await upload(alice, "shared.txt");
    const c = (await alice.post(`${ws()}/rows/tasks`, { title: "C", attachment: shared })).body
      .items[0];
    await alice.post(`${ws()}/rows/tasks`, { title: "D", attachment: shared });
    await alice.patch(`${ws()}/row/${c.id}/tasks`, { attachment: null });
    await age(shared);
    await pruneOnce(t.kernel);
    expect(await exists(shared)).toBe(true);
    expect(await exists(first)).toBe(true);
  });

  test("TAB-02: a row names only a file of its workspace, and another tenant's note is left alone", async () => {
    const globex = await t.db
      .selectFrom("tenant")
      .select("id")
      .where("slug", "=", "globex")
      .executeTakeFirstOrThrow();
    const foreignWorkspace = (
      await other.post(`/tenants/${globex.id}/workspaces`, {
        slug: "main-dev",
        name: "Dev",
        type: "dev",
      })
    ).body.id;
    const foreign = (
      await other.upload(
        `/tenants/${globex.id}/workspaces/${foreignWorkspace}/files?name=f.txt`,
        "f",
        "text/plain",
      )
    ).body.id as string;
    await t.db
      .insertInto("row_file_history")
      .values({
        id: newId(),
        tenant_id: globex.id,
        workspace_id: foreignWorkspace,
        file_id: foreign,
        table_name: "orders",
        row_id: "1",
        column_name: "doc",
        replaced_by_type: "member",
      })
      .execute();
    const refused = await alice.post(`${ws()}/rows/tasks`, { title: "X", attachment: foreign });
    expect(refused.status).toBe(400);
    const made = (await alice.post(`${ws()}/rows/tasks`, { title: "Y" })).body.items[0];
    expect(
      (await alice.patch(`${ws()}/row/${made.id}/tasks`, { attachment: foreign })).status,
    ).toBe(400);
    expect(
      (await alice.patch(`${ws()}/row/${made.id}/tasks`, { attachment: newId() })).status,
    ).toBe(400);
    expect(await notesOf(foreign)).toHaveLength(1);
  });
});

describe("guards", () => {
  test("every change by a principal went through the write path, and every such route was exercised", () => {
    expect(
      t.unaudited.filter((route) => !/\/(rows?|source-rows?|row-deletions)\//.test(route)),
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
