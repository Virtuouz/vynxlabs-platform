import { newId } from "@vynxlabs/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client; // tenant admin
let dora: Client; // developer in dev only
let fred: Client; // may read flows, and nothing else
let runId: string;

/** Resources written straight into the workspace, as a deploy would leave them. */
async function resources(workspace: string, list: { kind: string; path: string; body?: object }[]) {
  const rows = list.map((one) => ({
    id: newId(),
    tenant_id: tenant,
    workspace_id: workspace,
    kind: one.kind,
    schema_version: 1,
    path: one.path,
    ownership: "code" as const,
    version: 1,
    body: JSON.stringify(one.body ?? {}),
    updated_at: new Date(),
  }));
  for (let start = 0; start < rows.length; start += 1000) {
    await t.db
      .insertInto("resource")
      .values(rows.slice(start, start + 1000) as never)
      .execute();
  }
}

const search = (as: Client, q: string, more = "") =>
  as.get(`/tenants/${tenant}/search?q=${encodeURIComponent(q)}&workspace=${dev}${more}`);
const found = (body: { items: { kind: string; ref: string; workspaceSlug: string | null }[] }) =>
  body.items.map((one) => `${one.kind} ${one.workspaceSlug}/${one.ref}`);

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = async (email: string, name: string) =>
    (await t.admin.post(`/tenants/${tenant}/members`, { email, name, password: PASSWORD })).body
      .id as string;
  const aliceId = await member("alice@acme.example", "Alice Archer");
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: aliceId,
    roleId: roles.tenant_admin,
  });
  const doraId = await member("dora@acme.example", "Dora Dev");
  const fredId = await member("fred@acme.example", "Fred Flows");
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: dev,
    principalType: "member",
    principalId: doraId,
    roleId: roles.developer,
  });
  const flowsOnly = await alice.post(`/tenants/${tenant}/roles`, {
    name: "flow_reader",
    permissions: ["flow:read"],
  });
  expect(flowsOnly.status, JSON.stringify(flowsOnly.body)).toBe(201);
  await alice.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: fredId,
    roleId: flowsOnly.body.id,
  });
  dora = await t.signIn("dora@acme.example", PASSWORD);
  fred = await t.signIn("fred@acme.example", PASSWORD);

  for (const workspace of [dev, prod]) {
    await resources(workspace, [
      { kind: "script", path: "reminders/send", body: { description: "Texts a reminder" } },
      { kind: "schedule", path: "reminders/hourly" },
      { kind: "flow", path: "reminders/chase" },
      { kind: "script", path: "orders/sync" },
      { kind: "connection", path: "sms" },
    ]);
  }
  // Two thousand more, so that the time a search takes means something.
  await resources(
    dev,
    Array.from({ length: 2000 }, (_, index) => ({
      kind: ["script", "flow", "table", "event"][index % 4] as string,
      path: `area${index % 40}/thing-${index}`,
    })),
  );
  runId = newId();
  const bundle = newId();
  await t.db
    .insertInto("bundle")
    .values({
      id: bundle,
      tenant_id: tenant,
      workspace_id: dev,
      version: 1,
      digest: "0".repeat(64),
      sdk_version: "0.5.0",
      core_min: "0.0.0",
      core_below: "99.0.0",
      storage_key: "k",
      size_bytes: 1,
      manifest_count: 0,
      created_by_type: "system",
    })
    .execute();
  await t.db
    .insertInto("run")
    .values({
      id: runId,
      tenant_id: tenant,
      workspace_id: dev,
      resource_id: newId(),
      script_path: "reminders/send",
      bundle_id: bundle,
      status: "failed",
      max_attempts: 1,
      trigger_type: "manual",
      trigger_detail: JSON.stringify({}),
      started_by_type: "system",
      idempotency_key: runId,
      tags: ["clinic:fernhill"],
      finished_at: new Date(),
    } as never)
    .execute();
}, 120_000);

afterAll(async () => {
  await t.stop();
});

