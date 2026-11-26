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
    // An operator may, with an open access grant on each tenant the member belongs to (A3).
    expect((await t.admin.post(`/members/${a.person}/password-link`, {})).status).toBe(404);
    for (const tenant of [a.id, b.id]) {
      await t.admin.post(`/tenants/${tenant}/access-grants`, {
        reason: "Ticket",
        roleId: roles.tenant_admin,
      });
    }
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

describe("who may make a member's password link (phase 35, A3)", () => {
  const openGrant = async (tenant: string) =>
    (
      await t.admin.post(`/tenants/${tenant}/access-grants`, {
        reason: "Ticket",
        roleId: roles.tenant_admin,
      })
    ).body.id as string;

  test("an operator with no open access grant is refused for a member of a tenant, and no link is made", async () => {
    const a = await tenantWith("nogrant");
    const refused = await t.admin.post(`/members/${a.admin}/password-link`, {});
    expect(refused.status).toBe(404);
    expect(refused.body.url).toBeUndefined();
    const tokens = await t.db
      .selectFrom("member_password_token")
      .select("id")
      .where("member_id", "=", a.admin)
      .execute();
    expect(tokens).toHaveLength(0);
  });

  test("under a grant the operator may, and the entry is in the tenant's log with who made it", async () => {
    const a = await tenantWith("withgrant");
    await openGrant(a.id);
    const made = await t.admin.post(`/members/${a.admin}/password-link`, {});
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const log = await a.ann.get(`/tenants/${a.id}/audit?action=member.password_link_created`);
    expect(log.body.items).toHaveLength(1);
    expect(log.body.items[0].actorId).toBeTruthy();
    expect(log.body.items[0].targetId).toBe(a.admin);
  });

  test("a member of two tenants is logged in each, and the operator needs a grant in each", async () => {
    const a = await tenantWith("twoa");
    const b = await tenantWith("twob");
    await t.db
      .insertInto("tenant_member")
      .values({ tenant_id: b.id, member_id: a.person } as Any)
      .execute();
    await openGrant(a.id);
    expect((await t.admin.post(`/members/${a.person}/password-link`, {})).status).toBe(404);
    await openGrant(b.id);
    expect((await t.admin.post(`/members/${a.person}/password-link`, {})).status).toBe(201);
    for (const tenant of [a, b]) {
      const entries = (await audits("member.password_link_created")).filter(
        (one) => one.tenant_id === tenant.id && one.target_id === a.person,
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]?.actor_id).toBeTruthy();
    }
  });

  test("a member with member:write cannot make a link for a tenant admin, but can for a plain member", async () => {
    const a = await tenantWith("morethan");
    const g = await openGrant(a.id);
    const role = await t.admin.post(`/tenants/${a.id}/roles`, {
      name: "member_maker",
      permissions: ["member:write", "*:read"],
    });
    const made = await t.admin.post(`/tenants/${a.id}/members`, {
      email: "mel@morethan.example",
      name: "Mel",
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${a.id}/bindings`, {
      principalType: "member",
      principalId: made.body.id,
      roleId: role.body.id,
    });
    await t.admin.delete(`/tenants/${a.id}/access-grants/${g}`);
    const mel = await t.signIn("mel@morethan.example", PASSWORD);
    const refused = await mel.post(`/tenants/${a.id}/members/${a.admin}/password-link`, {});
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect((await mel.post(`/tenants/${a.id}/members/${a.person}/password-link`, {})).status).toBe(
      201,
    );
  });
  test("a role held only in one workspace does not count as held across the tenant", async () => {
    const a = await tenantWith("wsscope");
    const g = await openGrant(a.id);
    const ws = await t.admin.post(`/tenants/${a.id}/workspaces`, {
      slug: "w1",
      name: "W1",
      type: "dev",
    });
    const role = await t.admin.post(`/tenants/${a.id}/roles`, {
      name: "member_maker",
      permissions: ["member:write"],
    });
    const make = async (name: string) =>
      (
        await t.admin.post(`/tenants/${a.id}/members`, {
          email: `${name}@wsscope.example`,
          name,
          password: PASSWORD,
        })
      ).body.id as string;
    const bind = (member: string, roleId: string, workspaceId?: string) =>
      t.admin.post(`/tenants/${a.id}/bindings`, {
        principalType: "member",
        principalId: member,
        roleId,
        ...(workspaceId ? { workspaceId } : {}),
      });
    const mel = await make("mel");
    await bind(mel, role.body.id);
    await bind(mel, roles.tenant_admin as string, ws.body.id);
    const wanda = await make("wanda");
    await bind(wanda, roles.workspace_admin as string, ws.body.id);
    await t.admin.delete(`/tenants/${a.id}/access-grants/${g}`);

    const melIn = await t.signIn("mel@wsscope.example", PASSWORD);
    const refused = await melIn.post(`/tenants/${a.id}/members/${a.admin}/password-link`, {});
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);

    // A tenant admin may still make one for a workspace admin.
    const ok = await a.ann.post(`/tenants/${a.id}/members/${wanda}/password-link`, {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    // A workspace binding of the caller covers the target's permissions in that workspace only.
    const mel2 = await melIn.post(`/tenants/${a.id}/members/${wanda}/password-link`, {});
    expect(mel2.status, JSON.stringify(mel2.body)).toBe(201);
  });
});
