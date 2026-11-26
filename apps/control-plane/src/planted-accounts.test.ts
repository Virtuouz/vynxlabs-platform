import { newId } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { writeAudit } from "./kernel/audit.js";
import { recoverOperator } from "./kernel/bootstrap.js";
import { resolvePerson } from "./kernel/sso/people.js";
import { findProvider } from "./kernel/sso/providers.js";
import { ADMIN, type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const PLANTED = "planted-by-an-admin-1";
const OWN = "the-owners-own-password-9";

let t: TestApp;
let roles: Record<string, string>;
const sent: { to: string; subject: string; text: string }[] = [];

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
}, 60_000);

afterAll(async () => {
  t.kernel.mail.deliver = undefined;
  await t?.stop();
});

/** A tenant with these people as its tenant admins (directly), and a client for each. */
async function tenantWith(slug: string, who: string[]) {
  const id = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
  const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const members: Record<string, string> = {};
  for (const name of who) {
    const made = await t.admin.post(`/tenants/${id}/members`, {
      email: `${name}@${slug}.example`,
      name,
      password: PASSWORD,
    });
    members[name] = made.body.id;
    await t.admin.post(`/tenants/${id}/bindings`, {
      principalType: "member",
      principalId: made.body.id,
      roleId: roles.tenant_admin,
    });
  }
  await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
  const clients: Record<string, Client> = {};
  for (const name of who) clients[name] = await t.signIn(`${name}@${slug}.example`, PASSWORD);
  return { id, members, clients };
}

const tokenOf = (url: string) => decodeURIComponent(url.split("/").pop() as string);
const entries = (action: string, targetId: string) =>
  t.db
    .selectFrom("audit_entry")
    .selectAll()
    .where("action", "=", action as Any)
    .where("target_id", "=", targetId)
    .execute();
const signInStatus = async (email: string, password: string, headers: object = {}) =>
  (
    await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-in/email",
      headers: { origin: t.config.publicUrl, ...headers },
      payload: { email, password },
    })
  ).statusCode;
const recoveryCodesLeft = async (memberId: string) =>
  (
    await t.db
      .selectFrom("member_recovery_code")
      .select("id")
      .where("member_id", "=", memberId)
      .execute()
  ).length;

/** A person who owns a tenant, with a key and recovery codes made as themselves. */
async function personWithKeyAndCodes(client: Client) {
  const key = await client.post("/api-keys", { name: "mine" });
  expect(key.status).toBe(201);
  const codes = await client.post("/me/recovery-codes", {});
  expect(codes.status).toBe(201);
  return {
    key: t.withKey(key.body.token),
    keyId: key.body.id as string,
    codes: codes.body.codes as string[],
  };
}

