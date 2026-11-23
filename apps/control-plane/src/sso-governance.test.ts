import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generate } from "selfsigned";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dns } from "./kernel/apps/challenge.js";
import { writeAudit } from "./kernel/audit.js";
import { resolvePerson } from "./kernel/sso/people.js";
import { findProvider } from "./kernel/sso/providers.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";

let t: TestApp;
let tenant: string;
let alice: Client;
let sam: Client;
let roles: Record<string, string>;
let certificate: string;
/** What DNS answers in these tests. */
const txt = new Map<string, string>();
let staff: string;
let staffToken: string;

const providers = () => `/tenants/${tenant}/identity-providers`;
const provisioning = (provider: string) => `/tenants/${tenant}/provisioning/${provider}`;

async function seed(slug: string, email: string) {
  const id = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
  const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${id}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${id}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
  return { id, client: await t.signIn(email, PASSWORD), memberId: member.body.id as string };
}

/** A member who holds only the permissions named, and can sign in. */
async function limited(email: string, permissions: string[]) {
  const role = await alice.post(`/tenants/${tenant}/roles`, {
    name: email.split("@")[0]?.replace(/\W/g, "_") ?? "x",
    permissions,
  });
  expect(role.status, JSON.stringify(role.body)).toBe(201);
  const member = await alice.post(`/tenants/${tenant}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  expect(member.status, JSON.stringify(member.body)).toBe(201);
  const bound = await alice.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: role.body.id,
  });
  expect(bound.status, JSON.stringify(bound.body)).toBe(201);
  return { client: await t.signIn(email, PASSWORD), memberId: member.body.id as string };
}

async function provider(as: Client, base: string, body: object, config: object = {}) {
  const created = await as.post(base, {
    protocol: "saml",
    config: {
      entryPoint: "https://idp.acme.test/saml/sso",
      idpIssuer: "https://idp.acme.test/saml",
      certificates: [certificate],
      ...config,
    },
    ...body,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.id as string;
}

async function prove(as: Client, base: string, id: string, domain: string) {
  const added = await as.post(`${base}/${id}/domains`, { domain });
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  if (added.body.record) txt.set(added.body.record.name, added.body.record.value);
  const checked = await as.post(`${base}/${id}/domains/${added.body.id}/checks`);
  expect(checked.body.verified, JSON.stringify(checked.body)).toBe(true);
}

/** A request as an identity provider makes it. */
async function push(
  id: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  token: string | undefined = staffToken,
) {
  const response = await t.app.inject({
    method,
    url: `/api/v1/scim/v2/${id}${path}`,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/scim+json" }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
  return {
    status: response.statusCode,
    body: (response.body === "" ? null : response.json()) as Any,
  };
}

/** A sign-in through the provider, as far as who it stands for: the answer is taken as checked. */
async function signInAs(providerId: string, subject: string, email: string) {
  const found = await t.db
    .selectFrom("identity_provider")
    .select("tenant_id")
    .where("id", "=", providerId)
    .executeTakeFirstOrThrow();
  const which = await findProvider(t.db, providerId, found.tenant_id);
  if (!which) throw new Error("no provider");
  return t.db
    .transaction()
    .execute((trx) =>
      resolvePerson(
        t.kernel,
        trx,
        (input) => writeAudit(trx, { principal: { type: "system", id: null } }, input),
        which,
        { subject, email, emailVerified: true, name: undefined, groups: [], attributes: {} },
      ),
    );
}

const pushedUser = (userName: string, more: object = {}) => ({
  schemas: [USER],
  userName,
  externalId: `ext-${userName}`,
  active: true,
  displayName: userName,
  emails: [{ primary: true, type: "work", value: userName }],
  ...more,
});

beforeAll(async () => {
  dns.resolveTxt = async (name) => (txt.has(name) ? [[txt.get(name) as string]] : []);
  certificate = (
    await generate([{ name: "commonName", value: "idp" }], { keySize: 2048, algorithm: "sha256" })
  ).cert;
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  sam = (await limited("sam@acme.example", ["sso:read", "sso:write"])).client;
  staff = await provider(alice, providers(), { audience: "members", name: "Acme Staff" });
  await prove(alice, providers(), staff, "acme.example");
  staffToken = (
    await alice.post(`${provisioning(staff)}/tokens`, { name: "Directory", expiresInDays: 30 })
  ).body.token;
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

describe("who a provider may make powerful (GOV-01, GOV-02, INS-05)", () => {
  test("a default role must be one the editor may give, and never the instance's own", async () => {
    // sso:write alone does not let someone give tenant_admin to everyone a provider makes.
    const asSam = await sam.patch(`${providers()}/${staff}`, { defaultRoleId: roles.tenant_admin });
    expect(asSam.status, JSON.stringify(asSam.body)).toBe(403);
    const created = await sam.post(providers(), {
      audience: "members",
      protocol: "saml",
      name: "Sam's",
      defaultRoleId: roles.tenant_admin,
      config: {
        entryPoint: "https://idp.acme.test/saml/sso",
        idpIssuer: "https://idp.acme.test/saml",
        certificates: [certificate],
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(403);
    // Taking a default role away needs nothing more than sso:write.
    expect((await sam.patch(`${providers()}/${staff}`, { defaultRoleId: null })).status).toBe(200);

    // Whoever may bind it may set it, and the instance's own role is no tenant's to give.
    const viewer = await alice.patch(`${providers()}/${staff}`, { defaultRoleId: roles.viewer });
    expect(viewer.status, JSON.stringify(viewer.body)).toBe(200);
    const operator = await alice.patch(`${providers()}/${staff}`, {
      defaultRoleId: roles.operator_admin,
    });
    expect(operator.status, JSON.stringify(operator.body)).toBe(400);
    expect((await alice.patch(`${providers()}/${staff}`, { defaultRoleId: null })).status).toBe(
      200,
    );
  });

  test("the instance's provider gives no role at all", async () => {
    const base = "/instance/identity-providers";
    const config = {
      entryPoint: "https://idp.ops.test/saml/sso",
      idpIssuer: "https://idp.ops.test/saml",
      certificates: [certificate],
    };
    for (const role of [roles.operator_admin, roles.tenant_admin, roles.viewer]) {
      const made = await t.admin.post(base, {
        audience: "members",
        protocol: "saml",
        name: "Operators",
        defaultRoleId: role,
        config,
      });
      expect(made.status, JSON.stringify(made.body)).toBe(400);
    }
    const id = await provider(t.admin, base, { audience: "members", name: "Operators" });
    for (const role of [roles.operator_admin, roles.tenant_admin]) {
      const set = await t.admin.patch(`${base}/${id}`, { defaultRoleId: role });
      expect(set.status, JSON.stringify(set.body)).toBe(400);
    }
    expect((await t.admin.get(`${base}/${id}`)).body.defaultRoleId).toBeNull();
    await t.admin.delete(`${base}/${id}`);
  });

  test("mapping a provider's group needs the right over the group it fills", async () => {
    const group = (await alice.post(`/tenants/${tenant}/groups`, { name: "plain" })).body.id;
    const strong = (await alice.post(`/tenants/${tenant}/groups`, { name: "strong" })).body.id;
    expect(
      (
        await alice.post(`/tenants/${tenant}/bindings`, {
          principalType: "group",
          principalId: strong,
          roleId: roles.tenant_admin,
        })
      ).status,
    ).toBe(201);
    const url = `${providers()}/${staff}/group-maps`;
    const hers = await sam.put(url, { items: [{ value: "*", groupId: strong }] });
    expect(hers.status, JSON.stringify(hers.body)).toBe(403);
    expect((await sam.put(url, { items: [{ value: "*", groupId: group }] })).status).toBe(403);
    // Someone who can change groups, but not who holds what, may map a group that holds nothing.
    const mapper = (await limited("mapper@acme.example", ["sso:read", "sso:write", "group:write"]))
      .client;
    expect((await mapper.put(url, { items: [{ value: "*", groupId: strong }] })).status).toBe(403);
    expect((await mapper.put(url, { items: [{ value: "*", groupId: group }] })).status).toBe(200);
    expect((await alice.put(url, { items: [{ value: "*", groupId: strong }] })).status).toBe(200);
    // Clearing the mapping asks for no more than sso:write.
    expect((await sam.put(url, { items: [] })).status).toBe(200);
  });
});

describe("pushed groups (GOV-03)", () => {
  test("a pushed group does not take over a group somebody made by hand", async () => {
    const admins = (await alice.post(`/tenants/${tenant}/groups`, { name: "Administrators" })).body
      .id;
    expect(
      (
        await alice.post(`/tenants/${tenant}/bindings`, {
          principalType: "group",
          principalId: admins,
          roleId: roles.tenant_admin,
        })
      ).status,
    ).toBe(201);
    const settings = await alice.put(provisioning(staff), {
      subjectFrom: null,
      groups: "scim",
      createGroups: true,
    });
    expect(settings.status, JSON.stringify(settings.body)).toBe(200);
    const dan = await push(staff, "POST", "/Users", pushedUser("dan@acme.example"));
    expect(dan.status, JSON.stringify(dan.body)).toBe(201);
    const pushed = await push(staff, "POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Administrators",
      members: [{ value: dan.body.id }],
    });
    expect(pushed.status, JSON.stringify(pushed.body)).toBe(201);

    const inGroup = await t.db
      .selectFrom("group_member")
      .select("member_id")
      .where("group_id", "=", admins)
      .execute();
    expect(inGroup).toEqual([]);
    expect(
      await t.db
        .selectFrom("identity_group_map")
        .select("id")
        .where("provider_id", "=", staff)
        .where("claim_value", "=", "Administrators")
        .execute(),
    ).toEqual([]);
    const seen = (await alice.get(`${provisioning(staff)}/pushed`)).body.refusals;
    expect(seen).toMatchObject([
      { resource: "Groups", status: 409, reason: expect.stringContaining("made by hand") },
    ]);

    // A group the provider made itself is still its own to fill.
    await push(staff, "POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Engineers",
      members: [{ value: dan.body.id }],
    });
    const engineers = await t.db
      .selectFrom("principal_group")
      .select(["id", "managed_by"])
      .where("tenant_id", "=", tenant)
      .where("name", "=", "Engineers")
      .executeTakeFirstOrThrow();
    expect(engineers.managed_by).toBe("provider");
    expect(
      (
        await t.db
          .selectFrom("group_member")
          .select("member_id")
          .where("group_id", "=", engineers.id)
          .execute()
      ).length,
    ).toBe(1);
  });
});

describe("what a person here turned off, a push does not turn on (GOV-05)", () => {
  const members = async () => (await alice.get(`/tenants/${tenant}/members?limit=200`)).body.items;
  const suspended = async (email: string) =>
    (await members()).find((member: Any) => member.email === email)?.suspended;

  test("a member suspended by hand stays so when the directory says active", async () => {
    const eve = await alice.post(`/tenants/${tenant}/members`, {
      email: "eve@acme.example",
      name: "Eve",
      password: PASSWORD,
    });
    expect(eve.status).toBe(201);
    expect(
      (await alice.patch(`/tenants/${tenant}/members/${eve.body.id}`, { suspended: true })).status,
    ).toBe(200);
    const made = await push(staff, "POST", "/Users", pushedUser("eve@acme.example"));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(await suspended("eve@acme.example")).toBe(true);
    // The directory says it again, and still the hand wins.
    await push(staff, "PATCH", `/Users/${made.body.id}`, {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", value: { active: false } }],
    });
    await push(staff, "PATCH", `/Users/${made.body.id}`, {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", value: { active: true } }],
    });
    expect(await suspended("eve@acme.example")).toBe(true);
    // Until it is lifted by hand.
    await alice.patch(`/tenants/${tenant}/members/${eve.body.id}`, { suspended: false });
    expect(await suspended("eve@acme.example")).toBe(false);
  });

  test("what the directory suspended, it resumes", async () => {
    const found = await push(staff, "GET", `/Users?filter=userName eq "dan@acme.example"`);
    const id = found.body.Resources[0].id;
    const patch = (active: boolean) =>
      push(staff, "PATCH", `/Users/${id}`, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "replace", value: { active } }],
      });
    await patch(false);
    expect(await suspended("dan@acme.example")).toBe(true);
    await patch(true);
    expect(await suspended("dan@acme.example")).toBe(false);
    // A person here suspends them while the directory has them off: that is now a hand's.
    await patch(false);
    const dan = (await members()).find((member: Any) => member.email === "dan@acme.example");
    await alice.patch(`/tenants/${tenant}/members/${dan.id}`, { suspended: true });
    await patch(true);
    expect(await suspended("dan@acme.example")).toBe(true);
  });

  test("an account an operator disabled stays disabled when the instance's provider pushes it", async () => {
    const base = "/instance/identity-providers";
    const ops = await provider(t.admin, base, { audience: "members", name: "Operators" });
    await prove(t.admin, base, ops, "ops.example");
    const token = (await t.admin.post(`/instance/provisioning/${ops}/tokens`, { name: "Dir" })).body
      .token;
    const carol = await t.admin.post("/members", {
      email: "carol@ops.example",
      name: "Carol",
      password: PASSWORD,
    });
    expect(carol.status).toBe(201);
    expect((await t.admin.patch(`/members/${carol.body.id}`, { disabled: true })).status).toBe(200);
    const made = await push(ops, "POST", "/Users", pushedUser("carol@ops.example"), token);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const disabled = async () =>
      (await t.admin.get("/members?limit=200")).body.items.find(
        (member: Any) => member.email === "carol@ops.example",
      ).disabled;
    expect(await disabled()).toBe(true);
    await t.admin.patch(`/members/${carol.body.id}`, { disabled: false });
    // Pushed off by the directory, and on again by it.
    const patch = (active: boolean) =>
      push(
        ops,
        "PATCH",
        `/Users/${made.body.id}`,
        {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", value: { active } }],
        },
        token,
      );
    await patch(false);
    expect(await disabled()).toBe(true);
    await patch(true);
    expect(await disabled()).toBe(false);
  });

  test("the same for an end user a person here disabled", async () => {
    const customers = await provider(alice, providers(), {
      audience: "end_users",
      name: "Acme Customers",
    });
    const token = (await alice.post(`${provisioning(customers)}/tokens`, { name: "Dir" })).body
      .token;
    const made = await push(customers, "POST", "/Users", pushedUser("kim@customer.example"), token);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const list = async () =>
      (await alice.get(`/tenants/${tenant}/end-users?limit=200`)).body.items.find(
        (user: Any) => user.email === "kim@customer.example",
      );
    const kim = await list();
    await alice.patch(`/tenants/${tenant}/end-users/${kim.id}`, { disabled: true });
    const patch = (active: boolean) =>
      push(
        customers,
        "PATCH",
        `/Users/${made.body.id}`,
        {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", value: { active } }],
        },
        token,
      );
    await patch(false);
    await patch(true);
    expect((await list()).disabled).toBe(true);
  });
});

/** An OIDC provider that only describes itself, which is all that saving a provider reads. */
async function describedIssuer(): Promise<{ issuer: string; stop: () => Promise<void> }> {
  let origin = "";
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", origin).pathname;
    const suffix = "/.well-known/openid-configuration";
    if (!path.endsWith(suffix)) {
      response.writeHead(404).end();
      return;
    }
    const issuer = `${origin}${path.slice(0, -suffix.length)}`;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { issuer: origin, stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

const audited = async (action: string): Promise<Any[]> =>
  t.db.selectFrom("audit_entry").select("details").where("action", "=", action).execute();

describe("a changed issuer (GOV-06, GOV-07)", () => {
  test("a stored client secret is not sent to an issuer at another address", async () => {
    const first = await describedIssuer();
    const second = await describedIssuer();
    try {
      const made = await alice.post(providers(), {
        audience: "members",
        protocol: "oidc",
        name: "Moves",
        config: { issuer: first.issuer, clientId: "console" },
        clientSecret: "the-secret-1",
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const id = made.body.id as string;
      // The same address, another path: the secret is for this host, and stays.
      const path = await alice.patch(`${providers()}/${id}`, {
        config: { issuer: `${first.issuer}/realms/b` },
      });
      expect(path.status, JSON.stringify(path.body)).toBe(200);
      expect(path.body.hasSecret).toBe(true);
      // Another address: it is not given the secret unless it is given again.
      const moved = await alice.patch(`${providers()}/${id}`, {
        config: { issuer: second.issuer },
      });
      expect(moved.status, JSON.stringify(moved.body)).toBe(200);
      expect(moved.body.hasSecret).toBe(false);
      expect(
        (await audited("identity_provider.updated")).some(
          (entry) => entry.details.secretDropped === true,
        ),
      ).toBe(true);
      // Given again, it is kept.
      const again = await alice.patch(`${providers()}/${id}`, {
        config: { issuer: first.issuer },
        clientSecret: "the-secret-2",
      });
      expect(again.body.hasSecret).toBe(true);
      expect((await alice.delete(`${providers()}/${id}`)).status).toBe(204);
    } finally {
      await first.stop();
      await second.stop();
    }
  });

  test("a provider that is on cannot move to another address without the secret", async () => {
    const first = await describedIssuer();
    const second = await describedIssuer();
    try {
      const id = (
        await alice.post(providers(), {
          audience: "members",
          protocol: "oidc",
          name: "Live",
          config: { issuer: first.issuer, clientId: "console" },
          clientSecret: "the-secret-1",
        })
      ).body.id as string;
      await prove(alice, providers(), id, "live.example");
      expect((await alice.patch(`${providers()}/${id}`, { enabled: true })).status).toBe(200);
      const moved = await alice.patch(`${providers()}/${id}`, {
        config: { issuer: second.issuer },
      });
      expect(moved.status, JSON.stringify(moved.body)).toBe(409);
      expect(moved.body.code).toBe("secret_needed");
      expect((await alice.get(`${providers()}/${id}`)).body.config.issuer).toBe(first.issuer);
      const given = await alice.patch(`${providers()}/${id}`, {
        config: { issuer: second.issuer },
        clientSecret: "the-secret-3",
      });
      expect(given.status, JSON.stringify(given.body)).toBe(200);
    } finally {
      await first.stop();
      await second.stop();
    }
  });

  test("ties to people are removed when the issuer changes, and made again by email", async () => {
    const first = await describedIssuer();
    const second = await describedIssuer();
    try {
      const gil = await alice.post(`/tenants/${tenant}/members`, {
        email: "gil@ties.example",
        name: "Gil",
        password: PASSWORD,
      });
      expect(gil.status).toBe(201);
      const id = (
        await alice.post(providers(), {
          audience: "members",
          protocol: "oidc",
          name: "Ties",
          config: { issuer: first.issuer, clientId: "console" },
          clientSecret: "the-secret-1",
        })
      ).body.id as string;
      await prove(alice, providers(), id, "ties.example");
      expect(await signInAs(id, "subject-7", "gil@ties.example")).toMatchObject({
        principalId: gil.body.id,
        linked: true,
      });
      expect((await alice.get(`${providers()}/${id}/links`)).body.items).toHaveLength(1);

      const moved = await alice.patch(`${providers()}/${id}`, {
        config: { issuer: second.issuer },
        clientSecret: "the-secret-2",
      });
      expect(moved.status, JSON.stringify(moved.body)).toBe(200);
      expect((await alice.get(`${providers()}/${id}/links`)).body.items).toEqual([]);
      expect((await audited("identity_provider.links_removed")).at(-1)).toMatchObject({
        details: { removed: 1 },
      });
      // The same subject at the new issuer is found by its email again, not by the old tie.
      const dan = (await alice.get(`/tenants/${tenant}/members?limit=200`)).body.items.find(
        (member: Any) => member.email === "gil@ties.example",
      );
      expect(await signInAs(id, "subject-7", "gil@ties.example")).toMatchObject({
        principalId: dan.id,
        linked: true,
      });
      await alice.delete(`${providers()}/${id}`);
    } finally {
      await first.stop();
      await second.stop();
    }
  });

  test("the same for a SAML provider's entity ID", async () => {
    const id = await provider(alice, providers(), { audience: "members", name: "Saml ties" });
    await prove(alice, providers(), id, "saml.example");
    await alice.post(`/tenants/${tenant}/members`, {
      email: "gil@saml.example",
      name: "Gil",
      password: PASSWORD,
    });
    await signInAs(id, "name-1", "gil@saml.example");
    expect((await alice.get(`${providers()}/${id}/links`)).body.items).toHaveLength(1);
    const same = await alice.patch(`${providers()}/${id}`, { name: "Saml ties again" });
    expect(same.status).toBe(200);
    expect((await alice.get(`${providers()}/${id}/links`)).body.items).toHaveLength(1);
    const moved = await alice.patch(`${providers()}/${id}`, {
      config: { idpIssuer: "https://other.acme.test/saml" },
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect((await alice.get(`${providers()}/${id}/links`)).body.items).toEqual([]);
  });
});

describe("a tenant's provider and the people who run the instance (GOV-08)", () => {
  test("it neither signs them in nor pushes them", async () => {
    const op = await t.admin.post("/members", {
      email: "ops@acme.example",
      name: "Ops",
      password: PASSWORD,
    });
    expect(op.status).toBe(201);
    expect(
      (await t.admin.post("/bindings", { memberId: op.body.id, roleId: roles.operator_admin }))
        .status,
    ).toBe(201);
    await t.db
      .insertInto("tenant_member")
      .values({ tenant_id: tenant, member_id: op.body.id })
      .execute();
    await expect(signInAs(staff, "ops-subject", "ops@acme.example")).rejects.toMatchObject({
      reason: "runs_instance",
    });
    expect(
      await t.db
        .selectFrom("identity_link")
        .select("id")
        .where("principal_id", "=", op.body.id)
        .execute(),
    ).toEqual([]);

    const root = await t.admin.post("/members", {
      email: "root@acme.example",
      name: "Root",
      password: PASSWORD,
    });
    expect(
      (await t.admin.post("/bindings", { memberId: root.body.id, roleId: roles.operator_admin }))
        .status,
    ).toBe(201);
    const pushed = await push(staff, "POST", "/Users", pushedUser("root@acme.example"));
    expect(pushed.status, JSON.stringify(pushed.body)).toBe(403);
    // Their password still works.
    expect((await t.signIn("ops@acme.example", PASSWORD)).get).toBeDefined();
  });
});