describe("searching a tenant", () => {
  test("a name finds the script, the schedule and the flow, the current workspace first", async () => {
    const answer = await search(alice, "reminders");
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    // Within a workspace, the shorter path is the closer match.
    expect(found(answer.body)).toEqual([
      "script dev/reminders/send",
      "flow dev/reminders/chase",
      "schedule dev/reminders/hourly",
      "script main/reminders/send",
      "flow main/reminders/chase",
      "schedule main/reminders/hourly",
    ]);
    expect(answer.body.items[0]).toMatchObject({
      title: "reminders/send",
      hint: "Texts a reminder",
    });
    // An exact path comes first; a word anywhere in a path is found too.
    expect(found((await search(alice, "orders/sync")).body)[0]).toBe("script dev/orders/sync");
    expect(found((await search(alice, "SEND")).body)).toContain("script dev/reminders/send");
    // `%` and `_` are only themselves.
    expect((await search(alice, "%")).body.items).toEqual([]);
  });

  test("only what each member may read is found", async () => {
    // A developer of dev finds dev's, and nothing of production's.
    expect(found((await search(dora, "reminders")).body)).toEqual([
      "script dev/reminders/send",
      "flow dev/reminders/chase",
      "schedule dev/reminders/hourly",
    ]);
    // Someone who may read flows only finds flows.
    expect(found((await search(fred, "reminders")).body)).toEqual([
      "flow dev/reminders/chase",
      "flow main/reminders/chase",
    ]);
    // Nor does anyone find another tenant's.
    const other = (await t.admin.post("/tenants", { slug: "globex", name: "Globex" })).body.id;
    expect((await alice.get(`/tenants/${other}/search?q=reminders`)).body.items ?? []).toEqual([]);
  });

  test("a run is found by its ID, the start of it, or a tag", async () => {
    for (const q of [runId, runId.slice(0, 8), runId.slice(0, 13), "tag:clinic:fernhill"]) {
      const answer = (await search(alice, q, "&only=runs")).body;
      expect(answer.items, q).toEqual([
        expect.objectContaining({
          kind: "run",
          id: runId,
          workspaceId: dev,
          title: "reminders/send",
        }),
      ]);
    }
    expect((await search(alice, runId.slice(0, 6), "&only=runs")).body.items).toEqual([]);
    // Someone who may not read runs does not find it.
    expect((await search(fred, runId, "&only=runs")).body.items).toEqual([]);
  });

  test("people only when asked, and only for those who may read them", async () => {
    expect(found((await search(alice, "dora", "&only=people")).body)).toEqual([
      expect.stringMatching(/^member null\//),
    ]);
    expect((await search(alice, "dora")).body.items).toEqual([]);
    expect((await search(fred, "dora", "&only=people")).body.items).toEqual([]);
  });

  test("it answers quickly over two thousand resources", async () => {
    await search(alice, "thing-1999");
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const at = performance.now();
      const answer = await search(alice, i % 2 ? "area7" : "thing-17");
      times.push(performance.now() - at);
      expect(answer.body.items.length).toBeGreaterThan(0);
    }
    times.sort((a, b) => a - b);
    // The median, through the whole stack: authentication, the query, the permission checks.
    expect(times[2]).toBeLessThan(100);
  });
});

describe("what a member opened last", () => {
  test("is kept for them alone, newest first, without an audit entry, and leaves out what is gone", async () => {
    const audits = async () =>
      Number(
        (
          await t.db
            .selectFrom("audit_entry")
            .select((eb) => eb.fn.countAll().as("n"))
            .executeTakeFirstOrThrow()
        ).n,
      );
    const before = await audits();
    const keep = (body: object) => alice.put("/me/recent-items", { tenantId: tenant, ...body });
    expect((await keep({ workspaceId: dev, kind: "script", ref: "reminders/send" })).status).toBe(
      204,
    );
    expect((await keep({ workspaceId: dev, kind: "run", ref: runId })).status).toBe(204);
    expect((await keep({ workspaceId: dev, kind: "flow", ref: "no/longer" })).status).toBe(204);
    expect(await audits()).toBe(before);
    const items = (await alice.get(`/me/recent-items?tenant=${tenant}`)).body.items;
    expect(items.map((one: { kind: string; ref: string }) => `${one.kind} ${one.ref}`)).toEqual([
      `run ${runId}`,
      "script reminders/send",
    ]);
    expect(items[0]).toMatchObject({ title: "reminders/send", workspaceSlug: "dev" });
    // Someone else's are their own.
    expect((await dora.get(`/me/recent-items?tenant=${tenant}`)).body.items).toEqual([]);
    // Twenty are kept.
    for (let i = 0; i < 25; i++)
      await keep({ workspaceId: dev, kind: "script", ref: `area1/thing-${i}` });
    const kept = await t.db
      .selectFrom("member_recent_item")
      .select((eb) => eb.fn.countAll().as("n"))
      .executeTakeFirstOrThrow();
    expect(Number(kept.n)).toBe(20);
  });
});
