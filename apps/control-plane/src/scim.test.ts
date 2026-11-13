import { newId, sql } from "@vynxlabs/db";
import { generate } from "selfsigned";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dns } from "./kernel/apps/challenge.js";
import { writeAudit } from "./kernel/audit.js";
import { generateApiKey } from "./kernel/principal.js";
import { resolvePerson, SsoRefusal } from "./kernel/sso/people.js";
import { findProvider } from "./kernel/sso/providers.js";
import {
  groupChanges,
  groupSlug,
  parseFilter,
  userChanges,
  userFields,
} from "./kernel/sso/scim.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const ENTERPRISE = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

let t: TestApp;
let tenant: string;
let globex: string;
let alice: Client;
let roles: Record<string, string>;
let certificate: string;
/** What DNS answers in these tests. */
const txt = new Map<string, string>();

/** The tenant's provider of members, of end users, and the instance's own. */
let staff: string;
let customers: string;
let operators: string;
const tokens: Record<string, string> = {};

const providers = () => `/tenants/${tenant}/identity-providers`;
const provisioning = (provider: string) => `/tenants/${tenant}/provisioning/${provider}`;

/** A request as an identity provider makes it: straight to the address, with its token. */
async function push(
  provider: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  token: string | undefined = tokens[provider],
) {
  const response = await t.app.inject({
    method,
    url: `/api/v1/scim/v2/${provider}${path}`,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/scim+json" }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
  return {
    status: response.statusCode,
    type: String(response.headers["content-type"] ?? ""),
    body: (response.body === "" ? null : response.json()) as Any,
  };
}

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
  return { id, client: await t.signIn(email, PASSWORD) };
}

async function provider(as: Client, base: string, body: object) {
  const created = await as.post(base, {
    protocol: "saml",
    config: {
      entryPoint: "https://idp.acme.test/saml/sso",
      idpIssuer: "https://idp.acme.test/saml",
      certificates: [certificate],
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

/** An API key for a member, made as the member would make one. */
async function keyFor(memberId: string): Promise<Client> {
  const key = generateApiKey();
  await t.db
    .insertInto("api_key")
    .values({
      id: newId(),
      owner_type: "member",
      owner_id: memberId,
      name: "test",
      prefix: key.prefix,
      token_hash: key.hash,
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
    })
    .execute();
  return t.withKey(key.token);
}

const auditCount = async () =>
  Number(
    (await sql<{ n: string }>`select count(*) as n from audit_entry`.execute(t.db)).rows[0]?.n,
  );
const lastAudit = async (action: string) =>
  (await t.db
    .selectFrom("audit_entry")
    .selectAll()
    .where("action", "=", action)
    .orderBy("id", "desc")
    .executeTakeFirst()) as Any;

/** A sign-in through the provider, as far as who it stands for: the answer is taken as checked. */
async function signInAs(providerId: string, subject: string, email: string, groups: string[] = []) {
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
        { subject, email, emailVerified: true, name: undefined, groups, attributes: {} },
      ),
    );
}

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
  globex = (await seed("globex", "gina@globex.example")).id;
  staff = await provider(alice, providers(), {
    audience: "members",
    name: "Acme Staff",
    defaultRoleId: roles.developer,
  });
  await prove(alice, providers(), staff, "acme.example");
  customers = await provider(alice, providers(), { audience: "end_users", name: "Acme Customers" });
  operators = await provider(t.admin, "/instance/identity-providers", {
    audience: "members",
    name: "Operators",
  });
  await prove(t.admin, "/instance/identity-providers", operators, "ops.example");
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

describe("what a provider sends, read", () => {
  test("a filter is one attribute, equal to one value", () => {
    expect(parseFilter('userName eq "bob@acme.example"', ["userName", "externalId"])).toEqual({
      attribute: "userName",
      value: "bob@acme.example",
    });
    expect(parseFilter('EXTERNALID  EQ  "a\\"b"', ["userName", "externalId"])).toEqual({
      attribute: "externalId",
      value: 'a"b',
    });
    expect(parseFilter(undefined, ["userName"])).toBeUndefined();
    expect(() => parseFilter('userName co "bob"', ["userName"])).toThrow(/Only these filters/);
    expect(() => parseFilter('emails eq "x"', ["userName"])).toThrow(/Only these filters/);
  });

  test("a whole user is read from what Entra and Okta each send", () => {
    expect(
      userFields({
        schemas: [USER, ENTERPRISE],
        externalId: "0a21f0f2-8d2a-4f8e-bf98-7d8c37c283cf",
        userName: "Bob@acme.example",
        active: true,
        emails: [{ primary: true, type: "work", value: "bob@acme.example" }],
        meta: { resourceType: "User" },
        name: { formatted: "Bob Stone", familyName: "Stone", givenName: "Bob" },
        [ENTERPRISE]: { department: "Finance" },
      }),
    ).toEqual({
      userName: "Bob@acme.example",
      externalId: "0a21f0f2-8d2a-4f8e-bf98-7d8c37c283cf",
      email: "bob@acme.example",
      displayName: "Bob Stone",
      givenName: "Bob",
      familyName: "Stone",
      active: true,
    });
    // Okta sends several addresses, a password and a locale. The primary address is the one.
    expect(
      userFields({
        schemas: [USER],
        userName: "pat@customer.example",
        name: { givenName: "Pat", familyName: "Lee" },
        emails: [
          { primary: false, value: "pat@home.example", type: "home" },
          { primary: true, value: "pat@customer.example", type: "work" },
        ],
        displayName: "Pat Lee",
        locale: "en-US",
        password: "not-kept",
        groups: [],
        active: true,
      }),
    ).toEqual({
      userName: "pat@customer.example",
      email: "pat@customer.example",
      displayName: "Pat Lee",
      givenName: "Pat",
      familyName: "Lee",
      active: true,
    });
  });

  test("a change is read whether it names a path or sends an object", () => {
    // Entra: capitalised operations, and true and false as text.
    expect(
      userChanges({
        schemas: [PATCH],
        Operations: [
          { op: "Replace", path: "active", value: "False" },
          { op: "Add", path: "name.givenName", value: "Robert" },
          { op: "Replace", path: 'emails[type eq "work"].value', value: "rob@acme.example" },
          { op: "Add", path: `${ENTERPRISE}:department`, value: "Sales" },
          { op: "Remove", path: "displayName" },
        ],
      }),
    ).toEqual({
      active: false,
      givenName: "Robert",
      email: "rob@acme.example",
      displayName: null,
    });
    // Okta: no path.
    expect(userChanges({ Operations: [{ op: "replace", value: { active: false } }] })).toEqual({
      active: false,
    });
    expect(() => userChanges({ Operations: [] })).toThrow(/Operations/);
    expect(() => userChanges({ Operations: [{ op: "move", path: "x" }] })).toThrow(/operation/);

    expect(
      groupChanges({
        Operations: [
          { op: "Add", path: "members", value: [{ value: "a" }, { value: "b" }] },
          { op: "Remove", path: 'members[value eq "c"]' },
          { op: "Replace", path: "displayName", value: "Gold" },
        ],
      }),
    ).toEqual({ add: ["a", "b"], remove: ["c"], displayName: "Gold" });
    expect(
      groupChanges({
        Operations: [{ op: "replace", value: { id: "x", displayName: "Gold" } }],
      }),
    ).toEqual({ add: [], remove: [], displayName: "Gold" });
    expect(
      groupChanges({ Operations: [{ op: "replace", path: "members", value: [{ value: "a" }] }] }),
    ).toEqual({ add: [], remove: [], replace: ["a"] });
    // Removing `members` with nothing named empties the group.
    expect(groupChanges({ Operations: [{ op: "remove", path: "members" }] })).toEqual({
      add: [],
      remove: [],
      replace: [],
    });
    expect(groupSlug("Gold Customers (EU)")).toBe("gold-customers-eu");
  });
});

describe("setting a provider up to push", () => {
  test("a provider has an address and tokens, and a token opens that provider alone", async () => {
    const before = await alice.get(provisioning(staff));
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      address: `http://localhost:8080/api/v1/scim/v2/${staff}`,
      settings: { subjectFrom: null, groups: "sign_in", createGroups: false },
      tokens: [],
      users: { pushed: 0, active: 0 },
      groups: 0,
      lastPushAt: null,
    });
    for (const [id, as, base] of [
      [staff, alice, provisioning(staff)],
      [customers, alice, provisioning(customers)],
      [operators, t.admin, `/instance/provisioning/${operators}`],
    ] as const) {
      const made = await as.post(`${base}/tokens`, { name: "Directory", expiresInDays: 365 });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      expect(made.body.token).toMatch(/^vxp_/);
      tokens[id] = made.body.token;
    }
    // The token is shown once. Afterwards only its first characters are.
    const listed = (await alice.get(provisioning(staff))).body.tokens;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: "Directory", prefix: tokens[staff]?.slice(0, 12) });
    expect(JSON.stringify(listed)).not.toContain(tokens[staff]);
    const stored = await t.db.selectFrom("scim_token").select("token_hash").execute();
    expect(stored.map((row) => row.token_hash)).not.toContain(tokens[staff]);

    const config = await push(staff, "GET", "/ServiceProviderConfig");
    expect(config.status).toBe(200);
    expect(config.type).toContain("application/scim+json");
    expect(config.body).toMatchObject({
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 200 },
    });
    expect(
      (await push(staff, "GET", "/ResourceTypes")).body.Resources.map((r: Any) => r.id),
    ).toEqual(["User", "Group"]);
    expect((await push(staff, "GET", "/Schemas")).body.totalResults).toBe(2);

    // Refusals are said the way SCIM says them.
    const none = await push(staff, "GET", "/Users", undefined, "");
    expect(none.status).toBe(401);
    expect(none.type).toContain("application/scim+json");
    expect(none.body).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "401",
    });
    // One provider's token is no use at another's address, nor is a member's API key.
    expect((await push(customers, "GET", "/Users", undefined, tokens[staff])).status).toBe(401);
    expect((await push(staff, "GET", "/Users", undefined, "vxk_not-a-scim-token")).status).toBe(
      401,
    );
    expect((await push(newId(), "GET", "/Users", undefined, tokens[staff])).status).toBe(401);
    // And a token opens nothing but its address.
    expect((await t.withKey(tokens[staff] as string).get(`/tenants/${tenant}`)).status).toBe(401);

    // Only someone who may change single sign-on makes a token, in their own tenant.
    const gina = await t.signIn("gina@globex.example", PASSWORD);
    expect((await gina.get(provisioning(staff))).status).toBe(404);
    expect((await gina.post(`${provisioning(staff)}/tokens`, { name: "x" })).status).toBe(404);

    // A revoked token is refused from then on.
    const spare = await alice.post(`${provisioning(staff)}/tokens`, { name: "Spare" });
    expect((await push(staff, "GET", "/Users", undefined, spare.body.token)).status).toBe(200);
    expect((await alice.delete(`${provisioning(staff)}/tokens/${spare.body.id}`)).status).toBe(204);
    expect((await push(staff, "GET", "/Users", undefined, spare.body.token)).status).toBe(401);
    expect((await alice.delete(`${provisioning(staff)}/tokens/${spare.body.id}`)).status).toBe(404);
    expect((await alice.get(provisioning(staff))).body.tokens).toHaveLength(1);
  });
});

