import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { check, explainAccess, grants, reaches } from "./kernel/authorize.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client; // tenant admin: may promote
let dave: Client; // developer: may not
let daveId: string;
let roles: Record<string, string>;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;
const variable = (path: string, description: string) =>
  alice.put(`${ws()}/drafts/${path}`, {
    kind: "variable",
    schemaVersion: 1,
    body: { description },
  });
const deployDev = async () => {
  const deployed = await alice.post(`${ws()}/changes/deploy`, {});
  expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);
};

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = async (email: string, role: string) => {
    const created = await t.admin.post(`/tenants/${tenant}/members`, {
      email,
      name: email.split("@")[0],
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: created.body.id,
      roleId: roles[role],
    });
    return { client: await t.signIn(email, PASSWORD), id: created.body.id as string };
  };
  alice = (await member("alice@acme.example", "tenant_admin")).client;
  const developer = await member("dave@acme.example", "developer");
  dave = developer.client;
  daveId = developer.id;
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "prod",
      name: "Production",
      type: "production",
    })
  ).body.id;
  await alice.patch(ws(dev), { linkedWorkspaceId: prod });
  await variable("orders/size", "How many");
  await variable("orders/tone", "How it sounds");
  await deployDev();
  expect((await alice.post(`${ws()}/promotions`, {})).status).toBe(201);
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

