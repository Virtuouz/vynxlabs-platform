import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
let dedicatedDb: TestDatabase | undefined;
let tenant: string;
let dev: string;
let alice: Client; // tenant admin
let roles: Record<string, string>;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;

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
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;
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
      slug: `tabp-${counter}`,
      name: `Tabp ${counter}`,
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

describe("what the console needs of a table to change it (TAB-P1 to TAB-P6)", () => {
  test("TAB-P4: a table's detail lists its indexes, and one may name created_at", async () => {
    const own = await fresh();
    const made = await put(
      own,
      "logs",
      { columns: { kind: { type: "text" } }, indexes: [["kind", "created_at"], ["created_at"]] },
      { create: true },
    );
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const detail = await alice.get(`${ws(own)}/tables/logs`);
    expect(detail.body.indexes).toEqual([["kind", "created_at"], ["created_at"]]);
  });

  test("TAB-P6: a retired table is brought back, with its rows, by saving it again", async () => {
    const own = await fresh();
    await put(
      own,
      "notes",
      { columns: { title: { type: "text", required: true } } },
      { create: true },
    );
    await alice.post(`${ws(own)}/rows/notes`, { rows: [{ title: "a" }, { title: "b" }] });
    expect((await alice.delete(`${ws(own)}/resources/notes`)).status).toBe(204);
    expect((await alice.get(`${ws(own)}/tables/notes`)).body.status).toBe("retired");
    const back = await put(own, "notes", { columns: { title: { type: "text", required: true } } });
    expect(back.status, JSON.stringify(back.body)).toBeLessThan(300);
    const detail = (await alice.get(`${ws(own)}/tables/notes`)).body;
    expect(detail.status).toBe("active");
    expect(detail.rowCount).toBe(2);
  });

  test("w-data 1: a retired table still lists its indexes, and brings them back", async () => {
    const own = await fresh();
    const body = {
      columns: { title: { type: "text" }, kind: { type: "text" } },
      indexes: [["kind", "title"], ["title"]],
    };
    await put(own, "notes", body, { create: true });
    expect((await alice.delete(`${ws(own)}/resources/notes`)).status).toBe(204);
    const gone = (await alice.get(`${ws(own)}/tables/notes`)).body;
    expect(gone.status).toBe("retired");
    expect(gone.indexes).toEqual(expect.arrayContaining([["kind", "title"], ["title"]]));
    expect(gone.indexes).toHaveLength(2);
    const back = await put(own, "notes", { ...body, indexes: gone.indexes });
    expect(back.status, JSON.stringify(back.body)).toBeLessThan(300);
    const detail = (await alice.get(`${ws(own)}/tables/notes`)).body;
    expect(detail.status).toBe("active");
    expect(detail.indexes).toHaveLength(2);
  });
});
