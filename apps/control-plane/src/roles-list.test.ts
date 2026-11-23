import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.stop();
});

// SSO's role picker asks `roles?limit=200` and the console's note said it stops there. The route
// does not page: it answers every role, so a list longer than the limit is not cut.
test("a tenant's roles are all answered, whatever limit is asked (GOV-37, sweep-can)", async () => {
  const tenant = (await t.admin.post("/tenants", { slug: "roll", name: "Roll" })).body.id;
  const admin = (
    await t.db
      .selectFrom("role")
      .select("id")
      .where("name", "=", "tenant_admin")
      .executeTakeFirstOrThrow()
  ).id;
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: admin });
  const all = (await t.admin.get(`/tenants/${tenant}/roles`)).body.items as unknown[];
  const asked = (await t.admin.get(`/tenants/${tenant}/roles?limit=2`)).body.items as unknown[];
  expect(all.length).toBeGreaterThan(2);
  expect(asked.length).toBe(all.length);
});
