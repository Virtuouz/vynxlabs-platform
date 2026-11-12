import { newId, sql } from "@vynxlabs/db";
import { getMigrations } from "better-auth/db/migration";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mutate, SYSTEM } from "./kernel/audit.js";
import { authOptions } from "./kernel/auth.js";
import { check, grants } from "./kernel/authorize.js";
import { Vault } from "./kernel/crypto.js";
import { revealSecret } from "./kernel/secrets.js";
import { ADMIN, type Client, startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
const PASSWORD = "a-good-long-password";

// Shared fixtures, built up by the tests in order.
let acme: string; // tenant
let globex: string; // another tenant
let prod: string; // acme production workspace
let dev: string; // acme dev workspace
let alice: { id: string; client: Client }; // acme tenant admin
let bob: { id: string; client: Client }; // acme member, bound at the dev workspace only
let gina: { id: string; client: Client }; // globex tenant admin
let roles: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.stop();
});

async function auditActions(tenantId: string | null) {
  const url = tenantId ? `/tenants/${tenantId}/audit?limit=200` : "/audit?limit=200";
  const client = tenantId === globex ? gina.client : tenantId ? alice.client : t.admin;
  const response = await client.get(url);
  expect(response.status).toBe(200);
  return (response.body.items as { action: string }[]).map((entry) => entry.action);
}

describe("authentication", () => {
  test("the authentication library finds every table and column it needs", async () => {
    const pending = await getMigrations(authOptions(t.db, t.config));
    expect(pending.toBeCreated).toEqual([]);
    expect(pending.toBeAdded).toEqual([]);
  });

  test("the bootstrap admin signs in and is an operator", async () => {
    const me = await t.admin.get("/me");
    expect(me.status).toBe(200);
    expect(me.body.principal).toMatchObject({ type: "member", email: ADMIN.email });
    expect(me.body.instancePermissions).toContain("tenant:*");
  });

  test("a wrong password is refused with a problem document", async () => {
    const response = await t.anonymous.post("/auth/sign-in/email", {
      email: ADMIN.email,
      password: "not-the-password",
    });
    expect(response.status).toBe(401);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 401, code: "invalid_email_or_password" });
  });

  test("nobody can sign themselves up", async () => {
    const response = await t.anonymous.post("/auth/sign-up/email", {
      email: "intruder@example.com",
      name: "Intruder",
      password: PASSWORD,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const members = await t.admin.get("/members");
    expect(members.body.items.map((m: { email: string }) => m.email)).toEqual([ADMIN.email]);
  });

  test("without a session or key, protected routes answer 401", async () => {
    expect((await t.anonymous.get("/me")).status).toBe(401);
    expect((await t.anonymous.get("/tenants")).status).toBe(401);
    expect((await t.anonymous.get(`/tenants/${newId()}`)).status).toBe(401);
    expect((await t.withKey("vxk_not-a-real-key").get("/me")).status).toBe(401);
  });

  test("bootstrap runs once", async () => {
    const { bootstrapAdmin } = await import("./kernel/bootstrap.js");
    await bootstrapAdmin(t.kernel, t.app.log);
    expect((await t.admin.get("/members")).body.items).toHaveLength(1);
  });
});

