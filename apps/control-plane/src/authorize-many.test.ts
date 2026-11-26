import { newId } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Principal } from "./kernel/audit.js";
import { check, checkMany, type Target } from "./kernel/authorize.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * `checkMany` is `check` for a list: the same answer for every place, in as many statements
 * however long the list (STR-04 of phase 35). Every kind of principal against every kind of place.
 */

const PASSWORD = "a-good-long-password";
let t: TestApp;
let roles: Record<string, string>;
const ids: Record<string, string> = {};
const principals: Record<string, Principal> = {};
let targets: Target[] = [];

async function resource(tenantId: string, workspaceId: string, path: string) {
  const id = newId();
  await t.db
    .insertInto("resource")
    .values({
      id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      kind: "script",
      schema_version: 1,
      key: path,
      path,
      ownership: "code",
      version: 1,
      body: JSON.stringify({}),
      updated_at: new Date(),
    } as never)
    .execute();
  return id;
}

async function member(tenantId: string, name: string) {
  const made = await t.admin.post(`/tenants/${tenantId}/members`, {
    email: `${name}@many.example`,
    name,
    password: PASSWORD,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
}

async function bind(tenantId: string, body: Record<string, unknown>) {
  const bound = await t.admin.post(`/tenants/${tenantId}/bindings`, body);
  expect(bound.status, JSON.stringify(bound.body)).toBe(201);
  return bound.body.id as string;
}

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const acme = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id as string;
  const globex = (await t.admin.post("/tenants", { slug: "globex", name: "Globex" })).body
    .id as string;
  const lone = (await t.admin.post("/tenants", { slug: "lone", name: "Lone" })).body.id as string;
  Object.assign(ids, { acme, globex, lone });
  // The operator holds an access grant in acme (and so is an operator with a grant there).
  const grant = await t.admin.post(`/tenants/${acme}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  expect(grant.status).toBe(201);
  // And in globex, but not in lone.
  expect(
    (
      await t.admin.post(`/tenants/${globex}/access-grants`, {
        reason: "Setup",
        roleId: roles.tenant_admin,
      })
    ).status,
  ).toBe(201);
  const workspace = async (tenantId: string, slug: string) => {
    const made = await t.admin.post(`/tenants/${tenantId}/workspaces`, {
      slug,
      name: slug,
      type: "production",
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    return made.body.id as string;
  };
  ids.prod = await workspace(acme, "main");
  ids.dev = await workspace(acme, "dev");
  ids.gw = await workspace(globex, "main");
  ids.r1 = await resource(acme, ids.dev as string, "a/one");
  ids.r2 = await resource(acme, ids.dev as string, "a/two");
  ids.r3 = await resource(acme, ids.prod as string, "a/three");
  ids.gr = await resource(globex, ids.gw as string, "g/one");

  const person = async (name: string, tenantId = acme) => {
    ids[name] = await member(tenantId, name);
    principals[name] = { type: "member", id: ids[name] as string };
  };
  await person("alice");
  await bind(acme, { principalType: "member", principalId: ids.alice, roleId: roles.tenant_admin });
  await person("bob");
  await bind(acme, {
    workspaceId: ids.dev,
    principalType: "member",
    principalId: ids.bob,
    roleId: roles.developer,
  });
  await person("rita");
  await bind(acme, {
    workspaceId: ids.dev,
    resourceId: ids.r1,
    principalType: "member",
    principalId: ids.rita,
    roleId: roles.developer,
  });
  await person("nobody");
  await person("sue");
  await bind(acme, { principalType: "member", principalId: ids.sue, roleId: roles.tenant_admin });
  await bind(acme, {
    workspaceId: ids.dev,
    principalType: "member",
    principalId: ids.sue,
    roleId: roles.developer,
  });
  const suspended = await t.admin.patch(`/tenants/${acme}/members/${ids.sue}`, {
    suspended: true,
  });
  expect(suspended.status, JSON.stringify(suspended.body)).toBe(200);
  // Someone with standing in globex only, and someone in both through a group-free binding.
  await person("gina", globex);
  await bind(globex, {
    principalType: "member",
    principalId: ids.gina,
    roleId: roles.tenant_admin,
  });
  // Anyone, bound at acme's dev workspace and at one resource of globex.
  await bind(acme, { workspaceId: ids.dev, principalType: "anonymous", roleId: roles.viewer });
  await bind(globex, { principalType: "anonymous", roleId: roles.developer });

  // Operators: the instance's admin (with a grant in acme), one with none, and one whose
  // grant outlived being an operator.
  const operator = async (name: string) => {
    const made = await t.admin.post("/members", {
      email: `${name}@ops.example`,
      name,
      password: PASSWORD,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const bound = await t.admin.post("/bindings", {
      memberId: made.body.id,
      roleId: roles.operator_admin,
    });
    expect(bound.status).toBe(201);
    ids[name] = made.body.id;
    principals[name] = { type: "member", id: made.body.id };
    return {
      client: (await t.signIn(`${name}@ops.example`, PASSWORD)) as Client,
      binding: bound.body.id as string,
    };
  };
  const admin = await t.db
    .selectFrom("member")
    .select("id")
    .where("email", "=", "operator@example.com")
    .executeTakeFirstOrThrow();
  principals.operatorWithGrant = { type: "member", id: admin.id };
  await operator("operatorPlain");
  const ghost = await operator("operatorGhost");
  const ghostGrant = await ghost.client.post(`/tenants/${acme}/access-grants`, {
    reason: "Looking",
    roleId: roles.tenant_admin,
  });
  expect(ghostGrant.status, JSON.stringify(ghostGrant.body)).toBe(201);
  await t.db.deleteFrom("binding").where("id", "=", ghost.binding).execute();

  // A service account of acme with a tenant-wide viewer, one of globex with nothing.
  const sa = async (tenantId: string, name: string) => {
    const made = await t.admin.post(`/tenants/${tenantId}/service-accounts`, { name });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    return made.body.id as string;
  };
  const robot = await sa(acme, "robot");
  await bind(acme, { principalType: "service_account", principalId: robot, roleId: roles.viewer });
  principals.robot = { type: "service_account", id: robot, tenantId: acme };
  principals.robotAtDev = { type: "service_account", id: robot, tenantId: acme };
  principals.robotBare = {
    type: "service_account",
    id: await sa(globex, "bare"),
    tenantId: globex,
  };
  principals.anonymous = { type: "anonymous", id: null };
  principals.system = { type: "system", id: null };
  principals.endUser = { type: "end_user", id: newId(), tenantId: acme };
  principals.endUserElsewhere = { type: "end_user", id: newId(), tenantId: globex };
  // A member signed in to acme's apps only: holds nothing but what apps use, and only there.
  principals.bobInApps = { ...(principals.bob as Principal), appTenantId: acme };
  principals.aliceInApps = { ...(principals.alice as Principal), appTenantId: acme };
  principals.aliceInGlobexApps = { ...(principals.alice as Principal), appTenantId: globex };

  targets = [
    {},
    { orInstance: true },
    { tenantId: acme },
    { tenantId: acme, orInstance: true },
    { tenantId: acme, workspaceId: ids.dev },
    { tenantId: acme, workspaceId: ids.prod },
    { tenantId: acme, workspaceId: ids.dev, resourceId: ids.r1 },
    { tenantId: acme, workspaceId: ids.dev, resourceId: ids.r2 },
    { tenantId: acme, workspaceId: ids.prod, resourceId: ids.r3 },
    // A resource named with no workspace, and a workspace of another tenant named for this one.
    { tenantId: acme, resourceId: ids.r1 },
    { tenantId: acme, workspaceId: ids.gw },
    { tenantId: globex },
    { tenantId: globex, orInstance: true },
    { tenantId: globex, workspaceId: ids.gw },
    { tenantId: globex, workspaceId: ids.gw, resourceId: ids.gr },
    { tenantId: lone },
    { tenantId: lone, orInstance: true },
    { tenantId: newId() },
    // The same place twice.
    { tenantId: acme, workspaceId: ids.dev },
  ];
}, 120_000);

afterAll(async () => {
  await t?.stop();
});

const PERMISSIONS = [
  "tenant:write",
  "tenant:read",
  "workspace:read",
  "secret:write",
  "run:write",
  "flow_run:write",
  "app:read",
  "data:read",
  "member:read",
  "instance:write",
];

describe("checkMany answers as check does", () => {
  test("for every principal, permission and place", async () => {
    let compared = 0;
    for (const [name, principal] of Object.entries(principals)) {
      for (const permission of PERMISSIONS) {
        const together = await checkMany(t.db, principal, permission, targets);
        expect(together).toHaveLength(targets.length);
        for (const [index, target] of targets.entries()) {
          const alone = await check(t.db, principal, permission, target);
          expect(together[index], `${name} ${permission} ${JSON.stringify(target)}`).toEqual(alone);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(2000);
  }, 300_000);

  test("the fixtures reach every kind of answer", async () => {
    const answer = async (name: string, permission: string, target: Target) =>
      (await checkMany(t.db, principals[name] as Principal, permission, [target]))[0];
    const { acme, dev, r1, r2 } = ids;
    // Bound at one resource: that resource only.
    expect(
      (await answer("rita", "run:write", { tenantId: acme, workspaceId: dev, resourceId: r1 }))
        ?.allowed,
    ).toBe(true);
    expect(
      (await answer("rita", "run:write", { tenantId: acme, workspaceId: dev, resourceId: r2 }))
        ?.allowed,
    ).toBe(false);
    // Bound at one workspace.
    expect((await answer("bob", "run:write", { tenantId: acme, workspaceId: dev }))?.allowed).toBe(
      true,
    );
    expect(
      (await answer("bob", "run:write", { tenantId: acme, workspaceId: ids.prod }))?.allowed,
    ).toBe(false);
    // Suspended: holds nothing, and is still known to the tenant.
    expect(await answer("sue", "workspace:read", { tenantId: acme })).toEqual({
      allowed: false,
      related: true,
    });
    // An operator with a grant, one without, and one whose grant ended with being an operator.
    expect(
      (await answer("operatorWithGrant", "member:read", { tenantId: acme }))?.accessGrantId,
    ).toBeDefined();
    expect(await answer("operatorPlain", "member:read", { tenantId: ids.lone })).toEqual({
      allowed: false,
      related: false,
    });
    expect((await answer("operatorGhost", "member:read", { tenantId: acme }))?.allowed).toBe(false);
    expect(
      (await answer("operatorPlain", "tenant:write", { tenantId: acme, orInstance: true }))
        ?.allowed,
    ).toBe(true);
    // A member of another tenant is told nothing of this one.
    expect(await answer("gina", "member:read", { tenantId: ids.lone })).toEqual({
      allowed: false,
      related: false,
    });
    // Nothing held but a membership.
    expect(await answer("nobody", "member:read", { tenantId: acme })).toEqual({
      allowed: false,
      related: true,
    });
    // Anyone's binding gives an app permission, and not a tenant's members.
    expect(
      (await answer("anonymous", "app:read", { tenantId: acme, workspaceId: dev }))?.allowed,
    ).toBe(true);
    expect(
      (await answer("anonymous", "member:read", { tenantId: acme, workspaceId: dev }))?.allowed,
    ).toBe(false);
    // A signed-in app session holds only what apps use, and only in its tenant.
    expect((await answer("aliceInApps", "member:read", { tenantId: acme }))?.allowed).toBe(false);
    expect((await answer("aliceInApps", "app:read", { tenantId: acme }))?.allowed).toBe(true);
    expect(await answer("aliceInGlobexApps", "app:read", { tenantId: acme })).toEqual({
      allowed: false,
      related: false,
    });
    // A service account has no standing in another tenant.
    expect(await answer("robot", "workspace:read", { tenantId: ids.globex })).toEqual({
      allowed: false,
      related: false,
    });
  });

  test("an empty list asks nothing", async () => {
    let statements = 0;
    const counting = t.db.withPlugin({
      transformQuery(args) {
        statements += 1;
        return args.node;
      },
      transformResult: async (args) => args.result,
    });
    expect(await checkMany(counting, principals.alice as Principal, "tenant:write", [])).toEqual(
      [],
    );
    expect(statements).toBe(0);
  });
});

describe("checkMany reads a bounded number of statements", () => {
  test("however many places are asked", async () => {
    let statements = 0;
    const counting = t.db.withPlugin({
      transformQuery(args) {
        statements += 1;
        return args.node;
      },
      transformResult: async (args) => args.result,
    });
    const tenants = Array.from({ length: 60 }, (_, index) => ({
      tenantId: index % 2 === 0 ? ids.acme : newId(),
      orInstance: true,
    }));
    for (const name of ["alice", "nobody", "operatorWithGrant", "robot", "sue"]) {
      const principal = principals[name] as Principal;
      statements = 0;
      await checkMany(counting, principal, "tenant:write", tenants.slice(0, 2));
      const few = statements;
      statements = 0;
      await checkMany(counting, principal, "tenant:write", tenants);
      expect(statements, name).toBeLessThanOrEqual(3);
      expect(statements, name).toBe(few);
      statements = 0;
      await checkMany(counting, principal, "run:write", targets);
      expect(statements, name).toBeLessThanOrEqual(3);
    }
  });
});

describe("the list of tenants", () => {
  /** The statements a request sends, counted by a plugin put on the platform's own connection. */
  async function statementsFor(client: Client, url: string) {
    let statements = 0;
    const plugin = {
      transformQuery(args: { node: unknown }) {
        statements += 1;
        return args.node;
      },
      transformResult: async (args: { result: unknown }) => args.result,
    };
    const plugins = (t.kernel.db.getExecutor() as unknown as { plugins: unknown[] }).plugins;
    plugins.push(plugin);
    try {
      const response = await client.get(url);
      expect(response.status).toBe(200);
      return { statements, body: response.body };
    } finally {
      plugins.splice(plugins.indexOf(plugin), 1);
    }
  }

  test("says per tenant whether the caller may rename it, in statements that do not grow with the tenants", async () => {
    const alice = await t.signIn("alice@many.example", PASSWORD);
    const bob = await t.signIn("bob@many.example", PASSWORD);
    const flags = (body: { items: { slug: string; mayRename: boolean }[] }) =>
      Object.fromEntries(body.items.map((one) => [one.slug, one.mayRename]));
    const before = {
      operator: await statementsFor(t.admin, "/tenants"),
      alice: await statementsFor(alice, "/tenants"),
      bob: await statementsFor(bob, "/tenants"),
    };
    console.log(
      "tenants list statements, 3 tenants",
      before.operator.statements,
      before.alice.statements,
    );
    expect(flags(before.operator.body)).toMatchObject({ acme: true, globex: true, lone: true });
    // A tenant admin may change the tenant, a member bound to nothing may not.
    expect(flags(before.alice.body)).toEqual({ acme: true });
    expect(flags(before.bob.body)).toEqual({ acme: false });
    for (let index = 0; index < 12; index += 1) {
      await t.admin.post("/tenants", { slug: `more-${index}`, name: `More ${index}` });
    }
    const after = {
      operator: await statementsFor(t.admin, "/tenants"),
      alice: await statementsFor(alice, "/tenants"),
    };
    console.log(
      "tenants list statements, 15 tenants",
      after.operator.statements,
      after.alice.statements,
    );
    expect(after.operator.body.items.length).toBe(15);
    expect(flags(after.operator.body)["more-3"]).toBe(true);
    expect(after.operator.statements).toBe(before.operator.statements);
    expect(after.alice.statements).toBe(before.alice.statements);
  });
});
