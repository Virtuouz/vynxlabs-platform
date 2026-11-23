import { type Kysely, type PlatformSchema, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { upgradePolicies, workspaceSchema } from "./kernel/data/apply.js";
import { describeTable, findRows, withData } from "./kernel/data/rows.js";
import { commitDataTransactions } from "./kernel/data/stores.js";
import { deployBundle } from "./kernel/execution/deploy.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

/**
 * This suite runs twice: with the tenant's tables in the platform database,
 * and with them in a database of their own (see data-dedicated.test.ts).
 * Everything a tenant can do with its data must behave the same in both.
 */
const DEDICATED = process.env.VX_DATA_MODE === "dedicated";

let t: TestApp;
/** The database that holds the tenant's tables and their catalog, as its owner. */
let data: Kysely<PlatformSchema>;
let dedicatedDb: TestDatabase | undefined;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client; // tenant admin
let carol: { id: string; client: Client }; // may read and write rows, subject to policy
let dave: { id: string; client: Client };
let erin: { id: string; client: Client }; // bound at one table only
let viewer: Client;
let other: Client;
let roles: Record<string, string>;

// biome-ignore lint/suspicious/noExplicitAny: row bodies are inspected freely
type Any = any;
const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const table = (
  path: string,
  columns: Record<string, object>,
  extra: Record<string, unknown> = {},
) => manifest("table", path, { columns, ...extra });

const customers = table("customers", {
  name: { type: "text", required: true },
  email: { type: "text", unique: true },
});
const ordersV1 = table(
  "orders",
  {
    number: { type: "text", required: true, unique: true },
    total: { type: "integer" },
    note: { type: "text" },
    customer: { type: "reference", references: "customers" },
    owner_id: { type: "uuid" },
  },
  {
    policy: { type: "owner", column: "owner_id" },
    indexes: [["total"], ["owner_id", "created_at"]],
  },
);
const ordersV2 = table(
  "orders",
  {
    number: { type: "text", required: true, unique: true },
    amount: { type: "integer", renamedFrom: "total" },
    currency: { type: "text", required: true, default: "USD" },
    customer: { type: "reference", references: "customers" },
    owner_id: { type: "uuid" },
  },
  { policy: { type: "owner", column: "owner_id" }, indexes: [["amount"]] },
);
const samples = table("lab/samples", {
  label: { type: "text" },
  count: { type: "integer" },
  ratio: { type: "number" },
  ok: { type: "boolean", default: true },
  at: { type: "timestamp" },
  day: { type: "date" },
  extra: { type: "json" },
  ref: { type: "uuid" },
});

function bundle(tables: BundleManifest[], marker = ""): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: tables,
    code: `export const marker = ${JSON.stringify(marker)};`,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;
async function deploy(content: Bundle, workspace = dev) {
  const uploaded = await alice.post(`${ws(workspace)}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return alice.post(`${ws(workspace)}/deployments`, { bundleId: uploaded.body.id });
}
const rows = async (
  client: Client,
  tableName: string,
  query = "",
  workspace = dev,
): Promise<Any[]> => (await client.get(`${ws(workspace)}/rows/${tableName}${query}`)).body.items;
/** What is really in the database, asked as the platform itself. */
async function stored(workspace: string, physical: string, columns: string): Promise<Any[]> {
  const result = await sql
    .raw(`select ${columns} from "${workspaceSchema(workspace)}"."${physical}" order by 1`)
    .execute(data);
  return result.rows;
}

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  if (DEDICATED) {
    dedicatedDb = await createTestDatabase();
    const registered = await t.admin.put("/instance/database-locations/acme-db", {
      connectionString: dedicatedDb.connectionString,
      description: "Acme's own database",
    });
    expect(registered.status, JSON.stringify(registered.body)).toBe(204);
  }
  const seed = async (slug: string, email: string) => {
    const created = await t.admin.post("/tenants", {
      slug,
      name: slug,
      ...(DEDICATED && slug === "acme" ? { dataLocation: "acme-db" } : {}),
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
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
  other = (await seed("globex", "gina@globex.example")).client;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;

  // A role like the one end users will hold: rows only, subject to each table's policy.
  const rowsOnly = (
    await alice.post(`/tenants/${tenant}/roles`, {
      name: "rows_only",
      permissions: ["data:read", "data:write"],
    })
  ).body.id;
  const member = async (name: string, bind: object | null) => {
    const created = await alice.post(`/tenants/${tenant}/members`, {
      email: `${name}@acme.example`,
      name,
      password: PASSWORD,
    });
    if (bind)
      await alice.post(`/tenants/${tenant}/bindings`, {
        principalType: "member",
        principalId: created.body.id,
        ...bind,
      });
    return {
      id: created.body.id as string,
      client: await t.signIn(`${name}@acme.example`, PASSWORD),
    };
  };
  carol = await member("carol", { roleId: rowsOnly });
  dave = await member("dave", { roleId: rowsOnly });
  erin = await member("erin", null);
  viewer = (await member("vera", { roleId: roles.viewer })).client;
  roles.rows_only = rowsOnly;
  data = (await t.kernel.data.forTenant(tenant)).owner;
}, 60_000);

afterAll(async () => {
  await t.stop();
  await dedicatedDb?.drop();
});

describe("deploying tables", () => {
  test("a deploy creates the tables, each in the workspace's own schema, with its policy and indexes", async () => {
    const deployed = await deploy(bundle([customers, ordersV1, samples]));
    expect(deployed.status).toBe(201);
    expect(deployed.body.summary).toMatchObject({ created: 3 });

    const listed = (await alice.get(`${ws()}/tables`)).body.items;
    expect(
      listed.map((item: Any) => [item.name, item.status, item.managedIn, item.rowCount]),
    ).toEqual([
      ["customers", "active", "code", 0],
      ["lab/samples", "active", "code", 0],
      ["orders", "active", "code", 0],
    ]);
    const detail = (await alice.get(`${ws()}/tables/orders`)).body;
    expect(detail.stored).toEqual({ schema: workspaceSchema(dev), table: "t_orders" });
    expect(detail.policy).toEqual({ type: "owner", column: "owner_id" });
    expect(detail.columns.find((c: Any) => c.name === "customer")).toMatchObject({
      type: "reference",
      references: "customers",
    });

    const facts = await sql<{ rls: boolean; policies: string; indexes: string }>`
      select c.relrowsecurity as rls,
        (select count(*) from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname) as policies,
        (select count(*) from pg_indexes i where i.schemaname = n.nspname and i.tablename = c.relname and i.indexname like 'ix\\_%') as indexes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${workspaceSchema(dev)} and c.relname = 't_orders'
    `.execute(data);
    expect(facts.rows[0]).toEqual({ rls: true, policies: "1", indexes: "2" });

    // Deploying the same thing again touches nothing.
    expect((await deploy(bundle([customers, ordersV1, samples]))).body.summary).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 3,
    });
  });

  test("a bundle whose tables do not hold together is refused at upload", async () => {
    const problems = async (broken: BundleManifest) =>
      ((await alice.post(`${ws()}/bundles`, bundle([customers, broken]))).body.errors as Any[]).map(
        (e) => `${e.path}: ${e.message}`,
      );
    expect(
      await problems(
        table("bad", {
          id: { type: "text" },
          friend: { type: "reference" },
          n: { type: "integer", default: "x" },
        }),
      ),
    ).toEqual([
      'bad (table): /body/columns/id every table already has a column called "id"',
      "bad (table): /body/columns/friend/references a reference must say which table it points to",
      "bad (table): /body/columns/n/default the default does not fit a integer column",
    ]);
    expect(
      await problems(
        table(
          "bad",
          { owner: { type: "integer" }, to: { type: "reference", references: "nowhere" } },
          { policy: { type: "owner", column: "owner" } },
        ),
      ),
    ).toEqual([
      'bad (table): /body/policy/column the owner column must be a uuid or text column, and "owner" is a integer',
      'bad (table): /body/columns/to/references refers to "nowhere", which is not a table in this repository.',
    ]);
  });
});

describe("the data API", () => {
  test("every column type goes in and comes back as it was", async () => {
    const row = {
      label: "First sample",
      count: 42,
      ratio: 0.125,
      ok: false,
      at: "2026-03-01T09:30:00.000Z",
      day: "2026-03-01",
      extra: { tags: ["a", "b"], nested: { n: 1 } },
      ref: "018f0000-0000-7000-8000-000000000001",
    };
    const inserted = await alice.post(`${ws()}/rows/lab/samples`, row);
    expect(inserted.status).toBe(201);
    const saved = inserted.body.items[0];
    expect(saved).toMatchObject(row);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.created_at).toBe(saved.updated_at);
    expect((await alice.get(`${ws()}/row/${saved.id}/lab/samples`)).body).toEqual(saved);

    // A default applies when no value is given, and a missing value is null.
    const sparse = (await alice.post(`${ws()}/rows/lab/samples`, { label: "Sparse" })).body
      .items[0];
    expect(sparse).toMatchObject({ ok: true, count: null, extra: null });

    const patched = await alice.patch(`${ws()}/row/${saved.id}/lab/samples`, {
      count: 43,
      extra: null,
    });
    expect(patched.body).toMatchObject({ count: 43, extra: null, label: "First sample" });
    expect(Date.parse(patched.body.updated_at)).toBeGreaterThanOrEqual(
      Date.parse(saved.updated_at),
    );
    expect((await alice.delete(`${ws()}/row/${sparse.id}/lab/samples`)).status).toBe(204);
    expect((await alice.get(`${ws()}/row/${sparse.id}/lab/samples`)).status).toBe(404);
    expect((await alice.get(`${ws()}/row/not-an-id/lab/samples`)).status).toBe(404);
  });

  test("a value that does not fit its column is refused, with the column named", async () => {
    const refused = await alice.post(`${ws()}/rows/lab/samples`, {
      label: 5,
      count: 1.5,
      ok: "yes",
      at: "soon",
      day: "03/01/2026",
      ref: "abc",
      nope: 1,
      id: "018f0000-0000-7000-8000-000000000001",
    });
    expect(refused.status).toBe(400);
    expect(refused.body.errors).toEqual([
      { path: "/label", message: "must be text" },
      { path: "/count", message: "must be a whole number" },
      { path: "/ok", message: "must be true or false" },
      {
        path: "/at",
        message: "must be a date and time that exists, with its zone, such as 2026-01-31T09:30:00Z",
      },
      { path: "/day", message: "must be a day that exists, such as 2026-01-31" },
      { path: "/ref", message: "must be an ID" },
      { path: "/nope", message: 'there is no column "nope" in lab/samples' },
      { path: "/id", message: '"id" is set by the platform' },
    ]);
    expect(
      (await alice.post(`${ws()}/rows/customers`, { email: "a@x.example" })).body.errors,
    ).toEqual([{ path: "/name", message: "is required" }]);
    expect((await alice.get(`${ws()}/rows/no-such-table`)).status).toBe(404);
  });

  test("unique values and references are enforced", async () => {
    const ada = (
      await alice.post(`${ws()}/rows/customers`, { name: "Ada", email: "ada@x.example" })
    ).body.items[0];
    const again = await alice.post(`${ws()}/rows/customers`, {
      name: "Other Ada",
      email: "ada@x.example",
    });
    expect(again.status).toBe(409);
    expect(again.body.detail).toBe('Another row already has that value for "email".');
    // The refusal names the field, so the form marks it (walk-fix 29).
    expect(again.body.errors).toEqual([
      { path: "/email", message: "Another row already has this value." },
    ]);

    const order = await alice.post(`${ws()}/rows/orders`, {
      number: "A-1",
      total: 100,
      customer: ada.id,
    });
    expect(order.status).toBe(201);
    const orphan = await alice.post(`${ws()}/rows/orders`, {
      number: "A-2",
      customer: "018f0000-0000-7000-8000-00000000dead",
    });
    expect(orphan.status).toBe(409);
    expect(orphan.body.detail).toBe("A reference points to a row that does not exist.");
    const stillUsed = await alice.delete(`${ws()}/row/${ada.id}/customers`);
    expect(stillUsed.status).toBe(409);
    expect(stillUsed.body.detail).toBe("Another row still refers to this one.");
  });

  test("filtering, sorting and paging", async () => {
    const batch = Array.from({ length: 25 }, (_, n) => ({
      label: `item ${String(n).padStart(2, "0")}`,
      count: n,
      ok: n % 2 === 0,
      day: `2026-04-${String((n % 28) + 1).padStart(2, "0")}`,
    }));
    expect((await alice.post(`${ws()}/rows/lab/samples`, { rows: batch })).body.items).toHaveLength(
      25,
    );
    const find = async (filter: object, extra = "") =>
      (
        await rows(
          alice,
          "lab/samples",
          `?filter=${encodeURIComponent(JSON.stringify(filter))}${extra}`,
        )
      ).map((row) => row.count);

    expect(await find({ column: "count", op: "gte", value: 22 }, "&sort=count")).toEqual([
      22, 23, 24, 43,
    ]);
    expect(
      await find(
        {
          and: [
            { column: "count", op: "lt", value: 6 },
            { column: "ok", op: "eq", value: true },
          ],
        },
        "&sort=-count",
      ),
    ).toEqual([4, 2, 0]);
    expect(
      await find(
        {
          or: [
            { column: "count", op: "eq", value: 1 },
            { column: "label", op: "contains", value: "ITEM 2" },
          ],
        },
        "&sort=count",
      ),
    ).toEqual([1, 20, 21, 22, 23, 24]);
    // Text that does not hold a word is the rest of the rows (not the rows that hold it).
    const holding = await find({ column: "label", op: "contains", value: "ITEM 2" });
    const lacking = await find({ column: "label", op: "not_contains", value: "ITEM 2" });
    expect(holding.length).toBeGreaterThan(0);
    expect(lacking.length).toBeGreaterThan(0);
    expect(lacking.filter((count) => holding.includes(count))).toEqual([]);
    expect(await find({ column: "count", op: "in", value: [3, 5, 99] }, "&sort=count")).toEqual([
      3, 5,
    ]);
    expect(await find({ column: "day", op: "eq", value: "2026-04-03" })).toEqual([2]);
    expect(await find({ column: "extra", op: "is_null", value: false })).toEqual([]);
    expect(await find({ column: "at", op: "is_null" }, "&sort=count&limit=2")).toEqual([0, 1]);

    // Paging walks every row once.
    const seen: string[] = [];
    let cursor: string | null = "";
    while (cursor !== null) {
      const page: Any = (
        await alice.get(
          `${ws()}/rows/lab/samples?sort=label&limit=10${cursor ? `&cursor=${cursor}` : ""}`,
        )
      ).body;
      seen.push(...page.items.map((row: Any) => row.id));
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(26);
    expect(new Set(seen).size).toBe(26);

    // A page starts after the last row seen, so a row added before it moves nothing:
    // the next page neither repeats a row nor skips one. Down the sort, and with no sort.
    for (const order of ["-count", ""]) {
      const first: Any = (
        await alice.get(`${ws()}/rows/lab/samples?limit=5${order ? `&sort=${order}` : ""}`)
      ).body;
      expect(JSON.parse(Buffer.from(first.nextCursor, "base64url").toString())).toHaveProperty(
        "after",
      );
      const added = await alice.post(`${ws()}/rows/lab/samples`, {
        rows: [{ label: "added before", count: 1000 }],
      });
      expect(added.status, JSON.stringify(added.body)).toBe(201);
      const second: Any = (
        await alice.get(
          `${ws()}/rows/lab/samples?limit=5${order ? `&sort=${order}` : ""}&cursor=${first.nextCursor}`,
        )
      ).body;
      const ids = [...first.items, ...second.items].map((row: Any) => row.id);
      expect(new Set(ids).size).toBe(10);
      await alice.delete(`${ws()}/row/${added.body.items[0].id}/lab/samples`);
    }
    // Several rows deleted at once; a key that names no row is said to be missing.
    const made = await alice.post(`${ws()}/rows/lab/samples`, {
      rows: [
        { label: "=1+1 go", count: 2000 },
        { label: 'says "hi", twice', count: 2001 },
      ],
    });
    const madeIds = made.body.items.map((row: Any) => row.id);
    // The CSV has a heading line, quotes what needs it, and defuses a formula.
    const csv = await alice.get(
      `${ws()}/rows-export/lab/samples?filter=${encodeURIComponent(JSON.stringify({ column: "count", op: "gte", value: 2000 }))}&sort=count`,
    );
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    const lines = String(csv.body).trim().split("\r\n");
    expect(lines[0]).toContain("label");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("'=1+1 go");
    expect(lines[2]).toContain('"says ""hi"", twice"');
    const gone = await alice.post(`${ws()}/row-deletions/lab/samples`, {
      ids: [...madeIds, "01a1e798-0000-7000-8000-000000000000"],
    });
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    expect(gone.body.deleted.sort()).toEqual([...madeIds].sort());
    expect(gone.body.missing).toEqual(["01a1e798-0000-7000-8000-000000000000"]);

    // A cursor that is neither form is refused.
    const garbled = Buffer.from('{"after":"x"}').toString("base64url");
    expect((await alice.get(`${ws()}/rows/lab/samples?cursor=${garbled}`)).status).toBe(400);

    const bad = async (query: string) =>
      (await alice.get(`${ws()}/rows/lab/samples?${query}`)).status;
    expect(await bad("filter=notjson")).toBe(400);
    expect(
      await bad(
        `filter=${encodeURIComponent(JSON.stringify({ column: "nope", op: "eq", value: 1 }))}`,
      ),
    ).toBe(400);
    expect(
      await bad(
        `filter=${encodeURIComponent(JSON.stringify({ column: "count", op: "like", value: 1 }))}`,
      ),
    ).toBe(400);
    expect(
      await bad(
        `filter=${encodeURIComponent(JSON.stringify({ column: "count", op: "eq", value: "1; drop table x" }))}`,
      ),
    ).toBe(400);
    expect(await bad("sort=nope")).toBe(400);
    // A value is always bound, never spliced, so text that looks like SQL is just text.
    expect(await find({ column: "label", op: "eq", value: "x' or '1'='1" })).toEqual([]);
  });

  test("a batch is all or nothing, and is limited to 1,000 rows", async () => {
    const before = (await alice.get(`${ws()}/tables/lab/samples`)).body.rowCount;
    const mixed = await alice.post(`${ws()}/rows/lab/samples`, {
      rows: [{ label: "fine" }, { label: 7 }],
    });
    expect(mixed.status).toBe(400);
    expect(mixed.body.errors).toEqual([{ path: "/1/label", message: "must be text" }]);
    expect((await alice.get(`${ws()}/tables/lab/samples`)).body.rowCount).toBe(before);
    expect(
      (
        await alice.post(`${ws()}/rows/lab/samples`, {
          rows: Array.from({ length: 1001 }, () => ({})),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await alice.post(`${ws()}/rows/lab/samples`, {
          rows: Array.from({ length: 1000 }, (_, n) => ({ count: 1000 + n })),
        })
      ).body.items,
    ).toHaveLength(1000);
  });
});

describe("totals", () => {
  const totals = (query: string) => alice.get(`${ws()}/aggregate/lab/samples?${query}`);
  const mine = `filter=${encodeURIComponent(JSON.stringify({ column: "label", op: "contains", value: "tot-" }))}`;
  let made: string[] = [];

  test("counts, sums, averages, the least and the most, over the rows a filter keeps", async () => {
    const inserted = await alice.post(`${ws()}/rows/lab/samples`, {
      rows: [
        { label: "tot-a", count: 1, ratio: 0.5, at: "2026-01-15T10:00:00Z", day: "2026-01-15" },
        { label: "tot-b", count: 2, ratio: 1.5, at: "2026-01-20T23:59:59Z", day: "2026-01-31" },
        { label: "tot-c", count: 3, at: "2026-02-03T00:00:00Z", day: "2026-02-01" },
        { label: "tot-d", count: 4, ok: false },
      ],
    });
    expect(inserted.status, JSON.stringify(inserted.body)).toBe(201);
    made = inserted.body.items.map((row: Any) => row.id);

    // With nothing asked for, the rows are counted.
    expect((await totals(mine)).body).toEqual({
      items: [{ by: {}, values: { count: 4 } }],
      truncated: false,
    });
    const all = await totals(
      `${mine}&measure=count,sum:count,avg:count,min:at,max:day,count:ratio,max:label`.slice(
        0,
        500,
      ),
    );
    // Five at most.
    expect(all.status).toBe(400);
    const some = await totals(`${mine}&measure=sum:count,avg:count,min:at,max:day,count:ratio`);
    expect(some.status, JSON.stringify(some.body)).toBe(200);
    expect(some.body.items).toEqual([
      {
        by: {},
        values: {
          "sum:count": 10,
          "avg:count": 2.5,
          "min:at": "2026-01-15T10:00:00.000Z",
          "max:day": "2026-02-01",
          // Counting a column counts the rows that have a value in it.
          "count:ratio": 2,
        },
      },
    ]);
    // Over no rows a count is nothing and a sum is not a number.
    const none = encodeURIComponent(JSON.stringify({ column: "label", op: "eq", value: "nobody" }));
    expect((await totals(`filter=${none}&measure=count,sum:count`)).body.items).toEqual([
      { by: {}, values: { count: 0, "sum:count": null } },
    ]);
  });

  test("rows are grouped by a column, and a time or a date by day, week, month or year", async () => {
    const byMonth = await totals(`${mine}&group=at:month&measure=count,sum:count`);
    expect(byMonth.status, JSON.stringify(byMonth.body)).toBe(200);
    expect(byMonth.body.items).toEqual([
      { by: { "at:month": "2026-01-01T00:00:00.000Z" }, values: { count: 2, "sum:count": 3 } },
      { by: { "at:month": "2026-02-01T00:00:00.000Z" }, values: { count: 1, "sum:count": 3 } },
      // A row with no time is in a group of its own, last.
      { by: { "at:month": null }, values: { count: 1, "sum:count": 4 } },
    ]);
    const byDay = await totals(`${mine}&group=day:month&sort=-count`);
    expect(byDay.body.items.map((item: Any) => [item.by["day:month"], item.values.count])).toEqual([
      ["2026-01-01", 2],
      ["2026-02-01", 1],
      [null, 1],
    ]);
    expect(
      (await totals(`${mine}&group=at:year`)).body.items.map((item: Any) => item.by["at:year"]),
    ).toEqual(["2026-01-01T00:00:00.000Z", null]);
    // Two columns, sorted by a total, and cut short.
    const two = await totals(`${mine}&group=ok,day:month&measure=sum:count&sort=-sum:count`);
    expect(two.body.items[0]).toEqual({
      by: { ok: false, "day:month": null },
      values: { "sum:count": 4 },
    });
    const cut = await totals(`${mine}&group=label&limit=3`);
    expect(cut.body.items.map((item: Any) => item.by.label)).toEqual(["tot-a", "tot-b", "tot-c"]);
    expect(cut.body.truncated).toBe(true);
  });

  test("a total that makes no sense is refused, with what is wrong", async () => {
    const refused = async (query: string, why: string) => {
      const answer = await totals(query);
      expect(answer.status, query).toBe(400);
      const said = (answer.body.errors as Any[]).map((issue) => issue.message).join(" ");
      expect(said, query).toContain(why);
    };
    await refused("measure=sum:label", '"sum" does not work on "label"');
    await refused("measure=avg:day", '"avg" does not work on "day"');
    await refused("measure=sum", '"sum" needs a column');
    await refused("measure=median:count", 'there is no total "median"');
    await refused("measure=sum:nope", 'there is no column "nope"');
    await refused("group=extra", "rows cannot be grouped by");
    await refused("group=label:month", "is not a date or a time");
    await refused("group=at:decade", 'there is no bucket "decade"');
    await refused("group=label,count,ok,day", "at most 3 columns");
    await refused("group=label,label", "grouped by twice");
    await refused("group=label&sort=ratio", "totals can be sorted by label, count");
    // What a caller writes never reaches the statement as a name.
    await refused('group=label";drop table x;--', "there is no column");
    await refused("measure=count(*);select:label", "there is no total");
    expect((await totals("filter=nonsense")).status).toBe(400);
    expect((await alice.get(`${ws()}/aggregate/no-such-table`)).status).toBe(404);

    for (const id of made) await alice.delete(`${ws()}/row/${id}/lab/samples`);
  });
});

describe("row policies", () => {
  let carols: Any;
  let daves: Any;

  test("a row written without an owner becomes the writer's, and each person sees only their own", async () => {
    carols = (
      await carol.client.post(`${ws()}/rows/orders`, { number: "C-1", total: 10, note: "carol's" })
    ).body.items[0];
    daves = (
      await dave.client.post(`${ws()}/rows/orders`, { number: "D-1", total: 20, note: "dave's" })
    ).body.items[0];
    expect(carols.owner_id).toBe(carol.id);
    expect(daves.owner_id).toBe(dave.id);

    expect((await rows(carol.client, "orders")).map((row) => row.number)).toEqual(["C-1"]);
    expect((await rows(dave.client, "orders")).map((row) => row.number)).toEqual(["D-1"]);
    // A filter cannot reach past the policy.
    const everything = encodeURIComponent(JSON.stringify({ column: "total", op: "gte", value: 0 }));
    expect(
      (await rows(carol.client, "orders", `?filter=${everything}`)).map((row) => row.number),
    ).toEqual(["C-1"]);
  });

  test("another person's row cannot be read, changed, deleted or forged", async () => {
    expect((await carol.client.get(`${ws()}/row/${daves.id}/orders`)).status).toBe(404);
    expect(
      (await carol.client.patch(`${ws()}/row/${daves.id}/orders`, { note: "mine now" })).status,
    ).toBe(404);
    expect((await carol.client.delete(`${ws()}/row/${daves.id}/orders`)).status).toBe(404);
    const forged = await carol.client.post(`${ws()}/rows/orders`, {
      number: "C-2",
      owner_id: dave.id,
    });
    expect(forged.status).toBe(403);
    expect(forged.body.detail).toBe(
      "This table's policy only lets you write rows you own, or rows its rules give you.",
    );
    // Nor can she give her own row away.
    expect(
      (await carol.client.patch(`${ws()}/row/${carols.id}/orders`, { owner_id: dave.id })).status,
    ).toBe(403);
    expect(
      (await carol.client.patch(`${ws()}/row/${carols.id}/orders`, { note: "edited" })).body.note,
    ).toBe("edited");
    expect((await alice.get(`${ws()}/row/${daves.id}/orders`)).body.note).toBe("dave's");
  });

  test("someone who may see every row does, and a table with an open policy is not filtered", async () => {
    expect((await rows(alice, "orders", "?sort=number")).map((row) => row.number)).toEqual([
      "A-1",
      "C-1",
      "D-1",
    ]);
    // The built-in viewer holds *:read, which includes reading every row.
    expect(await rows(viewer, "orders")).toHaveLength(3);
    expect((await viewer.post(`${ws()}/rows/orders`, { number: "V-1" })).status).toBe(403);
    expect((await rows(carol.client, "customers")).map((row) => row.name)).toEqual(["Ada"]);
  });

  test("a total is of the rows the caller may see, and of no others", async () => {
    const sum = async (client: Client, query = "") =>
      (await client.get(`${ws()}/aggregate/orders?measure=count,sum:total${query}`)).body.items[0]
        .values;
    expect(await sum(carol.client)).toEqual({ count: 1, "sum:total": 10 });
    expect(await sum(dave.client)).toEqual({ count: 1, "sum:total": 20 });
    expect((await sum(alice)).count).toBe(3);
    // Grouping by the owner shows a person one group: their own.
    const groups = await carol.client.get(`${ws()}/aggregate/orders?group=owner_id`);
    expect(groups.body.items).toEqual([{ by: { owner_id: carol.id }, values: { count: 1 } }]);
    // A filter cannot reach past the policy here either.
    const everything = encodeURIComponent(JSON.stringify({ column: "total", op: "gte", value: 0 }));
    expect(await sum(dave.client, `&filter=${everything}`)).toEqual({ count: 1, "sum:total": 20 });
  });

  test("a query written wrongly on purpose still returns only the caller's rows", async () => {
    const target = await describeTable(data, dev, "orders");
    const scope = { principalId: carol.id, all: false };
    // No filter at all, as if the code that adds one had been forgotten.
    const unfiltered = await withData(t.kernel, tenant, scope, (data) => findRows(data, target));
    expect(unfiltered.items.map((row) => row.number)).toEqual(["C-1"]);
    // Even SQL written by hand inside the request sees no more, and cannot touch the platform's tables.
    const counted = await withData(t.kernel, tenant, scope, (data) =>
      sql<{
        n: string;
      }>`select count(*) as n from ${sql.id(workspaceSchema(dev), "t_orders")}`.execute(data),
    );
    expect(counted.rows[0]?.n).toBe("1");
    await expect(
      withData(t.kernel, tenant, scope, (data) => sql`select count(*) from member`.execute(data)),
    ).rejects.toThrow(/permission denied|does not exist/);
    await expect(
      withData(t.kernel, tenant, scope, (data) =>
        sql`update ${sql.id(workspaceSchema(dev), "t_orders")} set note = 'x'`
          .execute(data)
          .then((r) => r.numAffectedRows),
      ),
    ).resolves.toBe(1n);
    // Nobody stated: nothing is visible.
    expect(
      (
        await withData(t.kernel, tenant, { principalId: null, all: false }, (rows) =>
          findRows(rows, target),
        )
      ).items,
    ).toEqual([]);
  });

  test("access can be granted at one table only", async () => {
    expect((await erin.client.get(`${ws()}/rows/customers`)).status).toBe(403);
    const resource = (await alice.get(`${ws()}/resources/customers`)).body;
    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: dev,
      resourceId: resource.id,
      principalType: "member",
      principalId: erin.id,
      roleId: roles.rows_only,
    });
    expect((await rows(erin.client, "customers")).map((row) => row.name)).toEqual(["Ada"]);
    expect(
      (await erin.client.post(`${ws()}/rows/customers`, { name: "Erin's customer" })).status,
    ).toBe(201);
    expect((await erin.client.get(`${ws()}/rows/orders`)).status).toBe(403);
    expect((await erin.client.get(`${ws()}/tables`)).status).toBe(403);
  });

  test("someone whose access comes through a group is held to their own rows like anyone else", async () => {
    const group = await alice.post(`/tenants/${tenant}/groups`, { name: "Order handlers" });
    await alice.put(`/tenants/${tenant}/groups/${group.body.id}/members/${erin.id}`);
    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: dev,
      principalType: "group",
      principalId: group.body.id,
      roleId: roles.rows_only,
    });
    const own = await erin.client.post(`${ws()}/rows/orders`, { number: "E-1", total: 5 });
    expect(own.status).toBe(201);
    // The owner is the person, not the group.
    expect(own.body.items[0].owner_id).toBe(erin.id);
    expect((await rows(erin.client, "orders")).map((row) => row.number)).toEqual(["E-1"]);
    expect((await alice.delete(`${ws()}/row/${own.body.items[0].id}/orders`)).status).toBe(204);
    expect((await alice.delete(`/tenants/${tenant}/groups/${group.body.id}`)).status).toBe(204);
    expect((await erin.client.get(`${ws()}/rows/orders`)).status).toBe(403);
  });

  test("a request for rows runs on a connection that cannot become the platform", async () => {
    const scope = { principalId: carol.id, all: false };
    const owner = (await sql<{ who: string }>`select current_user as who`.execute(data)).rows[0]
      ?.who as string;
    const asked = <T>(run: Parameters<typeof withData<T>>[3]) =>
      withData(t.kernel, tenant, scope, run);
    const who = await asked((rows) =>
      sql<{
        current: string;
        session: string;
      }>`select current_user as current, session_user as session`.execute(rows),
    );
    expect(who.rows[0]?.current).toMatch(/^vxd_[0-9a-f]{20}$/);
    expect(who.rows[0]?.session).toBe(who.rows[0]?.current);
    expect(who.rows[0]?.current).not.toBe(owner);
    // Every way back to the role that owns the tables is closed.
    await expect(asked((rows) => sql`set role ${sql.id(owner)}`.execute(rows))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asked((rows) => sql`set session authorization ${sql.id(owner)}`.execute(rows)),
    ).rejects.toThrow(/permission denied/);
    const afterReset = await asked(async (rows) => {
      await sql`reset role`.execute(rows);
      return sql<{ who: string }>`select current_user as who`.execute(rows);
    });
    expect(afterReset.rows[0]?.who).toBe(who.rows[0]?.current);
    // It cannot change the tables, the policies or the catalog.
    const orders = sql.id(workspaceSchema(dev), "t_orders");
    for (const attempt of [
      sql`alter table ${orders} disable row level security`,
      sql`drop policy rows on ${orders}`,
      sql`create table ${sql.id(workspaceSchema(dev), "sneaky")} (x int)`,
      sql`update data_table set policy = '{"type":"open"}'`,
      sql`select * from data_column`,
    ]) {
      await expect(asked((rows) => attempt.execute(rows))).rejects.toThrow(
        /permission denied|must be owner/,
      );
    }
  });

  test.runIf(DEDICATED)(
    "a tenant on a dedicated database has nothing of its tables in the platform database",
    async () => {
      const here = await sql<{ n: string }>`
        select count(*) as n from pg_namespace where nspname in (${workspaceSchema(dev)}, ${workspaceSchema(prod)})
      `.execute(t.db);
      expect(here.rows[0]?.n).toBe("0");
      expect(
        await t.db.selectFrom("data_table").select("id").where("tenant_id", "=", tenant).execute(),
      ).toEqual([]);
      const there = await sql<{ n: string }>`
        select count(*) as n from pg_namespace where nspname = ${workspaceSchema(dev)}
      `.execute(data);
      expect(there.rows[0]?.n).toBe("1");
      // The operator sees the location, how many tenants use it and that it answers. Never its password.
      const listed = (await t.admin.get("/instance/database-locations")).body.items;
      expect(listed).toEqual([
        expect.objectContaining({ name: "acme-db", tenants: 1, reachable: true, problem: null }),
      ]);
      expect(JSON.stringify(listed)).not.toMatch(/password|postgres:\/\//);
      expect((await t.admin.delete("/instance/database-locations/acme-db")).status).toBe(409);
      expect((await alice.get("/instance/database-locations")).status).toBe(403);
    },
  );

  test.runIf(DEDICATED)(
    "registering a location's name again with another database is refused while it does not hold the tenants' tables",
    async () => {
      const empty = await createTestDatabase();
      try {
        const refused = await t.admin.put("/instance/database-locations/acme-db", {
          connectionString: empty.connectionString,
        });
        expect(refused.status, JSON.stringify(refused.body)).toBe(409);
        expect(refused.body.detail).toMatch(/does not hold them/);
        expect((await t.admin.get("/instance/database-locations")).body.items[0].reachable).toBe(
          true,
        );
        expect(await data.selectFrom("data_table").select("id").execute()).not.toEqual([]);
        const same = await t.admin.put("/instance/database-locations/acme-db", {
          connectionString: (dedicatedDb as TestDatabase).connectionString,
          description: "Acme's own database, described again",
        });
        expect(same.status).toBe(204);
        // The old connection was closed with the change of address.
        data = (await t.kernel.data.forTenant(tenant)).owner;
      } finally {
        await empty.drop();
      }
    },
  );

  test.runIf(DEDICATED)(
    "a replica reopens a location whose address another replica changed, and rereads where a tenant lives",
    async () => {
      const current = async () =>
        (
          await sql<{ name: string }>`select current_database() as name`.execute(
            (
              await t.kernel.data.location("acme-db")
            ).owner,
          )
        ).rows[0]?.name;
      const first = await current();
      const other = await createTestDatabase();
      const saved = await t.db
        .selectFrom("database_location")
        .select(["connection_encrypted", "updated_at"])
        .where("name", "=", "acme-db")
        .executeTakeFirstOrThrow();
      try {
        // As another replica would have written it: the row changes, and this process is not told.
        await t.db
          .updateTable("database_location")
          .set({
            connection_encrypted: t.kernel.data.seal("acme-db", other.connectionString),
            updated_at: new Date(),
          })
          .where("name", "=", "acme-db")
          .execute();
        await new Promise((resolve) => setTimeout(resolve, 2200));
        expect(await current()).not.toBe(first);

        // A tenant moved by another replica: its location is read again, not remembered for good.
        await t.db
          .updateTable("tenant")
          .set({ data_location: JSON.stringify({ kind: "shared" }) })
          .where("id", "=", tenant)
          .execute();
        await new Promise((resolve) => setTimeout(resolve, 2200));
        expect(await t.kernel.data.locationOf(tenant)).toBeNull();
      } finally {
        await t.db
          .updateTable("tenant")
          .set({ data_location: JSON.stringify({ kind: "dedicated", ref: "acme-db" }) })
          .where("id", "=", tenant)
          .execute();
        await t.db
          .updateTable("database_location")
          .set({ connection_encrypted: saved.connection_encrypted, updated_at: new Date() })
          .where("name", "=", "acme-db")
          .execute();
        await new Promise((resolve) => setTimeout(resolve, 2200));
        expect(await current()).toBe(first);
        data = (await t.kernel.data.forTenant(tenant)).owner;
        await other.drop();
      }
    },
    30_000,
  );
});

describe("changing a table without losing data: the exit criterion", () => {
  const snapshot = async (workspace: string) =>
    stored(workspace, "t_orders", "number, total, note");

  test("the same bundle that changed dev is promoted to production, and every value is intact in both", async () => {
    // Production starts on the first definition, with its own rows.
    for (const path of []) void path;
    expect((await deploy(bundle([customers, ordersV1, samples]), prod)).status).toBe(201);
    const pc = (await alice.post(`${ws(prod)}/rows/customers`, { name: "Prod customer" })).body
      .items[0];
    await alice.post(`${ws(prod)}/rows/orders`, {
      rows: [
        { number: "P-1", total: 500, note: "first", customer: pc.id },
        { number: "P-2", total: 750, note: "second" },
        { number: "P-3", note: "no total" },
      ],
    });
    const devBefore = await snapshot(dev);
    const prodBefore = await snapshot(prod);
    expect(prodBefore).toEqual([
      { number: "P-1", total: "500", note: "first" },
      { number: "P-2", total: "750", note: "second" },
      { number: "P-3", total: null, note: "no total" },
    ]);

    // The change: add a required column with a default, rename one, remove one.
    const v2 = bundle([customers, ordersV2, samples]);
    const onDev = await deploy(v2, dev);
    expect(onDev.status).toBe(201);
    expect(onDev.body.summary).toMatchObject({ updated: 1, unchanged: 2 });
    const onProd = await deploy(v2, prod);
    expect(onProd.status).toBe(201);
    // The deploy says what it did to the data, the same in both workspaces.
    expect(onProd.body.summary.data).toEqual(onDev.body.summary.data);
    expect([...onProd.body.summary.data].sort()).toEqual([
      "Table orders: column currency added.",
      "Table orders: column note retired. Its values are kept.",
      "Table orders: column total renamed to amount. Its values are kept.",
    ]);

    for (const [workspace, before] of [
      [dev, devBefore],
      [prod, prodBefore],
    ] as const) {
      const now = (await rows(alice, "orders", "?sort=number", workspace)) as Any[];
      // Same rows, the renamed column carries the old values, the new one has its default, the removed one is gone from view.
      expect(
        now.map((row) => [row.number, row.amount === null ? null : String(row.amount)]),
      ).toEqual(before.map((row) => [row.number, row.total]));
      expect(now.every((row) => row.currency === "USD")).toBe(true);
      expect(now.every((row) => !("note" in row) && !("total" in row))).toBe(true);
      // In the database the removed column is still there, holding what it held.
      expect((await stored(workspace, "t_orders", "number, note")).map((row) => row.note)).toEqual(
        before.map((row) => row.note),
      );
    }
    expect((await rows(alice, "orders", "?sort=number", prod))[0]).toMatchObject({
      number: "P-1",
      amount: 500,
      customer: pc.id,
    });
    const detail = (await alice.get(`${ws(prod)}/tables/orders`)).body;
    expect(detail.columns.map((c: Any) => [c.name, c.status]).sort()).toEqual([
      ["amount", "active"],
      ["currency", "active"],
      ["customer", "active"],
      ["note", "retired"],
      ["number", "active"],
      ["owner_id", "active"],
    ]);
  });

  test("rows written after the change are fine without the retired column, and the retired one is not writable", async () => {
    const written = await alice.post(`${ws(prod)}/rows/orders`, {
      number: "P-4",
      amount: 90,
      currency: "USD",
    });
    expect(written.status).toBe(201);
    expect(
      (await alice.post(`${ws(prod)}/rows/orders`, { number: "P-5", note: "old column" })).body
        .errors,
    ).toEqual([{ path: "/note", message: 'there is no column "note" in orders' }]);
    const filter = encodeURIComponent(JSON.stringify({ column: "note", op: "is_null" }));
    expect((await alice.get(`${ws(prod)}/rows/orders?filter=${filter}`)).status).toBe(400);
  });

  test("rolling production back brings the removed column back with its data, and the renamed one under its old name", async () => {
    const first = (await alice.get(`${ws(prod)}/bundles`)).body.items.find(
      (b: Any) => b.version === 1,
    );
    const rolledBack = await alice.post(`${ws(prod)}/deployments`, { bundleId: first.id });
    expect(rolledBack.status).toBe(201);
    expect([...rolledBack.body.summary.data].sort()).toEqual([
      "Table orders: column amount renamed to total. Its values are kept.",
      "Table orders: column currency retired. Its values are kept.",
      "Table orders: column note brought back, with its values.",
    ]);
    const now = await rows(alice, "orders", "?sort=number", prod);
    expect(now.map((row) => [row.number, row.total, row.note])).toEqual([
      ["P-1", 500, "first"],
      ["P-2", 750, "second"],
      ["P-3", null, "no total"],
      ["P-4", 90, null],
    ]);
    expect(now.every((row) => !("currency" in row) && !("amount" in row))).toBe(true);
    // The column added by the newer bundle is retired too, not dropped: going forward again finds its values.
    const second = (await alice.get(`${ws(prod)}/bundles`)).body.items.find(
      (b: Any) => b.version === 2,
    );
    expect((await alice.post(`${ws(prod)}/deployments`, { bundleId: second.id })).status).toBe(201);
    expect(
      (await rows(alice, "orders", "?sort=number", prod)).map((row) => [
        row.number,
        row.amount,
        row.currency,
      ]),
    ).toEqual([
      ["P-1", 500, "USD"],
      ["P-2", 750, "USD"],
      ["P-3", null, "USD"],
      ["P-4", 90, "USD"],
    ]);
  });
});

describe("refusals, retiring and purging", () => {
  const orders = (columns: Record<string, object>) =>
    table(
      "orders",
      { ...(ordersV2.body.columns as object), ...columns },
      { policy: { type: "owner", column: "owner_id" } },
    );

  test("a change that could lose or invalidate data is refused, naming the table and column, and changes nothing", async () => {
    const before = (await alice.get(`${ws()}/tables/orders`)).body;
    const refused = async (columns: Record<string, object>) =>
      deploy(bundle([customers, orders(columns), samples], `refused ${JSON.stringify(columns)}`));

    const narrowed = await refused({ number: { type: "integer" } });
    expect(narrowed.status).toBe(400);
    expect(narrowed.body.errors[0]).toEqual({
      path: "/body/columns/number/type",
      message:
        "a text column cannot become a integer column without risking its data. Add a new column and copy the values across in a script",
    });
    const required = await refused({ region: { type: "text", required: true } });
    expect(required.status).toBe(409);
    expect(required.body.detail).toBe(
      'The table "orders" cannot be changed: column "region" is required and the table already has rows. Give it a default, so existing rows have a value.',
    );
    const unique = await refused({
      currency: { type: "text", required: true, default: "USD", unique: true },
    });
    expect(unique.body.detail).toBe(
      'The table "orders" cannot be changed: column "currency" is now unique, and some rows share a value: "USD" is in 3 rows. Make the values distinct first.',
    );

    // Nothing moved: same definition, same active bundle, and the samples table untouched by the failed deploys.
    expect((await alice.get(`${ws()}/tables/orders`)).body).toEqual(before);
    expect((await alice.get(`${ws()}/bundles`)).body.items.find((b: Any) => b.active).version).toBe(
      2,
    );
  });

  test("a widening change is applied in place", async () => {
    const widened = await deploy(
      bundle([customers, orders({ amount: { type: "number", renamedFrom: "total" } }), samples]),
    );
    expect(widened.status).toBe(201);
    await alice.post(`${ws()}/rows/orders`, { number: "W-1", amount: 12.5 });
    const now = await rows(alice, "orders", "?sort=number");
    expect(now.find((row) => row.number === "A-1").amount).toBe(100);
    expect(now.find((row) => row.number === "W-1").amount).toBe(12.5);
  });

  test("retired data survives further deploys and is dropped only by a purge", async () => {
    await deploy(
      bundle([
        customers,
        orders({ amount: { type: "number" }, extra_note: { type: "text" } }),
        samples,
      ]),
    );
    expect(
      (await stored(dev, "t_orders", "number, note")).find((row) => row.number === "C-1").note,
    ).toBe("x");

    expect(
      (await carol.client.post(`${ws()}/table-purges`, { table: "orders", column: "note" })).status,
    ).toBe(403);
    expect(
      (await alice.post(`${ws()}/table-purges`, { table: "orders", column: "number" })).status,
    ).toBe(404);
    const purged = await alice.post(`${ws()}/table-purges`, { table: "orders", column: "note" });
    expect(purged.body).toEqual({ dropped: "column" });
    await expect(stored(dev, "t_orders", "note")).rejects.toThrow(/column "note" does not exist/);
    expect(
      (await alice.get(`${ws()}/tables/orders`)).body.columns.map((c: Any) => c.name),
    ).not.toContain("note");
    const audit = await alice.get(`/tenants/${tenant}/audit?action=table.purged`);
    expect(audit.body.items[0]).toMatchObject({
      targetId: "orders",
      details: { column: "note", dropped: "column" },
    });
  });

  test("a table that leaves the bundle is retired with its rows, comes back with them, and can be purged", async () => {
    const count = (await alice.get(`${ws()}/tables/lab/samples`)).body.rowCount;
    expect(count).toBeGreaterThan(1000);
    const without = [customers, orders({ amount: { type: "number" } })];
    expect((await deploy(bundle(without, "no samples"))).body.summary).toMatchObject({
      deleted: 1,
    });
    expect((await alice.get(`${ws()}/rows/lab/samples`)).status).toBe(404);
    expect(
      (await alice.get(`${ws()}/tables`)).body.items.find(
        (item: Any) => item.name === "lab/samples",
      ),
    ).toMatchObject({ status: "retired", rowCount: count });

    expect((await deploy(bundle([...without, samples], "samples again"))).status).toBe(201);
    expect((await alice.get(`${ws()}/tables/lab/samples`)).body).toMatchObject({
      status: "active",
      rowCount: count,
    });

    await deploy(bundle(without, "no samples, for good"));
    expect((await alice.post(`${ws()}/table-purges`, { table: "customers" })).status).toBe(404);
    expect((await alice.post(`${ws()}/table-purges`, { table: "lab/samples" })).body).toEqual({
      dropped: "table",
    });
    expect((await alice.get(`${ws()}/tables`)).body.items.map((item: Any) => item.name)).toEqual([
      "customers",
      "orders",
    ]);
  });

  test("a table is renamed with its rows", async () => {
    const renamed = table("crm/clients", customers.body.columns as Record<string, object>, {
      renamedFrom: "customers",
    });
    const pointing = table(
      "orders",
      {
        ...(ordersV2.body.columns as object),
        amount: { type: "number" },
        customer: { type: "reference", references: "crm/clients" },
      },
      { policy: { type: "owner", column: "owner_id" } },
    );
    // Without saying what it was renamed from, it is a delete of a table with rows and a new empty one.
    const { renamedFrom: _from, ...unsaid } = renamed.body as Record<string, unknown>;
    const refused = await deploy(
      bundle([{ ...renamed, body: unsaid }, pointing], "renamed without saying"),
    );
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("rename_suspected");
    expect(refused.body.errors).toEqual([
      {
        path: "customers",
        message: expect.stringContaining(
          'the table "customers" has access given to it and rows, and this deploy creates crm/clients. If one of them is it renamed, give that one key: "customers".',
        ),
      },
    ]);

    const deployed = await deploy(bundle([renamed, pointing], "renamed"));
    expect(deployed.status).toBe(201);
    expect((await rows(alice, "crm/clients", "?sort=name")).map((row) => row.name)).toEqual([
      "Ada",
      "Erin's customer",
    ]);
    expect((await alice.get(`${ws()}/rows/customers`)).status).toBe(404);
    // References still point at the same rows.
    const a1 = (await rows(alice, "orders")).find((row) => row.number === "A-1");
    expect((await alice.get(`${ws()}/row/${a1.customer}/crm/clients`)).body.name).toBe("Ada");
  });
});

describe("enum columns", () => {
  const put = (name: string, columns: Record<string, object>, extra: object = {}) =>
    alice.put(`${ws()}/resources/${name}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns, ...extra },
    });
  const physicalOf = async (name: string) =>
    (
      await data
        .selectFrom("data_table")
        .select("physical_name")
        .where("workspace_id", "=", dev)
        .where("name", "=", name)
        .where("status", "=", "active")
        .executeTakeFirstOrThrow()
    ).physical_name;
  const base = {
    title: { type: "text" },
    status: {
      type: "enum",
      values: ["new", { value: "on_loan", label: "On loan", color: "blue" }, "returned"],
      default: "new",
    },
    extras: { type: "enum_list", values: ["charger", "case", "dock"] },
  };

  test("a definition that does not hold together is refused, saying what is wrong", async () => {
    const wrong = async (columns: Record<string, object>) =>
      JSON.stringify((await put("wrong", columns)).body);
    expect(await wrong({ s: { type: "enum" } })).toContain("must list its values");
    expect(await wrong({ s: { type: "enum", values: ["a", "a"] } })).toContain("listed twice");
    expect(await wrong({ s: { type: "text", values: ["a"] } })).toContain("only an enum");
    expect(await wrong({ s: { type: "enum", values: ["a"], default: "b" } })).toContain(
      "default does not fit",
    );
    expect(
      await wrong({ s: { type: "enum", values: [{ value: "a", color: "mauve" }] } }),
    ).toContain("/body/columns/s/values/0");
  });

  test("a row holds one of the values, or several of them, and nothing else, by the API and by the database", async () => {
    expect((await put("loans", base)).status).toBe(201);
    const made = await alice.post(`${ws()}/rows/loans`, {
      title: "Laptop",
      status: "on_loan",
      extras: ["charger", "case", "charger"],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    // Each of a list once, in the order given.
    expect(made.body.items[0]).toMatchObject({ status: "on_loan", extras: ["charger", "case"] });
    // The default applies, and a list may be empty or absent.
    const plain = (await alice.post(`${ws()}/rows/loans`, { title: "Tablet" })).body.items[0];
    expect(plain).toMatchObject({ status: "new", extras: null });

    const stray = await alice.post(`${ws()}/rows/loans`, { title: "x", status: "lost" });
    expect(stray.status).toBe(400);
    expect(JSON.stringify(stray.body)).toContain("must be one of: new, on_loan, returned");
    const strayList = await alice.post(`${ws()}/rows/loans`, { title: "x", extras: ["bag"] });
    expect(strayList.status).toBe(400);
    expect((await alice.post(`${ws()}/rows/loans`, { title: "x", extras: "case" })).status).toBe(
      400,
    );
    const changed = await alice.patch(`${ws()}/row/${plain.id}/loans`, { status: "nope" });
    expect(changed.status).toBe(400);

    // Whatever writes to the table is held to the values: here the platform itself, past the API.
    const physical = await physicalOf("loans");
    const direct = (statement: string) =>
      sql.raw(statement.replaceAll("$T", `"${workspaceSchema(dev)}"."${physical}"`)).execute(data);
    await expect(
      direct(`insert into $T (id, status) values (gen_random_uuid(), 'lost')`),
    ).rejects.toThrow(/violates check constraint/);
    await expect(
      direct(`insert into $T (id, extras) values (gen_random_uuid(), array['case','bag'])`),
    ).rejects.toThrow(/violates check constraint/);
  });

  test("rows are found by a value, and a list by a value it has", async () => {
    const titles = async (filter: object) =>
      (await rows(alice, "loans", `?filter=${encodeURIComponent(JSON.stringify(filter))}`))
        .map((row) => row.title)
        .sort();
    expect(await titles({ column: "status", op: "eq", value: "on_loan" })).toEqual(["Laptop"]);
    expect(await titles({ column: "status", op: "in", value: ["new", "returned"] })).toEqual([
      "Tablet",
    ]);
    expect(await titles({ column: "extras", op: "has", value: "case" })).toEqual(["Laptop"]);
    expect(await titles({ column: "extras", op: "is_null" })).toEqual(["Tablet"]);
    const wrong = await alice.get(
      `${ws()}/rows/loans?filter=${encodeURIComponent(JSON.stringify({ column: "extras", op: "has", value: "bag" }))}`,
    );
    // A value the list no longer offers is still found by `has`: a row may hold it (TAB-24).
    expect(wrong.status).toBe(200);
    expect(wrong.body.items).toEqual([]);
    const grouped = await alice.get(`${ws()}/aggregate/loans?group=status&measure=count`);
    expect(grouped.status, JSON.stringify(grouped.body)).toBe(200);
    expect(grouped.body.items.map((one: Any) => one.by)).toEqual(
      expect.arrayContaining([{ status: "new" }, { status: "on_loan" }]),
    );
  });

  test("the table says its values, with their labels and colours", async () => {
    const described = (await alice.get(`${ws()}/tables/loans`)).body;
    const status = described.columns.find((column: Any) => column.name === "status");
    expect(status).toMatchObject({
      type: "enum",
      values: [
        { value: "new" },
        { value: "on_loan", label: "On loan", color: "blue" },
        { value: "returned" },
      ],
      retiredValues: [],
    });
  });

  test("a value taken out stays on the rows that hold it, is offered no more, and comes back", async () => {
    const without = {
      ...base,
      status: { type: "enum", values: ["new", "returned"], default: "new" },
    };
    expect((await put("loans", without)).status).toBe(200);
    // The row that holds it keeps it, and can still be found by it and changed otherwise.
    const laptop = (await rows(alice, "loans")).find((row) => row.title === "Laptop");
    expect(laptop.status).toBe("on_loan");
    expect(
      (await alice.patch(`${ws()}/row/${laptop.id}/loans`, { title: "Laptop 2" })).status,
    ).toBe(200);
    expect(
      await rows(
        alice,
        "loans",
        `?filter=${encodeURIComponent(JSON.stringify({ column: "status", op: "eq", value: "on_loan" }))}`,
      ),
    ).toHaveLength(1);
    // Nobody is given it any more.
    const again = await alice.post(`${ws()}/rows/loans`, { title: "x", status: "on_loan" });
    expect(again.status).toBe(400);
    const described = (await alice.get(`${ws()}/tables/loans`)).body;
    expect(described.columns.find((column: Any) => column.name === "status").retiredValues).toEqual(
      ["on_loan"],
    );
    // Back in the definition, it is a value like any other.
    expect((await put("loans", base)).status).toBe(200);
    expect((await alice.post(`${ws()}/rows/loans`, { title: "y", status: "on_loan" })).status).toBe(
      201,
    );
  });

  test("a value spelled anew is rewritten in every row, in a list as well", async () => {
    const renamed = {
      ...base,
      status: {
        type: "enum",
        values: ["new", { value: "out", renamedFrom: "on_loan", color: "blue" }, "returned"],
        default: "new",
      },
      extras: {
        type: "enum_list",
        values: ["charger", { value: "sleeve", renamedFrom: "case" }, "dock"],
      },
    };
    expect((await put("loans", renamed)).status).toBe(200);
    const laptop = (await rows(alice, "loans")).find((row) => row.title === "Laptop 2");
    expect(laptop).toMatchObject({ status: "out", extras: ["charger", "sleeve"] });
    // The old spelling is gone, not kept: no row holds it.
    const stray = await alice.post(`${ws()}/rows/loans`, { title: "x", status: "on_loan" });
    expect(stray.status).toBe(400);
    const described = (await alice.get(`${ws()}/tables/loans`)).body;
    expect(described.columns.find((column: Any) => column.name === "status").retiredValues).toEqual(
      [],
    );
    // Deployed again as it stands, nothing is rewritten.
    expect((await put("loans", renamed)).status).toBe(200);
  });

  test("text becomes an enum only when every row already holds one of its values, and an enum becomes text freely", async () => {
    await alice.post(`${ws()}/rows/loans`, { title: "odd one" });
    const narrow = (values: string[]) =>
      put("loans", { ...base, title: { type: "enum", values }, status: { type: "text" } });
    const refused = await narrow(["Laptop 2", "Tablet"]);
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toContain("cannot become an enum while rows hold other values");
    expect(refused.body.detail).toContain('"odd one"');
    // Nothing changed: the other column is still an enum.
    expect((await alice.post(`${ws()}/rows/loans`, { title: "x", status: "lost" })).status).toBe(
      400,
    );

    const titles = [...new Set((await rows(alice, "loans")).map((row) => row.title))];
    const done = await narrow(titles);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    // The enum that became text takes anything now, and kept what it held.
    expect(
      (await alice.post(`${ws()}/rows/loans`, { title: "Tablet", status: "anything" })).status,
    ).toBe(201);
    expect((await alice.post(`${ws()}/rows/loans`, { title: "not listed" })).status).toBe(400);
  });
});