describe("tenancy", () => {
  test("an operator creates tenants", async () => {
    const created = await t.admin.post("/tenants", { slug: "acme", name: "Acme Corp" });
    expect(created.status).toBe(201);
    acme = created.body.id;
    globex = (await t.admin.post("/tenants", { slug: "globex", name: "Globex" })).body.id;

    expect((await t.admin.post("/tenants", { slug: "acme", name: "Again" })).status).toBe(409);
    expect((await t.admin.post("/tenants", { slug: "Not A Slug", name: "x" })).status).toBe(400);
    expect((await t.admin.get("/tenants")).body.items).toHaveLength(2);
    expect((await t.admin.patch(`/tenants/${acme}`, { name: "Acme" })).body.name).toBe("Acme");
  });

  test("an operator has no access inside a tenant", async () => {
    expect((await t.admin.get(`/tenants/${acme}`)).status).toBe(200);
    for (const path of ["members", "workspaces", "roles", "bindings", "audit", "groups"]) {
      expect((await t.admin.get(`/tenants/${acme}/${path}`)).status, path).toBe(404);
    }
    expect((await t.admin.post(`/tenants/${acme}/members`, { email: ADMIN.email })).status).toBe(
      404,
    );
  });

  test("the operator seeds each tenant with its first admin through an access grant", async () => {
    roles = Object.fromEntries(
      (
        await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
      ).map((role) => [role.name, role.id]),
    );
    const seed = async (tenantId: string, email: string) => {
      const grant = await t.admin.post(`/tenants/${tenantId}/access-grants`, {
        reason: "Initial tenant setup",
        roleId: roles.tenant_admin,
        durationMinutes: 5,
      });
      expect(grant.status).toBe(201);
      const member = await t.admin.post(`/tenants/${tenantId}/members`, {
        email,
        name: email.split("@")[0],
        password: PASSWORD,
      });
      expect(member.status).toBe(201);
      const binding = await t.admin.post(`/tenants/${tenantId}/bindings`, {
        principalType: "member",
        principalId: member.body.id,
        roleId: roles.tenant_admin,
      });
      expect(binding.status).toBe(201);
      expect(
        (await t.admin.delete(`/tenants/${tenantId}/access-grants/${grant.body.id}`)).status,
      ).toBe(204);
      return { id: member.body.id as string, client: await t.signIn(email, PASSWORD) };
    };
    alice = await seed(acme, "alice@acme.example");
    gina = await seed(globex, "gina@globex.example");

    // The grant is revoked, so the operator is locked out again.
    expect((await t.admin.get(`/tenants/${acme}/members`)).status).toBe(404);
    expect(
      (await alice.client.get("/tenants")).body.items.map((x: { slug: string }) => x.slug),
    ).toEqual(["acme"]);
  });

  test("a tenant admin creates workspaces, and the type is fixed for life", async () => {
    const production = await alice.client.post(`/tenants/${acme}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    });
    expect(production.status).toBe(201);
    prod = production.body.id;
    const development = await alice.client.post(`/tenants/${acme}/workspaces`, {
      slug: "main-dev",
      name: "Main (dev)",
      type: "dev",
      linkedWorkspaceId: prod,
    });
    expect(development.body).toMatchObject({ type: "dev", linkedWorkspaceId: prod });
    dev = development.body.id;

    // The API ignores an attempt to change the type, and the database refuses one outright.
    const patched = await alice.client.patch(`/tenants/${acme}/workspaces/${dev}`, {
      name: "Development",
      type: "production",
    });
    expect(patched.body).toMatchObject({ name: "Development", type: "dev" });
    await expect(
      t.db.updateTable("workspace").set({ type: "production" }).where("id", "=", dev).execute(),
    ).rejects.toThrow(/type of a workspace cannot be changed/);

    expect(
      (
        await alice.client.post(`/tenants/${acme}/workspaces`, {
          slug: "bad-link",
          name: "x",
          type: "production",
          linkedWorkspaceId: prod,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await alice.client.post(`/tenants/${acme}/workspaces`, {
          slug: "main",
          name: "x",
          type: "dev",
        })
      ).status,
    ).toBe(409);
  });
});

describe("permissions", () => {
  test("permission matching", () => {
    expect(grants(["*:*"], "secret:write")).toBe(true);
    expect(grants(["*:read"], "secret:read")).toBe(true);
    expect(grants(["*:read"], "secret:write")).toBe(false);
    expect(grants(["secret:*"], "secret:write")).toBe(true);
    expect(grants(["secret:write"], "role:write")).toBe(false);
    expect(grants([], "tenant:read")).toBe(false);
  });

  test("a member bound at one workspace can act there and nowhere else", async () => {
    const created = await alice.client.post(`/tenants/${acme}/members`, {
      email: "bob@acme.example",
      name: "Bob",
      password: PASSWORD,
    });
    bob = { id: created.body.id, client: await t.signIn("bob@acme.example", PASSWORD) };

    // A member with no binding sees the tenant exists but can do nothing in it.
    expect((await bob.client.get(`/tenants/${acme}/workspaces`)).status).toBe(403);

    const binding = await alice.client.post(`/tenants/${acme}/bindings`, {
      workspaceId: dev,
      principalType: "member",
      principalId: bob.id,
      roleId: roles.developer,
    });
    expect(binding.status).toBe(201);

    const visible = await bob.client.get(`/tenants/${acme}/workspaces`);
    expect(visible.body.items.map((w: { id: string }) => w.id)).toEqual([dev]);
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${dev}`)).status).toBe(200);
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${prod}`)).status).toBe(403);
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${dev}/secrets`)).status).toBe(200);
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${prod}/secrets`)).status).toBe(403);
    // A developer reads but does not administer.
    expect(
      (await bob.client.patch(`/tenants/${acme}/workspaces/${dev}`, { name: "Mine" })).status,
    ).toBe(403);
    expect((await bob.client.get(`/tenants/${acme}/members`)).status).toBe(403);
    expect(
      (
        await bob.client.post(`/tenants/${acme}/bindings`, {
          workspaceId: dev,
          principalType: "member",
          principalId: bob.id,
          roleId: roles.workspace_admin,
        })
      ).status,
    ).toBe(403);
  });

  test("the check itself, scope by scope", async () => {
    const member = { type: "member" as const, id: bob.id };
    const at = (permission: string, target: object) =>
      check(t.db, member, permission, target).then((decision) => decision.allowed);
    expect(await at("secret:write", { tenantId: acme, workspaceId: dev })).toBe(true);
    expect(await at("secret:write", { tenantId: acme, workspaceId: prod })).toBe(false);
    expect(await at("secret:write", { tenantId: acme })).toBe(false);
    expect(await at("secret:write", { tenantId: globex, workspaceId: dev })).toBe(false);
    expect(await at("tenant:read", {})).toBe(false);

    // An instance binding counts for instance targets and never inside a tenant.
    const operator = await t.db
      .selectFrom("member")
      .select("id")
      .where("email", "=", ADMIN.email)
      .executeTakeFirstOrThrow();
    const asOperator = { type: "member" as const, id: operator.id };
    expect((await check(t.db, asOperator, "tenant:write", {})).allowed).toBe(true);
    expect(
      (await check(t.db, asOperator, "tenant:read", { tenantId: acme, orInstance: true })).allowed,
    ).toBe(true);
    expect(await check(t.db, asOperator, "member:read", { tenantId: acme })).toEqual({
      allowed: false,
      related: false,
    });

    expect(
      (await check(t.db, { type: "anonymous", id: null }, "workspace:read", { tenantId: acme }))
        .allowed,
    ).toBe(false);
  });

  test("groups carry bindings to their members", async () => {
    const group = await alice.client.post(`/tenants/${acme}/groups`, {
      name: "Production readers",
    });
    expect(group.status).toBe(201);
    expect(
      (await alice.client.put(`/tenants/${acme}/groups/${group.body.id}/members/${bob.id}`)).status,
    ).toBe(204);
    await alice.client.post(`/tenants/${acme}/bindings`, {
      workspaceId: prod,
      principalType: "group",
      principalId: group.body.id,
      roleId: roles.viewer,
    });
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${prod}`)).status).toBe(200);
    expect(
      (await alice.client.get(`/tenants/${acme}/groups/${group.body.id}`)).body.members,
    ).toHaveLength(1);

    expect(
      (await alice.client.delete(`/tenants/${acme}/groups/${group.body.id}/members/${bob.id}`))
        .status,
    ).toBe(204);
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${prod}`)).status).toBe(403);
    expect((await alice.client.delete(`/tenants/${acme}/groups/${group.body.id}`)).status).toBe(
      204,
    );
    expect((await alice.client.get(`/tenants/${acme}/groups`)).body.items).toEqual([]);
  });

  test("custom roles", async () => {
    const role = await alice.client.post(`/tenants/${acme}/roles`, {
      name: "secret_keeper",
      description: "Manages secrets",
      permissions: ["secret:*"],
    });
    expect(role.status).toBe(201);
    expect(
      (
        await alice.client.post(`/tenants/${acme}/roles`, {
          name: "bad",
          permissions: ["everything"],
        })
      ).status,
    ).toBe(400);
    const patched = await alice.client.patch(`/tenants/${acme}/roles/${role.body.id}`, {
      permissions: ["secret:read"],
    });
    expect(patched.body.permissions).toEqual(["secret:read"]);

    const binding = await alice.client.post(`/tenants/${acme}/bindings`, {
      workspaceId: prod,
      principalType: "member",
      principalId: bob.id,
      roleId: role.body.id,
    });
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${prod}/secrets`)).status).toBe(200);
    // A role in use cannot be deleted. A built-in role cannot be touched at all.
    expect((await alice.client.delete(`/tenants/${acme}/roles/${role.body.id}`)).status).toBe(409);
    expect((await alice.client.delete(`/tenants/${acme}/roles/${roles.viewer}`)).status).toBe(404);
    expect((await alice.client.delete(`/tenants/${acme}/bindings/${binding.body.id}`)).status).toBe(
      204,
    );
    expect((await alice.client.delete(`/tenants/${acme}/roles/${role.body.id}`)).status).toBe(204);

    const listed = (await alice.client.get(`/tenants/${acme}/roles`)).body.items.map(
      (r: { name: string }) => r.name,
    );
    expect(listed).toEqual(["deployer", "developer", "tenant_admin", "viewer", "workspace_admin"]);
  });

  test("a role from another tenant, or the operator role, cannot be bound", async () => {
    const foreign = await gina.client.post(`/tenants/${globex}/roles`, {
      name: "theirs",
      permissions: ["*:*"],
    });
    for (const roleId of [foreign.body.id, roles.operator_admin]) {
      const response = await alice.client.post(`/tenants/${acme}/bindings`, {
        principalType: "member",
        principalId: bob.id,
        roleId,
      });
      expect(response.status).toBe(400);
    }
    // Nor can a principal from another tenant be bound.
    expect(
      (
        await alice.client.post(`/tenants/${acme}/bindings`, {
          principalType: "member",
          principalId: gina.id,
          roleId: roles.viewer,
        })
      ).status,
    ).toBe(400);
  });

  test("instance bindings", async () => {
    const second = await t.admin.post("/members", {
      email: "ops2@example.com",
      name: "Ops Two",
      password: PASSWORD,
    });
    expect(second.status).toBe(201);
    const binding = await t.admin.post("/bindings", {
      memberId: second.body.id,
      roleId: roles.operator_admin,
    });
    expect(binding.status).toBe(201);
    expect((await t.admin.get("/bindings")).body.items).toHaveLength(2);
    expect((await t.admin.delete(`/bindings/${binding.body.id}`)).status).toBe(204);
    // The last operator admin cannot be removed.
    const last = (await t.admin.get("/bindings")).body.items[0];
    expect((await t.admin.delete(`/bindings/${last.id}`)).status).toBe(409);
    expect((await alice.client.get("/bindings")).status).toBe(403);
    expect((await alice.client.get("/members")).status).toBe(403);
    expect((await alice.client.post("/tenants", { slug: "mine", name: "Mine" })).status).toBe(403);
  });
});

