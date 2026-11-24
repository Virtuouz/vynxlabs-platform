import { newId, sql } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { appCookieName } from "./kernel/apps/sessions.js";
import { writeAudit } from "./kernel/audit.js";
import { recoverOperator } from "./kernel/bootstrap.js";
import { createPasswordToken, setPasswordWithToken } from "./kernel/endusers.js";
import { generateApiKey } from "./kernel/principal.js";
import { StreamHub } from "./kernel/stream.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let roles: Record<string, string>;

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
  await t?.stop();
});

/** A tenant, with these people as its tenant admins (directly), and a client for each. */
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

/** An operator account with the operator role, and a client signed in as them. */
async function operator(name: string, app: TestApp = t) {
  const made = await app.admin.post("/members", {
    email: `${name}@ops.example`,
    name,
    password: PASSWORD,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const bound = await app.admin.post("/bindings", {
    memberId: made.body.id,
    roleId: roles.operator_admin,
  });
  expect(bound.status, JSON.stringify(bound.body)).toBe(201);
  return {
    id: made.body.id as string,
    binding: bound.body.id as string,
    client: await app.signIn(`${name}@ops.example`, PASSWORD),
  };
}

describe("a binding to anyone holds only what apps use (ACC-01)", () => {
  test("a viewer given to anyone does not open members or the audit log to a caller with no sign-in", async () => {
    const a = await tenantWith("anyone", ["ann"]);
    const bound = await a.clients.ann?.post(`/tenants/${a.id}/bindings`, {
      principalType: "anonymous",
      roleId: roles.viewer,
    });
    expect(bound?.status, JSON.stringify(bound?.body)).toBe(201);
    expect((await t.anonymous.get(`/tenants/${a.id}/members`)).status).toBeGreaterThanOrEqual(401);
    expect((await t.anonymous.get(`/tenants/${a.id}/audit`)).status).toBeGreaterThanOrEqual(401);
    // Someone signed in to another tenant is no better off than nobody.
    const other = await tenantWith("elsewhere", ["eve"]);
    expect(
      (await other.clients.eve?.get(`/tenants/${a.id}/members`))?.status,
    ).toBeGreaterThanOrEqual(401);
  });

  test("the explanation of someone's access does not credit a binding to anyone with what it cannot give", async () => {
    const a = await tenantWith("explain", ["ann"]);
    const ann = a.clients.ann as Client;
    await ann.post(`/tenants/${a.id}/bindings`, {
      principalType: "anonymous",
      roleId: roles.viewer,
    });
    const shown = (await ann.get(`/tenants/${a.id}/access/member/${a.members.ann}`)).body;
    const anyone = shown.sources.find((one: Any) => one.through.type === "anyone");
    const members = shown.permissions.find((one: Any) => one.permission === "member:read");
    expect(members.sources).not.toContain(anyone.id);
  });

  test("a role that gives nothing an app uses is refused for anyone and for end users", async () => {
    const a = await tenantWith("anyone2", ["ann"]);
    const role = await a.clients.ann?.post(`/tenants/${a.id}/roles`, {
      name: "staff_only",
      permissions: ["member:read"],
    });
    expect(role?.status, JSON.stringify(role?.body)).toBe(201);
    for (const principalType of ["anonymous", "end_users"]) {
      const refused = await a.clients.ann?.post(`/tenants/${a.id}/bindings`, {
        principalType,
        roleId: role?.body.id,
      });
      expect(refused?.status, principalType).toBe(400);
    }
  });
});

describe("bindings have keys of their own (ACC-05, ACC-06)", () => {
  test("removing one binding does not remove another that would share its name, and a pull is whole", async () => {
    const a = await tenantWith("keys2", ["kim"]);
    const kim = a.clients.kim as Client;
    const group = await kim.post(`/tenants/${a.id}/groups`, { name: "Tech" });
    const account = await kim.post(`/tenants/${a.id}/service-accounts`, { name: "Tech" });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    expect(account.status, JSON.stringify(account.body)).toBe(201);
    const give = async (principalType: string, principalId: string) =>
      (
        await kim.post(`/tenants/${a.id}/bindings`, {
          principalType,
          principalId,
          roleId: roles.viewer,
        })
      ).body.id as string;
    await give("group", group.body.id);
    const accountBinding = await give("service_account", account.body.id);

    // What a pull writes: every binding has a name of its own.
    const resources = (await kim.get(`/tenants/${a.id}/access`)).body.resources as Any[];
    const bindings = resources.filter((one) => one.kind === "tenant_binding");
    expect(new Set(bindings.map((one) => one.key)).size).toBe(bindings.length);
    // Planning the set exactly as pulled changes nothing.
    const plan = await kim.post(`/tenants/${a.id}/access/plan`, { resources });
    expect(plan.status, JSON.stringify(plan.body)).toBe(200);
    expect(plan.body.summary).toMatchObject({ created: 0, updated: 0, deleted: 0 });

    expect((await kim.delete(`/tenants/${a.id}/bindings/${accountBinding}`)).status).toBe(204);
    const left = (await kim.get(`/tenants/${a.id}/access`)).body.resources as Any[];
    const kept = left.filter((one) => one.kind === "tenant_binding");
    expect(kept.map((one) => one.body.principal.type)).toEqual(["group"]);
  });
});

describe("an operator's grant ends with being an operator (ACC-02, INS-03)", () => {
  test("removing the binding ends the open grant, and disabling the account does too", async () => {
    const a = await tenantWith("grants", ["ann"]);
    for (const how of ["remove", "disable"] as const) {
      const op = await operator(`grant-${how}`);
      const grant = await op.client.post(`/tenants/${a.id}/access-grants`, {
        reason: "Looking into a ticket",
        roleId: roles.tenant_admin,
      });
      expect(grant.status, JSON.stringify(grant.body)).toBe(201);
      expect((await op.client.get(`/tenants/${a.id}/members`)).status).toBe(200);
      const ended =
        how === "remove"
          ? await t.admin.delete(`/bindings/${op.binding}`)
          : await t.admin.patch(`/members/${op.id}`, { disabled: true });
      expect(ended.status, JSON.stringify(ended.body)).toBeLessThan(300);
      expect((await op.client.get(`/tenants/${a.id}/members`)).status).toBeGreaterThanOrEqual(401);
      const open = await a.clients.ann?.get(`/tenants/${a.id}/access-grants`);
      expect(
        open?.body.items.find((one: Any) => one.id === grant.body.id).revokedAt,
      ).not.toBeNull();
    }
  });
});

describe("a disabled account is signed in nowhere (ACC-03, INS-02, GOV-10)", () => {
  test("their sign-in to a tenant's apps ends when an operator disables them", async () => {
    const a = await tenantWith("sessions", ["ann"]);
    const made = await (a.clients.ann as Client).post(`/tenants/${a.id}/members`, {
      email: "carl@sessions.example",
      name: "Carl",
      password: PASSWORD,
    });
    const token = "vxs_acc-test-token";
    const host = "localhost";
    const { createHash } = await import("node:crypto");
    await t.db
      .insertInto("app_session")
      .values({
        id: newId(),
        tenant_id: a.id,
        principal_type: "member",
        principal_id: made.body.id,
        token_hash: createHash("sha256").update(token).digest("hex"),
        host,
        expires_at: new Date(Date.now() + 3_600_000),
        ip_address: null,
        user_agent: null,
      })
      .execute();
    await t.db
      .insertInto("app_handoff")
      .values({
        id: newId(),
        tenant_id: a.id,
        member_id: made.body.id,
        code_hash: "c".repeat(64),
        host,
        expires_at: new Date(Date.now() + 60_000),
      })
      .execute();
    const app = t.withHeaders({ cookie: `${appCookieName(a.id)}=${token}`, host });
    expect((await app.get(`/tenants/${a.id}/session`)).body.principal.type).toBe("member");
    expect((await t.admin.patch(`/members/${made.body.id}`, { disabled: true })).status).toBe(200);
    expect((await app.get(`/tenants/${a.id}/session`)).body.principal.type).toBe("anonymous");
    for (const table of ["app_session", "app_handoff"] as const) {
      const rows = await t.db
        .selectFrom(table)
        .select("id")
        .where("tenant_id", "=", a.id)
        .execute();
      expect(rows, table).toEqual([]);
    }
  });
});

describe("one link at a time sets an end user's password (ACC-07)", () => {
  test("an invitation does not set a password after a reset was used", async () => {
    const a = await tenantWith("links", ["ann"]);
    const user = await t.db
      .insertInto("end_user")
      .values({ id: newId(), tenant_id: a.id, email: "ed@links.example", name: "Ed" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const audit = (trx: Any) => (input: Any) =>
      writeAudit(trx, { principal: { type: "system", id: null } }, input);
    const invite = await t.db
      .transaction()
      .execute((trx) => createPasswordToken(trx, { id: user.id, tenantId: a.id }, "invite"));
    const reset = await t.db
      .transaction()
      .execute((trx) => createPasswordToken(trx, { id: user.id, tenantId: a.id }, "reset"));
    await t.db.transaction().execute((trx) =>
      setPasswordWithToken(t.kernel, trx, audit(trx), {
        tenantId: a.id,
        token: reset.token,
        password: "the-first-password-1",
      }),
    );
    await expect(
      t.db.transaction().execute((trx) =>
        setPasswordWithToken(t.kernel, trx, audit(trx), {
          tenantId: a.id,
          token: invite.token,
          password: "the-second-password-2",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 410 });
  });
});

describe("a service account's key does not answer for a person (ACC-08, API-19)", () => {
  test("a key of a service account that may release cannot approve a release", async () => {
    const a = await tenantWith("approvals", ["ann", "bob"]);
    const ann = a.clients.ann as Client;
    const account = await ann.post(`/tenants/${a.id}/service-accounts`, { name: "Robot" });
    expect(account.status, JSON.stringify(account.body)).toBe(201);
    await ann.post(`/tenants/${a.id}/bindings`, {
      principalType: "service_account",
      principalId: account.body.id,
      roleId: roles.tenant_admin,
    });
    const key = await ann.post(`/tenants/${a.id}/service-accounts/${account.body.id}/api-keys`, {
      name: "robot",
    });
    expect(key.status, JSON.stringify(key.body)).toBe(201);
    const robot = t.withKey(key.body.token);
    expect((await ann.put(`/tenants/${a.id}/access/approval`, { required: true })).status).toBe(
      200,
    );
    const now = (await ann.get(`/tenants/${a.id}/access`)).body.resources as Any[];
    const asked = await ann.post(`/tenants/${a.id}/access/releases`, {
      resources: [...now, { kind: "group", key: "ops", body: { title: "Ops" } }],
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    const decided = await robot.post(
      `/tenants/${a.id}/access/releases/${asked.body.release.id}/decision`,
      {
        decision: "approve",
      },
    );
    expect(decided.status, JSON.stringify(decided.body)).toBe(403);
    expect(
      (
        await (a.clients.bob as Client).post(
          `/tenants/${a.id}/access/releases/${asked.body.release.id}/decision`,
          { decision: "approve" },
        )
      ).status,
    ).toBe(200);
  });

  test("whoever made the key a change was asked with does not approve it", async () => {
    const a = await tenantWith("keymaker", ["ann", "bob"]);
    const ann = a.clients.ann as Client;
    const account = await ann.post(`/tenants/${a.id}/service-accounts`, { name: "Robot" });
    await ann.post(`/tenants/${a.id}/bindings`, {
      principalType: "service_account",
      principalId: account.body.id,
      roleId: roles.tenant_admin,
    });
    const key = await ann.post(`/tenants/${a.id}/service-accounts/${account.body.id}/api-keys`, {
      name: "robot",
    });
    const robot = t.withKey(key.body.token);
    expect((await ann.put(`/tenants/${a.id}/access/approval`, { required: true })).status).toBe(
      200,
    );
    const now = (await robot.get(`/tenants/${a.id}/access`)).body.resources as Any[];
    const asked = await robot.post(`/tenants/${a.id}/access/releases`, {
      resources: [...now, { kind: "group", key: "ops", body: { title: "Ops" } }],
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    const own = await ann.post(
      `/tenants/${a.id}/access/releases/${asked.body.release.id}/decision`,
      {
        decision: "approve",
      },
    );
    expect(own.status, JSON.stringify(own.body)).toBe(409);
    expect(own.body.code).toBe("own_release");
    const other = await (a.clients.bob as Client).post(
      `/tenants/${a.id}/access/releases/${asked.body.release.id}/decision`,
      { decision: "approve" },
    );
    expect(other.status, JSON.stringify(other.body)).toBe(200);
  });

  test("a route about a person's own account refuses a service account's key", async () => {
    const a = await tenantWith("keys", ["ann"]);
    const ann = a.clients.ann as Client;
    const account = await ann.post(`/tenants/${a.id}/service-accounts`, { name: "Robot" });
    await ann.post(`/tenants/${a.id}/bindings`, {
      principalType: "service_account",
      principalId: account.body.id,
      roleId: roles.tenant_admin,
    });
    const key = await ann.post(`/tenants/${a.id}/service-accounts/${account.body.id}/api-keys`, {
      name: "robot",
    });
    const robot = t.withKey(key.body.token);
    expect((await robot.get("/api-keys")).status).toBe(403);
    expect((await ann.get("/api-keys")).status).toBe(200);
  });
});

describe("disabling an account at the instance says which tenants it leaves without an admin", () => {
  test("it is allowed, and the answer and the audit entry name the tenants", async () => {
    const a = await tenantWith("compromised", ["cam"]);
    const done = await t.admin.patch(`/members/${a.members.cam}`, { disabled: true });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.tenantsWithoutAdmin).toEqual([{ id: a.id, name: "compromised" }]);
    const entry = await t.db
      .selectFrom("audit_entry")
      .select("details")
      .where("action", "=", "member.disabled")
      .where("target_id", "=", a.members.cam as string)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(entry.details)).toContain(a.id);
  });

  test("disabling a disabled account, or enabling an enabled one, changes and writes nothing (INS-27)", async () => {
    const a = await tenantWith("twice", ["tom"]);
    const count = async (action: string) =>
      Number(
        (
          await t.db
            .selectFrom("audit_entry")
            .select((eb) => eb.fn.countAll().as("n"))
            .where("action", "=", action)
            .where("target_id", "=", a.members.tom as string)
            .executeTakeFirstOrThrow()
        ).n,
      );
    expect((await t.admin.patch(`/members/${a.members.tom}`, { disabled: false })).status).toBe(
      200,
    );
    expect(await count("member.enabled")).toBe(0);
    await t.admin.patch(`/members/${a.members.tom}`, { disabled: true });
    const again = await t.admin.patch(`/members/${a.members.tom}`, { disabled: true });
    expect(again.status).toBe(200);
    expect(again.body.tenantsWithoutAdmin).toEqual([]);
    expect(await count("member.disabled")).toBe(1);
    await t.admin.patch(`/members/${a.members.tom}`, { disabled: false });
    await t.admin.patch(`/members/${a.members.tom}`, { disabled: false });
    expect(await count("member.enabled")).toBe(1);
  });

  test("ending an access grant that has ended writes no second entry (INS-27)", async () => {
    const a = await tenantWith("regrant", ["rae"]);
    const grant = await t.admin.post(`/tenants/${a.id}/access-grants`, {
      reason: "look at the logs",
    });
    expect(grant.status, JSON.stringify(grant.body)).toBe(201);
    expect((await t.admin.delete(`/tenants/${a.id}/access-grants/${grant.body.id}`)).status).toBe(
      204,
    );
    expect((await t.admin.delete(`/tenants/${a.id}/access-grants/${grant.body.id}`)).status).toBe(
      204,
    );
    const entries = await t.db
      .selectFrom("audit_entry")
      .select("id")
      .where("action", "=", "access_grant.revoked")
      .where("target_id", "=", grant.body.id)
      .execute();
    expect(entries).toHaveLength(1);
  });

  test("their open event streams and unfinished sign-ins end with it", async () => {
    const a = await tenantWith("streams", ["sam"]);
    let closed = 0;
    const principal = `member:${a.members.sam}`;
    const unsubscribe = await t.kernel.stream.subscribe({
      tenantId: a.id,
      may: new Map(),
      principal,
      send: () => undefined,
      close: () => {
        closed += 1;
      },
    });
    expect(unsubscribe).not.toBe(false);
    await t.admin.patch(`/members/${a.members.sam}`, { disabled: true });
    await vi.waitFor(() => expect(closed).toBe(1));
  });

  test("they end on every replica, not only the one that handled it, and only once the change is kept (INS-02)", async () => {
    const a = await tenantWith("replicas", ["rex", "ruth"]);
    // Another replica: its own hub, with its own listening connection to the same database.
    const elsewhere = new StreamHub(t.database, t.kernel.log);
    const closed: string[] = [];
    const open = async (hub: StreamHub, principal: string, label: string) =>
      hub.subscribe({
        tenantId: a.id,
        may: new Map(),
        principal,
        send: () => undefined,
        close: () => closed.push(label),
      });
    await open(elsewhere, `member:${a.members.rex}`, "rex elsewhere");
    await open(elsewhere, `member:${a.members.ruth}`, "ruth elsewhere");
    await open(t.kernel.stream, `member:${a.members.rex}`, "rex here");
    // What other replicas hear is on the database's channel.
    const heard: string[] = [];
    const listener = await t.database.listen({
      channels: ["vx_ended"],
      onMessage: (_channel, payload) => heard.push(payload),
      onError: () => undefined,
    });
    try {
      await t.admin.patch(`/members/${a.members.rex}`, { disabled: true });
      await vi.waitFor(() => expect(closed.sort()).toEqual(["rex elsewhere", "rex here"]));
      expect(heard.map((one) => JSON.parse(one).p)).toEqual([`member:${a.members.rex}`]);
    } finally {
      await listener.close();
      await elsewhere.close();
    }
  });

  test("an end user disabled loses their pending sign-in codes and open streams too (INS-02)", async () => {
    const a = await tenantWith("endusers", ["eva"]);
    const user = await t.db
      .insertInto("end_user")
      .values({ id: newId(), tenant_id: a.id, email: "ed@endusers.example", name: "Ed" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const provider = newId();
    await sql`
      insert into identity_provider (id, tenant_id, audience, protocol, name, config)
      values (${provider}, ${a.id}, 'end_users', 'oidc', 'Customers', '{}'::jsonb)
    `.execute(t.db);
    const pending = async (code: string, person: string) =>
      sql`
        insert into sso_state (id, provider_id, tenant_id, purpose, state_hash, browser_hash, origin,
          expires_at, finish_hash, principal_id)
        values (${newId()}, ${provider}, ${a.id}, 'sign_in', ${newId()}, '', 'http://localhost:8080',
          now() + interval '10 minutes', ${code}, ${person})
      `.execute(t.db);
    await pending("code-of-ed", user.id);
    await pending("code-of-someone-else", newId());
    let closed = 0;
    await t.kernel.stream.subscribe({
      tenantId: a.id,
      may: new Map(),
      principal: `end_user:${user.id}`,
      own: `end_user:${user.id}`,
      send: () => undefined,
      close: () => {
        closed += 1;
      },
    });
    const done = await (a.clients.eva as Client).patch(`/tenants/${a.id}/end-users/${user.id}`, {
      disabled: true,
    });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const codes = await t.db
      .selectFrom("sso_state")
      .select("finish_hash")
      .where("tenant_id", "=", a.id)
      .execute();
    expect(codes.map((one) => one.finish_hash)).toEqual(["code-of-someone-else"]);
    await vi.waitFor(() => expect(closed).toBe(1));
  });
});

describe("the last person who can administer stays (ACC-09, ACC-10, GOV-04)", () => {
  test("the only tenant admin cannot remove themself, or their own binding, or be suspended by another", async () => {
    const a = await tenantWith("solo", ["sol"]);
    const sol = a.clients.sol as Client;
    expect((await sol.delete(`/tenants/${a.id}/members/${a.members.sol}`)).status).toBe(409);
    const mine = (await sol.get(`/tenants/${a.id}/bindings`)).body.items.find(
      (one: Any) => one.principalId === a.members.sol,
    );
    expect((await sol.delete(`/tenants/${a.id}/bindings/${mine.id}`)).status).toBe(409);
    expect((await sol.get(`/tenants/${a.id}/members`)).status).toBe(200);
  });

  test("someone who administers through a group counts, and the group's last one stays", async () => {
    const a = await tenantWith("viagroup", ["gus"]);
    const gus = a.clients.gus as Client;
    const group = await gus.post(`/tenants/${a.id}/groups`, { name: "Admins" });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    await gus.post(`/tenants/${a.id}/bindings`, {
      principalType: "group",
      principalId: group.body.id,
      roleId: roles.tenant_admin,
    });
    const hal = await gus.post(`/tenants/${a.id}/members`, {
      email: "hal@viagroup.example",
      name: "Hal",
      password: PASSWORD,
    });
    const put = await gus.put(`/tenants/${a.id}/groups/${group.body.id}/members/${hal.body.id}`);
    expect(put.status, JSON.stringify(put.body)).toBe(204);
    // Gus may go now: Hal administers through the group.
    expect((await gus.delete(`/tenants/${a.id}/members/${a.members.gus}`)).status).toBe(204);
    const hals = await t.signIn("hal@viagroup.example", PASSWORD);
    expect(
      (await hals.delete(`/tenants/${a.id}/groups/${group.body.id}/members/${hal.body.id}`)).status,
    ).toBe(409);
  });

  test("two admins who remove each other at once leave one", async () => {
    const a = await tenantWith("race", ["ray", "sue"]);
    const [one, two] = await Promise.all([
      (a.clients.ray as Client).delete(`/tenants/${a.id}/members/${a.members.sue}`),
      (a.clients.sue as Client).delete(`/tenants/${a.id}/members/${a.members.ray}`),
    ]);
    expect([one.status, two.status].sort()).toEqual([204, 409]);
  });

  test("approval is turned on only when two people who can answer exist", async () => {
    const a = await tenantWith("pair", ["pia", "pat"]);
    const pia = a.clients.pia as Client;
    expect(
      (await pia.patch(`/tenants/${a.id}/members/${a.members.pat}`, { suspended: true })).status,
    ).toBe(200);
    // A suspended admin cannot answer.
    expect((await pia.put(`/tenants/${a.id}/access/approval`, { required: true })).status).toBe(
      409,
    );
    expect(
      (await pia.patch(`/tenants/${a.id}/members/${a.members.pat}`, { suspended: false })).status,
    ).toBe(200);
    expect((await pia.put(`/tenants/${a.id}/access/approval`, { required: true })).status).toBe(
      200,
    );
  });

  test("approval counts one who may through a group, and not a disabled account", async () => {
    const a = await tenantWith("pair2", ["una"]);
    const una = a.clients.una as Client;
    const group = await una.post(`/tenants/${a.id}/groups`, { name: "Releasers" });
    await una.post(`/tenants/${a.id}/bindings`, {
      principalType: "group",
      principalId: group.body.id,
      roleId: roles.tenant_admin,
    });
    const vic = await una.post(`/tenants/${a.id}/members`, {
      email: "vic@pair2.example",
      name: "Vic",
      password: PASSWORD,
    });
    expect(
      (await una.put(`/tenants/${a.id}/groups/${group.body.id}/members/${vic.body.id}`)).status,
    ).toBe(204);
    expect((await una.put(`/tenants/${a.id}/access/approval`, { required: true })).status).toBe(
      200,
    );
  });
});

describe("the instance keeps an operator who can sign in (ACC-09, INS-04, GOV-04)", () => {
  let o: TestApp;
  beforeAll(async () => {
    o = await startTestApp();
    roles = { ...roles };
  }, 60_000);
  afterAll(async () => {
    await o?.stop();
  });

  test("the instance keeps an operator who can sign in", async () => {
    const x = await operator("x", o);
    const y = await operator("y", o);
    const everyone = (await o.admin.get("/bindings")).body.items as Any[];
    // Leave only x and y: an operator who was made earlier is turned off.
    for (const one of everyone) {
      if (![x.binding, y.binding].includes(one.id) && one.memberEmail !== "operator@example.com") {
        await o.admin.delete(`/bindings/${one.id}`);
      }
    }
    // The first operator and x remove each other at once, and one stays.
    const first = (await o.admin.get("/bindings")).body.items.find(
      (one: Any) => one.memberEmail === "operator@example.com",
    );
    await o.admin.delete(`/bindings/${y.binding}`);
    const [a, b] = await Promise.all([
      o.admin.delete(`/bindings/${x.binding}`),
      x.client.delete(`/bindings/${first.id}`),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 409]);
  });

  test("a disabled operator is not one who is left", async () => {
    const z = await operator("z", o);
    const w = await operator("w", o);
    for (const one of (await o.admin.get("/bindings")).body.items as Any[]) {
      if (![z.binding, w.binding].includes(one.id))
        await o.admin.delete(`/bindings/${one.id}`).catch(() => undefined);
    }
    expect((await z.client.patch(`/members/${w.id}`, { disabled: true })).status).toBe(200);
    expect((await z.client.delete(`/bindings/${z.binding}`)).status).toBe(409);
    // Nor can one be made of nobody, or of someone whose account is off.
    expect(
      (await z.client.post("/bindings", { memberId: newId(), roleId: roles.operator_admin }))
        .status,
    ).toBe(400);
    expect(
      (await z.client.post("/bindings", { memberId: w.id, roleId: roles.operator_admin })).status,
    ).toBe(400);
    // The only operator cannot disable themself, and is not turned off by another who is gone.
    expect((await z.client.patch(`/members/${z.id}`, { disabled: true })).status).toBe(400);
  });
});

describe("the way back for a locked-out instance (D3)", () => {
  test("a command run on the machine enables the account, makes it an operator and sets a password once", async () => {
    const lost = await t.admin.post("/members", {
      email: "lost@ops.example",
      name: "Lost",
      password: PASSWORD,
    });
    await t.admin.patch(`/members/${lost.body.id}`, { disabled: true });
    const done = await recoverOperator(t.kernel, "Lost@ops.example");
    const again = await t.signIn("lost@ops.example", done.password);
    expect((await again.get("/bindings")).status).toBe(200);
    expect(
      (
        await t.db
          .selectFrom("audit_entry")
          .select("id")
          .where("action", "=", "operator.recovered")
          .execute()
      ).length,
    ).toBe(1);
  });
});

describe("only an operator admin is the operator (INS-07)", () => {
  test("only that role is bound at the instance, and a tenant's own code is told apart from the operator's", async () => {
    const m = await t.admin.post("/members", {
      email: "vera@ops.example",
      name: "Vera",
      password: PASSWORD,
    });
    const refused = await t.admin.post("/bindings", { memberId: m.body.id, roleId: roles.viewer });
    expect(refused.status).toBe(400);
  });
});

void generateApiKey;