describe("references: what a delete does, what stands for a row, and where one points", () => {
  const put = (name: string, columns: Record<string, object>, extra: object = {}) =>
    alice.put(`${ws()}/resources/${name}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns, ...extra },
    });
  const lend = (onDelete?: string, references = "kit/devices") => ({
    note: { type: "text" },
    device: { type: "reference", references, ...(onDelete ? { onDelete } : {}) },
  });
  const device = async (name: string, to = "kit/devices") =>
    (await alice.post(`${ws()}/rows/${to}`, { name })).body.items[0].id as string;

  test("a reference is indexed, and refuses the delete of what it points to unless it says otherwise", async () => {
    expect((await put("kit/devices", { name: { type: "text" } }, { display: "name" })).status).toBe(
      201,
    );
    expect((await put("kit/spares", { name: { type: "text" } })).status).toBe(201);
    expect((await put("kit/lends", lend())).status).toBe(201);
    const indexes = await sql<{ indexdef: string }>`
      select indexdef from pg_indexes
      where schemaname = ${workspaceSchema(dev)} and tablename like 't_kit__lends%' and indexname like 'rx\_%'
    `.execute(data);
    expect(indexes.rows.map((row) => row.indexdef).join()).toContain("(device)");

    const laptop = await device("Laptop");
    await alice.post(`${ws()}/rows/kit/lends`, { note: "first", device: laptop });
    expect((await alice.delete(`${ws()}/row/${laptop}/kit/devices`)).status).toBe(409);
  });

  test("set_null empties the column, and cascade deletes the row, when what it points to goes", async () => {
    expect((await put("kit/lends", lend("set_null"))).status).toBe(200);
    const [first] = await rows(alice, "kit/lends");
    expect((await alice.delete(`${ws()}/row/${first.device}/kit/devices`)).status).toBe(204);
    expect(await rows(alice, "kit/lends")).toEqual([
      expect.objectContaining({ note: "first", device: null }),
    ]);

    expect((await put("kit/lends", lend("cascade"))).status).toBe(200);
    const tablet = await device("Tablet");
    await alice.post(`${ws()}/rows/kit/lends`, { note: "second", device: tablet });
    expect((await alice.delete(`${ws()}/row/${tablet}/kit/devices`)).status).toBe(204);
    expect((await rows(alice, "kit/lends")).map((row) => row.note)).toEqual(["first"]);

    // Back to refusing.
    expect((await put("kit/lends", lend("restrict"))).status).toBe(200);
    const phone = await device("Phone");
    await alice.post(`${ws()}/rows/kit/lends`, { note: "third", device: phone });
    expect((await alice.delete(`${ws()}/row/${phone}/kit/devices`)).status).toBe(409);
    await alice.delete(
      `${ws()}/row/${(await rows(alice, "kit/lends")).find((row) => row.note === "third").id}/kit/lends`,
    );
  });

  test("a reference pointed at another table is held to that table from then on", async () => {
    expect((await put("kit/lends", lend(undefined, "kit/spares"))).status).toBe(200);
    const spare = await device("Spare battery", "kit/spares");
    const ok = await alice.post(`${ws()}/rows/kit/lends`, { note: "spare", device: spare });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    // A device is no longer something it may point to.
    const phone = (await rows(alice, "kit/devices")).find((row) => row.name === "Phone");
    const wrong = await alice.post(`${ws()}/rows/kit/lends`, { note: "phone", device: phone.id });
    expect(wrong.status).toBe(409);
    expect(wrong.body.detail).toBe("A reference points to a row that does not exist.");
  });

  test("rows come with what stands for the rows they point to, as far as the caller may read them", async () => {
    // Pointed back while a row still points at a spare, it is refused: that row would point nowhere.
    expect((await put("kit/lends", lend())).status).toBe(409);
    await alice.delete(
      `${ws()}/row/${(await rows(alice, "kit/lends")).find((row) => row.note === "spare").id}/kit/lends`,
    );
    expect((await put("kit/lends", lend())).status).toBe(200);
    const phone = (await rows(alice, "kit/devices")).find((row) => row.name === "Phone");
    await alice.post(`${ws()}/rows/kit/lends`, { note: "phone", device: phone.id });
    const page = (await alice.get(`${ws()}/rows/kit/lends?expand=device`)).body;
    expect(page.expanded).toEqual({ device: { [phone.id]: "Phone" } });
    // Without the asking, nothing is added.
    expect((await alice.get(`${ws()}/rows/kit/lends`)).body.expanded).toBeUndefined();
    expect((await alice.get(`${ws()}/rows/kit/lends?expand=note`)).status).toBe(400);
    // A table that names no column to stand for its rows is named by its name.
    for (const row of await rows(alice, "kit/lends")) {
      await alice.delete(`${ws()}/row/${row.id}/kit/lends`);
    }
    expect((await put("kit/lends", lend(undefined, "kit/spares"))).status).toBe(200);
    const spare = await device("Cable", "kit/spares");
    await alice.post(`${ws()}/rows/kit/lends`, { note: "cable", device: spare });
    expect((await alice.get(`${ws()}/rows/kit/lends?expand=device`)).body.expanded).toEqual({
      device: { [spare]: "Cable" },
    });
  });

  test("a definition that asks for what cannot be is refused", async () => {
    const wrong = async (name: string, columns: Record<string, object>, extra: object = {}) =>
      JSON.stringify((await put(name, columns, extra)).body);
    expect(await wrong("kit/w", { n: { type: "text", onDelete: "cascade" } })).toContain(
      "only a reference says what happens",
    );
    expect(
      await wrong("kit/w", {
        d: { type: "reference", references: "kit/devices", onDelete: "set_null", required: true },
      }),
    ).toContain("a required column cannot be emptied");
    expect(await wrong("kit/w", { n: { type: "text" } }, { display: "nope" })).toContain(
      "there is no column",
    );
    expect(await wrong("kit/w", { n: { type: "json" } }, { display: "n" })).toContain(
      "cannot stand for a row",
    );
  });
});

describe("tables made in the console, isolation and guards", () => {
  test("a rename carries what the workspace kept under the old path, and refuses a path that is taken", async () => {
    const at = ws();
    const put = (path: string, body: object) => alice.put(`${ws()}/resources/${path}`, body);
    const connection = {
      kind: "connection",
      schemaVersion: 1,
      ownership: "ui",
      body: { connector: "http" },
    };
    const notes = {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns: { title: { type: "text", required: true } } },
    };
    expect((await put("crm", connection)).status).toBe(201);
    expect(
      (
        await alice.put(`${at}/connection-bindings/crm`, {
          config: { baseUrl: "http://crm.test" },
        })
      ).status,
    ).toBeLessThan(300);
    const made = await put("memos", notes);
    expect(made.status).toBe(201);
    expect((await alice.post(`${at}/rows/memos`, { title: "kept" })).status).toBe(201);

    // The connection keeps what it was bound to.
    const moved = await put("sales/crm", { ...connection, renameFrom: "crm" });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const bindings = (await alice.get(`${at}/connection-bindings`)).body.items as {
      path: string;
      bound: boolean;
    }[];
    expect(bindings.filter((item) => item.bound).map((item) => item.path)).toEqual(["sales/crm"]);

    // The table keeps its rows, though it does not say what it was renamed from.
    const renamed = await put("journal/memos", { ...notes, renameFrom: "memos" });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body).toMatchObject({ id: made.body.id, path: "journal/memos" });
    expect(
      (await alice.get(`${at}/rows/journal/memos`)).body.items.map(
        (row: { title: string }) => row.title,
      ),
    ).toEqual(["kept"]);
    // The path it had still answers for a while, and says where the table is now.
    const byOld = await alice.get(`${at}/rows/memos`);
    expect(byOld.status).toBe(200);
    expect(byOld.headers["volvel-resource-moved"]).toBe("journal/memos");

    // A path that something else has is not taken from it.
    const taken = await put("sales/crm", { ...notes, renameFrom: "journal/memos" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("path_taken");
    expect(taken.body.detail).toContain("that is the path of a connection");

    const audited = await t.db
      .selectFrom("audit_entry")
      .select(["action", "details"])
      .where("target_id", "=", made.body.id)
      .orderBy("occurred_at")
      .execute();
    expect(audited.map((entry) => entry.action)).toEqual(["resource.created", "resource.renamed"]);
    expect(audited[1]?.details).toMatchObject({
      path: "journal/memos",
      key: "memos",
      renamedFrom: "memos",
    });
  });

  test("a UI-managed table is created and changed through the resource routes", async () => {
    const body = {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns: { title: { type: "text", required: true } } },
    };
    expect((await alice.put(`${ws()}/resources/notes`, body)).status).toBe(201);
    await alice.post(`${ws()}/rows/notes`, { title: "First" });
    const changed = await alice.put(`${ws()}/resources/notes`, {
      ...body,
      body: {
        columns: {
          title: { type: "text", required: true },
          done: { type: "boolean", default: false },
        },
      },
    });
    expect(changed.status).toBe(200);
    expect((await rows(alice, "notes"))[0]).toMatchObject({ title: "First", done: false });
    expect(
      (await alice.get(`${ws()}/tables`)).body.items.find((item: Any) => item.name === "notes")
        .managedIn,
    ).toBe("ui");
    // A deploy leaves a table made in the console alone.
    const current = (await alice.get(`${ws()}/bundles`)).body.items.find((b: Any) => b.active);
    await alice.post(`${ws()}/deployments`, { bundleId: current.id });
    expect(await rows(alice, "notes")).toHaveLength(1);
    expect((await alice.delete(`${ws()}/resources/notes`)).status).toBe(204);
    expect(
      (await alice.get(`${ws()}/tables`)).body.items.find((item: Any) => item.name === "notes")
        .status,
    ).toBe("retired");
  });

  test("a retired table keeps where it was managed, in the list and on its own page", async () => {
    const mine = (path: string, ownership: string) =>
      alice.put(`${ws()}/resources/${path}`, {
        kind: "table",
        schemaVersion: 1,
        ownership,
        body: { columns: { title: { type: "text", required: true } } },
      });
    expect((await mine("kept-in-console", "ui")).status).toBe(201);
    expect((await alice.delete(`${ws()}/resources/kept-in-console`)).status).toBe(204);
    const listed = (await alice.get(`${ws()}/tables`)).body.items.find(
      (item: Any) => item.name === "kept-in-console",
    );
    expect(listed).toMatchObject({ status: "retired", managedIn: "ui" });
    const described = await alice.get(`${ws()}/tables/kept-in-console?id=${listed.id}`);
    expect(described.body).toMatchObject({ status: "retired", managedIn: "ui" });
  });

  test("a required column that was removed comes back even when rows were written without it", async () => {
    const put = (columns: Record<string, object>) =>
      alice.put(`${ws()}/resources/gaps`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        body: { columns },
      });
    const both = {
      title: { type: "text", required: true },
      code: { type: "text", required: true },
    };
    expect((await put(both)).status).toBe(201);
    await alice.post(`${ws()}/rows/gaps`, { title: "Before", code: "A" });
    // The column leaves the definition, and a row is written that never had it.
    expect((await put({ title: both.title })).status).toBe(200);
    const during = (await alice.post(`${ws()}/rows/gaps`, { title: "During" })).body.items[0];
    // Going back is never refused. The row written meanwhile keeps its gap.
    const back = await put(both);
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect((await rows(alice, "gaps", "?sort=title")).map((row) => [row.title, row.code])).toEqual([
      ["Before", "A"],
      ["During", null],
    ]);
    // From now on the column is required again.
    expect((await alice.post(`${ws()}/rows/gaps`, { title: "After" })).body.errors).toEqual([
      { path: "/code", message: "is required" },
    ]);
    // The row with the gap must be given a value when it is next changed.
    const untouched = await alice.patch(`${ws()}/row/${during.id}/gaps`, { title: "Renamed" });
    expect(untouched.status).toBe(400);
    expect(untouched.body.detail).toBe('A value is required for "code".');
    const filled = await alice.patch(`${ws()}/row/${during.id}/gaps`, {
      title: "Renamed",
      code: "B",
    });
    expect(filled.body).toMatchObject({ title: "Renamed", code: "B" });
    // Making an ordinary column required while rows lack a value is still refused.
    const optional = { ...both, extra: { type: "text" } };
    expect((await put(optional)).status).toBe(200);
    const refused = await put({ ...both, extra: { type: "text", required: true } });
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toContain('column "extra" is now required');
    expect((await alice.delete(`${ws()}/resources/gaps`)).status).toBe(204);
  });

  test.runIf(DEDICATED)(
    "a deploy that changed the tables but then failed is completed by deploying again",
    async () => {
      const made = await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "window",
        name: "Window",
        type: "dev",
      });
      const window = made.body.id as string;
      const first = bundle([table("things", { name: { type: "text", required: true } })], "w1");
      expect((await deploy(first, window)).status).toBe(201);
      await alice.post(`${ws(window)}/rows/things`, { rows: [{ name: "one" }, { name: "two" }] });

      const second = bundle(
        [
          table("things", {
            title: { type: "text", required: true, renamedFrom: "name" },
            done: { type: "boolean", default: false },
          }),
        ],
        "w2",
      );
      const uploaded = await alice.post(`${ws(window)}/bundles`, second);
      // The tenant's database commits. Then the platform's transaction fails before it can.
      const interrupted = t.db.transaction().execute(async (trx) => {
        await deployBundle(
          t.kernel,
          trx,
          async () => {},
          { id: window, tenantId: tenant, slug: "window" },
          { type: "system", id: null },
          uploaded.body.id,
        );
        await commitDataTransactions(trx);
        throw new Error("the platform database went away");
      });
      await expect(interrupted).rejects.toThrow("the platform database went away");

      // The registry still shows the first bundle. The tables are already at the second definition.
      const active = async () =>
        (await alice.get(`${ws(window)}/bundles`)).body.items.find((b: Any) => b.active).version;
      expect(await active()).toBe(1);
      const between = await rows(alice, "things", "?sort=title", window);
      // Nothing was lost, and the rows can be read as they now are.
      expect(between.map((row) => [row.title, row.done])).toEqual([
        ["one", false],
        ["two", false],
      ]);

      // Deploying again finds the tables already changed, and finishes the job.
      const again = await alice.post(`${ws(window)}/deployments`, { bundleId: uploaded.body.id });
      expect(again.status, JSON.stringify(again.body)).toBe(201);
      expect(again.body.summary).toMatchObject({ updated: 1, data: [] });
      expect(await active()).toBe(2);
      expect((await rows(alice, "things", "?sort=title", window)).map((row) => row.title)).toEqual([
        "one",
        "two",
      ]);
    },
  );

  test("each workspace has its own tables, and another tenant reaches none", async () => {
    expect(
      (await rows(alice, "orders", "", prod)).every((row) => String(row.number).startsWith("P-")),
    ).toBe(true);
    expect(
      (await rows(alice, "orders", "", dev)).some((row) => String(row.number).startsWith("P-")),
    ).toBe(false);
    for (const path of ["tables", "tables/orders", "rows/orders"]) {
      expect((await other.get(`${ws()}/${path}`)).status, path).toBe(404);
    }
    expect((await other.post(`${ws()}/rows/orders`, { number: "X" })).status).toBe(404);
    expect((await t.anonymous.get(`${ws()}/rows/orders`)).status).toBe(401);
  });

  test("TAB-33: a key that cannot name a row is missing, not an error, and a row of only `rows` is sent in a batch", async () => {
    const put = await alice.put(`${ws()}/resources/tab33`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns: { label: { type: "text" } } },
    });
    expect(put.status, JSON.stringify(put.body)).toBe(201);
    const made = await alice.post(`${ws()}/rows/tab33`, { rows: [{ label: "one" }] });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const id = made.body.items[0].id;
    const gone = await alice.post(`${ws()}/row-deletions/tab33`, { ids: ["nope", id] });
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    expect(gone.body).toEqual({ deleted: [id], missing: ["nope"] });
    const alone = await alice.post(`${ws()}/row-deletions/tab33`, { ids: ["nope"] });
    expect(alone.status, JSON.stringify(alone.body)).toBe(200);
    expect(alone.body).toEqual({ deleted: [], missing: ["nope"] });
    // A row whose only column is a json one named `rows` is sent as `{ rows: [row] }`.
    const description = (await alice.get("/openapi.json")).body;
    expect(
      description.paths["/api/v1/tenants/{t}/workspaces/{w}/rows/{*}"].post.description,
    ).toContain("`{ rows: [row] }`");
  });

  test("TAB-30: columns come as the definition gives them, and one added later comes last", async () => {
    const put = (columns: Record<string, object>) =>
      alice.put(`${ws()}/resources/tab30`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        body: { columns },
      });
    const text = { type: "text" };
    expect((await put({ t: text, j: { type: "json" }, d: { type: "date" }, a: text })).status).toBe(
      201,
    );
    const names = async () =>
      (await alice.get(`${ws()}/tables/tab30`)).body.columns
        .filter((column: Any) => column.status === "active")
        .map((column: Any) => column.name);
    expect(await names()).toEqual(["t", "j", "d", "a"]);
    const row = (await alice.post(`${ws()}/rows/tab30`, { t: "x" })).body.items[0];
    expect(Object.keys(row).filter((key) => ["t", "j", "d", "a"].includes(key))).toEqual([
      "t",
      "j",
      "d",
      "a",
    ]);
    // Two columns added in one save come in the order they were given, after the others.
    expect(
      (
        await put({
          z: text,
          t: text,
          j: { type: "json" },
          d: { type: "date" },
          a: text,
          b: text,
        })
      ).status,
    ).toBe(200);
    expect(await names()).toEqual(["t", "j", "d", "a", "z", "b"]);
    const csv = await alice.get(`${ws()}/rows-export/tab30`);
    expect(String(csv.body).split("\r\n")[0]).toMatch(
      /^(id,created_at,updated_at,)?t,j,d,a,z,b$|t,j,d,a,z,b/,
    );
  });

  test("every change by a principal went through the write path", () => {
    expect(
      // Rows are the tenant's data, written without an audit entry each, one at a time or many.
      t.unaudited.filter((route) => !/\/(rows?|row-deletions)\//.test(route)),
      JSON.stringify(t.unaudited),
    ).toEqual([]);
    expect(t.unexercised((route) => /\/table-purges$/.test(route))).toEqual([]);
  });
});

describe("tables restored without their policies (HOST-01)", () => {
  test("opening a store makes the policy of every active table that has none for its role", async () => {
    const workspace = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "restored",
        name: "Restored",
        type: "dev",
      })
    ).body.id as string;
    const mine = table(
      "mine",
      { label: { type: "text" }, owner_id: { type: "uuid" } },
      { policy: { type: "owner", column: "owner_id" } },
    );
    const shared = table(
      "shared",
      { label: { type: "text" }, team: { type: "text" } },
      { policy: { type: "rules", rules: [{ allow: "write", when: { everyone: true } }] } },
    );
    const open = table("plain", { label: { type: "text" } });
    const deployed = await deploy(bundle([mine, shared, open], "restored"), workspace);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    for (const name of ["mine", "shared", "plain"]) {
      expect((await alice.post(`${ws(workspace)}/rows/${name}`, { label: "kept" })).status).toBe(
        201,
      );
    }
    // What `pg_dump` restored onto a server without the role leaves: rows and security, no policy.
    const schema = workspaceSchema(workspace);
    for (const physical of ["t_mine", "t_shared", "t_plain"]) {
      for (const name of ["rows", "rows_read", "rows_insert", "rows_update", "rows_delete"]) {
        await sql.raw(`drop policy if exists ${name} on "${schema}"."${physical}"`).execute(data);
      }
    }
    expect((await alice.get(`${ws(workspace)}/rows/plain`)).body.items).toHaveLength(0);

    const store = await t.kernel.data.forTenant(tenant);
    expect(await upgradePolicies(store.owner, store.role)).toBe(3);
    expect((await alice.get(`${ws(workspace)}/rows/plain`)).body.items).toHaveLength(1);
    expect((await alice.get(`${ws(workspace)}/rows/shared`)).body.items).toHaveLength(1);
    expect((await alice.post(`${ws(workspace)}/rows/shared`, { label: "again" })).status).toBe(201);
    expect(await upgradePolicies(store.owner, store.role)).toBe(0);
  });
});