describe("a tenant's members, pushed as Entra pushes them", () => {
  const OBJECT_ID = "0a21f0f2-8d2a-4f8e-bf98-7d8c37c283cf";
  let scimId: string;
  let bob: string;
  let bobKey: Client;
  const entraUser = (userName: string, externalId: string, more: object = {}) => ({
    schemas: [USER, ENTERPRISE],
    externalId,
    userName,
    active: true,
    displayName: "Bob Stone",
    emails: [{ primary: true, type: "work", value: userName.toLowerCase() }],
    meta: { resourceType: "User" },
    name: { formatted: "Bob Stone", familyName: "Stone", givenName: "Bob" },
    ...more,
  });
  const reaches = async () => (await bobKey.get(`/tenants/${tenant}/workspaces`)).status;

  test("a pushed person becomes a member of the tenant, tied to the provider", async () => {
    const settings = await alice.put(provisioning(staff), {
      subjectFrom: "externalId",
      groups: "sign_in",
      createGroups: false,
    });
    expect(settings.status, JSON.stringify(settings.body)).toBe(200);
    expect(settings.body.settings.subjectFrom).toBe("externalId");

    // Entra looks before it makes.
    const looked = await push(staff, "GET", `/Users?filter=userName eq "Bob@acme.example"`);
    expect(looked.body).toMatchObject({ totalResults: 0, Resources: [], startIndex: 1 });

    const made = await push(staff, "POST", "/Users", entraUser("Bob@acme.example", OBJECT_ID));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    scimId = made.body.id;
    expect(made.body).toMatchObject({
      schemas: [USER],
      externalId: OBJECT_ID,
      userName: "Bob@acme.example",
      active: true,
      emails: [{ value: "bob@acme.example", primary: true }],
      name: { givenName: "Bob", familyName: "Stone" },
      meta: {
        resourceType: "User",
        location: `http://localhost:8080/api/v1/scim/v2/${staff}/Users/${scimId}`,
      },
    });
    const members = (await alice.get(`/tenants/${tenant}/members`)).body.items;
    const listed = members.find((member: Any) => member.email === "bob@acme.example");
    expect(listed).toMatchObject({ name: "Bob Stone", suspended: false });
    bob = listed.id;
    // The provider's default role came with the membership, as it does on a first sign-in.
    const held = (await alice.get(`/tenants/${tenant}/bindings`)).body.items.filter(
      (binding: Any) => binding.principalId === bob,
    );
    expect(held.map((binding: Any) => binding.roleId)).toEqual([roles.developer]);
    // The change is in the audit log as the provider's, by which token.
    expect(await lastAudit("scim.user_pushed")).toMatchObject({
      actor_type: "system",
      tenant_id: tenant,
      details: {
        via: "scim",
        identityProvider: "Acme Staff",
        token: tokens[staff]?.slice(0, 12),
        userName: "Bob@acme.example",
      },
    });

    // Found again by either name, whatever the case.
    expect(
      (await push(staff, "GET", `/Users?filter=userName eq "bob@ACME.example"`)).body.Resources[0]
        .id,
    ).toBe(scimId);
    expect(
      (await push(staff, "GET", `/Users?filter=externalId eq "${OBJECT_ID}"`)).body.totalResults,
    ).toBe(1);
    expect((await push(staff, "GET", `/Users/${scimId}`)).body.userName).toBe("Bob@acme.example");
    expect((await push(staff, "GET", `/Users/${newId()}`)).status).toBe(404);
    expect((await push(staff, "GET", "/Users/not-an-id")).status).toBe(404);

    // The person signs in for the first time already tied: by the provider's own name for them.
    const signedIn = await signInAs(staff, OBJECT_ID, "someone-else@elsewhere.example");
    expect(signedIn).toMatchObject({ principalId: bob, created: false, linked: false });
  });

  test("what cannot be taken in is refused, in words a directory's log can show", async () => {
    const again = await push(staff, "POST", "/Users", entraUser("bob@acme.example", "another-id"));
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ scimType: "uniqueness", status: "409" });
    const sameId = await push(staff, "POST", "/Users", entraUser("bobby@acme.example", OBJECT_ID));
    expect(sameId.status).toBe(409);
    // A member is one person on the whole instance: only an email in a proved domain is believed.
    const outside = await push(staff, "POST", "/Users", entraUser("eve@elsewhere.example", "e-1"));
    expect(outside.status).toBe(400);
    expect(outside.body.detail).toContain("has proved");
    expect(
      await t.db
        .selectFrom("member")
        .select("id")
        .where("email", "=", "eve@elsewhere.example")
        .execute(),
    ).toEqual([]);
    const nameless = await push(staff, "POST", "/Users", { schemas: [USER], active: true });
    expect(nameless.status).toBe(400);
    const noEmail = await push(staff, "POST", "/Users", { schemas: [USER], userName: "bob2" });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.detail).toContain("email");
    const garbled = await t.app.inject({
      method: "POST",
      url: `/api/v1/scim/v2/${staff}/Users`,
      headers: {
        authorization: `Bearer ${tokens[staff]}`,
        "content-type": "application/scim+json",
      },
      payload: "{not json",
    });
    expect(garbled.statusCode).toBe(400);
    expect(garbled.json().scimType).toBe("invalidSyntax");
    expect((await push(staff, "GET", `/Users?filter=userName sw "bo"`)).body.scimType).toBe(
      "invalidFilter",
    );
  });

  test("turning a person off suspends them in this tenant, and nowhere else", async () => {
    // Bob also belongs to another tenant, which this provider knows nothing of.
    await t.admin.post(`/tenants/${globex}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    expect(
      (await t.admin.post(`/tenants/${globex}/members`, { email: "bob@acme.example" })).status,
    ).toBe(201);
    await t.admin.post(`/tenants/${globex}/bindings`, {
      principalType: "member",
      principalId: bob,
      roleId: roles.viewer,
    });
    bobKey = await keyFor(bob);
    expect(await reaches()).toBe(200);
    // A group gives him more here. That stops counting too.
    const group = (await alice.post(`/tenants/${tenant}/groups`, { name: "auditors" })).body.id;
    await alice.put(`/tenants/${tenant}/groups/${group}/members/${bob}`);
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "group",
      principalId: group,
      roleId: roles.tenant_admin,
    });
    expect((await bobKey.get(`/tenants/${tenant}/members`)).status).toBe(200);

    const off = await push(staff, "PATCH", `/Users/${scimId}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "active", value: "False" }],
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body.active).toBe(false);
    expect(await reaches()).toBe(403);
    expect((await bobKey.get(`/tenants/${tenant}/members`)).status).toBe(403);
    expect((await bobKey.get(`/tenants/${globex}/workspaces`)).status).toBe(200);
    const listed = (await alice.get(`/tenants/${tenant}/members`)).body.items.find(
      (member: Any) => member.id === bob,
    );
    expect(listed.suspended).toBe(true);
    expect((await lastAudit("tenant_member.suspended")).details).toMatchObject({ via: "scim" });
    // The tenant is no longer among those he is offered.
    expect((await bobKey.get("/me")).body.tenants.map((one: Any) => one.slug)).toEqual(["globex"]);
    // What he held is kept, for the day he is back.
    expect(
      (await alice.get(`/tenants/${tenant}/bindings`)).body.items.filter(
        (binding: Any) => binding.principalId === bob,
      ),
    ).toHaveLength(1);
    // Signing in through the provider is refused while he is suspended.
    await expect(signInAs(staff, OBJECT_ID, "bob@acme.example")).rejects.toMatchObject({
      reason: "disabled",
    });

    // Entra sends the same change again and again. It changes nothing, and is still a success.
    const entries = await auditCount();
    const repeated = await push(staff, "PATCH", `/Users/${scimId}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "active", value: "False" }],
    });
    expect(repeated.status).toBe(200);
    expect(await auditCount()).toBe(entries);

    const on = await push(staff, "PATCH", `/Users/${scimId}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "active", value: "True" }],
    });
    expect(on.body.active).toBe(true);
    expect(await reaches()).toBe(200);
    expect((await signInAs(staff, OBJECT_ID, "bob@acme.example")).principalId).toBe(bob);
  });

  test("a person's details follow the directory, and a member's email here does not", async () => {
    const changed = await push(staff, "PATCH", `/Users/${scimId}`, {
      schemas: [PATCH],
      Operations: [
        { op: "Replace", path: "name.givenName", value: "Robert" },
        { op: "Replace", path: "displayName", value: "Robert Stone" },
        { op: "Replace", path: 'emails[type eq "work"].value', value: "robert@acme.example" },
        { op: "Add", path: `${ENTERPRISE}:department`, value: "Finance" },
      ],
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toMatchObject({
      displayName: "Robert Stone",
      name: { givenName: "Robert", familyName: "Stone" },
      emails: [{ value: "robert@acme.example" }],
    });
    // The account's email is its name on the whole instance. A push does not rename it.
    const member = await t.db
      .selectFrom("member")
      .select("email")
      .where("id", "=", bob)
      .executeTakeFirstOrThrow();
    expect(member.email).toBe("bob@acme.example");
    // A new name at the provider moves the tie with it.
    const renamed = await push(staff, "PATCH", `/Users/${scimId}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "externalId", value: "new-object-id" }],
    });
    expect(renamed.body.externalId).toBe("new-object-id");
    expect((await signInAs(staff, "new-object-id", "x@elsewhere.example")).principalId).toBe(bob);
  });

  test("a deleted person is suspended and untied, and can be pushed again", async () => {
    const gone = await push(staff, "DELETE", `/Users/${scimId}`);
    expect(gone.status).toBe(204);
    expect(await reaches()).toBe(403);
    expect((await push(staff, "GET", `/Users/${scimId}`)).status).toBe(404);
    expect((await push(staff, "DELETE", `/Users/${scimId}`)).status).toBe(404);
    expect(
      await t.db.selectFrom("identity_link").select("id").where("principal_id", "=", bob).execute(),
    ).toEqual([]);
    // The account is kept: a push never deletes one.
    expect(
      (await alice.get(`/tenants/${tenant}/members`)).body.items.some((m: Any) => m.id === bob),
    ).toBe(true);
    expect((await alice.get(provisioning(staff))).body.users).toEqual({ pushed: 0, active: 0 });

    const back = await push(staff, "POST", "/Users", entraUser("bob@acme.example", "third-id"));
    expect(back.status, JSON.stringify(back.body)).toBe(201);
    scimId = back.body.id;
    expect(await reaches()).toBe(200);
    expect((await alice.get(provisioning(staff))).body).toMatchObject({
      users: { pushed: 1, active: 1 },
    });
    expect((await alice.get(provisioning(staff))).body.lastPushAt).not.toBeNull();
  });

  test("an admin suspends and resumes a member by hand, and removing one clears what was pushed", async () => {
    const off = await alice.patch(`/tenants/${tenant}/members/${bob}`, { suspended: true });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body.suspended).toBe(true);
    expect(await reaches()).toBe(403);
    expect(
      (await alice.patch(`/tenants/${tenant}/members/${bob}`, { suspended: false })).body.suspended,
    ).toBe(false);
    expect(await reaches()).toBe(200);
    // Nobody locks themselves out.
    const me = (await alice.get("/me")).body.principal.id;
    expect(
      (await alice.patch(`/tenants/${tenant}/members/${me}`, { suspended: true })).status,
    ).toBe(400);
    expect(
      (await alice.patch(`/tenants/${tenant}/members/${newId()}`, { suspended: true })).status,
    ).toBe(404);

    expect((await alice.delete(`/tenants/${tenant}/members/${bob}`)).status).toBe(204);
    expect((await push(staff, "GET", `/Users/${scimId}`)).status).toBe(404);
    expect(await reaches()).toBe(404);
  });
});

describe("a tenant's end users, pushed as Okta pushes them", () => {
  const oktaUser = (email: string, given: string, more: object = {}) => ({
    schemas: [USER],
    userName: email,
    name: { givenName: given, familyName: "Lee" },
    emails: [{ primary: true, value: email, type: "work" }],
    displayName: `${given} Lee`,
    locale: "en-US",
    externalId: `00u-${given.toLowerCase()}`,
    groups: [],
    password: "Okta-made-this-1",
    active: true,
    ...more,
  });
  const endUser = async (email: string): Promise<Any> =>
    (await alice.get(`/tenants/${tenant}/end-users?limit=200`)).body.items.find(
      (user: Any) => user.email === email,
    );
  let pat: string;

  test("a pushed person becomes an end user, with no password of the provider's kept", async () => {
    const looked = await push(
      customers,
      "GET",
      `/Users?filter=userName eq "pat@customer.example"&startIndex=1&count=100`,
    );
    expect(looked.body.totalResults).toBe(0);
    const made = await push(customers, "POST", "/Users", oktaUser("pat@customer.example", "Pat"));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    pat = made.body.id;
    expect(made.body).not.toHaveProperty("password");
    const user = await endUser("pat@customer.example");
    expect(user).toMatchObject({ name: "Pat Lee", disabled: false });
    const row = await t.db
      .selectFrom("end_user")
      .select("password_hash")
      .where("id", "=", user.id)
      .executeTakeFirstOrThrow();
    expect(row.password_hash).toBeNull();
    // No field was named as the one people sign in by, so nothing is tied until they do.
    expect(
      await t.db
        .selectFrom("identity_link")
        .select("id")
        .where("principal_id", "=", user.id)
        .execute(),
    ).toEqual([]);
  });

  test("an account that already exists is taken over only when the tenant has said so", async () => {
    const existing = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "sam@customer.example",
      name: "Sam",
    });
    expect(existing.status).toBe(201);
    const refused = await push(
      customers,
      "POST",
      "/Users",
      oktaUser("sam@customer.example", "Sam"),
    );
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toContain("may not take the account over");
    const trusting = await alice.patch(`${providers()}/${customers}`, {
      config: { trustEmail: true },
    });
    expect(trusting.status, JSON.stringify(trusting.body)).toBe(200);
    const taken = await push(customers, "POST", "/Users", oktaUser("sam@customer.example", "Sam"));
    expect(taken.status, JSON.stringify(taken.body)).toBe(201);
    expect((await endUser("sam@customer.example")).id).toBe(existing.body.endUser.id);
  });

  test("Okta turns a person off with a change, and back on by sending them whole", async () => {
    const user = await endUser("pat@customer.example");
    await t.db
      .insertInto("app_session")
      .values({
        id: newId(),
        tenant_id: tenant,
        principal_type: "end_user",
        principal_id: user.id,
        token_hash: "h".repeat(64),
        host: "localhost:8080",
        expires_at: new Date(Date.now() + 3_600_000),
        ip_address: null,
        user_agent: null,
      })
      .execute();
    const off = await push(customers, "PATCH", `/Users/${pat}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { active: false } }],
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect((await endUser("pat@customer.example")).disabled).toBe(true);
    // Whatever they were signed in to ends now.
    expect(
      await t.db
        .selectFrom("app_session")
        .select("id")
        .where("principal_id", "=", user.id)
        .execute(),
    ).toEqual([]);
    await expect(signInAs(customers, "anything", "pat@customer.example")).rejects.toBeInstanceOf(
      SsoRefusal,
    );

    const whole = await push(
      customers,
      "PUT",
      `/Users/${pat}`,
      oktaUser("patricia@customer.example", "Patricia", { externalId: "00u-pat" }),
    );
    expect(whole.status, JSON.stringify(whole.body)).toBe(200);
    expect(whole.body).toMatchObject({
      userName: "patricia@customer.example",
      displayName: "Patricia Lee",
      active: true,
    });
    // An end user's email and name follow the directory.
    expect(await endUser("pat@customer.example")).toBeUndefined();
    expect(await endUser("patricia@customer.example")).toMatchObject({
      id: user.id,
      name: "Patricia Lee",
      disabled: false,
    });
    // But not onto an address someone else has.
    const clash = await push(customers, "PATCH", `/Users/${pat}`, {
      schemas: [PATCH],
      Operations: [
        { op: "replace", value: { emails: [{ value: "sam@customer.example", primary: true }] } },
      ],
    });
    expect(clash.status).toBe(409);
  });

  test("people are listed a page at a time", async () => {
    for (const name of ["Uma", "Vic", "Wes"]) {
      const made = await push(
        customers,
        "POST",
        "/Users",
        oktaUser(`${name.toLowerCase()}@customer.example`, name),
      );
      expect(made.status, JSON.stringify(made.body)).toBe(201);
    }
    const all = await push(customers, "GET", "/Users");
    expect(all.body.totalResults).toBe(5);
    expect(all.body.itemsPerPage).toBe(5);
    const second = await push(customers, "GET", "/Users?startIndex=2&count=2");
    expect(second.body).toMatchObject({ totalResults: 5, startIndex: 2, itemsPerPage: 2 });
    expect(second.body.Resources.map((user: Any) => user.id)).toEqual(
      all.body.Resources.slice(1, 3).map((user: Any) => user.id),
    );
    // A count of nothing asks only how many there are.
    expect((await push(customers, "GET", "/Users?count=0")).body).toMatchObject({
      totalResults: 5,
      Resources: [],
    });
  });

  test("removing an end user here leaves nothing for the provider to find", async () => {
    const wes = await endUser("wes@customer.example");
    expect((await alice.delete(`/tenants/${tenant}/end-users/${wes.id}`)).status).toBe(204);
    expect(
      (await push(customers, "GET", `/Users?filter=userName eq "wes@customer.example"`)).body
        .totalResults,
    ).toBe(0);
  });
});

