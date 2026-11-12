import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type Kysely, type PlatformSchema, sql } from "@vynxlabs/db";
import { createTestDatabase, type TestDatabase } from "@vynxlabs/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspaceSchema } from "./kernel/data/apply.js";
import type { ExportManifest } from "./kernel/tenancy/export.js";
import { OWNED_TABLES } from "./kernel/tenancy/tables.js";
import { TAR_END, tarEntry, tarIndex, tarRead } from "./kernel/tenancy/tar.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const PASSPHRASE = "correct horse battery staple";

// Two instances that have never met: separate databases, object stores and master keys.
let a: TestApp;
let b: TestApp;
let dedicated: TestDatabase;
let dir: string;

let tenant: string;
let main: string;
let dev: string;
let alice: Client;
let bob: { id: string; client: Client };
let carolId: string;
let operatorB: Client;
let archive: Buffer;
let manifest: ExportManifest;
let fileId: string;
let bobOnB: string;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;
const m = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const object = { type: "object" };
const script = (path: string, entry: string, uses: Record<string, string[]> = {}) =>
  m("script", path, {
    entry,
    input: object,
    output: object,
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], ...uses },
  });
const code = `
export const greet = { execute: async (input, ctx) => {
  const secret = await ctx.secret("TOKEN");
  ctx.log.info("greeting", { name: input.name });
  return {
    said: "hello " + input.name,
    // Never the secret itself: a figure that only the right value gives.
    secretSum: [...secret].reduce((sum, c) => sum + c.charCodeAt(0), 0),
    orders: (await ctx.table("orders").find()).length,
  };
} };
export const idle = { execute: async () => ({}) };
`;
function bundle(orders: Record<string, object>, marker: string): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      m("connection", "api", { connector: "http" }),
      m("variable", "batch", { default: "10" }),
      m("data_source", "erp", { connector: "postgres" }),
      m("event", "ping", { payload: object }),
      m("table", "customers", {
        columns: { name: { type: "text", required: true, unique: true } },
      }),
      m("table", "orders", {
        columns: orders,
        policy: { type: "owner", column: "owner_id" },
        indexes: [["number"]],
      }),
      script("greet", "greet", { secrets: ["TOKEN"], tables: ["orders"] }),
      script("idle", "idle", { connections: ["api"], variables: ["batch"], sources: ["erp"] }),
      m("schedule", "nightly", { script: "idle", cron: "0 3 * * *" }),
      m("trigger", "hook", { type: "webhook", script: "idle" }),
      m("trigger", "on-ping", { type: "event", script: "idle", event: "ping" }),
    ],
    code: `${code}\nexport const marker = ${JSON.stringify(marker)};`,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
const ordersV1 = {
  number: { type: "text", required: true, unique: true },
  total: { type: "number" },
  note: { type: "text" },
  owner_id: { type: "uuid" },
  customer: { type: "reference", references: "customers" },
  attachment: { type: "file" },
  meta: { type: "json" },
  placed: { type: "timestamp" },
};
// Renames a column, retires one and adds one, so the export has to carry all three kinds.
const { total: _total, note: _note, ...kept } = ordersV1;
const ordersV2 = {
  ...kept,
  amount: { type: "number", renamedFrom: "total" },
  currency: { type: "text", required: true, default: "EUR" },
};