describe("tenant isolation", () => {
  test("a member of one tenant gets 404 for everything in another", async () => {
    const theirs = await gina.client.post(`/tenants/${globex}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    });
    const paths = [
      "",
      "/members",
      "/groups",
      "/service-accounts",
      "/roles",
      "/bindings",
      "/access-grants",
      "/audit",
      "/workspaces",
      `/workspaces/${theirs.body.id}`,
      `/workspaces/${theirs.body.id}/secrets`,
      `/workspaces/${theirs.body.id}/resources`,
    ];
    for (const path of paths) {
      expect((await alice.client.get(`/tenants/${globex}${path}`)).status, path).toBe(404);
    }
    // A workspace ID from another tenant does not resolve under one's own tenant either.
    expect((await alice.client.get(`/tenants/${acme}/workspaces/${theirs.body.id}`)).status).toBe(
      404,
    );
    expect((await alice.client.get(`/tenants/${newId()}/members`)).status).toBe(404);
    expect((await alice.client.get("/tenants/not-an-id/members")).status).toBe(400);
  });
});

describe("operator access grants", () => {
  test("access exists only while a grant is active, and all of it is visible to the tenant", async () => {
    expect((await t.admin.get(`/tenants/${acme}/workspaces`)).status).toBe(404);
    expect(
      (await alice.client.post(`/tenants/${acme}/access-grants`, { reason: "self-service" }))
        .status,
    ).toBe(403);
    expect((await t.admin.post(`/tenants/${acme}/access-grants`, { reason: "" })).status).toBe(400);

    const grant = await t.admin.post(`/tenants/${acme}/access-grants`, {
      reason: "Support ticket 42",
    });
    expect(grant.body).toMatchObject({
      roleName: "viewer",
      active: true,
      reason: "Support ticket 42",
    });

    // A viewer grant reads but does not write.
    expect((await t.admin.get(`/tenants/${acme}/workspaces`)).status).toBe(200);
    expect((await t.admin.post(`/tenants/${acme}/groups`, { name: "nope" })).status).toBe(403);
    expect((await t.admin.get(`/tenants/${globex}/workspaces`)).status).toBe(404);

    const log = await alice.client.get(`/tenants/${acme}/audit?action=operator.access`);
    expect(log.body.items[0]).toMatchObject({
      action: "operator.access",
      accessGrantId: grant.body.id,
      targetId: "GET /api/v1/tenants/:t/workspaces",
    });

    // The tenant admin sees the grant and ends it.
    const listed = await alice.client.get(`/tenants/${acme}/access-grants`);
    expect(listed.body.items[0]).toMatchObject({
      id: grant.body.id,
      memberEmail: ADMIN.email,
      active: true,
    });
    expect(
      (await alice.client.delete(`/tenants/${acme}/access-grants/${grant.body.id}`)).status,
    ).toBe(204);
    expect((await t.admin.get(`/tenants/${acme}/workspaces`)).status).toBe(404);
    expect(await auditActions(acme)).toEqual(
      expect.arrayContaining(["access_grant.opened", "access_grant.revoked"]),
    );
  });

  test("a grant stops working when it expires", async () => {
    const grant = await t.admin.post(`/tenants/${acme}/access-grants`, {
      reason: "Short visit",
      durationMinutes: 1,
    });
    expect((await t.admin.get(`/tenants/${acme}/members`)).status).toBe(200);
    await t.db
      .updateTable("access_grant")
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where("id", "=", grant.body.id)
      .execute();
    expect((await t.admin.get(`/tenants/${acme}/members`)).status).toBe(404);
    const listed = await t.admin.get(`/tenants/${acme}/access-grants`);
    expect(listed.body.items[0]).toMatchObject({ id: grant.body.id, active: false });
  });
});

describe("API keys and service accounts", () => {
  test("a member's key acts as the member, and only its hash is stored", async () => {
    const created = await alice.client.post("/api-keys", { name: "laptop" });
    expect(created.status).toBe(201);
    const token: string = created.body.token;
    expect(token).toMatch(/^vxk_[A-Za-z0-9_-]{43}$/);

    const stored = await t.db
      .selectFrom("api_key")
      .selectAll()
      .where("id", "=", created.body.id)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.prefix).toBe(token.slice(0, 12));

    const keyed = t.withKey(token);
    expect((await keyed.get("/me")).body.principal.email).toBe("alice@acme.example");
    expect((await keyed.get(`/tenants/${acme}/members`)).status).toBe(200);
    expect((await alice.client.get("/api-keys")).body.items[0]).not.toHaveProperty("token");

    // Someone else cannot revoke it. The owner can, and then it stops working.
    expect((await bob.client.delete(`/api-keys/${created.body.id}`)).status).toBe(404);
    expect((await alice.client.delete(`/api-keys/${created.body.id}`)).status).toBe(204);
    expect((await keyed.get("/me")).status).toBe(401);
  });

  test("an expired key is refused", async () => {
    const created = await alice.client.post("/api-keys", {
      name: "short-lived",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await t.db
      .updateTable("api_key")
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where("id", "=", created.body.id)
      .execute();
    expect((await t.withKey(created.body.token).get("/me")).status).toBe(401);
    expect(
      (
        await alice.client.post("/api-keys", {
          name: "past",
          expiresAt: "2020-01-01T00:00:00.000Z",
        })
      ).status,
    ).toBe(400);
  });

  test("a service account acts only inside its tenant, with what it is bound to", async () => {
    const account = await alice.client.post(`/tenants/${acme}/service-accounts`, { name: "ci" });
    const key = await alice.client.post(
      `/tenants/${acme}/service-accounts/${account.body.id}/api-keys`,
      { name: "pipeline" },
    );
    expect(key.status).toBe(201);
    const ci = t.withKey(key.body.token);

    expect((await ci.get("/me")).body).toMatchObject({
      principal: { type: "service_account", name: "ci" },
      tenants: [{ id: acme }],
    });
    expect((await ci.get(`/tenants/${acme}/workspaces/${dev}/resources`)).status).toBe(403);
    await alice.client.post(`/tenants/${acme}/bindings`, {
      workspaceId: dev,
      principalType: "service_account",
      principalId: account.body.id,
      roleId: roles.developer,
    });
    expect((await ci.get(`/tenants/${acme}/workspaces/${dev}/resources`)).status).toBe(200);
    expect((await ci.get(`/tenants/${globex}/workspaces`)).status).toBe(404);
    expect((await ci.get("/api-keys")).status).toBe(403);

    expect(
      (await alice.client.get(`/tenants/${acme}/service-accounts/${account.body.id}/api-keys`)).body
        .items,
    ).toHaveLength(1);
    const second = await alice.client.post(
      `/tenants/${acme}/service-accounts/${account.body.id}/api-keys`,
      { name: "old" },
    );
    expect(
      (
        await alice.client.delete(
          `/tenants/${acme}/service-accounts/${account.body.id}/api-keys/${second.body.id}`,
        )
      ).status,
    ).toBe(204);
    expect((await t.withKey(second.body.token).get("/me")).status).toBe(401);

    expect(
      (await alice.client.delete(`/tenants/${acme}/service-accounts/${account.body.id}`)).status,
    ).toBe(204);
    expect((await ci.get("/me")).status).toBe(401);
    expect((await alice.client.get(`/tenants/${acme}/service-accounts`)).body.items).toEqual([]);
  });
});

describe("secrets", () => {
  const base = () => `/tenants/${acme}/workspaces/${dev}/secrets`;

  test("a value is stored encrypted, listed by name only, and never returned", async () => {
    const value = "sk-live-9f8e7d6c5b4a";
    expect((await bob.client.put(`${base()}/STRIPE_KEY`, { value })).status).toBe(204);
    expect((await bob.client.put(`${base()}/STRIPE_KEY`, { value })).status).toBe(204);
    expect((await bob.client.put(`${base()}/bad-name`, { value })).status).toBe(400);

    const listed = await bob.client.get(base());
    expect(listed.body.items.map((s: { name: string }) => s.name)).toEqual(["STRIPE_KEY"]);
    expect(JSON.stringify(listed.body)).not.toContain(value);
    expect((await bob.client.get(`${base()}/STRIPE_KEY`)).status).toBe(404);

    const row = await t.db
      .selectFrom("secret")
      .selectAll()
      .where("name", "=", "STRIPE_KEY")
      .executeTakeFirstOrThrow();
    expect(row.ciphertext.includes(Buffer.from(value))).toBe(false);
    const id = { tenantId: acme, workspaceId: dev, name: "STRIPE_KEY" };
    expect(await revealSecret(t.db, t.kernel.vault, id)).toBe(value);

    // Nothing about the value reaches the audit log.
    const entries = await alice.client.get(`/tenants/${acme}/audit?limit=200`);
    expect(JSON.stringify(entries.body)).not.toContain(value);
    expect(await auditActions(acme)).toEqual(
      expect.arrayContaining(["secret.created", "secret.updated"]),
    );
  });

  test("a ciphertext cannot be moved to another name, workspace or tenant, or read with another key", async () => {
    const row = await t.db
      .selectFrom("secret")
      .selectAll()
      .where("name", "=", "STRIPE_KEY")
      .executeTakeFirstOrThrow();
    const wrapped = await t.db
      .selectFrom("tenant_key")
      .select("wrapped_key")
      .where("tenant_id", "=", acme)
      .executeTakeFirstOrThrow();
    const key = t.kernel.vault.unwrapTenantKey(acme, wrapped.wrapped_key);
    const id = { tenantId: acme, workspaceId: dev, name: "STRIPE_KEY" };
    expect(t.kernel.vault.decrypt(key, id, row.ciphertext)).toBe("sk-live-9f8e7d6c5b4a");
    expect(() => t.kernel.vault.decrypt(key, { ...id, name: "OTHER" }, row.ciphertext)).toThrow();
    expect(() =>
      t.kernel.vault.decrypt(key, { ...id, workspaceId: prod }, row.ciphertext),
    ).toThrow();
    expect(() =>
      t.kernel.vault.decrypt(key, { ...id, tenantId: globex }, row.ciphertext),
    ).toThrow();
    // Another tenant's key, and another instance's master key, are both useless.
    expect(() => t.kernel.vault.unwrapTenantKey(globex, wrapped.wrapped_key)).toThrow();
    expect(() =>
      new Vault(Buffer.alloc(32, 1)).unwrapTenantKey(acme, wrapped.wrapped_key),
    ).toThrow();
  });

  test("a secret can be deleted", async () => {
    await bob.client.put(`${base()}/TEMPORARY`, { value: "x" });
    expect((await bob.client.delete(`${base()}/TEMPORARY`)).status).toBe(204);
    expect((await bob.client.delete(`${base()}/TEMPORARY`)).status).toBe(404);
  });
});

describe("resource registry", () => {
  const base = () => `/tenants/${acme}/workspaces/${dev}/resources`;
  const reviewer = {
    kind: "role",
    schemaVersion: 1,
    ownership: "code",
    body: { name: "reviewer", permissions: ["secret:read"] },
  };

  test("lists the registered kinds", async () => {
    expect(
      (await bob.client.get("/kinds")).body.items.map((k: { kind: string }) => k.kind),
    ).toEqual([
      "binding",
      "connection",
      "data_source",
      "event",
      "flow",
      "role",
      "schedule",
      "script",
      "table",
      "trigger",
      "variable",
    ]);
  });

  test("create, update, rename and version history", async () => {
    const created = await alice.client.put(`${base()}/access/reviewer`, reviewer);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      kind: "role",
      path: "access/reviewer",
      workspace: "main-dev",
      ownership: "code",
      version: 1,
    });
    const id = created.body.id;

    const updated = await alice.client.put(`${base()}/access/reviewer`, {
      ...reviewer,
      body: { ...reviewer.body, description: "Reads secrets" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id, version: 2 });

    // A rename keeps the ID.
    const renamed = await alice.client.put(`${base()}/access/roles/reviewer`, {
      ...reviewer,
      renameFrom: "access/reviewer",
    });
    expect(renamed.body).toMatchObject({ id, path: "access/roles/reviewer", version: 3 });
    expect((await alice.client.get(`${base()}/access/reviewer`)).status).toBe(404);
    expect((await alice.client.get(`${base()}/access/roles/reviewer`)).body.id).toBe(id);
    expect((await alice.client.get(`${base()}?kind=role`)).body.items).toHaveLength(1);

    const versions = await t.db
      .selectFrom("resource_version")
      .select(["version", "path"])
      .where("resource_id", "=", id)
      .orderBy("version")
      .execute();
    expect(versions).toEqual([
      { version: 1, path: "access/reviewer" },
      { version: 2, path: "access/reviewer" },
      { version: 3, path: "access/roles/reviewer" },
    ]);
  });

  test("refuses what the manifest rules forbid", async () => {
    const put = (path: string, body: object) => alice.client.put(`${base()}/${path}`, body);
    const invalid = await put("access/broken", {
      ...reviewer,
      body: { name: "x", permissions: ["nonsense"] },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors[0].path).toBe("/body/permissions/0");
    expect((await put("access/unknown", { ...reviewer, kind: "mystery" })).body.errors).toEqual([
      { path: "/kind", message: 'unknown kind "mystery"' },
    ]);
    expect((await put("Not/A/Path", reviewer)).status).toBe(400);
    // Ownership cannot flip, and a path cannot change kind.
    expect((await put("access/roles/reviewer", { ...reviewer, ownership: "ui" })).status).toBe(409);
    expect(
      (
        await put("access/roles/reviewer", {
          kind: "binding",
          schemaVersion: 1,
          ownership: "code",
          body: { role: "viewer", principal: { type: "anonymous" } },
        })
      ).status,
    ).toBe(409);
    expect(
      (await put("access/elsewhere", { ...reviewer, renameFrom: "access/missing" })).status,
    ).toBe(404);
    // A viewer of the workspace cannot write.
    expect((await t.anonymous.put(`${base()}/access/x`, reviewer)).status).toBe(401);
  });

  test("a role and a binding written as resources take effect, and stop when deleted", async () => {
    const carol = await alice.client.post(`/tenants/${acme}/members`, {
      email: "carol@acme.example",
      name: "Carol",
      password: PASSWORD,
    });
    const carolClient = await t.signIn("carol@acme.example", PASSWORD);
    const secrets = `/tenants/${acme}/workspaces/${dev}/secrets`;
    expect((await carolClient.get(secrets)).status).toBe(403);

    const binding = {
      kind: "binding",
      schemaVersion: 1,
      ownership: "code",
      body: { role: "reviewer", principal: { type: "member", email: "carol@acme.example" } },
    };
    expect((await alice.client.put(`${base()}/access/carol-reviews`, binding)).status).toBe(201);
    expect((await carolClient.get(secrets)).status).toBe(200);
    expect((await carolClient.put(`${secrets}/NOPE`, { value: "x" })).status).toBe(403);

    // Changing the role resource changes what the binding grants.
    await alice.client.put(`${base()}/access/roles/reviewer`, {
      ...reviewer,
      body: { name: "reviewer", permissions: ["secret:*"] },
    });
    expect((await carolClient.put(`${secrets}/CAROLS`, { value: "x" })).status).toBe(204);

    // Projections are read-only through the interface routes.
    const listed = await alice.client.get(`/tenants/${acme}/bindings?workspaceId=${dev}`);
    const projected = listed.body.items.find(
      (b: { principalId: string }) => b.principalId === carol.body.id,
    );
    expect(projected).toMatchObject({
      roleName: "reviewer",
      managedByResource: true,
      scopeType: "workspace",
    });
    expect((await alice.client.delete(`/tenants/${acme}/bindings/${projected.id}`)).status).toBe(
      409,
    );
    const role = (await alice.client.get(`/tenants/${acme}/roles`)).body.items.find(
      (r: { name: string }) => r.name === "reviewer",
    );
    expect(role).toMatchObject({ managedByResource: true, workspaceId: dev });
    expect(
      (await alice.client.patch(`/tenants/${acme}/roles/${role.id}`, { permissions: ["*:*"] }))
        .status,
    ).toBe(409);

    // A role in use cannot be deleted. Deleting the binding ends the access.
    expect((await alice.client.delete(`${base()}/access/roles/reviewer`)).status).toBe(409);
    expect((await alice.client.delete(`${base()}/access/carol-reviews`)).status).toBe(204);
    expect((await carolClient.get(secrets)).status).toBe(403);
    expect((await alice.client.delete(`${base()}/access/roles/reviewer`)).status).toBe(204);
    expect((await alice.client.get(base())).body.items).toEqual([]);
  });

  test("a binding resource that refers to nothing is refused whole", async () => {
    const put = (body: object) =>
      alice.client.put(`${base()}/access/ghost`, {
        kind: "binding",
        schemaVersion: 1,
        ownership: "code",
        body,
      });
    expect(
      (await put({ role: "no_such_role", principal: { type: "anonymous" } })).body.errors[0].path,
    ).toBe("/body/role");
    expect((await put({ role: "operator_admin", principal: { type: "anonymous" } })).status).toBe(
      400,
    );
    expect(
      (await put({ role: "viewer", principal: { type: "member", email: "gina@globex.example" } }))
        .body.errors[0].path,
    ).toBe("/body/principal/email");
    expect(
      (await put({ role: "viewer", principal: { type: "group", name: "nobody" } })).status,
    ).toBe(400);
    expect(
      (await put({ role: "viewer", principal: { type: "anonymous" }, resource: "no/such" })).status,
    ).toBe(400);
    // Nothing was stored by any of those attempts.
    expect((await alice.client.get(`${base()}/access/ghost`)).status).toBe(404);
  });

  test("a binding at one resource reaches only that resource's scope", async () => {
    await alice.client.put(`${base()}/access/roles/auditor`, {
      kind: "role",
      schemaVersion: 1,
      ownership: "ui",
      body: { name: "auditor", permissions: ["resource:read"] },
    });
    const target = (await alice.client.get(`${base()}/access/roles/auditor`)).body;
    const binding = await alice.client.post(`/tenants/${acme}/bindings`, {
      workspaceId: dev,
      resourceId: target.id,
      principalType: "anonymous",
      roleId: roles.viewer,
    });
    expect(binding.status).toBe(201);
    const anyone = { type: "anonymous" as const, id: null };
    expect(
      (
        await check(t.db, anyone, "resource:read", {
          tenantId: acme,
          workspaceId: dev,
          resourceId: target.id,
        })
      ).allowed,
    ).toBe(true);
    expect(
      (await check(t.db, anyone, "resource:read", { tenantId: acme, workspaceId: dev })).allowed,
    ).toBe(false);
    await alice.client.delete(`/tenants/${acme}/bindings/${binding.body.id}`);
    await alice.client.delete(`${base()}/access/roles/auditor`);
  });
});

describe("audit", () => {
  test("the log cannot be changed or emptied", async () => {
    await expect(
      t.db.updateTable("audit_entry").set({ action: "tampered" }).execute(),
    ).rejects.toThrow(/append-only/);
    await expect(t.db.deleteFrom("audit_entry").execute()).rejects.toThrow(/append-only/);
    await expect(sql`truncate audit_entry`.execute(t.db)).rejects.toThrow(/append-only/);
  });

  test("a change and its audit entry succeed or fail together", async () => {
    const count = async () =>
      Number(
        (await sql<{ n: string }>`select count(*) as n from audit_entry`.execute(t.db)).rows[0]?.n,
      );
    const before = await count();
    const tenants = (await t.admin.get("/tenants")).body.items.length;

    // The change fails after the entry was written: neither survives.
    await expect(
      mutate(t.db, { principal: SYSTEM }, async (trx, audit) => {
        await audit({ action: "tenant.created", targetType: "tenant" });
        await trx
          .insertInto("tenant")
          .values({ id: newId(), slug: "acme", name: "Duplicate" })
          .execute();
      }),
    ).rejects.toThrow();
    // The change records no entry: it is refused and rolled back.
    await expect(
      mutate(t.db, { principal: SYSTEM }, async (trx) => {
        await trx
          .insertInto("tenant")
          .values({ id: newId(), slug: "silent", name: "Silent" })
          .execute();
      }),
    ).rejects.toThrow(/audit entry/);

    expect(await count()).toBe(before);
    expect((await t.admin.get("/tenants")).body.items).toHaveLength(tenants);
  });

  test("entries say who, what, when and from where", async () => {
    const response = await alice.client.get(`/tenants/${acme}/audit?action=workspace.created`);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      action: "workspace.created",
      tenantId: acme,
      workspaceId: dev,
      actorType: "member",
      actorId: alice.id,
      targetType: "workspace",
      targetId: dev,
      details: { slug: "main-dev", type: "dev" },
      ipAddress: "127.0.0.1",
    });
    expect(response.body.items[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(response.body.items[0].occurredAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  test("the log pages newest first, and a tenant sees only its own entries", async () => {
    const first = await alice.client.get(`/tenants/${acme}/audit?limit=5`);
    expect(first.body.items).toHaveLength(5);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await alice.client.get(
      `/tenants/${acme}/audit?limit=5&cursor=${first.body.nextCursor}`,
    );
    const ids = [...first.body.items, ...second.body.items].map(
      (entry: { id: string }) => entry.id,
    );
    expect(new Set(ids).size).toBe(10);
    expect([...ids].sort().reverse()).toEqual(ids);
    expect((await alice.client.get(`/tenants/${acme}/audit?cursor=garbage!`)).status).toBe(400);

    const all = await alice.client.get(`/tenants/${acme}/audit?limit=200`);
    expect(all.body.items.every((entry: { tenantId: string }) => entry.tenantId === acme)).toBe(
      true,
    );
    // Instance entries are the operator's. Sign-ins land there.
    expect(await auditActions(null)).toEqual(
      expect.arrayContaining(["member.created", "member.signed_in", "binding.created"]),
    );
    expect((await alice.client.get("/audit")).status).toBe(403);
  });

  test("sign-out and password changes are recorded", async () => {
    const carol = await t.signIn("carol@acme.example", PASSWORD);
    const changed = await carol.post("/auth/change-password", {
      currentPassword: PASSWORD,
      newPassword: "an-even-better-password",
    });
    expect(changed.status).toBe(200);
    expect((await carol.post("/auth/sign-out")).status).toBe(200);
    expect((await carol.get("/me")).status).toBe(401);
    await expect(t.signIn("carol@acme.example", PASSWORD)).rejects.toThrow(/Sign-in failed/);
    await t.signIn("carol@acme.example", "an-even-better-password");
    expect(await auditActions(null)).toEqual(
      expect.arrayContaining(["member.password_changed", "member.signed_out"]),
    );
  });
});

describe("members", () => {
  test("removing a member from a tenant removes their access", async () => {
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${dev}`)).status).toBe(200);
    expect((await alice.client.delete(`/tenants/${acme}/members/${bob.id}`)).status).toBe(204);
    expect((await bob.client.get(`/tenants/${acme}/workspaces/${dev}`)).status).toBe(404);
    expect((await bob.client.get("/tenants")).body.items).toEqual([]);
    // Adding an existing member back needs only the email.
    expect(
      (await alice.client.post(`/tenants/${acme}/members`, { email: "bob@acme.example" })).status,
    ).toBe(201);
    expect(
      (await alice.client.post(`/tenants/${acme}/members`, { email: "new@acme.example" })).status,
    ).toBe(400);
    expect((await alice.client.get(`/tenants/${acme}/members`)).body.items).toHaveLength(3);
  });
});

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    expect(t.unaudited).toEqual([]);
  });

  test("every kernel route that changes something was exercised and audited", () => {
    // The execution, data and environment routes have the same check in their own test files.
    const execution =
      /\/(bundles|deployments|runs|connection-bindings|variable-values|worker-credentials|worker|hooks|auth|flow-runs|flow-layouts|events|rows|row|table-purges|data-source-bindings|source-rows|source-row|files|promotions|database-locations|clones|trigger-pause|deletion|exports|imports)(\/|$)/;
    // Deleting a workspace is exercised in environments.test.ts.
    expect(
      t.unexercised(
        (route) => !execution.test(route) && route !== "DELETE /api/v1/tenants/:t/workspaces/:w",
      ),
    ).toEqual([]);
  });
});
