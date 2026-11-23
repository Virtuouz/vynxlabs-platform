import { newId } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const NEW_PASSWORD = "another-good-long-password";

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

/** A tenant with an admin, and one plain member (who belongs nowhere else). */
async function tenantWith(slug: string) {
  const id = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
  const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const make = async (name: string, role: string) => {
    const made = await t.admin.post(`/tenants/${id}/members`, {
      email: `${name}@${slug}.example`,
      name,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${id}/bindings`, {
      principalType: "member",
      principalId: made.body.id,
      roleId: role,
    });
    return made.body.id as string;
  };
  const admin = await make("ann", roles.tenant_admin as string);
  const person = await make("pat", roles.viewer as string);
  await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
  return { id, admin, person, ann: await t.signIn(`ann@${slug}.example`, PASSWORD) };
}

const tokenOf = (url: string) => decodeURIComponent(url.split("/").pop() as string);
const audits = (action: string) =>
  t.db.selectFrom("audit_entry").selectAll().where("action", "=", action).execute();

describe("a link that resets a member's password (D4)", () => {
  test("a tenant admin makes one; it works once, ends the sessions, and is audited without the token", async () => {
    const a = await tenantWith("resets");
    const pat = await t.signIn("pat@resets.example", PASSWORD);
    expect((await pat.get("/me")).status).toBe(200);

    const made = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    // No mail is set up: the link is shown to copy.
    expect(made.body.emailed).toBe(false);
    expect(made.body.url).toContain("/reset-password/");
    const token = tokenOf(made.body.url);

    // Reading it changes nothing.
    const read = await t.anonymous.get(`/member-password-links/${token}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.email).toBe("pat@resets.example");
    expect((await pat.get("/me")).status).toBe(200);

    const set = await t.anonymous.post(`/member-password-links/${token}`, {
      password: NEW_PASSWORD,
    });
    expect(set.status, JSON.stringify(set.body)).toBe(204);
    // The sessions ended; the old password no longer works, the new one does.
    expect((await pat.get("/me")).status).toBe(401);
    await expect(t.signIn("pat@resets.example", PASSWORD)).rejects.toThrow();
    expect((await (await t.signIn("pat@resets.example", NEW_PASSWORD)).get("/me")).status).toBe(
      200,
    );
    // Once.
    expect(
      (await t.anonymous.post(`/member-password-links/${token}`, { password: PASSWORD + "x" }))
        .status,
    ).toBe(410);
    expect((await t.anonymous.get(`/member-password-links/${token}`)).status).toBe(410);

    const created = await audits("member.password_link_created");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ target_id: a.person, tenant_id: a.id });
    expect(created[0]?.actor_id).toBe(a.admin);
    expect(await audits("member.password_reset")).toHaveLength(1);
    const everything = JSON.stringify(await t.db.selectFrom("audit_entry").selectAll().execute());
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(NEW_PASSWORD);
  });

  test("a second link replaces the first, and an expired one does not work", async () => {
    const a = await tenantWith("replaced");
    const one = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    const two = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    expect((await t.anonymous.get(`/member-password-links/${tokenOf(one.body.url)}`)).status).toBe(
      410,
    );
    await t.db
      .updateTable("member_password_token" as Any)
      .set({ expires_at: new Date(Date.now() - 1000) })
      .execute();
    expect(
      (
        await t.anonymous.post(`/member-password-links/${tokenOf(two.body.url)}`, {
          password: NEW_PASSWORD,
        })
      ).status,
    ).toBe(410);
  });

  test("a short password is refused and the link stays good", async () => {
    const a = await tenantWith("short");
    const made = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    const token = tokenOf(made.body.url);
    expect(
      (await t.anonymous.post(`/member-password-links/${token}`, { password: "short" })).status,
    ).toBe(400);
    expect((await t.anonymous.get(`/member-password-links/${token}`)).status).toBe(200);
  });

  test("with mail set up the link is mailed and not shown", async () => {
    sent.length = 0;
    t.kernel.mail.deliver = async (message) => {
      sent.push(message);
    };
    const a = await tenantWith("mailed");
    const made = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    t.kernel.mail.deliver = undefined;
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ emailed: true, url: null });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("pat@mailed.example");
    expect(sent[0]?.text).toContain("/reset-password/");
  });

  test("an admin of another tenant, and a member who belongs elsewhere, are refused", async () => {
    const a = await tenantWith("mine");
    const b = await tenantWith("theirs");
    const across = await b.ann.post(`/tenants/${b.id}/members/${a.person}/password-link`, {});
    expect(across.status).toBe(404);
    expect(
      (await b.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {})).status,
    ).toBe(404);
    // Someone who also belongs to another tenant is not theirs to take over.
    await t.db
      .insertInto("tenant_member")
      .values({ tenant_id: b.id, member_id: a.person } as Any)
      .execute();
    const shared = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    expect(shared.status, JSON.stringify(shared.body)).toBe(409);
    expect(shared.body.detail).toMatch(/operator/i);
    // An operator may.
    const op = await t.admin.post(`/members/${a.person}/password-link`, {});
    expect(op.status, JSON.stringify(op.body)).toBe(201);
    // An operator's own password is not reset by a tenant's admin.
    const ops = await t.admin.get("/me");
    const refused = await a.ann.post(
      `/tenants/${a.id}/members/${ops.body.principal.id}/password-link`,
      {},
    );
    expect([404, 409]).toContain(refused.status);
  });

  test("a member who signs in only through a provider is refused with words", async () => {
    const a = await tenantWith("sso");
    const provider = newId();
    await t.db
      .insertInto("identity_provider")
      .values({
        id: provider,
        tenant_id: a.id,
        audience: "members",
        protocol: "oidc",
        name: "Acme Directory",
        config: JSON.stringify({}),
        enabled: true,
        enforce: true,
      } as Any)
      .execute();
    await t.db
      .insertInto("identity_domain")
      .values({
        id: newId(),
        provider_id: provider,
        tenant_id: a.id,
        audience: "members",
        domain: "sso.example",
        verified_at: new Date(),
      } as Any)
      .execute();
    const refused = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.detail).toContain("Acme Directory");
    expect(
      (await audits("member.password_link_created")).filter((one) => one.target_id === a.person),
    ).toHaveLength(0);
  });

  test("a member with no password (imported) gets one this way", async () => {
    const a = await tenantWith("imported");
    await t.db
      .deleteFrom("member_account" as Any)
      .where("member_id", "=", a.person)
      .execute();
    const made = await a.ann.post(`/tenants/${a.id}/members/${a.person}/password-link`, {});
    const set = await t.anonymous.post(`/member-password-links/${tokenOf(made.body.url)}`, {
      password: NEW_PASSWORD,
    });
    expect(set.status).toBe(204);
    expect((await (await t.signIn("pat@imported.example", NEW_PASSWORD)).get("/me")).status).toBe(
      200,
    );
  });
});