const ws = (id: string) => `/tenants/${tenant}/workspaces/${id}`;
async function deploy(client: Client, workspace: string, content: Bundle) {
  const uploaded = await client.post(`${ws(workspace)}/bundles`, content);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  const deployed = await client.post(`${ws(workspace)}/deployments`, {
    bundleId: uploaded.body.id,
  });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
}
async function finished(client: Client, workspace: string, runId: string): Promise<Any> {
  for (let i = 0; i < 200; i++) {
    const run = (await client.get(`${ws(workspace)}/runs/${runId}`)).body;
    if (run.status !== "queued" && run.status !== "running") return run;
    await sleep(100);
  }
  throw new Error("the run did not finish");
}
async function withWorker<T>(app: TestApp, client: Client, work: () => Promise<T>): Promise<T> {
  const url = `http://127.0.0.1:${(app.app.server.address() as { port: number }).port}`;
  const credential = await client.post(`/tenants/${tenant}/worker-credentials`, { name: "test" });
  const worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  const working = worker.run();
  try {
    return await work();
  } finally {
    worker.stop();
    await working;
  }
}
const rolesOf = async (app: TestApp) =>
  Object.fromEntries(
    (
      await app.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );

/** Every row of a query, as the database prints it, for comparing two instances. */
async function dump(db: Kysely<PlatformSchema>, query: ReturnType<typeof sql>): Promise<string[]> {
  return (await sql<{ line: string }>`${query}`.execute(db)).rows.map((row) => row.line);
}
const tableDump = (db: Kysely<PlatformSchema>, name: string) => {
  const entry = OWNED_TABLES.find((candidate) => candidate.table === name);
  if (!entry) throw new Error(name);
  return dump(
    db,
    sql`select to_jsonb(t)::text as line from ${sql.table(entry.table)} as t
        where ${entry.ofTenant(tenant)}
        order by ${sql.join(entry.key.map((column) => sql.ref(`t.${column}`)))}`,
  );
};
/** A workspace table's structure: columns, rules, indexes and policy. The role's name differs per database. */
async function structure(db: Kysely<PlatformSchema>, workspace: string) {
  const schema = workspaceSchema(workspace);
  const role = (text: string) => text.replaceAll(/vxd_[0-9a-f]{20}/g, "<role>");
  return {
    columns: await dump(
      db,
      sql`select table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '-') as line
          from information_schema.columns where table_schema = ${schema} order by 1`,
    ),
    constraints: await dump(
      db,
      sql`select c.conrelid::regclass::text || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid) || ' ' || c.convalidated as line
          from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = ${schema} order by 1`,
    ),
    indexes: await dump(
      db,
      sql`select indexdef as line from pg_indexes where schemaname = ${schema} order by 1`,
    ),
    policies: (
      await dump(
        db,
        sql`select tablename || ' ' || policyname || ' ' || roles::text || ' ' || qual || ' ' || with_check as line
            from pg_policies where schemaname = ${schema} order by 1`,
      )
    ).map(role),
    security: await dump(
      db,
      sql`select c.relname || ' ' || c.relrowsecurity as line from pg_class c
          join pg_namespace n on n.oid = c.relnamespace where n.nspname = ${schema} and c.relkind = 'r' order by 1`,
    ),
    grants: (
      await dump(
        db,
        sql`select table_name || ' ' || grantee || ' ' || privilege_type as line
            from information_schema.table_privileges where table_schema = ${schema} and grantee like 'vxd\\_%' order by 1`,
      )
    ).map(role),
  };
}
const rowsOf = (db: Kysely<PlatformSchema>, workspace: string, physical: string) =>
  dump(
    db,
    sql`select to_jsonb(t)::text as line from ${sql.id(workspaceSchema(workspace), physical)} as t order by t.id`,
  );

beforeAll(async () => {
  [a, b] = await Promise.all([startTestApp(), startTestApp()]);
  await a.app.listen({ host: "127.0.0.1", port: 0 });
  await b.app.listen({ host: "127.0.0.1", port: 0 });
  dir = await mkdtemp(join(tmpdir(), "portability-test-"));
  operatorB = b.admin;

  const roles = await rolesOf(a);
  const created = await a.admin.post("/tenants", { slug: "acme", name: "Acme Corp" });
  tenant = created.body.id;
  const grant = await a.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = async (name: string, roleId?: string) => {
    const made = await a.admin.post(`/tenants/${tenant}/members`, {
      email: `${name}@acme.example`,
      name,
      password: PASSWORD,
    });
    if (roleId) {
      await a.admin.post(`/tenants/${tenant}/bindings`, {
        principalType: "member",
        principalId: made.body.id,
        roleId,
      });
    }
    return made.body.id as string;
  };
  await member("alice", roles.tenant_admin);
  alice = await a.signIn("alice@acme.example", PASSWORD);
  const handler = (
    await a.admin.post(`/tenants/${tenant}/roles`, {
      name: "order_handler",
      permissions: ["workspace:read", "data:read", "data:write", "file:read"],
    })
  ).body.id;
  bob = { id: await member("bob", handler), client: await a.signIn("bob@acme.example", PASSWORD) };
  // Carol gets her access through a group.
  carolId = await member("carol");
  const group = await a.admin.post(`/tenants/${tenant}/groups`, { name: "Handlers" });
  await a.admin.put(`/tenants/${tenant}/groups/${group.body.id}/members/${carolId}`);
  await a.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "group",
    principalId: group.body.id,
    roleId: handler,
  });
  await a.admin.post(`/tenants/${tenant}/service-accounts`, { name: "ci" });
  await a.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);

  main = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "dev",
      name: "Dev",
      type: "dev",
      linkedWorkspaceId: main,
    })
  ).body.id;
  for (const workspace of [main, dev]) {
    await alice.put(`${ws(workspace)}/connection-bindings/api`, {
      config: {
        baseUrl: `http://api.${workspace === main ? "live" : "test"}.example`,
        auth: { type: "bearer" },
      },
      credential: `api-key-of-${workspace === main ? "main" : "dev"}`,
    });
    await alice.put(`${ws(workspace)}/secrets/TOKEN`, {
      value: `token-of-${workspace === main ? "main" : "dev"}`,
    });
    await alice.put(`${ws(workspace)}/data-source-bindings/erp`, {
      config: { host: "erp.internal", database: "erp", user: "sync" },
      password: "erp-password",
    });
  }
  await alice.put(`${ws(main)}/variable-values/batch`, { value: "25" });

  // Main: the first definition with rows, then the second, so that a renamed and a retired column exist.
  await deploy(alice, main, bundle(ordersV1, "v1"));
  const customer = (await alice.post(`${ws(main)}/rows/customers`, { name: "Ada & Co" })).body
    .items[0];
  const file = await alice.upload(
    `${ws(main)}/files?name=${encodeURIComponent("order 1.pdf")}`,
    Buffer.from([0, 1, 2, 255, 254, 10, 13]),
    "application/pdf",
  );
  fileId = file.body.id;
  const inserted = await alice.post(`${ws(main)}/rows/orders`, {
    rows: [
      {
        number: "A-1",
        total: 110.25,
        note: "first",
        owner_id: bob.id,
        customer: customer.id,
        attachment: fileId,
        meta: { tags: ["x", "y"], nested: { n: 1 } },
        placed: "2026-03-01T10:15:30.123Z",
      },
      { number: "A-2", total: 0.1, note: 'second ünïcödé "quoted"', owner_id: carolId },
      { number: "A-3", owner_id: null, meta: [1, 2, 3] },
    ],
  });
  expect(inserted.status, JSON.stringify(inserted.body)).toBe(201);
  await deploy(alice, main, bundle(ordersV2, "v2"));
  await alice.post(`${ws(main)}/rows/orders`, {
    number: "A-4",
    amount: 77,
    currency: "USD",
    owner_id: bob.id,
  });
  // A table made in the console, and a retired table in dev.
  await alice.put(`${ws(main)}/resources/scratch`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: { columns: { label: { type: "text" } } },
  });
  await alice.post(`${ws(main)}/rows/scratch`, { label: "console-made" });
  await deploy(alice, dev, bundle(ordersV2, "v2"));
  await alice.post(`${ws(dev)}/rows/orders`, { number: "D-1", amount: 5 });
  await alice.put(`${ws(dev)}/resources/temp`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: { columns: { x: { type: "integer" } } },
  });
  await alice.post(`${ws(dev)}/rows/temp`, { x: 42 });
  await alice.delete(`${ws(dev)}/resources/temp`);

  // History: one run that finished, with logs, and one still waiting when the export is made.
  await withWorker(a, alice, async () => {
    const started = await alice.post(`${ws(main)}/runs`, {
      script: "greet",
      input: { name: "Ada" },
    });
    const done = await finished(alice, main, started.body.id);
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
  });
  await alice.post(`${ws(main)}/events`, { name: "ping", payload: { from: "the test" } });
  await alice.post(`${ws(main)}/runs`, { script: "idle", input: {} });

  // A second tenant on the first instance, which must not be touched.
  const globex = await a.admin.post("/tenants", { slug: "globex", name: "Globex" });
  expect(globex.status).toBe(201);

  // On the second instance: a database of the tenant's own, and someone who is already Bob.
  dedicated = await createTestDatabase();
  const registered = await operatorB.put("/instance/database-locations/acme-db", {
    connectionString: dedicated.connectionString,
  });
  expect(registered.status, JSON.stringify(registered.body)).toBe(204);
  const elsewhere = await operatorB.post("/tenants", { slug: "elsewhere", name: "Elsewhere" });
  const rolesB = await rolesOf(b);
  const grantB = await operatorB.post(`/tenants/${elsewhere.body.id}/access-grants`, {
    reason: "Setup",
    roleId: rolesB.tenant_admin,
  });
  bobOnB = (
    await operatorB.post(`/tenants/${elsewhere.body.id}/members`, {
      email: "bob@acme.example",
      name: "Bob at Elsewhere",
      password: "bobs-other-password",
    })
  ).body.id;
  await operatorB.delete(`/tenants/${elsewhere.body.id}/access-grants/${grantB.body.id}`);
}, 120_000);

