import { newId, sql } from "@vynxlabs/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let workspace: string;
let bundle: string;
let alice: Client;

const activity = (query: string) =>
  alice.get(`/tenants/${tenant}/workspaces/${workspace}/activity?${query}`);
const ids = (body: { items: { id: string }[] }) => body.items.map((one) => one.id);

async function insertRuns(
  count: number,
  shape: (index: number) => {
    path?: string;
    status?: string;
    error?: string;
    tags?: string[];
    startedAt?: Date;
    finishedAt?: Date | null;
    scheduledFor?: Date;
    flowRunId?: string;
  },
) {
  const rows = Array.from({ length: count }, (_, index) => {
    const id = newId();
    const one = shape(index);
    return {
      id,
      tenant_id: tenant,
      workspace_id: workspace,
      resource_id: newId(),
      script_path: one.path ?? "orders/sync",
      bundle_id: bundle,
      status: one.status ?? "succeeded",
      max_attempts: 1,
      trigger_type: "manual",
      trigger_detail: JSON.stringify({}),
      started_by_type: "system",
      idempotency_key: id,
      error: one.error ? JSON.stringify({ message: one.error }) : null,
      tags: one.tags ?? [],
      started_at: one.startedAt ?? null,
      scheduled_for: one.scheduledFor ?? null,
      flow_run_id: one.flowRunId ?? null,
      finished_at: one.finishedAt === undefined ? new Date() : one.finishedAt,
    };
  });
  for (let start = 0; start < rows.length; start += 1000) {
    await t.db
      .insertInto("run")
      .values(rows.slice(start, start + 1000) as never)
      .execute();
  }
  return rows.map((row) => row.id);
}

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
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "main", name: "Main", type: "dev" })
  ).body.id;
  bundle = newId();
  await t.db
    .insertInto("bundle")
    .values({
      id: bundle,
      tenant_id: tenant,
      workspace_id: workspace,
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
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("finding runs", () => {
  test("by ID, by the start of the path, by tag and by what the error says", async () => {
    const [refused, other, tagged, invoice] = await insertRuns(
      4,
      (index) =>
        [
          { status: "failed", error: "The ERP refused the order\nat line 3" },
          { status: "failed", error: "Timed out" },
          { tags: ["order:1234", "vip"] },
          { path: "invoices/send" },
        ][index] as { path?: string; status?: string; error?: string; tags?: string[] },
    );

    expect(ids((await activity(`q=${tagged}`)).body)).toEqual([tagged]);
    expect(ids((await activity("q=invoices")).body)).toEqual([invoice]);
    expect(ids((await activity("q=order:1234")).body)).toEqual([tagged]);
    const searched = (await activity("q=refused")).body;
    expect(ids(searched)).toEqual([refused]);
    // The first line of the error, to show in the list.
    expect(searched.items[0]).toMatchObject({ errorSummary: "The ERP refused the order" });
    expect(searched.stateCounts).toEqual({ failed: 1 });
    // A wildcard is a character like any other.
    expect(ids((await activity("q=%25")).body)).toEqual([]);
    // Every tag asked for must be there.
    expect(ids((await activity("tag=vip&tag=order:1234")).body)).toEqual([tagged]);
    expect(ids((await activity("tag=vip&tag=nope")).body)).toEqual([]);
    expect(other).toBeTruthy();
  });

  test("every run is reached a page at a time, none twice, and the first page is quick", async () => {
    await insertRuns(5000, () => ({ path: "bulk/job" }));
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { body: { items: { id: string }[]; nextCursor: string | null } } = await activity(
        `q=bulk&limit=200${cursor ? `&cursor=${cursor}` : ""}`,
      );
      for (const id of ids(page.body)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      cursor = page.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 40);
    expect(seen.size).toBe(5000);
    expect(pages).toBe(25);

    await sql`analyze run`.execute(t.db);
    const started = performance.now();
    const first = await activity("limit=100");
    const took = performance.now() - started;
    expect(first.body.items).toHaveLength(100);
    // S4 asks for under 150 ms on a seeded database. Logged, and held to twice that here,
    // where many test files share one database server.
    console.log(`first page of runs over 5,000: ${took.toFixed(0)} ms`);
    expect(took).toBeLessThan(300);
  }, 120_000);
});

describe("sorting, summaries and filtered cancelling", () => {
  test("runs sort by when they started or by how long they took, a page at a time", async () => {
    const base = Date.parse("2026-01-01T00:00:00Z");
    const at = (seconds: number) => new Date(base + seconds * 1000);
    const made = await insertRuns(5, (index) => ({
      path: "sorted/job",
      startedAt: at([30, 10, 50, 20, 40][index] as number),
      finishedAt: at(([30, 10, 50, 20, 40][index] as number) + ([5, 1, 3, 9, 7][index] as number)),
    }));
    const order = (body: { items: { id: string }[] }) => ids(body).map((id) => made.indexOf(id));

    expect(order((await activity("q=sorted&sort=started&dir=asc")).body)).toEqual([1, 3, 0, 4, 2]);
    expect(order((await activity("q=sorted&sort=duration")).body)).toEqual([3, 4, 0, 2, 1]);
    // Keyset pages in the chosen order, none twice.
    const first = (await activity("q=sorted&sort=duration&limit=2")).body;
    expect(order(first)).toEqual([3, 4]);
    const second = (await activity(`q=sorted&sort=duration&limit=2&cursor=${first.nextCursor}`))
      .body;
    expect(order(second)).toEqual([0, 2]);
    expect((await activity("sort=duration&cursor=bm9wZQ")).status).toBe(400);
  });

  test("a delayed run says when it was due", async () => {
    const due = new Date("2026-02-01T09:00:00Z");
    const [late] = await insertRuns(1, () => ({ path: "due/job", scheduledFor: due }));
    const listed = (await activity("q=due")).body.items[0];
    expect(listed).toMatchObject({ id: late, scheduledFor: due.toISOString() });
  });

  test("filtered cancelling stops only the queued runs the list shows, never a flow's steps", async () => {
    const flowRun = newId();
    await t.db
      .insertInto("flow_run")
      .values({
        id: flowRun,
        tenant_id: tenant,
        workspace_id: workspace,
        resource_id: newId(),
        flow_path: "queue/flow",
        bundle_id: bundle,
        trigger_node: "start",
        trigger_type: "manual",
        trigger_detail: JSON.stringify({}),
        status: "running",
        started_by_type: "system",
        idempotency_key: flowRun,
      } as never)
      .execute();
    const [shown, step, elsewhere] = await insertRuns(3, (index) => ({
      path: index === 2 ? "other/job" : "queue/job",
      status: "queued",
      finishedAt: null,
      ...(index === 1 ? { flowRunId: flowRun } : {}),
    }));
    const cancelled = await alice.post(`/tenants/${tenant}/workspaces/${workspace}/runs/cancel`, {
      include: "queued",
      filters: { q: "queue/" },
    });
    expect(cancelled.body).toEqual({ cancelled: 1, more: false });
    const statuses = await t.db
      .selectFrom("run")
      .select(["id", "status"])
      .where("id", "in", [shown, step, elsewhere] as string[])
      .execute();
    const of = (id: string | undefined) => statuses.find((row) => row.id === id)?.status;
    expect(of(shown)).toBe("cancelled");
    expect(of(step)).toBe("queued");
    expect(of(elsewhere)).toBe("queued");
  });
});
