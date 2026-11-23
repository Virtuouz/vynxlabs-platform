import { readFileSync } from "node:fs";
import { type Kysely, type PlatformSchema, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { type Bundle, type BundleManifest, bundleDigest, formatFor } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspaceSchema } from "./kernel/data/apply.js";
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
let _prod: string;
let alice: Client; // tenant admin
let carol: { id: string; client: Client }; // may read and write rows, subject to policy
let _dave: { id: string; client: Client };
let _erin: { id: string; client: Client }; // bound at one table only
let _viewer: Client;
let _other: Client;
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

const _customers = table("customers", {
  name: { type: "text", required: true },
  email: { type: "text", unique: true },
});
const _ordersV1 = table(
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
const _ordersV2 = table(
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
const _samples = table("lab/samples", {
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
    formatVersion: formatFor(1, tables),
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
  _other = (await seed("globex", "gina@globex.example")).client;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;
  _prod = (
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
  _dave = await member("dave", { roleId: rowsOnly });
  _erin = await member("erin", null);
  _viewer = (await member("vera", { roleId: roles.viewer })).client;
  roles.rows_only = rowsOnly;
  data = (await t.kernel.data.forTenant(tenant)).owner;
}, 60_000);

afterAll(async () => {
  await t.stop();
  await dedicatedDb?.drop();
});

let counter = 0;
/** A workspace of its own, so that a test's tables are nobody else's. */
async function fresh(): Promise<string> {
  counter += 1;
  return (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: `tab2-${counter}`,
      name: `Tab ${counter}`,
      type: "dev",
    })
  ).body.id as string;
}
const put = (workspace: string, path: string, body: Record<string, unknown>, extra = {}) =>
  alice.put(`${ws(workspace)}/resources/${path}`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body,
    ...extra,
  });

