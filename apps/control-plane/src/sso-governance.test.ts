import { newId } from "@volvel/db";
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
