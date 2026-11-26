import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * Nobody gives what they do not hold, and a deploy that changes who holds what needs the
 * permission to say so (phase 35, round three).
 */

const PASSWORD = "a-good-long-password";

let t: TestApp;
let roles: Record<string, string>;
let tenant: string;
let dev: string;
let alice: Client; // tenant admin
const people: Record<string, { id: string; client: Client }> = {};

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});

function bundle(extra: BundleManifest[] = [], tag = "1"): Bundle {
  const manifests = [manifest("variable", "config/size", { default: tag }), ...extra];
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export {};",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;

async function deploy(as: Client, content: Bundle) {
  const uploaded = await as.post(`${ws()}/bundles`, content);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  return as.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
}

/** A custom role of the tenant, written by the tenant admin. */
async function role(name: string, permissions: string[]) {
  const made = await alice.post(`/tenants/${tenant}/roles`, { name, permissions });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
}

/** A member of the tenant who holds only these roles: at the tenant, or in the dev workspace. */
async function person(
  name: string,
  held: { roleId: string; workspace?: boolean }[],
): Promise<{ id: string; client: Client }> {
  const made = await alice.post(`/tenants/${tenant}/members`, {
    email: `${name}@grants.example`,
    name,
    password: PASSWORD,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  for (const one of held) {
    const bound = await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: made.body.id,
      roleId: one.roleId,
      ...(one.workspace ? { workspaceId: dev } : {}),
    });
    expect(bound.status, JSON.stringify(bound.body)).toBe(201);
  }
  const who = {
    id: made.body.id as string,
    client: await t.signIn(`${name}@grants.example`, PASSWORD),
  };
  people[name] = who;
  return who;
}

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((row) => [row.name, row.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "grants", name: "Grants" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const made = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@grants.example",
    name: "alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: made.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@grants.example", PASSWORD);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

describe("nobody gives a binding to a role they do not hold", () => {
  test("someone who holds only binding:write cannot bind tenant_admin, and is told which permission", async () => {
    const binder = await role("binder", ["binding:write", "binding:read"]);
    const bob = await person("bob", [{ roleId: binder }]);
    const refused = await bob.client.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: bob.id,
      roleId: roles.tenant_admin,
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.detail).toContain("*:*");
    // What they hold they may give: a second person gets the role bob holds.
    const carol = await person("carol", []);
    const given = await bob.client.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: carol.id,
      roleId: binder,
    });
    expect(given.status, JSON.stringify(given.body)).toBe(201);
  });

  test("a binding to a group or a service account is held to it too", async () => {
    const binder = await role("binder_two", ["binding:write", "group:write"]);
    const dave = await person("dave", [{ roleId: binder }]);
    const group = await alice.post(`/tenants/${tenant}/groups`, { name: "Ops" });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    const refused = await dave.client.post(`/tenants/${tenant}/bindings`, {
      principalType: "group",
      principalId: group.body.id,
      roleId: roles.tenant_admin,
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
  });

  test("a role held in one workspace is not held across the tenant, and is held there", async () => {
    const binder = await role("binder_ws", ["binding:write"]);
    const erin = await person("erin", [{ roleId: binder, workspace: true }]);
    const target = await person("target", []);
    const wide = await erin.client.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: target.id,
      roleId: binder,
    });
    expect(wide.status, JSON.stringify(wide.body)).toBe(403);
    const here = await erin.client.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: target.id,
      roleId: binder,
      workspaceId: dev,
    });
    expect(here.status, JSON.stringify(here.body)).toBe(201);
  });

  test("adding a member with roles in the same request is held to it", async () => {
    const binder = await role("binder_add", ["member:write", "binding:write"]);
    const fay = await person("fay", [{ roleId: binder }]);
    const refused = await fay.client.post(`/tenants/${tenant}/members`, {
      email: "newbie@grants.example",
      name: "newbie",
      password: PASSWORD,
      bindings: [{ roleId: roles.tenant_admin }],
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
  });
});

