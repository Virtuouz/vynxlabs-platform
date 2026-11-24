import { newId } from "@volvel/db";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { membershipForProvider } from "./kernel/tenant/releases.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
let bob: Client;
let main: string;
let roles: Record<string, string>;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const desk = (title = "Tech Desk") => ({
  kind: "group",
  key: "tech-desk",
  body: {
    title,
    description: "Lends and repairs devices.",
    membership: { sso: { values: ["it-tech-desk"] } },
  },
});
const students = { kind: "end_user_group", key: "students", body: { title: "Students" } };
const assistant = {
  kind: "service_account",
  key: "helpdesk-assistant",
  body: { title: "Helpdesk assistant", description: "Answers students." },
};
const lender = {
  kind: "tenant_role",
  key: "device_lender",
  body: { description: "Lends devices.", permissions: ["run:write", "data:read"] },
};
const lends = {
  kind: "tenant_binding",
  key: "tech-desk-lends",
  body: {
    role: "device_lender",
    principal: { type: "group", key: "tech-desk" },
    workspace: "main",
  },
};
const sees = {
  kind: "tenant_binding",
  key: "assistant-sees",
  body: { role: "viewer", principal: { type: "service_account", key: "helpdesk-assistant" } },
};
const all = [lender, desk(), students, assistant, lends, sees];

const at = () => `/tenants/${tenant}/access`;
const release = (resources: object[], extra: object = {}, client = alice) =>
  client.post(`${at()}/releases`, { resources, ...extra });
