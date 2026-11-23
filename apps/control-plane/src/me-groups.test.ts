import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

test("the caller's own groups in a tenant, and nobody else's", async () => {
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const password = "a-long-enough-password";
  const mia = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "mia@acme.example",
    name: "Mia",
    password,
  });
  const ben = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "ben@acme.example",
    name: "Ben",
    password,
  });
  for (const member of [mia, ben]) {
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
  }
  const billing = await t.admin.post(`/tenants/${tenant}/groups`, { name: "Billing" });
  const sales = await t.admin.post(`/tenants/${tenant}/groups`, { name: "Sales" });
  await t.admin.put(`/tenants/${tenant}/groups/${billing.body.id}/members/${mia.body.id}`);
  await t.admin.put(`/tenants/${tenant}/groups/${sales.body.id}/members/${ben.body.id}`);
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  const asMia = await t.signIn("mia@acme.example", password);
  const mine = await asMia.get(`/tenants/${tenant}/me/groups`);
  expect(mine.status).toBe(200);
  expect(mine.body.items).toEqual([{ key: expect.any(String), name: "Billing" }]);
});