describe("groups, pushed", () => {
  let gold: string;
  let localGold: string;
  const idOf = async (email: string) =>
    (await push(customers, "GET", `/Users?filter=userName eq "${email}"`)).body.Resources[0]
      .id as string;
  const membersOf = async (group: string): Promise<string[]> =>
    (
      await t.db
        .selectFrom("end_user_group_member")
        .innerJoin("end_user", "end_user.id", "end_user_group_member.end_user_id")
        .select("end_user.email")
        .where("group_id", "=", group)
        .orderBy("end_user.email")
        .execute()
    ).map((row) => row.email);
  const localGroups = async (): Promise<Any[]> =>
    (await alice.get(`/tenants/${tenant}/end-user-groups`)).body.items;

  test("until the provider is told to, a pushed group changes no group here", async () => {
    const made = await push(customers, "POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Gold Customers",
      members: [{ value: await idOf("uma@customer.example") }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    gold = made.body.id;
    expect(made.body).toMatchObject({
      displayName: "Gold Customers",
      members: [{ display: "uma@customer.example" }],
      meta: { resourceType: "Group" },
    });
    expect(await localGroups()).toEqual([]);
    expect(
      (await push(customers, "POST", "/Groups", { displayName: "gold customers" })).status,
    ).toBe(409);
    expect((await push(customers, "POST", "/Groups", { schemas: [GROUP] })).status).toBe(400);
    const stranger = await push(customers, "POST", "/Groups", {
      displayName: "Ghosts",
      members: [{ value: newId() }],
    });
    expect(stranger.status).toBe(400);
  });

  test("told to, pushed groups make groups here and decide who is in them", async () => {
    const settings = await alice.put(provisioning(customers), {
      subjectFrom: null,
      groups: "scim",
      createGroups: true,
    });
    expect(settings.status).toBe(200);
    // Entra adds one person at a time.
    const added = await push(customers, "PATCH", `/Groups/${gold}`, {
      schemas: [PATCH],
      Operations: [
        { op: "Add", path: "members", value: [{ value: await idOf("vic@customer.example") }] },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const made = (await localGroups()).find((group) => group.name === "gold-customers");
    expect(made).toBeTruthy();
    localGold = made.id;
    expect(await membersOf(localGold)).toEqual(["uma@customer.example", "vic@customer.example"]);
    expect((await alice.get(`${providers()}/${customers}/group-maps`)).body.items).toMatchObject([
      { value: "Gold Customers", groupId: localGold },
    ]);

    // And takes one out by naming them in the path.
    const removed = await push(customers, "PATCH", `/Groups/${gold}`, {
      schemas: [PATCH],
      Operations: [
        { op: "Remove", path: `members[value eq "${await idOf("uma@customer.example")}"]` },
      ],
    });
    expect(removed.status).toBe(200);
    expect(await membersOf(localGold)).toEqual(["vic@customer.example"]);

    // Okta sends the whole membership.
    const replaced = await push(customers, "PATCH", `/Groups/${gold}`, {
      schemas: [PATCH],
      Operations: [
        {
          op: "replace",
          path: "members",
          value: [
            { value: await idOf("uma@customer.example") },
            { value: await idOf("sam@customer.example") },
          ],
        },
      ],
    });
    expect(replaced.status).toBe(200);
    expect(await membersOf(localGold)).toEqual(["sam@customer.example", "uma@customer.example"]);

    const read = await push(customers, "GET", `/Groups/${gold}`);
    expect(read.body.members.map((member: Any) => member.display).sort()).toEqual([
      "sam@customer.example",
      "uma@customer.example",
    ]);
    const lean = await push(
      customers,
      "GET",
      `/Groups?filter=displayName eq "Gold Customers"&excludedAttributes=members`,
    );
    expect(lean.body.totalResults).toBe(1);
    expect(lean.body.Resources[0]).not.toHaveProperty("members");
    expect((await push(customers, "GET", "/Groups")).body.Resources[0].members).toHaveLength(2);

    const unknown = await push(customers, "PATCH", `/Groups/${gold}`, {
      Operations: [{ op: "add", path: "members", value: [{ value: newId() }] }],
    });
    expect(unknown.status).toBe(400);
    // A sign-in says nothing about groups now: what was pushed stands.
    const uma = await signInAs(customers, "uma-subject", "uma@customer.example", [
      "Something Else",
    ]);
    expect(uma.groupsRemoved).toEqual([]);
    expect(await membersOf(localGold)).toEqual(["sam@customer.example", "uma@customer.example"]);
  });

  test("a group somebody mapped by hand is used as they mapped it", async () => {
    const vips = (
      await alice.post(`/tenants/${tenant}/end-user-groups`, { name: "vips", description: "" })
    ).body.id;
    const maps = (await alice.get(`${providers()}/${customers}/group-maps`)).body.items;
    expect(
      (
        await alice.put(`${providers()}/${customers}/group-maps`, {
          items: [
            ...maps.map((map: Any) => ({ value: map.value, groupId: map.groupId })),
            { value: "Very Important", groupId: vips },
          ],
        })
      ).status,
    ).toBe(200);
    const made = await push(customers, "POST", "/Groups", {
      schemas: [GROUP],
      displayName: "Very Important",
      members: [{ value: await idOf("vic@customer.example") }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(await membersOf(vips)).toEqual(["vic@customer.example"]);
    expect((await localGroups()).map((group) => group.name).sort()).toEqual([
      "gold-customers",
      "vips",
    ]);
    // Replacing a group whole sets its name and everyone in it.
    const whole = await push(customers, "PUT", `/Groups/${made.body.id}`, {
      schemas: [GROUP],
      displayName: "Very Important",
      members: [{ value: await idOf("uma@customer.example") }],
    });
    expect(whole.status, JSON.stringify(whole.body)).toBe(200);
    expect(await membersOf(vips)).toEqual(["uma@customer.example"]);
    expect((await push(customers, "DELETE", `/Groups/${made.body.id}`)).status).toBe(204);
    expect(await membersOf(vips)).toEqual([]);
  });

  test("a renamed group is the same group, and a deleted one empties and stays", async () => {
    const renamed = await push(customers, "PATCH", `/Groups/${gold}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { id: gold, displayName: "Platinum Customers" } }],
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body.displayName).toBe("Platinum Customers");
    expect(await membersOf(localGold)).toEqual(["sam@customer.example", "uma@customer.example"]);
    expect(
      (await alice.get(`${providers()}/${customers}/group-maps`)).body.items.map(
        (m: Any) => m.value,
      ),
    ).toContain("Platinum Customers");

    // A person the provider turns off stays in what was pushed, and a deleted one leaves it.
    expect(
      (await push(customers, "DELETE", `/Users/${await idOf("sam@customer.example")}`)).status,
    ).toBe(204);
    expect(await membersOf(localGold)).toEqual(["uma@customer.example"]);

    expect((await push(customers, "DELETE", `/Groups/${gold}`)).status).toBe(204);
    expect((await push(customers, "GET", `/Groups/${gold}`)).status).toBe(404);
    expect(await membersOf(localGold)).toEqual([]);
    expect((await localGroups()).some((group) => group.id === localGold)).toBe(true);
    expect((await alice.get(provisioning(customers))).body.groups).toBe(0);
  });
});

describe("the instance's own provider", () => {
  const signIn = (email: string) =>
    t.app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in/email",
      headers: { origin: "http://localhost:8080" },
      payload: { email, password: PASSWORD },
    });

  test("turning an operator off disables the account everywhere, at once", async () => {
    const carol = await t.admin.post("/members", {
      email: "carol@ops.example",
      name: "Carol",
      password: PASSWORD,
    });
    expect(carol.status, JSON.stringify(carol.body)).toBe(201);
    await t.admin.post("/bindings", {
      principalType: "member",
      principalId: carol.body.id,
      roleId: roles.instance_admin,
    });
    const session = await t.signIn("carol@ops.example", PASSWORD);
    const key = await keyFor(carol.body.id);
    expect((await session.get("/me")).status).toBe(200);
    expect((await key.get("/tenants")).status).toBe(200);

    const made = await push(operators, "POST", "/Users", {
      schemas: [USER],
      userName: "carol@ops.example",
      externalId: "carol-1",
      active: true,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    // She existed already, and is the same person.
    expect(
      (await t.admin.get("/members?limit=200")).body.items.filter(
        (m: Any) => m.email === "carol@ops.example",
      ),
    ).toHaveLength(1);

    const off = await push(operators, "PATCH", `/Users/${made.body.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { active: false } }],
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    // The session she had is over, her key opens nothing, and her password is no way back in.
    expect((await session.get("/me")).status).toBe(401);
    expect((await key.get("/tenants")).status).toBe(401);
    const refused = await signIn("carol@ops.example");
    expect(refused.statusCode).toBe(401);
    // In the very words a wrong password gets: whether the account exists is not given away.
    const wrong = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in/email",
      headers: { origin: "http://localhost:8080" },
      payload: { email: "alice@acme.example", password: "not-her-password" },
    });
    expect({ ...refused.json(), requestId: "" }).toEqual({ ...wrong.json(), requestId: "" });
    await expect(signInAs(operators, "carol-subject", "carol@ops.example")).rejects.toMatchObject({
      reason: "disabled",
    });
    const listed = (await t.admin.get("/members?limit=200")).body.items.find(
      (member: Any) => member.email === "carol@ops.example",
    );
    expect(listed.disabled).toBe(true);

    const on = await push(operators, "PATCH", `/Users/${made.body.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { active: true } }],
    });
    expect(on.body.active).toBe(true);
    expect((await signIn("carol@ops.example")).statusCode).toBe(200);
    expect((await key.get("/tenants")).status).toBe(200);

    // An operator does the same by hand, and not to themselves.
    const byHand = await t.admin.patch(`/members/${carol.body.id}`, { disabled: true });
    expect(byHand.status, JSON.stringify(byHand.body)).toBe(200);
    expect(byHand.body.disabled).toBe(true);
    expect((await key.get("/tenants")).status).toBe(401);
    expect(
      (await t.admin.patch(`/members/${carol.body.id}`, { disabled: false })).body.disabled,
    ).toBe(false);
    const me = (await t.admin.get("/me")).body.principal.id;
    expect((await t.admin.patch(`/members/${me}`, { disabled: true })).status).toBe(400);

    // The instance's provider is set up to push like any other.
    const base = `/instance/provisioning/${operators}`;
    const settings = await t.admin.put(base, {
      subjectFrom: "userName",
      groups: "sign_in",
      createGroups: false,
    });
    expect(settings.status, JSON.stringify(settings.body)).toBe(200);
    expect(settings.body.users).toEqual({ pushed: 1, active: 1 });
    const spare = await t.admin.post(`${base}/tokens`, { name: "Spare" });
    expect((await t.admin.delete(`${base}/tokens/${spare.body.id}`)).status).toBe(204);
    expect((await alice.get(base)).status).toBe(403);
    expect((await t.admin.patch(`/members/${newId()}`, { disabled: true })).status).toBe(404);
  });

  test("a paused provider takes no pushes until it is saved again", async () => {
    await t.db
      .updateTable("identity_provider")
      .set({ paused: true })
      .where("id", "=", customers)
      .execute();
    const refused = await push(customers, "GET", "/Users");
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("paused");
    await t.db
      .updateTable("identity_provider")
      .set({ paused: false })
      .where("id", "=", customers)
      .execute();
    expect((await push(customers, "GET", "/Users")).status).toBe(200);
  });
});

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    expect(t.unaudited).toEqual([]);
  });

  test("every route for setting provisioning up was exercised and audited", () => {
    expect(
      t.unexercised(
        (route) =>
          /\/provisioning(\/|$)/.test(route) ||
          route === "PATCH /api/v1/members/:id" ||
          route === "PATCH /api/v1/tenants/:t/members/:memberId",
      ),
    ).toEqual([]);
  });
});