afterAll(async () => {
  await a.stop();
  await b.stop();
  await dedicated.drop();
  await rm(dir, { recursive: true, force: true });
});

const importInto = (operator: Client, bytes: Buffer, query = "", passphrase = PASSPHRASE) =>
  operator.upload(`/instance/tenant-imports${query}`, bytes, "application/x-tar", {
    "x-export-passphrase": passphrase,
  });
/** The archive with its list of contents changed, as a different version would have written it. */
async function withManifest(change: (manifest: ExportManifest) => void): Promise<Buffer> {
  const path = join(dir, `m-${Math.random()}.tar`);
  await writeFile(path, archive);
  const file = await open(path);
  try {
    const last = (await tarIndex(file)).at(-1);
    if (!last) throw new Error("empty");
    const changed = JSON.parse((await tarRead(file, last)).toString("utf8"));
    change(changed);
    return Buffer.concat([
      archive.subarray(0, last.offset - 512),
      ...tarEntry("manifest.json", Buffer.from(JSON.stringify(changed))),
      TAR_END,
    ]);
  } finally {
    await file.close();
  }
}

describe("exporting a tenant", () => {
  test("it takes the right to export, and a passphrase worth the name", async () => {
    expect(
      (await bob.client.post(`/tenants/${tenant}/exports`, { passphrase: PASSPHRASE })).status,
    ).toBe(403);
    // The operator has no way in to a tenant without an access grant the tenant can see.
    expect(
      (await a.admin.post(`/tenants/${tenant}/exports`, { passphrase: PASSPHRASE })).status,
    ).toBeGreaterThanOrEqual(403);
    expect((await alice.post(`/tenants/${tenant}/exports`, { passphrase: "short" })).status).toBe(
      400,
    );
  });

  test("the export is an ordinary archive with a list of its contents", async () => {
    const exported = await alice.post(`/tenants/${tenant}/exports`, {
      passphrase: PASSPHRASE,
      history: true,
    });
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toBe("application/x-tar");
    expect(exported.headers["content-disposition"]).toMatch(
      /^attachment; filename="acme-\d{4}-\d\d-\d\dT\d{6}\.tar"$/,
    );
    archive = exported.bytes;

    const path = join(dir, "acme.tar");
    await writeFile(path, archive);
    const file = await open(path);
    const index = await tarIndex(file);
    manifest = JSON.parse((await tarRead(file, index.at(-1) as never)).toString("utf8"));
    await file.close();
    expect(manifest).toMatchObject({
      format: "vynxlabs-tenant-export",
      formatVersion: 1,
      tenant: { id: tenant, slug: "acme", name: "Acme Corp" },
      history: true,
      pendingRuns: 2,
    });
    expect(manifest.workspaces.map((workspace) => workspace.slug).sort()).toEqual(["dev", "main"]);
    expect(manifest.counts).toMatchObject({
      member: 3,
      workspace: 2,
      secret: 2,
      connection_binding: 2,
      data_source_binding: 2,
      file: 1,
      [`${main}/t_orders`]: 4,
      [`${main}/t_customers`]: 1,
      [`${main}/t_scratch`]: 1,
      [`${dev}/t_temp`]: 1,
      run: 3,
    });
    const paths = index.map((entry) => entry.path);
    expect(paths.at(-1)).toBe("manifest.json");
    expect(paths).toEqual(
      expect.arrayContaining([
        "key.json",
        "members.0001.jsonl",
        "platform/secret.0001.jsonl",
        `data/${main}/t_orders.0001.jsonl`,
        "data/catalog/data_column.0001.jsonl",
      ]),
    );
    // Credentials that must be made again are not in it, and it says so.
    expect(
      paths.some((entry) => /api_key|worker_credential|access_grant|tenant_key/.test(entry)),
    ).toBe(false);
    expect(manifest.notCarried.join(" ")).toMatch(/API keys.*Worker credentials/s);
    expect(manifest.entries).toHaveLength(index.length - 1);
  });

  test("no secret, password or key is readable in the file", () => {
    const text = archive.toString("latin1");
    for (const value of [
      "token-of-main",
      "token-of-dev",
      "api-key-of-main",
      "erp-password",
      PASSWORD,
      PASSPHRASE,
    ]) {
      expect(text.includes(value), value).toBe(false);
    }
    // What is there is ciphertext, and a password hash for each member.
    expect(text).toContain('"ciphertext"');
    expect(text).toContain('"password_hash"');
  });

  test("exporting is recorded, and leaves the tenant as it was", async () => {
    const entry = (await alice.get(`/tenants/${tenant}/audit?action=tenant.exported`)).body
      .items[0];
    expect(entry.details).toEqual({ history: true });
    expect(JSON.stringify(entry)).not.toContain(PASSPHRASE);
    expect((await alice.get(`${ws(main)}/rows/orders`)).body.items).toHaveLength(4);
  });
});