describe("what a table refuses, and how it says so", () => {
  test("TAB-14: a table that others refer to is not retired, and the refusal names them", async () => {
    const own = await fresh();
    expect(
      (await put(own, "owners", { columns: { name: { type: "text" } } }, { create: true })).status,
    ).toBe(201);
    expect(
      (
        await put(own, "pets", {
          columns: { owner: { type: "reference", references: "owners" } },
        })
      ).status,
    ).toBe(201);
    const refused = await alice.delete(`${ws(own)}/resources/owners`);
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(JSON.stringify(refused.body)).toContain("pets");
    expect(JSON.stringify(refused.body)).toContain("owner");
    // Nothing was retired: the workspace still takes a save.
    expect((await put(own, "other", { columns: { a: { type: "text" } } })).status).toBe(201);
    // With the referring table gone, the delete is allowed.
    expect((await alice.delete(`${ws(own)}/resources/pets`)).status).toBe(204);
    expect((await alice.delete(`${ws(own)}/resources/owners`)).status).toBe(204);
  });

  test("TAB-15: a definition Postgres would refuse is refused in words, at the column", async () => {
    const own = await fresh();
    const bad = async (columns: Record<string, object>, field: string) => {
      const answer = await put(own, `t${Math.random().toString(36).slice(2, 8)}`, { columns });
      expect(answer.status, JSON.stringify(answer.body)).toBeLessThan(500);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(answer.body)).toContain(field);
    };
    await bad({ at: { type: "date", default: "soon" } }, "at");
    await bad({ at: { type: "timestamp", default: "soon" } }, "at");
    await bad({ at: { type: "text", default: "a\u0000b" } }, "at");
    await bad({ at: { type: "json", default: { a: "a\u0000b" } } }, "at");
    await bad({ at: { type: "uuid", default: "nope" } }, "at");
    // A column that is unique cannot be given a default that every existing row would share.
    const made = await put(own, "uniq", { columns: { code: { type: "text" } } });
    expect(made.status).toBe(201);
    await alice.post(`${ws(own)}/rows/uniq`, { rows: [{ code: "a" }, { code: "b" }] });
    const shared = await put(own, "uniq", {
      columns: { code: { type: "text" }, tag: { type: "text", unique: true, default: "x" } },
    });
    expect(shared.status, JSON.stringify(shared.body)).toBe(409);
    expect(JSON.stringify(shared.body)).toContain("tag");
    // Widening a column that the table's policy names.
    const owned = await put(own, "owned", {
      columns: { who: { type: "uuid" } },
      policy: { type: "owner", column: "who" },
    });
    expect(owned.status, JSON.stringify(owned.body)).toBe(201);
    const widened = await put(own, "owned", {
      columns: { who: { type: "text" } },
      policy: { type: "owner", column: "who" },
    });
    expect(widened.status, JSON.stringify(widened.body)).toBe(200);
    const dropped = await put(own, "owned2", {
      columns: { who: { type: "uuid" } },
      policy: { type: "owner", column: "who" },
    });
    expect(dropped.status).toBe(201);
    const widenedAndFree = await put(own, "owned2", { columns: { who: { type: "text" } } });
    expect(widenedAndFree.status, JSON.stringify(widenedAndFree.body)).toBe(200);
  });

  test("TAB-16: a value Postgres cannot hold is refused at its column, and a big batch goes in", async () => {
    const own = await fresh();
    const made = await put(own, "odd", {
      columns: {
        text: { type: "text" },
        extra: { type: "json" },
        at: { type: "timestamp" },
        code: { type: "text", unique: true },
      },
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const insert = (row: object) => alice.post(`${ws(own)}/rows/odd`, row);
    const nul = await insert({ text: "a\u0000b" });
    expect(nul.status, JSON.stringify(nul.body)).toBe(400);
    expect(JSON.stringify(nul.body)).toContain("text");
    const nulJson = await insert({ extra: { a: "a\u0000b" } });
    expect(nulJson.status, JSON.stringify(nulJson.body)).toBe(400);
    expect(JSON.stringify(nulJson.body)).toContain("extra");
    for (const at of ["+200000-01-01T00:00:00Z", "-200000-01-01T00:00:00Z"]) {
      const year = await insert({ at });
      expect(year.status, JSON.stringify(year.body)).toBe(400);
      expect(JSON.stringify(year.body)).toContain("at");
    }
    const long = await insert({ code: "x".repeat(20_000) });
    expect(long.status, JSON.stringify(long.body)).toBeLessThan(500);
    const filtered = await alice.get(
      `${ws(own)}/rows/odd?filter=${encodeURIComponent(JSON.stringify({ column: "text", op: "eq", value: "a\u0000b" }))}`,
    );
    expect(filtered.status, JSON.stringify(filtered.body)).toBe(400);
    // 1,000 rows of 100 columns is more than a statement can carry values for.
    const wide = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`c${i}`, { type: "integer" }]),
    );
    expect((await put(own, "wide", { columns: wide })).status).toBe(201);
    const rows = Array.from({ length: 1000 }, (_, n) =>
      Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`c${i}`, n + i])),
    );
    const big = await alice.post(`${ws(own)}/rows/wide`, { rows });
    expect(big.status, JSON.stringify(big.body).slice(0, 300)).toBe(201);
    expect(big.body.items).toHaveLength(1000);
  });

  test("TAB-17: pages sorted by a list column go on past a value that is no longer offered", async () => {
    const own = await fresh();
    const values = (list: string[]) => list.map((value) => ({ value }));
    const made = await put(own, "pick", {
      columns: {
        one: { type: "enum", values: values(["a", "b", "c"]) },
        many: { type: "enum_list", values: values(["a", "b", "c"]) },
      },
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await alice.post(`${ws(own)}/rows/pick`, {
      rows: [
        { one: "a", many: ["a"] },
        { one: "b", many: ["b"] },
        { one: "c", many: ["c"] },
      ],
    });
    const trimmed = await put(own, "pick", {
      columns: {
        one: { type: "enum", values: values(["a", "c"]) },
        many: { type: "enum_list", values: values(["a", "c"]) },
      },
    });
    expect(trimmed.status, JSON.stringify(trimmed.body)).toBe(200);
    for (const column of ["one", "many"]) {
      const first = await alice.get(`${ws(own)}/rows/pick?sort=${column}&limit=2`);
      expect(first.status).toBe(200);
      expect(first.body.nextCursor).not.toBeNull();
      const second = await alice.get(
        `${ws(own)}/rows/pick?sort=${column}&limit=2&cursor=${first.body.nextCursor}`,
      );
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expect(second.body.items).toHaveLength(1);
    }
    const csv = await alice.get(`${ws(own)}/rows-export/pick?sort=one`);
    expect(csv.status).toBe(200);
  });

  test("TAB-22: a CSV export that is refused is refused, not begun", async () => {
    const own = await fresh();
    expect((await put(own, "sheet", { columns: { a: { type: "text" } } })).status).toBe(201);
    const refused = await alice.get(`${ws(own)}/rows-export/sheet?sort=nope`);
    expect(refused.status).toBe(400);
  });

  test("TAB-25: the address a table had still answers, with the new one named", async () => {
    const own = await fresh();
    const rename = async (path: string, key?: string) => {
      const content = bundle(
        [
          {
            kind: "table",
            schemaVersion: 1,
            path,
            ownership: "code",
            body: { columns: { name: { type: "text" } } },
            ...(key ? { key } : {}),
          },
        ],
        path,
      );
      const uploaded = await alice.post(`${ws(own)}/bundles`, content);
      expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
      const done = await alice.post(`${ws(own)}/deployments`, { bundleId: uploaded.body.id });
      expect(done.status, JSON.stringify(done.body)).toBe(201);
    };
    await rename("old-name", "t1");
    await rename("new-name", "t1");
    const rows = await alice.get(`${ws(own)}/rows/old-name`);
    expect(rows.status).toBe(200);
    const detail = await alice.get(`${ws(own)}/tables/old-name`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body.name).toBe("new-name");
    expect(detail.headers["volvel-resource-moved"]).toBe("new-name");
    expect(String(detail.headers.deprecation)).toMatch(/^@\d+$/);
  });

  test("TAB-29: a column that is retired stops filling with its default", async () => {
    const own = await fresh();
    expect(
      (
        await put(own, "held", {
          columns: { a: { type: "text" }, b: { type: "text", default: "d" } },
        })
      ).status,
    ).toBe(201);
    await alice.post(`${ws(own)}/rows/held`, { a: "1" });
    expect((await put(own, "held", { columns: { a: { type: "text" } } })).status).toBe(200);
    await alice.post(`${ws(own)}/rows/held`, { a: "2" });
    const detail = await alice.get(`${ws(own)}/tables/held`);
    const retired = detail.body.columns.find((column: Any) => column.name === "b");
    expect(retired.status).toBe("retired");
    expect(retired.held).toBe(1);
    // It comes back with its default, for rows from then on.
    expect(
      (
        await put(own, "held", {
          columns: { a: { type: "text" }, b: { type: "text", default: "d" } },
        })
      ).status,
    ).toBe(200);
    const added = await alice.post(`${ws(own)}/rows/held`, { a: "3" });
    expect(added.body.items[0].b).toBe("d");
  });
});

