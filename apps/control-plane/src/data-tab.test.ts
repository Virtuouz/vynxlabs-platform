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