describe("an export that should not be imported", () => {
  const tenantsOnB = async () =>
    (await operatorB.get("/tenants?limit=200")).body.items.length as number;

  test("is refused before anything is written", async () => {
    const before = await tenantsOnB();
    const stored = async () => (await b.db.selectFrom("bundle").select("id").execute()).length;

    expect((await importInto(alice, archive)).status).toBe(403);
    const wrong = await importInto(operatorB, archive, "", "not the passphrase at all");
    expect(wrong.status).toBe(400);
    expect(wrong.body.detail).toBe("The passphrase does not open this export.");

    const damaged = Buffer.from(archive);
    const middle = Math.floor(archive.length / 2);
    damaged[middle] = (damaged[middle] as number) ^ 0xff;
    const refused = await importInto(operatorB, damaged);
    expect(refused.status).toBe(400);
    expect(refused.body.detail).toMatch(/damaged|cannot be read/);

    const cut = await importInto(operatorB, archive.subarray(0, archive.length - 4096));
    expect(cut.status).toBe(400);
    expect(cut.body.detail).toMatch(/cut short|incomplete/);

    expect((await importInto(operatorB, Buffer.from("this is not an export"))).status).toBe(400);

    const older = await importInto(
      operatorB,
      await withManifest((changed) => {
        changed.migrationLevel -= 1;
        changed.coreVersion = "0.2.0";
      }),
    );
    expect(older.status).toBe(400);
    expect(older.body.detail).toMatch(
      /made at database level \d+ \(core 0\.2\.0\)\. This instance is at level \d+/,
    );

    const missing = await importInto(
      operatorB,
      await withManifest((changed) => {
        changed.entries.pop();
      }),
    );
    expect(missing.status).toBe(400);
    expect(missing.body.detail).toBe("The export does not hold exactly the files it lists.");

    expect((await importInto(operatorB, archive, "?dataLocation=nowhere")).status).toBe(400);
    expect((await importInto(operatorB, archive, "?slug=elsewhere")).status).toBe(409);

    expect(await tenantsOnB()).toBe(before);
    expect(await stored()).toBe(0);
    expect(
      await b.db
        .selectFrom("member")
        .select("id")
        .where("email", "=", "alice@acme.example")
        .execute(),
    ).toEqual([]);
  });

  test("an import that goes wrong part way leaves nothing behind", async () => {
    // The list of contents claims a row that is not there, which is only found after loading.
    const wrongCount = await importInto(
      operatorB,
      await withManifest((changed) => {
        (changed.counts.secret as number) += 1;
      }),
    );
    expect(wrongCount.status).toBe(500);
    expect(wrongCount.body.detail).toContain("secret should have 3 rows and has 2");
    expect((await operatorB.get(`/tenants/${tenant}`)).status).toBe(404);
    expect(
      await b.db.selectFrom("workspace").select("id").where("tenant_id", "=", tenant).execute(),
    ).toEqual([]);
    const data = (await b.kernel.data.location("acme-db")).owner;
    expect(await data.selectFrom("data_table").select("id").execute()).toEqual([]);
    const schemas = await sql`select 1 from pg_namespace where nspname like 'ws\\_%'`.execute(data);
    expect(schemas.rows).toEqual([]);
  });
});

