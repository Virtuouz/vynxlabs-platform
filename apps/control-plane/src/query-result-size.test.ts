import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * A query result is held in the control plane only up to 5 MB: rows past that are cut in the
 * database and never reach it, and one row that is over it alone is refused.
 */
const PASSWORD = "a-good-long-password";
let t: TestApp;
let alice: Client;
let tenant: string;
let dev: string;

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((r) => [r.name, r.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const made = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: made.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

const run = (sql: string, limit?: number) =>
  alice.post(`/tenants/${tenant}/workspaces/${dev}/queries/run`, {
    sql,
    ...(limit ? { limit } : {}),
  });

describe("the size of a query result", () => {
  test("rows past the byte cap are cut in the database, not after the control plane holds them", async () => {
    const before = process.memoryUsage().rss;
    const answer = await run(
      "select repeat('x', 2000000) as a from generate_series(1, 1000)",
      10000,
    );
    const grew = process.memoryUsage().rss - before;
    expect(answer.status).toBe(200);
    expect(answer.body.truncated).toBe(true);
    expect(answer.body.rows.length).toBe(2);
    expect(grew).toBeLessThan(300 * 1024 * 1024);
  }, 120_000);

  test("a single row over the cap is refused with a 422 that says the result is too large", async () => {
    const answer = await run("select repeat('x', 6000000) as a");
    expect(answer.status).toBe(422);
    expect(JSON.stringify(answer.body)).toContain("too large");
  });

  test("a result under the cap comes back whole", async () => {
    const answer = await run("select g as n, repeat('x', 100) as a from generate_series(1, 50) g");
    expect(answer.status).toBe(200);
    expect(answer.body.truncated).toBe(false);
    expect(answer.body.rows.length).toBe(50);
  });
});