const current = async () => (await alice.get(at())).body.resources as Any[];

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "lakeshore", name: "Lakeshore" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  for (const who of ["alice", "bob"]) {
    const member = await t.admin.post(`/tenants/${tenant}/members`, {
      email: `${who}@lakeshore.example`,
      name: who,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
  }
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@lakeshore.example", PASSWORD);
  bob = await t.signIn("bob@lakeshore.example", PASSWORD);
  main = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "main", name: "Main", type: "dev" })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("a tenant's access, released from a set", () => {
  test("a tenant that was just made has none, and what people are given is not part of it", async () => {
    expect(await current()).toEqual([]);
  });

  test("the plan says what a release would do, and changes nothing", async () => {
    const plan = await alice.post(`${at()}/plan`, { resources: all });
    expect(plan.status, JSON.stringify(plan.body)).toBe(200);
    expect(plan.body).toMatchObject({
      possible: true,
      waits: false,
      summary: { created: 6, updated: 0, deleted: 0 },
    });
    expect(
      plan.body.summary.changes.map((one: Any) => `${one.change} ${one.kind} ${one.label}`),
    ).toEqual([
      "created tenant_role device_lender",
      "created group Tech Desk",
      "created end_user_group Students",
      "created service_account Helpdesk assistant",
      "created tenant_binding viewer to service account helpdesk-assistant",
      "created tenant_binding device_lender to group tech-desk in main",
    ]);
    expect(await current()).toEqual([]);
  });

  test("a release makes the groups, the service account, the role and what they are given", async () => {
    const released = await release(all, { message: "First release" });
    expect(released.status, JSON.stringify(released.body)).toBe(201);
    expect(released.body).toMatchObject({ number: 1, status: "applied", summary: { created: 6 } });

    const group = await t.db
      .selectFrom("principal_group")
      .selectAll()
      .where("tenant_id", "=", tenant)
      .executeTakeFirstOrThrow();
    expect(group).toMatchObject({
      key: "tech-desk",
      name: "Tech Desk",
      description: "Lends and repairs devices.",
      managed_by: "release",
    });
    // The group really holds the role, in that workspace, as if it had been given by hand.
    const held = await t.db
      .selectFrom("binding")
      .innerJoin("role", "role.id", "binding.role_id")
      .select(["role.name", "binding.workspace_id", "binding.scope_type"])
      .where("binding.principal_id", "=", group.id)
      .execute();
    expect(held).toEqual([{ name: "device_lender", workspace_id: main, scope_type: "workspace" }]);

    // Read back, it is what was released: the console and a repository see the same thing.
    const now = await current();
    expect(now.map((one) => `${one.kind} ${one.key}`)).toEqual([
      "tenant_role device_lender",
      "group tech-desk",
      "end_user_group students",
      "service_account helpdesk-assistant",
      "tenant_binding helpdesk-assistant-viewer",
      "tenant_binding tech-desk-device-lender-main",
    ]);
    expect(now.find((one) => one.key === "tech-desk")).toEqual(desk());
    expect((await alice.get(at())).body.files.map((file: Any) => file.path)).toEqual([
      "bindings/helpdesk-assistant-viewer.tenant_binding.yaml",
      "bindings/tech-desk-device-lender-main.tenant_binding.yaml",
      "end-user-groups/students.end_user_group.yaml",
      "groups/tech-desk.group.yaml",
      "roles/device_lender.tenant_role.yaml",
      "service-accounts/helpdesk-assistant.service_account.yaml",
    ]);
    // Releasing the same set again changes nothing.
    const again = await release(all);
    expect(again.body.summary).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 6 });
  });

  test("a title changes and the group is the same group, with what it holds", async () => {
    const before = await t.db
      .selectFrom("principal_group")
      .select("id")
      .where("tenant_id", "=", tenant)
      .executeTakeFirstOrThrow();
    const renamed = await release([
      lender,
      desk("IT Service Desk"),
      students,
      assistant,
      lends,
      sees,
    ]);
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(201);
    expect(renamed.body.summary).toMatchObject({ created: 0, updated: 1, deleted: 0 });
    expect(renamed.body.summary.changes).toEqual([
      { change: "updated", kind: "group", key: "tech-desk", label: "IT Service Desk" },
    ]);
    const after = await t.db
      .selectFrom("principal_group")
      .select(["id", "key", "name"])
      .where("tenant_id", "=", tenant)
      .executeTakeFirstOrThrow();
    expect(after).toEqual({ id: before.id, key: "tech-desk", name: "IT Service Desk" });
    expect(
      await t.db.selectFrom("binding").select("id").where("principal_id", "=", before.id).execute(),
    ).toHaveLength(1);
  });

  test("what is wrong with a set is said by name, and nothing changes", async () => {
    const refused = await release([
      desk(),
      {
        kind: "tenant_binding",
        key: "x",
        body: { role: "viewer", principal: { type: "group", key: "nobody" } },
      },
      { kind: "tenant_role", key: "odd", body: { permissions: ["nonsense:write"] } },
    ]);
    expect(refused.status).toBe(400);
    expect(refused.body.errors).toEqual([
      {
        path: "tenant binding x",
        message: '/body/principal names the group "nobody", which is not defined.',
      },
      {
        path: "tenant role odd",
        message: '/body/permissions "nonsense:write" is not a permission a role can give.',
      },
    ]);
    const unknownRole = await release([
      ...all,
      {
        kind: "tenant_binding",
        key: "y",
        body: { role: "wizard", principal: { type: "group", key: "tech-desk" } },
      },
    ]);
    expect(unknownRole.status).toBe(400);
    expect(unknownRole.body.detail).toBe('There is no role "wizard" that this tenant can give.');
    const operator = await release([
      ...all,
      {
        kind: "tenant_binding",
        key: "z",
        body: { role: "operator_admin", principal: { type: "group", key: "tech-desk" } },
      },
    ]);
    expect(operator.status).toBe(400);
  });
});