describe("what the built-in admins give every day", () => {
  test("a workspace admin gives viewer, developer and deployer in its workspace, and not in another", async () => {
    const wendy = await person("wendy", [
      { roleId: roles.workspace_admin as string, workspace: true },
    ]);
    for (const name of ["viewer", "developer", "deployer"] as const) {
      const someone = await person(`w-${name}`, []);
      const given = await wendy.client.post(`/tenants/${tenant}/bindings`, {
        principalType: "member",
        principalId: someone.id,
        roleId: roles[name] as string,
        workspaceId: dev,
      });
      expect(given.status, `${name}: ${JSON.stringify(given.body)}`).toBe(201);
    }
    const across = await wendy.client.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: wendy.id,
      roleId: roles.viewer,
    });
    expect(across.status).toBe(403);
  });

  test("a permission only its own name gives is given by someone who holds everything, and by nobody else", async () => {
    const production = await alice.post(`/tenants/${tenant}/roles`, {
      name: "production_keeper",
      permissions: ["workspace_production:write"],
    });
    expect(production.status, JSON.stringify(production.body)).toBe(201);
    const wide = await role("nearly_all", ["role:*", "binding:*", "workspace:*"]);
    const nils = await person("nils", [{ roleId: wide }]);
    const refused = await nils.client.post(`/tenants/${tenant}/roles`, {
      name: "production_taker",
      permissions: ["workspace_production:write"],
    });
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("workspace_production:write");
  });
});

