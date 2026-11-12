import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.stop();
});

/**
 * The phase 1 exit criterion: a tenant, workspace, members and roles can be
 * created, and every change is audited.
 */
test("a tenant, workspace, member and role are created, and each change is in the audit log", async () => {
  const tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body;
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );

  // The operator hands the tenant to its first admin, under an access grant.
  const grant = (
    await t.admin.post(`/tenants/${tenant.id}/access-grants`, {
      reason: "Onboarding",
      roleId: roles.tenant_admin,
    })
  ).body;
  const owner = (
    await t.admin.post(`/tenants/${tenant.id}/members`, {
      email: "owner@acme.example",
      name: "Owner",
      password: "a-good-long-password",
    })
  ).body;
  await t.admin.post(`/tenants/${tenant.id}/bindings`, {
    principalType: "member",
    principalId: owner.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant.id}/access-grants/${grant.id}`);

  // From here the tenant runs itself.
  const admin = await t.signIn("owner@acme.example", "a-good-long-password");
  const base = `/tenants/${tenant.id}`;
  const workspace = (
    await admin.post(`${base}/workspaces`, { slug: "main", name: "Main", type: "production" })
  ).body;
  const colleague = (
    await admin.post(`${base}/members`, {
      email: "dev@acme.example",
      name: "Dev",
      password: "a-good-long-password",
    })
  ).body;
  const role = (
    await admin.post(`${base}/roles`, {
      name: "releaser",
      permissions: ["resource:*", "secret:read"],
    })
  ).body;
  const binding = await admin.post(`${base}/bindings`, {
    workspaceId: workspace.id,
    principalType: "member",
    principalId: colleague.id,
    roleId: role.id,
  });
  expect(binding.status).toBe(201);

  const log = (await admin.get(`${base}/audit?limit=200`)).body.items as {
    action: string;
    targetId: string | null;
    actorId: string | null;
    accessGrantId: string | null;
  }[];
  const entry = (action: string, targetId: string) =>
    log.find((candidate) => candidate.action === action && candidate.targetId === targetId);

  expect(entry("tenant.created", tenant.id)).toBeDefined();
  expect(entry("access_grant.opened", grant.id)).toBeDefined();
  expect(entry("tenant_member.added", owner.id)?.accessGrantId).toBe(grant.id);
  expect(entry("access_grant.revoked", grant.id)).toBeDefined();
  expect(entry("workspace.created", workspace.id)?.actorId).toBe(owner.id);
  expect(entry("tenant_member.added", colleague.id)?.actorId).toBe(owner.id);
  expect(entry("role.created", role.id)?.actorId).toBe(owner.id);
  expect(entry("binding.created", binding.body.id)?.actorId).toBe(owner.id);
  expect(t.unaudited).toEqual([]);
});
