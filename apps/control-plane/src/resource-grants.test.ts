import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let roles: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

/** A tenant with a dev workspace, a developer in it, and a tenant admin. */
async function tenantWithDeveloper(slug: string) {
  const tenant = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const workspace = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "dev", type: "dev" })
  ).body.id as string;
  const make = async (name: string) =>
    (
      await t.admin.post(`/tenants/${tenant}/members`, {
        email: `${name}@${slug}.example`,
        name,
        password: PASSWORD,
      })
    ).body.id as string;
  const dev = await make("dev");
  const boss = await make("boss");
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: dev,
    roleId: roles.developer,
    workspaceId: workspace,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: boss,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  const me: Client = await t.signIn(`dev@${slug}.example`, PASSWORD);
  const owner: Client = await t.signIn(`boss@${slug}.example`, PASSWORD);
  return { tenant, workspace, me, owner, base: `/tenants/${tenant}/workspaces/${workspace}` };
}

const role = (name: string, permissions: string[]) => ({
  kind: "role",
  schemaVersion: 1,
  ownership: "code",
  body: { name, permissions },
});
const binding = (roleName: string, email: string) => ({
  kind: "binding",
  schemaVersion: 1,
  ownership: "code",
  body: { role: roleName, principal: { type: "member", email } },
});

describe("writing a role or a binding as a resource (phase 35, B4)", () => {
  test("a developer, who cannot make a role or a binding by their own routes, cannot by a resource either", async () => {
    const a = await tenantWithDeveloper("selfgrant");
    const friend = (
      await t.db
        .selectFrom("member")
        .select("id")
        .where("email", "=", "boss@selfgrant.example")
        .executeTakeFirstOrThrow()
    ).id;
    // By their own routes: refused.
    expect(
      (
        await a.me.post(`/tenants/${a.tenant}/bindings`, {
          principalType: "member",
          principalId: friend,
          roleId: roles.viewer,
          workspaceId: a.workspace,
        })
      ).status,
    ).toBe(403);
    expect(
      (await a.me.post(`/tenants/${a.tenant}/roles`, { name: "god", permissions: ["*:*"] })).status,
    ).toBe(403);

    // By a resource: refused the same way, and nothing is stored.
    const god = await a.me.put(`${a.base}/resources/access/god`, role("god", ["*:*"]));
    expect(god.status, JSON.stringify(god.body)).toBe(403);
    const bound = await a.me.put(
      `${a.base}/resources/access/me-admin`,
      binding("workspace_admin", "dev@selfgrant.example"),
    );
    expect(bound.status, JSON.stringify(bound.body)).toBe(403);
    expect(await t.db.selectFrom("role").select("id").where("name", "=", "god").execute()).toEqual(
      [],
    );
    expect(
      await t.db
        .selectFrom("binding")
        .select("id")
        .where("source_resource_id", "is not", null)
        .where("tenant_id", "=", a.tenant)
        .execute(),
    ).toEqual([]);
    // And they still cannot bind by hand.
    expect(
      (
        await a.me.post(`/tenants/${a.tenant}/bindings`, {
          principalType: "member",
          principalId: friend,
          roleId: roles.viewer,
          workspaceId: a.workspace,
        })
      ).status,
    ).toBe(403);
  });

  test("the same goes for a draft, its deploy, and removing one", async () => {
    const a = await tenantWithDeveloper("viadraft");
    const draft = await a.me.put(`${a.base}/drafts/access/god`, role("god", ["*:*"]));
    expect(draft.status, JSON.stringify(draft.body)).toBe(403);
    // Someone who may makes one; the developer may not remove it.
    expect(
      (await a.owner.put(`${a.base}/resources/access/viewers`, role("viewers", ["*:read"]))).status,
    ).toBe(201);
    expect((await a.me.delete(`${a.base}/resources/access/viewers`)).status).toBe(403);
    expect((await a.owner.delete(`${a.base}/resources/access/viewers`)).status).toBe(204);
  });

  test("a tenant admin still writes both", async () => {
    const a = await tenantWithDeveloper("allowed");
    expect(
      (await a.owner.put(`${a.base}/resources/access/ops`, role("ops", ["*:read"]))).status,
    ).toBe(201);
    expect(
      (
        await a.owner.put(
          `${a.base}/resources/access/dev-ops`,
          binding("ops", "dev@allowed.example"),
        )
      ).status,
    ).toBe(201);
  });
});