describe("the exit criterion: a tenant moves to a dedicated instance with nothing lost", () => {
  let report: Any;
  let aliceB: Client;
  let dataA: Kysely<PlatformSchema>;
  let dataB: Kysely<PlatformSchema>;

  test("the import brings in everything the export lists", async () => {
    const imported = await importInto(operatorB, archive, "?dataLocation=acme-db");
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    report = imported.body;
    expect(report.tenant).toEqual({
      id: tenant,
      slug: "acme",
      name: "Acme Corp",
      dataLocation: "acme-db",
    });
    expect(report.counts).toEqual(manifest.counts);
    // Alice and Carol are new here. Bob already had an account, which he keeps.
    expect(report.members).toEqual({ created: 2, linked: 1 });
    expect(report.pausedWorkspaces).toBe(2);
    expect(report.cancelled.runs).toBe(2);
    dataA = (await a.kernel.data.forTenant(tenant)).owner;
    dataB = (await b.kernel.data.forTenant(tenant)).owner;
  });

  test("every platform table holds the same rows on both instances", async () => {
    // What is expected to differ, and nothing else: Bob is the Bob who was already
    // here, workspaces arrive paused, and unfinished runs are closed.
    const expected = (line: string, table: string) => {
      let text = line.replaceAll(bob.id, bobOnB);
      if (table === "workspace")
        text = text.replace('"triggers_paused": false', '"triggers_paused": true');
      return text;
    };
    for (const entry of OWNED_TABLES) {
      if (entry.export === "never") continue;
      const there = await tableDump(a.db, entry.table);
      // The arrival itself is recorded here, and only here.
      const here = (await tableDump(b.db, entry.table)).filter(
        (line) => !line.includes('"action": "tenant.imported"'),
      );
      expect(here.length, entry.table).toBe(there.length);
      if (entry.table === "run") {
        // The finished run is identical. The two that were queued are recorded as cancelled.
        const finishedThere = there.filter((line) => line.includes('"status": "succeeded"'));
        expect(here.filter((line) => line.includes('"status": "succeeded"'))).toEqual(
          finishedThere,
        );
        expect(here.filter((line) => line.includes('"status": "cancelled"'))).toHaveLength(2);
        expect(here.filter((line) => /"status": "(queued|running)"/.test(line))).toEqual([]);
        continue;
      }
      // Rows keyed by a member come out in a different order once Bob has another ID.
      expect([...here].sort(), entry.table).toEqual(
        there.map((line) => expected(line, entry.table)).sort(),
      );
    }
    // The run's logs came with it.
    expect((await tableDump(b.db, "run_log")).join("\n")).toContain("greeting");
  });

  test("every custom table has the same structure and the same rows, in the tenant's own database", async () => {
    for (const workspace of [main, dev]) {
      expect(await structure(dataB, workspace), workspace).toEqual(
        await structure(dataA, workspace),
      );
    }
    const tables = await dataA
      .selectFrom("data_table")
      .select(["workspace_id", "physical_name", "status"])
      .where("tenant_id", "=", tenant)
      .execute();
    expect(tables.map((table) => table.physical_name).sort()).toEqual([
      "t_customers",
      "t_customers",
      "t_orders",
      "t_orders",
      "t_scratch",
      "t_temp",
    ]);
    for (const table of tables) {
      const there = await rowsOf(dataA, table.workspace_id, table.physical_name);
      const here = await rowsOf(dataB, table.workspace_id, table.physical_name);
      // Bob's rows are still Bob's, under the ID his account has here.
      expect(here, table.physical_name).toEqual(
        there.map((line) => line.replaceAll(bob.id, bobOnB)),
      );
    }
    // The catalog too: retired columns and tables, and every earlier name.
    const catalog = (db: Kysely<PlatformSchema>) =>
      dump(
        db,
        sql`select to_jsonb(c)::text as line from data_column c join data_table t on t.id = c.table_id where t.tenant_id = ${tenant} order by c.id`,
      );
    expect(await catalog(dataB)).toEqual(await catalog(dataA));
    // And none of it is in the second instance's own database.
    expect(
      await b.db.selectFrom("data_table").select("id").where("tenant_id", "=", tenant).execute(),
    ).toEqual([]);
    const here =
      await sql`select 1 from pg_namespace where nspname = ${workspaceSchema(main)}`.execute(b.db);
    expect(here.rows).toEqual([]);
  });

  test("every bundle, file and stored payload is there, byte for byte", async () => {
    let compared = 0;
    for (const entry of OWNED_TABLES) {
      if (entry.export === "never") continue;
      for (const column of entry.stored ?? []) {
        const keys = await sql<{ key: string }>`
          select ${sql.ref(`t.${column}`)} as key from ${sql.table(entry.table)} as t
          where ${entry.ofTenant(tenant)} and ${sql.ref(`t.${column}`)} is not null
        `.execute(a.db);
        for (const { key } of keys.rows) {
          expect(
            (await b.kernel.storage.get(key)).equals(await a.kernel.storage.get(key)),
            key,
          ).toBe(true);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(report.objects);
    expect(compared).toBeGreaterThanOrEqual(4);
  });

  test("members sign in with the passwords they had, and see what they saw", async () => {
    aliceB = await b.signIn("alice@acme.example", PASSWORD);
    expect((await aliceB.get("/me")).body.tenants).toEqual([
      { id: tenant, slug: "acme", name: "Acme Corp" },
    ]);
    // Bob had an account here already: his own password, and now a second tenant.
    const bobB = await b.signIn("bob@acme.example", "bobs-other-password");
    expect((await bobB.get("/me")).body.tenants.map((entry: Any) => entry.slug).sort()).toEqual([
      "acme",
      "elsewhere",
    ]);
    await expect(b.signIn("bob@acme.example", PASSWORD)).rejects.toThrow();
    const carolB = await b.signIn("carol@acme.example", PASSWORD);

    const numbers = async (client: Client) =>
      (await client.get(`${ws(main)}/rows/orders?sort=number`)).body.items.map(
        (row: Any) => row.number,
      );
    // The owner rule holds as before: each sees their own orders, the admin sees all.
    expect(await numbers(bobB)).toEqual(await numbers(bob.client));
    expect(await numbers(bobB)).toEqual(["A-1", "A-4"]);
    expect(await numbers(carolB)).toEqual(["A-2"]);
    expect(await numbers(aliceB)).toEqual(["A-1", "A-2", "A-3", "A-4"]);
    // Through the API a row reads the same, value for value.
    const [there, here] = [
      (await alice.get(`${ws(main)}/rows/orders?sort=number`)).body.items,
      (await aliceB.get(`${ws(main)}/rows/orders?sort=number`)).body.items,
    ];
    expect(here).toEqual(JSON.parse(JSON.stringify(there).replaceAll(bob.id, bobOnB)));
    expect(here[0]).toMatchObject({
      amount: 110.25,
      currency: "EUR",
      meta: { tags: ["x", "y"], nested: { n: 1 } },
      placed: "2026-03-01T10:15:30.123Z",
    });
  });

  test("the file downloads as it was, and the definitions and deployments are all there", async () => {
    const file = await aliceB.get(`${ws(main)}/files/${fileId}/content`);
    expect(file.bytes.equals(Buffer.from([0, 1, 2, 255, 254, 10, 13]))).toBe(true);
    expect(file.headers["content-type"]).toBe("application/pdf");

    for (const path of [
      "tables",
      "bundles",
      "deployments",
      "resources",
      "connection-bindings",
      "data-source-bindings",
      "secrets",
      "variable-values",
    ]) {
      const strip = (items: Any[]) => JSON.stringify(items).replaceAll(bob.id, bobOnB);
      expect(strip((await aliceB.get(`${ws(main)}/${path}`)).body.items), path).toBe(
        strip((await alice.get(`${ws(main)}/${path}`)).body.items),
      );
    }
    const orders = (await aliceB.get(`${ws(main)}/tables/orders`)).body;
    expect(orders.columns.find((column: Any) => column.name === "note")).toMatchObject({
      status: "retired",
      held: 2,
    });
    expect(orders.stored.schema).toBe(workspaceSchema(main));
    expect((await aliceB.get(ws(dev))).body.linkedWorkspaceId).toBe(main);
  });

  test("it arrives paused: nothing fires until someone resumes it, and webhooks keep their addresses", async () => {
    const hook = async (client: Client) =>
      (await client.get(`${ws(main)}/triggers`)).body.items.find(
        (item: Any) => item.path === "hook",
      ).url as string;
    const [there, here] = [new URL(await hook(alice)), new URL(await hook(aliceB))];
    expect(here.pathname).toBe(there.pathname);
    expect((await aliceB.get(ws(main))).body.triggersPaused).toBe(true);
    const call = () => b.app.inject({ method: "POST", url: here.pathname, payload: {} });
    expect((await call()).statusCode).toBe(503);
    await aliceB.patch(ws(main), { triggersPaused: false });
    expect((await call()).statusCode).toBe(202);
    await aliceB.patch(ws(main), { triggersPaused: true });
  });

  test("its scripts run here, reading the secrets and rows that came with it", async () => {
    // Worker credentials are not carried, so a new one is made on this instance.
    expect((await aliceB.get(`/tenants/${tenant}/worker-credentials`)).body.items).toEqual([]);
    const output = await withWorker(b, aliceB, async () => {
      const started = await aliceB.post(`${ws(main)}/runs`, {
        script: "greet",
        input: { name: "Ada" },
      });
      const done = await finished(aliceB, main, started.body.id);
      expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
      return done.output;
    });
    const sum = [..."token-of-main"].reduce((total, c) => total + c.charCodeAt(0), 0);
    // The secret opened with the tenant's own key, under a master key this instance never shared.
    expect(output).toEqual({ said: "hello Ada", secretSum: sum, orders: 4 });
    const erp = (await aliceB.get(`${ws(main)}/data-source-bindings`)).body.items[0];
    expect(erp).toMatchObject({ bound: true, hasPassword: true });
  });

  test("the audit log came too, and records the arrival", async () => {
    const actions = (await aliceB.get(`/tenants/${tenant}/audit?limit=200`)).body.items.map(
      (entry: Any) => entry.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "tenant.created",
        "tenant.exported",
        "deployment.created",
        "tenant.imported",
      ]),
    );
    const arrival = (await aliceB.get(`/tenants/${tenant}/audit?action=tenant.imported`)).body
      .items[0];
    expect(arrival.details).toMatchObject({
      slug: "acme",
      dataLocation: "acme-db",
      history: true,
      members: { created: 2, linked: 1 },
    });
  });

  test("a table change deployed after the move still works, in the tenant's own database", async () => {
    await deploy(
      aliceB,
      dev,
      bundle({ ...ordersV2, priority: { type: "integer", default: 3 } }, "v3"),
    );
    expect((await aliceB.get(`${ws(dev)}/rows/orders`)).body.items[0]).toMatchObject({
      number: "D-1",
      priority: 3,
    });
    const promoted = await aliceB.post(`${ws(dev)}/promotions`);
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(201);
    expect(promoted.body.summary.data).toEqual(["Table orders: column priority added."]);
    expect(
      (await aliceB.get(`${ws(main)}/rows/orders?sort=number`)).body.items.map((row: Any) => [
        row.number,
        row.priority,
      ]),
    ).toEqual([
      ["A-1", 3],
      ["A-2", 3],
      ["A-3", 3],
      ["A-4", 3],
    ]);
  });

  test("importing the same tenant twice is refused", async () => {
    const again = await importInto(operatorB, archive);
    expect(again.status).toBe(409);
    expect(again.body.detail).toContain("already on this instance");
  });

  test("the instance it left is untouched until the tenant is deleted there, which completes the move", async () => {
    expect((await alice.get(`${ws(main)}/rows/orders`)).body.items).toHaveLength(4);
    expect((await alice.get(ws(main))).body.triggersPaused).toBe(false);
    // Runs are still queued there, so the tenant is not yet idle.
    const busy = await a.admin.post(`/tenants/${tenant}/deletion`, { confirm: "acme" });
    expect(busy.status).toBe(409);
    for (const run of (await alice.get(`${ws(main)}/runs`)).body.items) {
      if (run.status === "queued") await alice.post(`${ws(main)}/runs/${run.id}/cancel`);
    }
    expect((await a.admin.post(`/tenants/${tenant}/deletion`, { confirm: "acme" })).status).toBe(
      204,
    );
    expect(
      (await a.admin.get("/tenants?limit=200")).body.items.map((entry: Any) => entry.slug),
    ).toEqual(["globex"]);
  });
});

describe("back again", () => {
  test("an export without history, from the dedicated database to a shared one, under another name", async () => {
    const aliceB = await b.signIn("alice@acme.example", PASSWORD);
    const exported = await aliceB.post(`/tenants/${tenant}/exports`, {
      passphrase: "another long passphrase",
    });
    expect(exported.status).toBe(200);
    const path = join(dir, "back.tar");
    await writeFile(path, exported.bytes);
    const file = await open(path);
    const index = await tarIndex(file);
    const light: ExportManifest = JSON.parse(
      (await tarRead(file, index.at(-1) as never)).toString("utf8"),
    );
    await file.close();
    expect(light.history).toBe(false);
    expect(
      Object.keys(light.counts).some((name) =>
        ["run", "run_log", "event", "flow_run"].includes(name),
      ),
    ).toBe(false);

    const imported = await a.admin.upload(
      "/instance/tenant-imports?slug=acme-returned",
      exported.bytes,
      "application/x-tar",
      { "x-export-passphrase": "another long passphrase" },
    );
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    expect(imported.body.tenant).toMatchObject({ slug: "acme-returned", dataLocation: null });
    // Alice's account was still here, so it is linked rather than made again.
    expect(imported.body.members.linked).toBeGreaterThanOrEqual(1);
    const back = await a.signIn("alice@acme.example", PASSWORD);
    expect(
      (await back.get(`${ws(main)}/rows/orders?sort=number`)).body.items.map((row: Any) => [
        row.number,
        row.priority,
      ]),
    ).toEqual([
      ["A-1", 3],
      ["A-2", 3],
      ["A-3", 3],
      ["A-4", 3],
    ]);
    expect((await back.get(`${ws(main)}/runs`)).body.items).toEqual([]);
    const here =
      await sql`select 1 from pg_namespace where nspname = ${workspaceSchema(main)}`.execute(a.db);
    expect(here.rows).toHaveLength(1);
  });
});

describe("guards", () => {
  test("every change by a principal went through the write path, and the new routes were exercised", () => {
    for (const app of [a, b]) {
      expect(
        app.unaudited.filter((route) => !/\/rows?\//.test(route)),
        JSON.stringify(app.unaudited),
      ).toEqual([]);
    }
    expect(a.unexercised((route) => /\/(exports|tenant-imports)$/.test(route))).toEqual([]);
  });
});