describe("a time is one thing, whoever writes it", () => {
  test("TAB-28: only a time that exists, with its zone, is taken", async () => {
    const own = await fresh();
    expect(
      (await put(own, "when", { columns: { at: { type: "timestamp" }, day: { type: "date" } } }))
        .status,
    ).toBe(201);
    const insert = (row: object) => alice.post(`${ws(own)}/rows/when`, row);
    for (const at of [
      "2026-02-31T10:00:00Z",
      "1",
      "2026-06-01 09:00",
      "2026-06-01T09:00:00",
      "June 1 2026",
    ]) {
      const refused = await insert({ at });
      expect(refused.status, at).toBe(400);
      expect(JSON.stringify(refused.body)).toContain("at");
    }
    expect((await insert({ day: "2026-02-31" })).status).toBe(400);
    const ok = await insert({ at: "2026-06-01T09:00:00+02:00", day: "2026-02-28" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.items[0].at).toBe("2026-06-01T07:00:00.000Z");
    expect((await insert({ at: "2026-06-01T09:00:00.123456Z" })).status).toBe(201);
  });
});

describe("a value a list no longer offers", () => {
  test("TAB-24: a row that holds it is found by it, and keeps it when the list is edited", async () => {
    const own = await fresh();
    const values = (list: string[]) => list.map((value) => ({ value }));
    const columns = (list: string[]) => ({
      many: { type: "enum_list", values: values(list) },
      one: { type: "enum", values: values(list) },
    });
    expect((await put(own, "tags", { columns: columns(["a", "b", "c"]) })).status).toBe(201);
    const made = await alice.post(`${ws(own)}/rows/tags`, { many: ["a", "b"], one: "b" });
    const id = made.body.items[0].id;
    expect((await put(own, "tags", { columns: columns(["a", "c"]) })).status).toBe(200);
    const found = await alice.get(
      `${ws(own)}/rows/tags?filter=${encodeURIComponent(JSON.stringify({ column: "many", op: "has", value: "b" }))}`,
    );
    expect(found.status, JSON.stringify(found.body)).toBe(200);
    expect(found.body.items.map((row: Any) => row.id)).toEqual([id]);
    // The console sends the whole list: adding one value must not be refused for the old one.
    const added = await alice.patch(`${ws(own)}/row/${id}/tags`, {
      many: ["a", "b", "c"],
      one: "b",
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(added.body.many).toEqual(["a", "b", "c"]);
    // A row that does not hold it is not given it, and a new row is not either.
    expect((await alice.post(`${ws(own)}/rows/tags`, { many: ["b"] })).status).toBe(400);
    expect((await alice.post(`${ws(own)}/rows/tags`, { one: "b" })).status).toBe(400);
    const other = (await alice.post(`${ws(own)}/rows/tags`, { many: ["a"] })).body.items[0].id;
    expect((await alice.patch(`${ws(own)}/row/${other}/tags`, { many: ["a", "b"] })).status).toBe(
      400,
    );
  });
});

describe("a reference that comes back, or points elsewhere", () => {
  test("TAB-23: a column comes back with rows that name a row now gone, and a new target is refused in words", async () => {
    const own = await fresh();
    expect((await put(own, "parents", { columns: { name: { type: "text" } } })).status).toBe(201);
    expect((await put(own, "others", { columns: { name: { type: "text" } } })).status).toBe(201);
    const withRef = (references: string) => ({
      columns: { label: { type: "text" }, parent: { type: "reference", references } },
    });
    expect((await put(own, "kids", withRef("parents"))).status).toBe(201);
    const parent = (await alice.post(`${ws(own)}/rows/parents`, { name: "p" })).body.items[0].id;
    await alice.post(`${ws(own)}/rows/kids`, { label: "k", parent });
    // Pointing at another table while a row holds an ID that is not there: said by column and count.
    const retargeted = await put(own, "kids", withRef("others"));
    expect(retargeted.status, JSON.stringify(retargeted.body)).toBe(409);
    expect(retargeted.body.detail).toContain('"parent"');
    expect(retargeted.body.detail).toContain("1 row");
    // The column goes, the row it named goes, and a rollback brings the column back.
    expect((await put(own, "kids", { columns: { label: { type: "text" } } })).status).toBe(200);
    expect((await alice.delete(`${ws(own)}/row/${parent}/parents`)).status).toBe(204);
    const back = await put(own, "kids", withRef("parents"));
    expect(back.status, JSON.stringify(back.body)).toBe(200);
  });
});

describe("what the words say", () => {
  test("TAB-27 and TAB-41: the table kind says a rule's own deletions are not announced, and how values sort", () => {
    const schema = readFileSync(
      new URL("../../../schemas/kinds/table.v1.schema.json", import.meta.url),
      "utf8",
    );
    // D28: rows a reference's rule deletes or empties are not announced, and the schema says so.
    expect(schema).toContain("is not announced as a row change");
    // Values are offered in their order and sorted by spelling (phase 18).
    expect(schema).not.toContain("offered and sorted");
    expect(schema).toContain("spelling of the value");
  });
});