describe("nobody writes a role that holds what they do not", () => {
  test("someone who holds only role:write cannot make a role of *:*, or widen one", async () => {
    const writer = await role("writer", ["role:write", "role:read"]);
    const gus = await person("gus", [{ roleId: writer }]);
    const refused = await gus.client.post(`/tenants/${tenant}/roles`, {
      name: "everything",
      permissions: ["*:*"],
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.detail).toContain("*:*");
    // A role of what they hold is theirs to make; widening it is not.
    const fine = await gus.client.post(`/tenants/${tenant}/roles`, {
      name: "narrow",
      permissions: ["role:write"],
    });
    expect(fine.status, JSON.stringify(fine.body)).toBe(201);
    const widen = await gus.client.patch(`/tenants/${tenant}/roles/${fine.body.id}`, {
      permissions: ["role:write", "secret:write"],
    });
    expect(widen.status, JSON.stringify(widen.body)).toBe(403);
    expect(widen.body.detail).toContain("secret:write");
    // Taking a permission away needs no more than it did.
    const narrower = await role("wide_for_trim", ["role:write", "secret:write"]);
    const trimmed = await gus.client.patch(`/tenants/${tenant}/roles/${narrower}`, {
      permissions: ["role:write"],
    });
    expect(trimmed.status, JSON.stringify(trimmed.body)).toBe(200);
  });

  test("a wildcard held is what it covers: binding:* covers binding:write, not the other way", async () => {
    const wild = await role("wild", ["role:write", "binding:*"]);
    const hal = await person("hal", [{ roleId: wild }]);
    const ok = await hal.client.post(`/tenants/${tenant}/roles`, {
      name: "binds_a_bit",
      permissions: ["binding:write"],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const narrow = await role("narrow_holder", ["role:write", "binding:write"]);
    const ida = await person("ida", [{ roleId: narrow }]);
    const refused = await ida.client.post(`/tenants/${tenant}/roles`, {
      name: "binds_all",
      permissions: ["binding:*"],
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
  });
});

describe("the other doors by which access comes to be", () => {
  test("adding a member to a group that holds more than the caller does is refused", async () => {
    const keeper = await role("group_keeper", ["group:write"]);
    const jo = await person("jo", [{ roleId: keeper }]);
    const kim = await person("kim", []);
    const group = await alice.post(`/tenants/${tenant}/groups`, { name: "Admins" });
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "group",
      principalId: group.body.id,
      roleId: roles.tenant_admin,
    });
    const refused = await jo.client.put(
      `/tenants/${tenant}/groups/${group.body.id}/members/${kim.id}`,
      {},
    );
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(
      (await alice.put(`/tenants/${tenant}/groups/${group.body.id}/members/${kim.id}`, {})).status,
    ).toBe(204);
    // A group that holds nothing is anyone's to fill.
    const empty = await alice.post(`/tenants/${tenant}/groups`, { name: "Empty" });
    expect(
      (await jo.client.put(`/tenants/${tenant}/groups/${empty.body.id}/members/${kim.id}`, {}))
        .status,
    ).toBe(204);
  });

  test("a key for a service account that holds more than the caller does is refused", async () => {
    const keeper = await role("account_keeper", ["service_account:write", "service_account:read"]);
    const lee = await person("lee", [{ roleId: keeper }]);
    const account = await alice.post(`/tenants/${tenant}/service-accounts`, { name: "Robot" });
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "service_account",
      principalId: account.body.id,
      roleId: roles.tenant_admin,
    });
    const refused = await lee.client.post(
      `/tenants/${tenant}/service-accounts/${account.body.id}/api-keys`,
      { name: "mine" },
    );
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    const mine = await alice.post(
      `/tenants/${tenant}/service-accounts/${account.body.id}/api-keys`,
      { name: "alices" },
    );
    expect(mine.status).toBe(201);
  });

  test("a role or a binding written as a resource is held to it", async () => {
    const author = await role("resource_author", ["role:write", "binding:write", "resource:write"]);
    const mo = await person("mo", [{ roleId: author, workspace: false }]);
    const refused = await mo.client.put(`${ws()}/resources/roles/grab`, {
      kind: "role",
      schemaVersion: 1,
      ownership: "ui",
      body: { name: "grab", permissions: ["*:*"] },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    const fine = await mo.client.put(`${ws()}/resources/roles/small`, {
      kind: "role",
      schemaVersion: 1,
      ownership: "ui",
      body: { name: "small", permissions: ["role:write"] },
    });
    expect(fine.status, JSON.stringify(fine.body)).toBeLessThan(300);
    const bound = await mo.client.put(`${ws()}/resources/bindings/grab`, {
      kind: "binding",
      schemaVersion: 1,
      ownership: "ui",
      body: {
        role: "tenant_admin",
        principal: { type: "member", email: "mo@grants.example" },
      },
    });
    expect(bound.status, JSON.stringify(bound.body)).toBe(403);
  });

  test("the identity provider's default role is held to it", async () => {
    const keeper = await role("sso_keeper", ["sso:write", "binding:write"]);
    const ned = await person("ned", [{ roleId: keeper }]);
    const refused = await ned.client.post(`/tenants/${tenant}/identity-providers`, {
      audience: "members",
      protocol: "oidc",
      name: "Directory",
      defaultRoleId: roles.tenant_admin,
    });
    // The role is refused before the provider's own settings are looked at.
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
  });
});

describe("a deploy that changes who holds what needs the permission to say so", () => {
  let deployer: { id: string; client: Client };
  let rolesAndDeploys: { id: string; client: Client };

  test("a deployer ships code that leaves roles and bindings as they are", async () => {
    deployer = await person("ci", [{ roleId: roles.deployer as string, workspace: true }]);
    const first = await deploy(
      alice,
      bundle([manifest("role", "roles/ops", { name: "ops", permissions: ["run:read"] })], "1"),
    );
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const again = await deploy(
      deployer.client,
      bundle([manifest("role", "roles/ops", { name: "ops", permissions: ["run:read"] })], "2"),
    );
    expect(again.status, JSON.stringify(again.body)).toBe(201);
  });

  test("a deployer cannot add, change or remove a role or a binding by deploying", async () => {
    const ops = manifest("role", "roles/ops", { name: "ops", permissions: ["run:read"] });
    const added = await deploy(
      deployer.client,
      bundle([ops, manifest("role", "roles/grab", { name: "grab", permissions: ["*:*"] })], "3"),
    );
    expect(added.status, JSON.stringify(added.body)).toBe(403);
    expect(added.body.detail).toMatch(/role/);
    expect(added.body.detail).toContain("role:write");

    const changed = await deploy(
      deployer.client,
      bundle([manifest("role", "roles/ops", { name: "ops", permissions: ["*:*"] })], "3"),
    );
    expect(changed.status, JSON.stringify(changed.body)).toBe(403);

    const bound = await deploy(
      deployer.client,
      bundle(
        [
          ops,
          manifest("binding", "bindings/self", {
            role: "tenant_admin",
            principal: { type: "member", email: "ci@grants.example" },
          }),
        ],
        "3",
      ),
    );
    expect(bound.status, JSON.stringify(bound.body)).toBe(403);
    expect(bound.body.detail).toContain("binding:write");

    const removed = await deploy(deployer.client, bundle([], "3"));
    expect(removed.status, JSON.stringify(removed.body)).toBe(403);
    expect(removed.body.detail).toContain("role:write");
    // Nothing of it was deployed.
    const roleNow = await t.db
      .selectFrom("role")
      .select("permissions")
      .where("name", "=", "ops")
      .where("workspace_id", "=", dev)
      .executeTakeFirstOrThrow();
    expect(roleNow.permissions).toEqual(["run:read"]);
  });

  test("someone who may write roles may deploy them, but only up to what they hold", async () => {
    const both = await role("deploy_and_roles", ["role:write", "binding:write", "run:read"]);
    rolesAndDeploys = await person("shipper", [
      { roleId: roles.deployer as string, workspace: true },
      { roleId: both, workspace: true },
    ]);
    const ops = manifest("role", "roles/ops", { name: "ops", permissions: ["run:read"] });
    const grab = await deploy(
      rolesAndDeploys.client,
      bundle([manifest("role", "roles/ops", { name: "ops", permissions: ["*:*"] })], "4"),
    );
    expect(grab.status, JSON.stringify(grab.body)).toBe(403);
    expect(grab.body.detail).toContain("*:*");
    const bind = await deploy(
      rolesAndDeploys.client,
      bundle(
        [
          ops,
          manifest("binding", "bindings/self", {
            role: "tenant_admin",
            principal: { type: "member", email: "shipper@grants.example" },
          }),
        ],
        "4",
      ),
    );
    expect(bind.status, JSON.stringify(bind.body)).toBe(403);
    const fine = await deploy(
      rolesAndDeploys.client,
      bundle(
        [manifest("role", "roles/ops", { name: "ops", permissions: ["run:read", "role:write"] })],
        "4",
      ),
    );
    expect(fine.status, JSON.stringify(fine.body)).toBe(201);
  });
});

describe("the other ways a bundle or an access change comes to be the one that holds", () => {
  test("a change of the tenant's access from a repository is held to it, and is a plan's refusal too", async () => {
    const releaser = await role("access_releaser", ["access:write", "access:read"]);
    const pat = await person("pat", [{ roleId: releaser }]);
    const now = (await alice.get(`/tenants/${tenant}/access`)).body.resources as Any[];
    const asked = [
      ...now,
      { kind: "tenant_role", key: "everything", body: { permissions: ["*:*"] } },
    ];
    const refused = await pat.client.post(`/tenants/${tenant}/access/releases`, {
      resources: asked,
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.detail).toContain("*:*");
    const planned = await pat.client.post(`/tenants/${tenant}/access/plan`, { resources: asked });
    expect(planned.body.possible, JSON.stringify(planned.body)).toBe(false);
    expect(planned.body.refusal.detail).toContain("*:*");
    // What they may give, they release.
    const fine = await pat.client.post(`/tenants/${tenant}/access/releases`, {
      resources: [
        ...now,
        { kind: "tenant_role", key: "reads_access", body: { permissions: ["access:read"] } },
      ],
    });
    expect(fine.status, JSON.stringify(fine.body)).toBe(201);
  });

  test("a promotion that changes who holds what in the target needs the permission there", async () => {
    const make = async (slug: string) =>
      (await alice.post(`/tenants/${tenant}/workspaces`, { slug, name: slug, type: "dev" })).body
        .id as string;
    const from = await make("promote-from");
    const to = await make("promote-to");
    const linked = await alice.patch(`/tenants/${tenant}/workspaces/${from}`, {
      linkedWorkspaceId: to,
    });
    expect(linked.status).toBe(200);
    const base = `/tenants/${tenant}/workspaces/${from}`;
    const uploaded = await alice.post(
      `${base}/bundles`,
      bundle([manifest("role", "roles/grab", { name: "grab_p", permissions: ["*:*"] })], "9"),
    );
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    expect((await alice.post(`${base}/deployments`, { bundleId: uploaded.body.id })).status).toBe(
      201,
    );
    const promoter = await person("promoter", []);
    for (const place of [from, to]) {
      await alice.post(`/tenants/${tenant}/bindings`, {
        workspaceId: place,
        principalType: "member",
        principalId: promoter.id,
        roleId: roles.deployer as string,
      });
    }
    const refused = await promoter.client.post(`${base}/promotions`, {});
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.detail).toContain("role:write");
    const done = await alice.post(`${base}/promotions`, {});
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    // Promoting it again leaves the target's roles as they are: the deployer may.
    const again = await promoter.client.post(`${base}/promotions`, {});
    expect(again.status, JSON.stringify(again.body)).toBeLessThan(300);
  });

  test("a clone that would make roles in a new workspace needs what making them needs", async () => {
    const cloner = await role("workspace_cloner", ["workspace:write", "workspace:read"]);
    const quin = await person("quin", [{ roleId: cloner }]);
    const asked = await quin.client.post(`${ws()}/clones`, { slug: "dev-copy", name: "Dev copy" });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    let done = asked;
    for (let i = 0; i < 100 && ["queued", "running"].includes(done.body.status); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      done = await alice.get(`/tenants/${tenant}/workspace-clones/${asked.body.id}`);
    }
    expect(done.body.status, JSON.stringify(done.body)).toBe("failed");
    expect(done.body.error).toContain("role:write");
  });
});
