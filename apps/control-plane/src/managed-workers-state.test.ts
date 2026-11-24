import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

test("the state tells a tenant that has the switch off from an instance that starts none (GOV-23)", async () => {
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const tenant = (await t.admin.post("/tenants", { slug: "acme", name: "acme" })).body.id as string;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "alice",
    password: "a-good-long-password",
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  const alice = await t.signIn("alice@acme.example", "a-good-long-password");
  // The instance of this test starts no workers.
  const off = await alice.patch(`/tenants/${tenant}`, { managedWorkers: false });
  expect(off.status, JSON.stringify(off.body)).toBe(200);
  expect((await alice.get(`/tenants/${tenant}/managed-workers`)).body).toEqual({ state: "off" });
  const on = await alice.patch(`/tenants/${tenant}`, { managedWorkers: true });
  expect(on.status, JSON.stringify(on.body)).toBe(200);
  // The tenant allows it, and the instance starts none for anyone.
  expect((await alice.get(`/tenants/${tenant}/managed-workers`)).body).toEqual({
    state: "unavailable",
  });
});