describe("a password reset ends what could sign in as the account before (round three, item 1)", () => {
  test("sessions, personal keys and recovery codes end; a service account's key stays; each tenant has the entry", async () => {
    const a = await tenantWith("resetone", ["ann", "pat"]);
    const b = await t.admin.post("/tenants", { slug: "resettwo", name: "two" });
    const open = await t.admin.post(`/tenants/${b.body.id}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const joined = await t.admin.post(`/tenants/${b.body.id}/members`, {
      email: "pat@resetone.example",
    });
    expect(joined.status, JSON.stringify(joined.body)).toBe(201);
    await t.admin.delete(`/tenants/${b.body.id}/access-grants/${open.body.id}`);
    const pat = a.clients.pat as Client;
    const held = await personWithKeyAndCodes(pat);
    // A key that belongs to the tenant, not to the person.
    const sa = await (a.clients.ann as Client).post(`/tenants/${a.id}/service-accounts`, {
      name: "robot",
    });
    const saKey = await (a.clients.ann as Client).post(
      `/tenants/${a.id}/service-accounts/${sa.body.id}/api-keys`,
      { name: "robot key" },
    );
    expect(saKey.status).toBe(201);

    // pat belongs to two tenants, so an operator makes the link.
    const link = await t.admin.post(`/members/${a.members.pat}/password-link`, {});
    // The operator needs a grant on both tenants first.
    expect(link.status).toBe(404);
    for (const tenant of [a.id, b.body.id]) {
      await t.admin.post(`/tenants/${tenant}/access-grants`, {
        reason: "Reset",
        roleId: roles.viewer,
      });
    }
    const made = await t.admin.post(`/members/${a.members.pat}/password-link`, {});
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const set = await t.anonymous.post(`/member-password-links/${tokenOf(made.body.url)}`, {
      password: OWN,
    });
    expect(set.status).toBe(204);

    expect((await pat.get("/me")).status).toBe(401);
    expect((await held.key.get("/me")).status).toBe(401);
    expect(await recoveryCodesLeft(a.members.pat as string)).toBe(0);
    expect(
      (await t.withKey(saKey.body.token).get(`/tenants/${a.id}/service-accounts`)).status,
    ).not.toBe(401);
    expect(await signInStatus("pat@resetone.example", PASSWORD)).not.toBe(200);
    expect(await signInStatus("pat@resetone.example", OWN)).toBe(200);

    const said = await entries("member.sign_ins_ended", a.members.pat as string);
    expect(said.map((row) => row.tenant_id).sort()).toEqual([a.id, b.body.id].sort());
    expect(said[0]?.details).toMatchObject({
      reason: "password_reset",
      apiKeysEnded: 1,
      recoveryCodesEnded: 10,
    });
  });

  test("the authentication library's own reset is not offered", async () => {
    const asked = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/request-password-reset",
      headers: { origin: t.config.publicUrl },
      payload: { email: ADMIN.email, redirectTo: "/" },
    });
    expect(asked.statusCode).toBeGreaterThanOrEqual(400);
    const reset = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      headers: { origin: t.config.publicUrl },
      payload: { newPassword: "some-other-password-1", token: "nothing" },
    });
    expect(reset.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("an operator's recovery ends the keys and codes the account had", async () => {
    const lost = await t.admin.post("/members", {
      email: "lostkeys@ops.example",
      name: "Lost",
      password: PASSWORD,
    });
    await t.admin.post("/bindings", { memberId: lost.body.id, roleId: roles.operator_admin });
    const as = await t.signIn("lostkeys@ops.example", PASSWORD);
    const key = await as.post("/api-keys", { name: "old" });
    const tenant = await tenantWith("recov", ["rita"]);
    // Recovery codes are for an owner of a tenant.
    await t.admin.post(`/tenants/${tenant.id}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    await t.admin.post(`/tenants/${tenant.id}/members`, {
      email: "lostkeys@ops.example",
      bindings: [{ roleId: roles.tenant_admin }],
    });
    expect((await as.post("/me/recovery-codes", {})).status).toBe(201);

    await recoverOperator(t.kernel, "lostkeys@ops.example");
    expect((await t.withKey(key.body.token).get("/members")).status).toBe(401);
    expect(await recoveryCodesLeft(lost.body.id)).toBe(0);
    expect((await as.get("/me")).status).toBe(401);
  });

  test("a person changing their own password while signed in keeps this session and their keys, and ends the other sessions", async () => {
    const a = await tenantWith("ownchange", ["una"]);
    const una = a.clients.una as Client;
    const other = await t.signIn("una@ownchange.example", PASSWORD);
    const held = await personWithKeyAndCodes(una);
    const changed = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { origin: t.config.publicUrl, ...una.headers },
      payload: { currentPassword: PASSWORD, newPassword: OWN },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect((await una.get("/me")).status).toBe(200);
    expect((await other.get("/me")).status).toBe(401);
    expect((await held.key.get("/me")).status).toBe(200);
  });
});

describe("the first tie to a single sign-on identity ends what signed in before (round three, item 1)", () => {
  async function tied(
    tenantId: string,
    enforce: boolean,
    domain: string,
    email: string,
    subject: string,
  ) {
    const id = newId();
    await t.db
      .insertInto("identity_provider")
      .values({
        id,
        tenant_id: tenantId,
        audience: "members",
        protocol: "oidc",
        name: `IdP ${domain}`,
        config: JSON.stringify({}),
        enabled: true,
        enforce,
        provision: false,
      } as Any)
      .execute();
    await t.db
      .insertInto("identity_domain")
      .values({
        id: newId(),
        provider_id: id,
        tenant_id: tenantId,
        audience: "members",
        domain,
        verified_at: new Date(),
      } as Any)
      .execute();
    const provider = await findProvider(t.db, id, tenantId);
    if (!provider) throw new Error("no provider");
    return t.db
      .transaction()
      .execute((trx) =>
        resolvePerson(
          t.kernel,
          trx,
          (input) => writeAudit(trx, { principal: { type: "system", id: null } }, input),
          provider,
          { subject, email, emailVerified: true, name: undefined, groups: [], attributes: {} },
        ),
      );
  }

  test("where the tenant requires it: sessions, keys, codes and the password end", async () => {
    const a = await tenantWith("ssoreq", ["sue"]);
    const sue = a.clients.sue as Client;
    const held = await personWithKeyAndCodes(sue);
    const done = await tied(a.id, true, "ssoreq.example", "sue@ssoreq.example", "sub-sue");
    expect(done.linked).toBe(true);
    expect((await sue.get("/me")).status).toBe(401);
    expect((await held.key.get("/me")).status).toBe(401);
    expect(await recoveryCodesLeft(a.members.sue as string)).toBe(0);
    const password = await t.db
      .selectFrom("member_account" as Any)
      .select("id")
      .where("member_id", "=", a.members.sue)
      .where("provider_id", "=", "credential")
      .executeTakeFirst();
    expect(password).toBeUndefined();
    const said = await entries("member.sign_ins_ended", a.members.sue as string);
    expect(said[0]).toMatchObject({ tenant_id: a.id });
    expect(said[0]?.details).toMatchObject({ reason: "single_sign_on_tie" });
  });

  test("where it does not require it: the password stays and the rest ends", async () => {
    const a = await tenantWith("ssoopt", ["sid"]);
    const sid = a.clients.sid as Client;
    const held = await personWithKeyAndCodes(sid);
    await tied(a.id, false, "ssoopt.example", "sid@ssoopt.example", "sub-sid");
    expect((await sid.get("/me")).status).toBe(401);
    expect((await held.key.get("/me")).status).toBe(401);
    expect(await recoveryCodesLeft(a.members.sid as string)).toBe(0);
    expect(await signInStatus("sid@ssoopt.example", PASSWORD)).toBe(200);
  });

  test("a second sign-in through the same tie ends nothing", async () => {
    const a = await tenantWith("ssotwice", ["tom"]);
    await tied(a.id, false, "ssotwice.example", "tom@ssotwice.example", "sub-tom");
    const again = await t.signIn("tom@ssotwice.example", PASSWORD);
    const key = await again.post("/api-keys", { name: "later" });
    const link = await t.db
      .selectFrom("identity_link")
      .select("provider_id")
      .where("subject", "=", "sub-tom")
      .executeTakeFirstOrThrow();
    const provider = await findProvider(t.db, link.provider_id, a.id);
    await t.db.transaction().execute((trx) =>
      resolvePerson(
        t.kernel,
        trx,
        (input) => writeAudit(trx, { principal: { type: "system", id: null } }, input),
        provider as Any,
        {
          subject: "sub-tom",
          email: "tom@ssotwice.example",
          emailVerified: true,
          name: undefined,
          groups: [],
          attributes: {},
        },
      ),
    );
    expect((await t.withKey(key.body.token).get("/me")).status).toBe(200);
  });
});

describe("an account that loses its last membership keeps nothing that can sign in (round three, item 2)", () => {
  test("removal by the members route", async () => {
    const a = await tenantWith("lastone", ["ann"]);
    const ann = a.clients.ann as Client;
    const squat = await ann.post(`/tenants/${a.id}/members`, {
      email: "carol@lastone.example",
      name: "Carol",
      password: PLANTED,
    });
    await ann.post(`/tenants/${a.id}/bindings`, {
      principalType: "member",
      principalId: squat.body.id,
      roleId: roles.tenant_admin,
    });
    const carol = await t.signIn("carol@lastone.example", PLANTED);
    const held = await personWithKeyAndCodes(carol);
    expect((await ann.delete(`/tenants/${a.id}/members/${squat.body.id}`)).status).toBe(204);

    expect((await carol.get("/me")).status).toBe(401);
    expect((await held.key.get("/me")).status).toBe(401);
    expect(await recoveryCodesLeft(squat.body.id)).toBe(0);
    expect(await signInStatus("carol@lastone.example", PLANTED)).not.toBe(200);
    // The account stays, as everywhere else, and the entry is in the tenant it left.
    const said = await entries("member.sign_ins_ended", squat.body.id);
    expect(said[0]).toMatchObject({ tenant_id: a.id });
    expect(said[0]?.details).toMatchObject({
      reason: "last_membership_removed",
      passwordEnded: true,
    });
  });

  test("an account that belongs to another tenant, or runs the instance, keeps its sign-ins", async () => {
    const a = await tenantWith("keepone", ["ann"]);
    const b = await tenantWith("keeptwo", ["bea"]);
    const ann = a.clients.ann as Client;
    const shared = await ann.post(`/tenants/${a.id}/members`, {
      email: "bea@keeptwo.example",
    });
    const bea = b.clients.bea as Client;
    const key = await bea.post("/api-keys", { name: "k" });
    expect((await ann.delete(`/tenants/${a.id}/members/${shared.body.id}`)).status).toBe(204);
    expect((await t.withKey(key.body.token).get("/me")).status).toBe(200);
    expect(await signInStatus("bea@keeptwo.example", PASSWORD)).toBe(200);

    // The operator, once added to a tenant and removed again.
    const op = await ann.post(`/tenants/${a.id}/members`, { email: ADMIN.email });
    expect((await ann.delete(`/tenants/${a.id}/members/${op.body.id}`)).status).toBe(204);
    expect(await signInStatus(ADMIN.email, ADMIN.password)).toBe(200);
  });

  test("deleting the tenant", async () => {
    const a = await tenantWith("goneone", ["ann", "gus"]);
    const gus = a.clients.gus as Client;
    const held = await personWithKeyAndCodes(gus);
    const deleted = await deleteTenant(a.id, "goneone");
    expect(deleted.status).toBe(204);
    expect((await gus.get("/me")).status).toBe(401);
    expect((await held.key.get("/me")).status).toBe(401);
    expect(await signInStatus("gus@goneone.example", PASSWORD)).not.toBe(200);
  });
});

async function deleteTenant(id: string, slug: string) {
  return t.admin.post(`/tenants/${id}/deletion`, { confirm: slug });
}

describe("the stricter rule for a password link applies only where the link is handed back (round three, item 3)", () => {
  async function adminAndMember(slug: string) {
    const a = await tenantWith(slug, ["ann"]);
    // A manager who may manage members and nothing more, and a tenant admin to be reset.
    const grant = await t.admin.post(`/tenants/${a.id}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const made = await t.admin.post(`/tenants/${a.id}/roles`, {
      name: "member_manager",
      permissions: ["member:write", "member:read"],
    });
    const mgr = await t.admin.post(`/tenants/${a.id}/members`, {
      email: `max@${slug}.example`,
      name: "Max",
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${a.id}/bindings`, {
      principalType: "member",
      principalId: mgr.body.id,
      roleId: made.body.id,
    });
    await t.admin.delete(`/tenants/${a.id}/access-grants/${grant.body.id}`);
    return { ...a, max: await t.signIn(`max@${slug}.example`, PASSWORD) };
  }

  test("with no mail the link comes back, and a member manager may not make one for an admin", async () => {
    t.kernel.mail.deliver = undefined;
    const a = await adminAndMember("nomail");
    const refused = await a.max.post(`/tenants/${a.id}/members/${a.members.ann}/password-link`, {});
    expect(refused.status).toBe(403);
  });

  test("with mail the link is sent to the member and never returned, and member:write is enough", async () => {
    const a = await adminAndMember("withmail");
    sent.length = 0;
    t.kernel.mail.deliver = async (message) => {
      sent.push(message);
    };
    const made = await a.max.post(`/tenants/${a.id}/members/${a.members.ann}/password-link`, {});
    t.kernel.mail.deliver = undefined;
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body).toMatchObject({ emailed: true, url: null });
    expect(JSON.stringify(made.body)).not.toContain("reset-password");
    expect(sent[0]?.to).toBe("ann@withmail.example");
    const entry = await entries("member.password_link_created", a.members.ann as string);
    expect(entry).toHaveLength(1);
  });

  test("with mail set up but the send failing, the link is not handed back either", async () => {
    const a = await adminAndMember("failmail");
    t.kernel.mail.deliver = async () => {
      throw new Error("the mail server is down");
    };
    const made = await a.max.post(`/tenants/${a.id}/members/${a.members.ann}/password-link`, {});
    t.kernel.mail.deliver = undefined;
    expect(made.status).toBe(503);
    expect(JSON.stringify(made.body)).not.toContain("reset-password");
  });
});

