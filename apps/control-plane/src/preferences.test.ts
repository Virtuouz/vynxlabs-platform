import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * A member's own settings and saved views (phase 15): kept per member, never
 * audited, refused for keys the console does not keep, and private to their maker.
 */

let t: TestApp;
let alice: Client;
let bob: Client;
let tenant: string;
let other: string;
let ws: string;
const PASSWORD = "a-good-long-password";

beforeAll(async () => {
  t = await startTestApp();
  const made = await t.admin.post("/tenants", { slug: "prefs", name: "Prefs", addCreator: true });
  tenant = made.body.id;
  other = (
    await t.admin.post("/tenants", { slug: "elsewhere", name: "Elsewhere", addCreator: true })
  ).body.id;
  ws = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  for (const [email, name] of [
    ["alice@prefs.example", "Alice"],
    ["bob@prefs.example", "Bob"],
  ]) {
    const member = await t.admin.post(`/tenants/${tenant}/members`, {
      email,
      name,
      password: PASSWORD,
    });
    expect(member.status, JSON.stringify(member.body)).toBe(201);
  }
  alice = await t.signIn("alice@prefs.example", PASSWORD);
  bob = await t.signIn("bob@prefs.example", PASSWORD);
});
afterAll(async () => {
  await t?.stop();
});

const audited = async () =>
  Number(
    (
      await t.db
        .selectFrom("audit_entry")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .executeTakeFirstOrThrow()
    ).count,
  );

describe("a member's own settings", () => {
  test("are kept per member, read back, replaced and forgotten, with no audit entry", async () => {
    const before = await audited();
    expect((await alice.put("/me/preferences/density:runs", { value: "compact" })).status).toBe(
      204,
    );
    expect(
      (await alice.put("/me/preferences/split:flow-editor", { value: { size: 64 } })).status,
    ).toBe(204);
    expect((await alice.put("/me/preferences/density:runs", { value: "standard" })).status).toBe(
      204,
    );
    expect((await alice.put("/me/preferences/shortcuts.single-key", { value: false })).status).toBe(
      204,
    );
    const kept = (await alice.get("/me/preferences")).body.items;
    expect(kept.map((item: { key: string; value: unknown }) => [item.key, item.value])).toEqual([
      ["density:runs", "standard"],
      ["shortcuts.single-key", false],
      ["split:flow-editor", { size: 64 }],
    ]);
    // Another member sees none of them.
    expect((await bob.get("/me/preferences")).body.items).toEqual([]);
    expect((await alice.delete("/me/preferences/density:runs")).status).toBe(204);
    expect((await alice.get("/me/preferences")).body.items).toHaveLength(2);
    expect(await audited()).toBe(before);
  });

  test("only the settings the console keeps, and only small ones", async () => {
    const refused = await alice.put("/me/preferences/anything-at-all", { value: 1 });
    expect(refused.status).toBe(400);
    expect(refused.body.detail).toMatch(/not a setting/);
    const large = await alice.put("/me/preferences/theme", { value: "x".repeat(5000) });
    expect(large.status).toBe(400);
    const pins = await alice.put(`/me/preferences/palette.pins:${tenant}`, {
      value: [{ kind: "script", ref: "orders/sync", workspaceId: ws }],
    });
    expect(pins.status).toBe(204);
  });
});

describe("saved views", () => {
  let view: string;

  test("are saved by name, listed only to their maker, renamed and replaced", async () => {
    const before = await audited();
    const saved = await alice.post("/me/views", {
      tenantId: tenant,
      workspaceId: ws,
      list: "runs",
      name: "Failed today",
      state: { status: "failed", when: "24h" },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    view = saved.body.id;
    const same = await alice.post("/me/views", {
      tenantId: tenant,
      workspaceId: ws,
      list: "runs",
      name: "failed today",
      state: {},
    });
    expect(same.status).toBe(409);
    const listed = (await alice.get(`/me/views?tenant=${tenant}&workspace=${ws}&list=runs`)).body
      .items;
    expect(listed).toEqual([
      expect.objectContaining({ name: "Failed today", state: { status: "failed", when: "24h" } }),
    ]);
    // Private: another member of the tenant has none, and cannot change Alice's.
    expect(
      (await bob.get(`/me/views?tenant=${tenant}&workspace=${ws}&list=runs`)).body.items,
    ).toEqual([]);
    expect((await bob.patch(`/me/views/${view}`, { name: "Mine now" })).status).toBe(404);
    expect((await bob.delete(`/me/views/${view}`)).status).toBe(404);
    const renamed = await alice.patch(`/me/views/${view}`, {
      name: "Failed, last day",
      state: { status: "failed", when: "24h", sort: "duration" },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Failed, last day", state: { sort: "duration" } });
    expect(await audited()).toBe(before);
  });

  test("a tenant-wide list's views have no workspace; a tenant one is not in is refused", async () => {
    const audit = await alice.post("/me/views", {
      tenantId: tenant,
      list: "audit",
      name: "Secrets",
      state: { action: "secret.set" },
    });
    expect(audit.status).toBe(201);
    expect((await alice.get(`/me/views?tenant=${tenant}&list=audit`)).body.items).toHaveLength(1);
    // A workspace view is not a tenant view.
    expect((await alice.get(`/me/views?tenant=${tenant}&list=runs`)).body.items).toEqual([]);
    const elsewhere = await alice.post("/me/views", {
      tenantId: other,
      list: "audit",
      name: "Not mine",
      state: {},
    });
    expect(elsewhere.status).toBe(404);
  });

  test("are deleted by their maker", async () => {
    expect((await alice.delete(`/me/views/${view}`)).status).toBe(204);
    expect(
      (await alice.get(`/me/views?tenant=${tenant}&workspace=${ws}&list=runs`)).body.items,
    ).toEqual([]);
  });
});