describe("what the console made, and what a workspace still uses", () => {
  test("a group made in the console gets a key from its name, and a release does not remove it unasked", async () => {
    const made = await alice.post(`/tenants/${tenant}/groups`, { name: "Finance & Billing" });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect((await current()).map((one) => one.key)).toContain("finance-billing");

    const refused = await release([
      lender,
      desk("IT Service Desk"),
      students,
      assistant,
      lends,
      sees,
    ]);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("delete_not_allowed");
    expect(refused.body.errors).toEqual([
      {
        path: "group/finance-billing",
        message:
          "the group finance-billing is not in what is being released (--allow-delete group/finance-billing)",
      },
    ]);
    const plan = (await alice.post(`${at()}/plan`, { resources: all })).body;
    expect(plan).toMatchObject({ possible: false, refusal: { code: "delete_not_allowed" } });

    const allowed = await release(
      [lender, desk("IT Service Desk"), students, assistant, lends, sees],
      { allowDelete: ["group/finance-billing"] },
    );
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
    expect(allowed.body.summary).toMatchObject({ deleted: 1 });
    // The repository never heard of the group. Whoever releases is told which change this undoes.
    expect(allowed.body.summary.warnings).toEqual([
      expect.stringMatching(
        /^the group finance-billing was last changed in access change \d+, outside the repository\. This removes it\. /,
      ),
    ]);
    // Said once: the next release of the whole set starts from this one.
    const again = await release([lender, desk(), students, assistant, lends, sees]);
    expect(again.body.summary.warnings).toEqual([]);
    await release([lender, desk("IT Service Desk"), students, assistant, lends, sees]);
  });

  test("a group that a workspace's bundle still gives access to is not removed", async () => {
    const manifest = (
      kind: string,
      path: string,
      body: Record<string, unknown>,
    ): BundleManifest => ({
      kind,
      schemaVersion: 1,
      path,
      ownership: "code",
      body,
    });
    const unsigned = {
      formatVersion: 1 as const,
      sdkVersion: "0.5.0",
      core: { min: "0.0.0", below: "99.0.0" },
      manifests: [
        manifest("binding", "access/desk", {
          role: "viewer",
          principal: { type: "group", name: "IT Service Desk" },
        }),
      ],
      code: "export {};",
    };
    const bundle: Bundle = { ...unsigned, digest: bundleDigest(unsigned) };
    const uploaded = await alice.post(`/tenants/${tenant}/workspaces/${main}/bundles`, bundle);
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    expect(
      (
        await alice.post(`/tenants/${tenant}/workspaces/${main}/deployments`, {
          bundleId: uploaded.body.id,
        })
      ).status,
    ).toBe(201);

    const refused = await release([lender, students, assistant, sees], {
      allowDelete: ["group/tech-desk"],
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("principal_in_use");
    expect(refused.body.detail).toContain("the binding access/desk in main");
    expect((await current()).map((one) => one.key)).toContain("tech-desk");
  });
});

describe("identity providers and the tenant's access", () => {
  test("a provider made after a release is given the group memberships that release said", async () => {
    // Made as the provider routes make one, without reaching for an issuer that is not there:
    // the row, and then what making a provider does for the tenant's released access.
    const made = { body: { id: newId() } };
    await t.db
      .insertInto("identity_provider")
      .values({
        id: made.body.id,
        tenant_id: tenant,
        audience: "members",
        protocol: "oidc",
        name: "Lakeshore sign-in",
        config: JSON.stringify({ issuer: "https://idp.lakeshore.example", clientId: "platform" }),
        secrets: null,
      })
      .execute();
    await t.db.transaction().execute((trx) => membershipForProvider(trx, tenant));
    const maps = await t.db
      .selectFrom("identity_group_map")
      .innerJoin("principal_group", "principal_group.id", "identity_group_map.member_group_id")
      .select([
        "identity_group_map.claim_value",
        "principal_group.key",
        "identity_group_map.managed_by",
      ])
      .where("identity_group_map.provider_id", "=", made.body.id)
      .execute();
    expect(maps).toEqual([
      { claim_value: "it-tech-desk", key: "tech-desk", managed_by: "release" },
    ]);

    // A release that changes the values replaces its own, and leaves one made by hand.
    const group = await t.db
      .selectFrom("principal_group")
      .select("id")
      .where("tenant_id", "=", tenant)
      .where("key", "=", "tech-desk")
      .executeTakeFirstOrThrow();
    const byHand = await alice.put(
      `/tenants/${tenant}/identity-providers/${made.body.id}/group-maps`,
      // The whole list as the console sends it back: what the release mapped, and one more.
      {
        items: [
          { value: "it-tech-desk", groupId: group.id },
          { value: "contractors", groupId: group.id },
        ],
      },
    );
    expect(byHand.status, JSON.stringify(byHand.body)).toBeLessThan(300);
    const changed = {
      ...desk("IT Service Desk"),
      body: { ...desk("IT Service Desk").body, membership: { sso: { values: ["service-desk"] } } },
    };
    expect((await release([lender, changed, students, assistant, lends, sees])).status).toBe(201);
    const after = await t.db
      .selectFrom("identity_group_map")
      .select(["claim_value", "managed_by"])
      .where("provider_id", "=", made.body.id)
      .orderBy("claim_value")
      .execute();
    expect(after).toEqual([
      { claim_value: "contractors", managed_by: "hand" },
      { claim_value: "service-desk", managed_by: "release" },
    ]);
    expect(
      (await release([lender, desk("IT Service Desk"), students, assistant, lends, sees])).status,
    ).toBe(201);
  });
});

describe("a workspace's bindings and the tenant's access", () => {
  const bundleOf = (principal: object, marker: string): Bundle => {
    const unsigned = {
      formatVersion: 1 as const,
      sdkVersion: "0.5.0",
      core: { min: "0.0.0", below: "99.0.0" },
      manifests: [
        {
          kind: "binding",
          schemaVersion: 1,
          path: "access/desk",
          ownership: "code" as const,
          body: { role: "viewer", principal },
        },
      ],
      code: `export const marker = ${JSON.stringify(marker)};`,
    };
    return { ...unsigned, digest: bundleDigest(unsigned) };
  };
  const deploy = async (bundle: Bundle) => {
    const uploaded = await alice.post(`/tenants/${tenant}/workspaces/${main}/bundles`, bundle);
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
    return alice.post(`/tenants/${tenant}/workspaces/${main}/deployments`, {
      bundleId: uploaded.body.id,
    });
  };
  const given = async () => {
    const group = await t.db
      .selectFrom("principal_group")
      .select("id")
      .where("tenant_id", "=", tenant)
      .where("key", "=", "tech-desk")
      .executeTakeFirstOrThrow();
    return t.db
      .selectFrom("binding")
      .select("id")
      .where("principal_id", "=", group.id)
      .where("source_resource_id", "is not", null)
      .execute();
  };

  test("a binding that names a group by its title is told the key, on every deploy", async () => {
    const again = await deploy(bundleOf({ type: "group", name: "IT Service Desk" }, "again"));
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.summary.warnings).toEqual([
      {
        path: "access/desk",
        message:
          'the binding access/desk names the group by its title "IT Service Desk", which can change. Name it by key: "tech-desk".',
      },
    ]);
  });

  test("a binding by key holds through a change of title, and a missing key says what to add", async () => {
    const byKey = await deploy(bundleOf({ type: "group", key: "tech-desk" }, "by key"));
    expect(byKey.status, JSON.stringify(byKey.body)).toBe(201);
    expect(byKey.body.summary.warnings).toEqual([]);
    expect(await given()).toHaveLength(1);
    const renamed = await release([lender, desk("Lending Desk"), students, assistant, lends, sees]);
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(201);
    expect(await given()).toHaveLength(1);

    const missing = await deploy(bundleOf({ type: "group", key: "night-shift" }, "missing"));
    expect(missing.status).toBe(400);
    expect(missing.body.errors).toEqual([
      {
        path: "/body/principal/key",
        message:
          'no group has the key "night-shift" in this tenant. Add tenant/groups/night-shift.group.yaml to the repository and run `volvel tenant release`, or make it in the console',
      },
    ]);
  });

  test("a binding whose access was lost is given again by the next deploy, though it did not change", async () => {
    const lost = await given();
    await t.db
      .deleteFrom("binding")
      .where(
        "id",
        "in",
        lost.map((row) => row.id),
      )
      .execute();
    expect(await given()).toHaveLength(0);
    // The same binding, in a bundle that differs only in its code.
    const redeployed = await deploy(bundleOf({ type: "group", key: "tech-desk" }, "repaired"));
    expect(redeployed.status, JSON.stringify(redeployed.body)).toBe(201);
    expect(redeployed.body.summary).toMatchObject({ unchanged: 1, updated: 0 });
    expect(await given()).toHaveLength(1);
  });
});

describe("going back, and asking a second person", () => {
  test("an earlier release is gone back to as a new release of what it left", async () => {
    const releases = (await alice.get(`${at()}/releases`)).body.items as Any[];
    const first = releases.find((one) => one.number === 1);
    expect(first).toMatchObject({
      status: "applied",
      message: "First release",
      createdBy: "alice",
    });
    // Asking what going back would do changes nothing, and names what it removes.
    const before = ((await alice.get(`${at()}/releases`)).body.items as Any[]).length;
    const preview = await alice.get(`${at()}/releases/${first.id}/rollback`);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body).toMatchObject({ number: 1 });
    expect(preview.body.asks.length).toBeGreaterThan(0);
    expect(preview.body.allowDelete).toEqual(
      (preview.body.removes as Any[]).map((one) => `${one.kind}/${one.key}`),
    );
    expect(((await alice.get(`${at()}/releases`)).body.items as Any[]).length).toBe(before);
    const back = await alice.post(`${at()}/releases/${first.id}/rollback`);
    expect(back.status, JSON.stringify(back.body)).toBe(201);
    expect(back.body.summary.changes).toEqual([
      { change: "updated", kind: "group", key: "tech-desk", label: "Tech Desk" },
    ]);
    const latest = ((await alice.get(`${at()}/releases`)).body.items as Any[])[0];
    expect(latest).toMatchObject({ origin: "rollback", message: "Back to access change 1" });
  });

  test("going back says first what it would remove, by name, and removes it only when asked", async () => {
    const first = ((await alice.get(`${at()}/releases`)).body.items as Any[]).find(
      (one) => one.number === 1,
    );
    const made = await release([
      ...all,
      { kind: "group", key: "late-shift", body: { title: "Late shift" } },
    ]);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const preview = await alice.get(`${at()}/releases/${first.id}/rollback`);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.removes).toEqual([
      { kind: "group", key: "late-shift", label: "Late shift" },
    ]);
    expect(preview.body.allowDelete).toEqual(["group/late-shift"]);
    // Looking changed nothing.
    expect((await current()).some((one) => one.key === "late-shift")).toBe(true);
    expect((await alice.post(`${at()}/releases/${first.id}/rollback`)).status).toBe(201);
    expect((await current()).some((one) => one.key === "late-shift")).toBe(false);
  });

  test("with approval on, a release waits, its author cannot approve it, and another person can", async () => {
    expect((await alice.put(`${at()}/approval`, { required: true })).status).toBe(200);
    const asked = await release([lender, desk("Service Desk"), students, assistant, lends, sees]);
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    expect(asked.body).toMatchObject({
      waiting: true,
      release: { status: "awaiting_approval", summary: { updated: 1 } },
    });
    // Nothing changed yet.
    expect((await current()).find((one) => one.key === "tech-desk").body.title).toBe("Tech Desk");

    const decide = (client: Client, decision: string, id = asked.body.release.id) =>
      client.post(`${at()}/releases/${id}/decision`, { decision });
    const own = await decide(alice, "approve");
    expect(own.status).toBe(409);
    expect(own.body.code).toBe("own_release");
    const approved = await decide(bob, "approve");
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.status).toBe("applied");
    expect((await current()).find((one) => one.key === "tech-desk").body.title).toBe(
      "Service Desk",
    );
    expect((await decide(bob, "approve")).status).toBe(409);

    // One that the tenant moved under is not applied as something else.
    const stale = await release([lender, desk("Desk"), students, assistant, lends, sees]);
    const other = await release(
      [lender, desk("Help Desk"), students, assistant, lends, sees],
      {},
      bob,
    );
    expect((await decide(alice, "approve", other.body.release.id)).status).toBe(200);
    // The release that was asked against the old state is marked so, not left waiting (REL-16).
    const listed = ((await alice.get(`${at()}/releases`)).body.items as Any[]).find(
      (one) => one.id === stale.body.release.id,
    );
    expect(listed.status).toBe("superseded");
    const late = await decide(bob, "approve", stale.body.release.id);
    // It was marked superseded when the other applied (ACC-15), so it is not left saying it waits.
    expect(late.status).toBe(409);
    expect(late.body.message ?? late.body.detail).toContain("superseded");
    expect((await decide(bob, "withdraw", stale.body.release.id)).status).toBe(409);
    expect((await decide(alice, "withdraw", stale.body.release.id)).status).toBe(409);

    // What the console changes waits the same way: a group made there is not there yet.
    const made = await alice.post(`/tenants/${tenant}/groups`, { name: "Night shift" });
    expect(made.status, JSON.stringify(made.body)).toBe(202);
    expect(made.body).toMatchObject({ waiting: true, release: { status: "awaiting_approval" } });
    const groups = async () =>
      ((await alice.get(`/tenants/${tenant}/groups`)).body.items as Any[]).map((one) => one.key);
    expect(await groups()).not.toContain("night-shift");
    expect((await decide(bob, "approve", made.body.release.id)).status).toBe(200);
    expect(await groups()).toContain("night-shift");

    // And so does giving a group a role.
    const night = ((await alice.get(`/tenants/${tenant}/groups`)).body.items as Any[]).find(
      (one) => one.key === "night-shift",
    );
    const given = await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "group",
      principalId: night.id,
      roleId: roles.viewer,
    });
    expect(given.status, JSON.stringify(given.body)).toBe(202);
    const holds = () =>
      t.db.selectFrom("binding").select("id").where("principal_id", "=", night.id).execute();
    expect(await holds()).toHaveLength(0);
    expect((await decide(bob, "approve", given.body.release.id)).status).toBe(200);
    const held = await holds();
    expect(held).toHaveLength(1);
    const latest = ((await alice.get(`${at()}/releases`)).body.items as Any[])[0];
    expect(latest).toMatchObject({
      scope: "partial",
      origin: "console",
      message: "Gave viewer to Night shift",
      createdBy: "alice",
      decidedBy: "bob",
    });
    // Giving a person a role is not part of this: it is done at once, as before.
    const bobId = (
      await t.db
        .selectFrom("member")
        .select("id")
        .where("email", "=", "bob@lakeshore.example")
        .executeTakeFirstOrThrow()
    ).id;
    expect(
      (
        await alice.post(`/tenants/${tenant}/bindings`, {
          workspaceId: main,
          principalType: "member",
          principalId: bobId,
          roleId: roles.viewer,
        })
      ).status,
    ).toBe(201);

    expect((await alice.put(`${at()}/approval`, { required: false })).status).toBe(200);
    // With approval off again, taking the role away is done at once, and is in the history.
    expect((await alice.delete(`/tenants/${tenant}/bindings/${held[0]?.id}`)).status).toBe(204);
    expect(await holds()).toHaveLength(0);
    expect(((await alice.get(`${at()}/releases`)).body.items as Any[])[0].message).toBe(
      "Took viewer from Night shift",
    );
  });

  test("approval needs two who may release, and releasing needs the permission", async () => {
    const solo = (await t.admin.post("/tenants", { slug: "solo", name: "Solo" })).body.id;
    const grant = await t.admin.post(`/tenants/${solo}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const member = await t.admin.post(`/tenants/${solo}/members`, {
      email: "sam@solo.example",
      name: "Sam",
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${solo}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
    await t.admin.delete(`/tenants/${solo}/access-grants/${grant.body.id}`);
    const sam = await t.signIn("sam@solo.example", PASSWORD);
    const refused = await sam.put(`/tenants/${solo}/access/approval`, { required: true });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("approval_needs_two");
    // Someone of another tenant can neither read nor release this one's access.
    expect((await sam.get(at())).status).toBe(404);
    expect((await release(all, {}, sam)).status).toBe(404);
  });
});

describe("approval counts the people who may release by every way they hold it (REL-17)", () => {
  test("two members who hold access:write through a group are two", async () => {
    const slug = await t.admin.post("/tenants", { slug: "grouped", name: "Grouped" });
    const grouped = slug.body.id as string;
    const grant = await t.admin.post(`/tenants/${grouped}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const sam = await t.admin.post(`/tenants/${grouped}/members`, {
      email: "sam@grouped.example",
      name: "Sam",
      password: PASSWORD,
    });
    const kim = await t.admin.post(`/tenants/${grouped}/members`, {
      email: "kim@grouped.example",
      name: "Kim",
      password: PASSWORD,
    });
    const group = await t.admin.post(`/tenants/${grouped}/groups`, { name: "Releasers" });
    expect(group.status, JSON.stringify(group.body)).toBeLessThan(300);
    for (const member of [sam, kim]) {
      await t.admin.put(`/tenants/${grouped}/groups/${group.body.id}/members/${member.body.id}`);
    }
    await t.admin.post(`/tenants/${grouped}/bindings`, {
      principalType: "group",
      principalId: group.body.id,
      roleId: roles.tenant_admin,
    });
    await t.admin.delete(`/tenants/${grouped}/access-grants/${grant.body.id}`);
    const asSam = await t.signIn("sam@grouped.example", PASSWORD);
    const on = await asSam.put(`/tenants/${grouped}/access/approval`, { required: true });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
  });
});

describe("the write path", () => {
  test("every route that releases access was exercised, and every change was audited", () => {
    // A plan is a release carried out and taken back whole: it changes nothing, and says so.
    expect(t.unaudited.filter((route) => !route.endsWith("/access/plan"))).toEqual([]);
    expect(
      t.unexercised((route) => /\/access(\/|$)/.test(route) && !route.endsWith("/access/plan")),
    ).toEqual([]);
  });
});