describe("the reviewer's chain, as safe behaviour (chains 1 and 2)", () => {
  test("a planted account, removed from the planting tenant, acts nowhere once another tenant adds the email", async () => {
    const A = await tenantWith("chaina", ["ann"]);
    const B = await tenantWith("chainb", ["bob"]);
    const ann = A.clients.ann as Client;
    const bob = B.clients.bob as Client;
    const squat = await ann.post(`/tenants/${A.id}/members`, {
      email: "carol@corp.example",
      name: "Carol",
      password: PLANTED,
    });
    await ann.post(`/tenants/${A.id}/bindings`, {
      principalType: "member",
      principalId: squat.body.id,
      roleId: roles.tenant_admin,
    });
    const carol = await t.signIn("carol@corp.example", PLANTED);
    const held = await personWithKeyAndCodes(carol);
    await ann.delete(`/tenants/${A.id}/members/${squat.body.id}`);

    const added = await bob.post(`/tenants/${B.id}/members`, {
      email: "carol@corp.example",
      bindings: [{ roleId: roles.tenant_admin }],
    });
    expect(added.status).toBe(201);
    expect((await carol.get(`/tenants/${B.id}/members`)).status).toBe(401);
    expect((await held.key.get(`/tenants/${B.id}/members`)).status).toBe(401);
    expect(await signInStatus("carol@corp.example", PLANTED)).not.toBe(200);
    // Not even with a recovery code under enforced single sign-on.
    expect(
      await signInStatus("carol@corp.example", PLANTED, { "x-recovery-code": held.codes[0] }),
    ).not.toBe(200);

    // The real owner gets a link (mailed: B's admin may make it, as she belongs to B alone).
    const link = await bob.post(`/tenants/${B.id}/members/${squat.body.id}/password-link`, {});
    expect(link.status, JSON.stringify(link.body)).toBe(201);
    await t.anonymous.post(`/member-password-links/${tokenOf(link.body.url)}`, { password: OWN });
    expect(await signInStatus("carol@corp.example", OWN)).toBe(200);
    expect((await held.key.get(`/tenants/${B.id}/members`)).status).toBe(401);
  });

  test("a planted account made an operator holds nothing from before", async () => {
    const A = await tenantWith("chainops", ["ann"]);
    const ann = A.clients.ann as Client;
    const squat = await ann.post(`/tenants/${A.id}/members`, {
      email: "newops@ops.example",
      name: "N",
      password: PLANTED,
    });
    const squatter = await t.signIn("newops@ops.example", PLANTED);
    const key = await squatter.post("/api-keys", { name: "k" });
    await ann.delete(`/tenants/${A.id}/members/${squat.body.id}`);
    const bound = await t.admin.post("/bindings", {
      memberId: squat.body.id,
      roleId: roles.operator_admin,
    });
    expect(bound.status).toBe(201);
    expect((await squatter.get("/members")).status).toBe(401);
    expect((await t.withKey(key.body.token).get("/members")).status).toBe(401);
    expect(await signInStatus("newops@ops.example", PLANTED)).not.toBe(200);
  });
});
