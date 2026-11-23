import { type Kysely, type PlatformSchema, sql } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { upgradePolicies, workspaceSchema } from "./kernel/data/apply.js";
import { describeTable, findRows, withData } from "./kernel/data/rows.js";
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

const events = table("events", { label: { type: "text" } });
const stamped = (id: string) =>
  `insert into "${workspaceSchema(dev)}"."t_events" (id, label, created_at, updated_at)
   select gen_random_uuid(), 'e' || n, ${id}, now() from generate_series(1, 120) n`;

describe("a row of nobody's, and a time in microseconds", () => {
  test("TAB-01: a request from no person owns no row whose owner is empty text", async () => {
    const guarded = table(
      "guarded",
      { owner: { type: "text" }, team: { type: "text" } },
      { policy: { type: "owner", column: "owner" } },
    );
    const ruled = table(
      "ruled",
      { team: { type: "text" } },
      {
        policy: {
          type: "rules",
          rules: [{ when: { column: "team", equals: { attribute: "team" } }, allow: "read" }],
        },
      },
    );
    const made = await deploy(bundle([guarded, ruled, events]));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await alice.post(`${ws()}/rows/guarded`, { owner: "", team: "empty" });
    await alice.post(`${ws()}/rows/guarded`, { owner: carol.id, team: "carol" });
    await alice.post(`${ws()}/rows/ruled`, { team: "" });
    const nobody = { principalId: null, all: false };
    const seen = async (name: string, scope: object) =>
      withData(
        t.kernel,
        tenant,
        scope as never,
        async (db) => (await findRows(db, await describeTable(data, dev, name))).items.length,
      );
    expect(await seen("guarded", nobody)).toBe(0);
    expect(await seen("guarded", { principalId: carol.id, all: false })).toBe(1);
    expect(
      await seen("ruled", { principalId: carol.id, all: false, attributes: { team: "" } }),
    ).toBe(0);
    expect(await seen("guarded", { principalId: null, all: true })).toBe(2);

    // A table compiled before the guard is compiled again when its database is opened.
    const physical = sql.id(workspaceSchema(dev), "t_guarded");
    await sql`drop policy rows on ${physical}`.execute(data);
    await sql`create policy rows on ${physical} for all to ${sql.id(
      (await t.kernel.data.forTenant(tenant)).role,
    )} using ((select vx.claim()) ->> 'principal' = owner)`.execute(data);
    expect(
      await upgradePolicies(data as never, (await t.kernel.data.forTenant(tenant)).role),
    ).toBeGreaterThan(0);
    expect(await seen("guarded", nobody)).toBe(0);
    expect(await seen("guarded", { principalId: carol.id, all: false })).toBe(1);
  });

  test("TAB-03: pages by a time reach every row, in rows, in a CSV, and as a script reads them", async () => {
    // 120 rows made in one statement: the same microsecond for all of them, then 120 within a millisecond.
    for (const [label, expression] of [
      ["one statement", "timestamptz '2026-03-01 10:00:00.123456+00'"],
      [
        "distinct microseconds",
        "timestamptz '2026-03-01 10:00:00.123000+00' + n * interval '1 microsecond'",
      ],
    ] as const) {
      await sql`delete from ${sql.id(workspaceSchema(dev), "t_events")}`.execute(data);
      await sql.raw(stamped(expression)).execute(data);
      for (const sort of ["created_at", "-created_at"]) {
        const seen: string[] = [];
        let cursor = "";
        for (let page = 0; page < 20; page++) {
          const got = await alice.get(`${ws()}/rows/events?sort=${sort}&limit=50${cursor}`);
          seen.push(...got.body.items.map((row: Any) => row.id));
          if (!got.body.nextCursor) break;
          cursor = `&cursor=${got.body.nextCursor}`;
        }
        expect(new Set(seen).size, `${label} ${sort}`).toBe(120);
        expect(seen.length, `${label} ${sort}`).toBe(120);
        const csv = await alice.get(`${ws()}/rows-export/events?sort=${sort}`);
        const lines = String(csv.body).trim().split("\r\n").slice(1);
        expect(lines.length, `csv ${label} ${sort}`).toBe(120);
        expect(new Set(lines.map((line) => line.split(",")[0])).size).toBe(120);
      }
      // What a script's find reads: pages by offset, and a time as the API gave it.
      const target = await describeTable(data, dev, "events");
      const listed = await withData(
        t.kernel,
        tenant,
        { principalId: null, all: true },
        async (db) => {
          const ids = new Set<unknown>();
          for (let offset = 0; offset < 120; offset += 50)
            for (const row of (
              await findRows(db, target, { sort: ["created_at"], limit: 50, offset })
            ).items)
              ids.add(row.id);
          const first = (await findRows(db, target, { sort: ["created_at"], limit: 1 })).items[0];
          const equal = await findRows(db, target, {
            filter: { column: "created_at", op: "eq", value: first?.created_at },
          });
          return { ids: ids.size, equal: equal.items.length };
        },
      );
      expect(listed.ids).toBe(120);
      expect(listed.equal, label).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("tables and their names", () => {
  test("TAB-04: a new table with a name another table used to have does not take that table's rows", async () => {
    const columns = { label: { type: "text" } };
    const own = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "tab-04",
        name: "Names",
        type: "dev",
      })
    ).body.id as string;

    const first = await deploy(bundle([table("alpha", columns)], "a1"), own);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    await alice.post(`${ws(own)}/rows/alpha`, { label: "from alpha" });
    const renamed = await deploy(
      bundle([table("beta", columns, { renamedFrom: "alpha" })], "a2"),
      own,
    );
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(201);
    const both = await deploy(bundle([table("beta", columns), table("alpha", columns)], "a3"), own);
    expect(both.status, JSON.stringify(both.body)).toBe(201);
    expect((await rows(alice, "beta", "", own)).map((row) => row.label)).toEqual(["from alpha"]);
    expect(await rows(alice, "alpha", "", own)).toEqual([]);
    expect((await alice.get(`${ws(own)}/tables/beta`)).status).toBe(200);
  });

  test("TAB-07: of two retired columns with one name, the one asked for is dropped", async () => {
    const own = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "tab-07",
        name: "Purge",
        type: "dev",
      })
    ).body.id as string;
    const withX = (type: string, marker: string) =>
      deploy(bundle([table("things", { x: { type }, keep: { type: "text" } })], marker), own);
    const without = (marker: string) =>
      deploy(bundle([table("things", { keep: { type: "text" } })], marker), own);
    expect((await withX("text", "t1")).status).toBe(201);
    expect((await without("t2")).status).toBe(201);
    expect((await withX("integer", "t3")).status).toBe(201);
    expect((await without("t4")).status).toBe(201);
    const listed = (await alice.get(`${ws(own)}/tables/things`)).body.columns.filter(
      (column: Any) => column.name === "x",
    );
    expect(listed.map((column: Any) => [column.type, column.status])).toEqual([
      ["text", "retired"],
      ["integer", "retired"],
    ]);
    // A name that means two is refused, and drops neither.
    const refused = await alice.post(`${ws(own)}/table-purges`, { table: "things", column: "x" });
    expect(refused.status).toBe(409);
    const stillThere = async () =>
      (await alice.get(`${ws(own)}/tables/things`)).body.columns
        .filter((column: Any) => column.name === "x")
        .map((column: Any) => column.type);
    expect(await stillThere()).toEqual(["text", "integer"]);
    const second = listed[1];
    const purged = await alice.post(`${ws(own)}/table-purges`, {
      table: "things",
      column: "x",
      columnId: second.id,
    });
    expect(purged.body).toEqual({ dropped: "column" });
    expect(await stillThere()).toEqual(["text"]);
  });

  test("TAB-08: a retired table's rows are not deleted or held by the rows it referred to", async () => {
    const own = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "tab-08",
        name: "Keys",
        type: "dev",
      })
    ).body.id as string;
    const parent = table("parents", { name: { type: "text" } });
    const child = (rule: string) =>
      table("children", { parent: { type: "reference", references: "parents", onDelete: rule } });
    for (const rule of ["cascade", "restrict"]) {
      const marker = (step: string) => `${rule} ${step}`;
      expect((await deploy(bundle([parent, child(rule)], marker("a")), own)).status).toBe(201);
      const made = (await alice.post(`${ws(own)}/rows/parents`, { name: rule })).body.items[0];
      await alice.post(`${ws(own)}/rows/children`, { parent: made.id });
      expect((await deploy(bundle([parent], marker("b")), own)).status).toBe(201);
      const gone = await alice.delete(`${ws(own)}/row/${made.id}/parents`);
      expect(gone.status, `${rule}: ${JSON.stringify(gone.body)}`).toBe(204);
      expect(await stored(own, "t_children", "parent"), rule).toHaveLength(1);
      // It comes back with its row, whose parent is gone, and is not refused for it.
      const back = await deploy(bundle([parent, child(rule)], marker("c")), own);
      expect(back.status, JSON.stringify(back.body)).toBe(201);
      expect(await stored(own, "t_children", "parent")).toHaveLength(1);
      await sql`delete from ${sql.id(workspaceSchema(own), "t_children")}`.execute(data);
    }
  });

  test("TAB-05: a table made as new does not replace the one at that path", async () => {
    const own = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "tab-05",
        name: "Create",
        type: "dev",
      })
    ).body.id as string;
    const put = (columns: object, create?: boolean) =>
      alice.put(`${ws(own)}/resources/codes`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        body: { columns },
        ...(create ? { create } : {}),
      });
    const first = await put({ a: { type: "text" }, b: { type: "text" } }, true);
    expect(first.status).toBe(201);
    const again = await put({ title: { type: "text" } }, true);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("path_taken");
    const kept = (await alice.get(`${ws(own)}/tables/codes`)).body.columns;
    expect(kept.map((column: Any) => [column.name, column.status])).toEqual([
      ["a", "active"],
      ["b", "active"],
    ]);
    // Without it, a save is still an update.
    expect((await put({ a: { type: "text" } })).status).toBe(200);
  });

  test("TAB-12: a save that names the version it read is refused when someone has saved since", async () => {
    const own = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "tab-12",
        name: "Undo",
        type: "dev",
      })
    ).body.id as string;
    const put = (columns: object, version?: number) =>
      alice.put(`${ws(own)}/resources/versions`, {
        kind: "table",
        schemaVersion: 1,
        ownership: "ui",
        body: { columns },
        ...(version !== undefined ? { version } : {}),
      });
    const first = await put({ a: { type: "text" } });
    expect(first.body.version).toBe(1);
    const theirs = await put({ a: { type: "text" }, theirs: { type: "text" } }, 1);
    expect(theirs.status).toBe(200);
    // Mine was read at version 1: it would retire their column.
    const mine = await put({ a: { type: "text" } }, 1);
    expect(mine.status).toBe(409);
    expect(mine.body.code).toBe("draft_changed");
    const now = (await alice.get(`${ws(own)}/tables/versions`)).body.columns;
    expect(now.map((column: Any) => [column.name, column.status])).toEqual([
      ["a", "active"],
      ["theirs", "active"],
    ]);
  });
});
