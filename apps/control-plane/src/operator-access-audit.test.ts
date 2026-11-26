import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
let tenant: string;
let ws: string;
// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "audited", name: "Audited" })).body.id;
  const setup = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const made = await t.admin.post(`/tenants/${tenant}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  ws = `/tenants/${tenant}/workspaces/${made.body.id}`;
  const table = await t.admin.put(`${ws}/resources/notes`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: { columns: { note: { type: "text" } } },
  });
  expect(table.status, JSON.stringify(table.body)).toBe(201);
  expect((await t.admin.post(`${ws}/rows/notes`, { note: "customer secret" })).status).toBe(201);
  await t.admin.delete(`/tenants/${tenant}/access-grants/${setup.body.id}`);
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

const entries = async () =>
  (
    await t.db
      .selectFrom("audit_entry")
      .select(["target_id"])
      .where("tenant_id", "=", tenant)
      .where("action", "=", "operator.access")
      .orderBy("id")
      .execute()
  ).map((row) => row.target_id as string);

describe("an operator's reads under an access grant are all in the tenant's log (phase 35, B5)", () => {
  test("every read, whether the route decides with authorize, allowed or allowedMany, leaves one entry", async () => {
    // Without a grant the operator reads nothing, and nothing is written.
    expect((await t.admin.get(`${ws}/drafts`)).status).toBe(404);
    const setupEntries = (await entries()).length;
    expect(setupEntries).toBe(3);

    const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Ticket 7" });
    expect(grant.status).toBe(201);

    const query = encodeURIComponent(JSON.stringify({ table: "notes" }));
    const reads = [
      `${ws}/rows/notes`, // authorize: the control
      `${ws}/resource-files`,
      `${ws}/drafts`,
      `${ws}/docs`,
      `/tenants/${tenant}/search?q=notes`,
      `${ws}/queries/visual?query=${query}`,
      `${ws}/queries/schema`,
      `/tenants/${tenant}/workspaces`,
    ];
    const seen: string[] = [];
    for (const path of reads) {
      const before = (await entries()).length;
      const read = await t.admin.get(path);
      expect(read.status, `${path} ${JSON.stringify(read.body)}`).toBe(200);
      const after = await entries();
      // One entry for the request, not one for each row or each question asked.
      expect(after.length - before, path).toBe(1);
      seen.push(...after.slice(before));
    }
    expect(seen).toContain("GET /api/v1/tenants/:t/workspaces/:w/queries/visual");
    expect(seen).toContain("GET /api/v1/tenants/:t/workspaces/:w/drafts");
    void ({} as Any);
  });
});