describe("asking for a promotion", () => {
  let asked: string;

  test("one who may not promote is told so, and asks; the promoter sees it waiting", async () => {
    await variable("orders/size", "How many, at most");
    await deployDev();
    const preview = (await dave.get(`${ws()}/promotion-preview`)).body;
    expect(preview).toMatchObject({ canPromote: false, request: null });
    expect((await alice.get(`${ws()}/promotion-preview`)).body.canPromote).toBe(true);
    // Promoting directly is refused, as before.
    expect((await dave.post(`${ws()}/promotions`, {})).status).toBe(403);

    const request = await dave.post(`${ws()}/promotion-requests`, { note: "The new size limit" });
    expect(request.status, JSON.stringify(request.body)).toBe(201);
    asked = request.body.id;
    expect(request.body).toMatchObject({
      status: "pending",
      note: "The new size limit",
      source: { id: dev, name: "Dev" },
      target: { id: prod, name: "Production" },
      requestedBy: { type: "member", name: "dave" },
      mine: true,
      mayDecide: false,
    });
    expect((await dave.get(`${ws()}/promotion-preview`)).body.request).toMatchObject({
      id: asked,
      status: "pending",
    });
    // The promoter's summary counts it, and their list has it to decide.
    expect((await alice.get(`/tenants/${tenant}/summary`)).body.promotionRequests).toBe(1);
    expect((await dave.get(`/tenants/${tenant}/summary`)).body.promotionRequests).toBeNull();
    const waiting = (await alice.get(`/tenants/${tenant}/promotion-requests?status=pending`)).body
      .items;
    expect(waiting).toEqual([expect.objectContaining({ id: asked, mayDecide: true, mine: false })]);
    // One who may promote asks no one.
    expect((await alice.post(`${ws()}/promotion-requests`, {})).status).toBe(409);
  });

  test("asking again replaces it; the one who asked may withdraw it, and no one else", async () => {
    const again = await dave.post(`${ws()}/promotion-requests`, { note: "With the tone too" });
    const replaced = await t.db
      .selectFrom("promotion_request")
      .select("status")
      .where("id", "=", asked)
      .executeTakeFirstOrThrow();
    expect(replaced.status).toBe("superseded");
    expect(
      (await alice.delete(`/tenants/${tenant}/promotion-requests/${again.body.id}`)).status,
    ).toBe(404);
    expect(
      (await dave.delete(`/tenants/${tenant}/promotion-requests/${again.body.id}`)).status,
    ).toBe(204);
    expect(
      (await dave.delete(`/tenants/${tenant}/promotion-requests/${again.body.id}`)).status,
    ).toBe(409);
    asked = (await dave.post(`${ws()}/promotion-requests`, { note: "Third time" })).body.id;
  });

  test("is decided by a promoter: what was asked for is promoted, though dev moved on since", async () => {
    // Dev deploys again after asking: the request still names what it asked for.
    const pinned = (await alice.get(`/tenants/${tenant}/promotion-requests?status=pending`)).body
      .items[0];
    await variable("orders/tone", "How it sounds, later");
    await deployDev();
    const moved = (await alice.get(`/tenants/${tenant}/promotion-requests?status=pending`)).body
      .items[0];
    expect(moved.sourceVersionNow).toBeGreaterThan(moved.version);

    const preview = await alice.get(`/tenants/${tenant}/promotion-requests/${asked}/preview`);
    expect(preview.body).toMatchObject({ possible: true, bundle: { version: pinned.version } });
    // A developer cannot decide it, and declining needs a reason.
    expect(
      (
        await dave.post(`/tenants/${tenant}/promotion-requests/${asked}/decision`, {
          decision: "promote",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await alice.post(`/tenants/${tenant}/promotion-requests/${asked}/decision`, {
          decision: "decline",
        })
      ).status,
    ).toBe(400);

    const decided = await alice.post(`/tenants/${tenant}/promotion-requests/${asked}/decision`, {
      decision: "promote",
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    expect(decided.body).toMatchObject({ status: "promoted", decidedBy: { name: "alice" } });
    // Production runs the bundle asked for, not the one dev runs now.
    const prodNow = (await alice.get(`${ws(prod)}/resources/orders/tone`)).body;
    expect(prodNow.body.description).toBe("How it sounds");
    expect((await alice.get(`${ws(prod)}/resources/orders/size`)).body.body.description).toBe(
      "How many, at most",
    );
    expect(
      (
        await alice.post(`/tenants/${tenant}/promotion-requests/${asked}/decision`, {
          decision: "promote",
        })
      ).status,
    ).toBe(409);
    expect((await dave.get(`${ws()}/promotion-preview`)).body.request).toMatchObject({
      status: "promoted",
      decidedBy: { name: "alice" },
    });
  });

  test("a declined request says why, to the one who asked", async () => {
    const request = (await dave.post(`${ws()}/promotion-requests`, {})).body.id;
    const declined = await alice.post(`/tenants/${tenant}/promotion-requests/${request}/decision`, {
      decision: "decline",
      comment: "Wait for Monday",
    });
    expect(declined.body).toMatchObject({ status: "declined", comment: "Wait for Monday" });
    expect((await dave.get(`/tenants/${tenant}/promotion-requests`)).body.items[0]).toMatchObject({
      id: request,
      status: "declined",
      comment: "Wait for Monday",
    });
    const audit = await t.db
      .selectFrom("audit_entry")
      .select("action")
      .where("action", "like", "promotion.%")
      .execute();
    expect(new Set(audit.map((entry) => entry.action))).toEqual(
      new Set([
        "promotion.requested",
        "promotion.request_withdrawn",
        "promotion.request_promoted",
        "promotion.request_declined",
      ]),
    );
  });
});

describe("drift", () => {
  test("after a dev deploy lists exactly what changed, with what differs", async () => {
    await alice.post(`${ws()}/promotions`, {});
    const synced = (await alice.get(`${ws()}/drift`)).body;
    expect(synced.counts).toEqual({ in_sync: 2, changed: 0, only_here: 0, only_there: 0 });

    await variable("orders/size", "How many, at the most");
    await variable("orders/new", "Brand new");
    await deployDev();
    const drift = (await alice.get(`${ws()}/drift`)).body;
    expect(drift.counts).toEqual({ in_sync: 1, changed: 1, only_here: 1, only_there: 0 });
    const changed = drift.items.filter((item: { state: string }) => item.state !== "in_sync");
    expect(changed.map((item: { path: string; state: string }) => [item.path, item.state])).toEqual(
      [
        ["orders/new", "only_here"],
        ["orders/size", "changed"],
      ],
    );
    expect(changed[1].about.length).toBeGreaterThan(0);
    expect(drift.target).toMatchObject({ id: prod, name: "Production" });

    const one = (await alice.get(`${ws()}/drift/orders/size`)).body;
    expect(one).toMatchObject({
      state: "changed",
      here: { description: "How many, at the most" },
      there: { description: "How many, at most" },
    });
    expect((await alice.get(`${ws()}/drift/orders/new`)).body.there).toBeNull();
    expect((await alice.get(`${ws()}/drift/nothing/here`)).status).toBe(404);
    // A developer may read it; a workspace linked nowhere has nothing to compare.
    expect((await dave.get(`${ws()}/drift`)).status).toBe(200);
    expect((await alice.get(`${ws(prod)}/drift`)).status).toBe(409);
  });
});

describe("effective permissions", () => {
  let engineers: string;
  let resourceId: string;

  test("say what gives each permission: direct, through a group, at a workspace or one resource", async () => {
    engineers = (await alice.post(`/tenants/${tenant}/groups`, { name: "Engineers" })).body.id;
    await alice.put(`/tenants/${tenant}/groups/${engineers}/members/${daveId}`, {});
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "group",
      principalId: engineers,
      roleId: roles.deployer,
      workspaceId: dev,
    });
    await alice.put(`${ws()}/drafts/orders/handle`, {
      kind: "flow",
      schemaVersion: 1,
      body: {
        nodes: {
          start: { type: "trigger", trigger: { type: "manual" } },
          note: { type: "set", values: { said: "'hi'" } },
        },
        edges: [{ from: "start", to: "note" }],
      },
    });
    await deployDev();
    resourceId = (await alice.get(`${ws()}/resources/orders/handle`)).body.id;
    const bound = await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: daveId,
      roleId: roles.agent_runner,
      workspaceId: dev,
      resourceId,
    });
    expect(bound.status, JSON.stringify(bound.body)).toBe(201);
    const shown = await alice.get(`/tenants/${tenant}/access/member/${daveId}`);
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    const { principal, sources, permissions } = shown.body;
    expect(principal).toMatchObject({
      name: "dave",
      suspended: false,
      groups: [{ id: engineers, name: "Engineers" }],
    });
    const byRole = (name: string) =>
      sources.find((source: { role: { name: string } }) => source.role.name === name);
    expect(byRole("developer")).toMatchObject({
      scope: { type: "tenant" },
      through: { type: "direct" },
    });
    expect(byRole("deployer")).toMatchObject({
      scope: { type: "workspace", workspaceId: dev, workspaceName: "Dev" },
      through: { type: "group", id: engineers, name: "Engineers" },
    });
    expect(byRole("agent_runner")).toMatchObject({
      scope: { type: "resource", resourceId, kind: "flow", path: "orders/handle" },
    });
    // Each permission names the sources that give it; wildcards are opened up.
    const deployment = permissions.find(
      (one: { permission: string }) => one.permission === "deployment:write",
    );
    expect(deployment.sources).toEqual([byRole("deployer").id]);
    expect(
      permissions.find((one: { permission: string }) => one.permission === "secret:read").sources,
    ).toEqual([byRole("developer").id, byRole("deployer").id]);
    // Promoting is held only where the deployer role is, in dev: not in production.
    const promoting = permissions.find(
      (one: { permission: string }) => one.permission === "promotion:write",
    );
    for (const id of promoting?.sources ?? []) {
      const source = sources.find((one: { id: string }) => one.id === id);
      expect(source.scope).toMatchObject({ type: "workspace", workspaceId: dev });
    }
  });

  test("agree with the permission check, permission by permission and place by place", async () => {
    const principal = { type: "member" as const, id: daveId };
    const sources = await explainAccess(t.db, principal, tenant);
    const targets = [
      { tenantId: tenant },
      { tenantId: tenant, workspaceId: dev },
      { tenantId: tenant, workspaceId: prod },
      { tenantId: tenant, workspaceId: dev, resourceId },
    ];
    for (const permission of [
      "deployment:write",
      "secret:read",
      "secret:write",
      "run:write",
      "flow_run:write",
      "promotion:write",
      "member:write",
    ]) {
      for (const target of targets) {
        const decided = await check(t.db, principal, permission, target);
        const explained = sources.some(
          (source) =>
            source.counts && grants(source.role.permissions, permission) && reaches(source, target),
        );
        expect([permission, target, decided.allowed]).toEqual([permission, target, explained]);
      }
    }
  });

  test("a suspended member's bindings are shown and do not count; an operator's grant does", async () => {
    await alice.patch(`/tenants/${tenant}/members/${daveId}`, { suspended: true });
    const sources = await explainAccess(t.db, { type: "member", id: daveId }, tenant);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((source) => !source.counts)).toBe(true);
    expect(
      (await alice.get(`/tenants/${tenant}/access/member/${daveId}`)).body.principal.suspended,
    ).toBe(true);
    await alice.patch(`/tenants/${tenant}/members/${daveId}`, { suspended: false });

    const operator = (await t.admin.get("/me")).body.principal.id as string;
    const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
      reason: "Looking at a fault",
      roleId: roles.viewer,
    });
    const shown = (await alice.get(`/tenants/${tenant}/access/member/${operator}`)).body;
    expect(shown.sources).toEqual([
      expect.objectContaining({
        source: "access_grant",
        id: grant.body.id,
        role: expect.objectContaining({ name: "viewer" }),
        expiresAt: expect.any(String),
        counts: true,
      }),
    ]);
    await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  });

  test("is for those who may read bindings, and for a member about themselves", async () => {
    expect((await dave.get(`/tenants/${tenant}/access/member/${daveId}`)).status).toBe(200);
    const aliceId = (await alice.get("/me")).body.principal.id;
    expect((await dave.get(`/tenants/${tenant}/access/member/${aliceId}`)).status).toBe(200);
    // A developer holds *:read, binding:read included. A viewer of another tenant does not.
    const other = (await t.admin.post("/tenants", { slug: "globex", name: "Globex" })).body.id;
    expect((await alice.get(`/tenants/${other}/access/member/${daveId}`)).status).toBe(404);
    expect(
      (await alice.get(`/tenants/${tenant}/access/member/01a1e000-0000-7000-8000-000000000000`))
        .status,
    ).toBe(404);
    const account = (await alice.post(`/tenants/${tenant}/service-accounts`, { name: "bot" })).body
      .id;
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "service_account",
      principalId: account,
      roleId: roles.viewer,
      workspaceId: prod,
    });
    const bot = (await alice.get(`/tenants/${tenant}/access/service_account/${account}`)).body;
    expect(bot.sources).toEqual([
      expect.objectContaining({ scope: expect.objectContaining({ workspaceId: prod }) }),
    ]);
  });
});

describe("the write path", () => {
  test("the promotion request routes were exercised and audited", () => {
    expect(t.unexercised((route) => route.includes("/promotion-requests"))).toEqual([]);
    expect(t.unaudited).toEqual([]);
  });
});
