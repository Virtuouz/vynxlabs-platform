import { gunzipSync } from "node:zlib";
import { newId, sql } from "@vynxlabs/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureAuditPartitions, pruneOnce } from "./kernel/retention.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const DAY = 86_400_000;

let t: TestApp;
let tenant: string;
let keeper: string;
let workspace: string;
let keeperWorkspace: string;
let bundle: string;
let keeperBundle: string;
let alice: Client;

const ago = (days: number) => new Date(Date.now() - days * DAY);

async function seedTenant(slug: string, email: string) {
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
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
  const client = await t.signIn(email, PASSWORD);
  const ws = (
    await client.post(`/tenants/${id}/workspaces`, { slug: "main", name: "Main", type: "dev" })
  ).body.id as string;
  const bundleId = newId();
  await t.db
    .insertInto("bundle")
    .values({
      id: bundleId,
      tenant_id: id,
      workspace_id: ws,
      version: 1,
      digest: "0".repeat(64),
      sdk_version: "0.5.0",
      core_min: "0.0.0",
      core_below: "99.0.0",
      storage_key: `bundles/${bundleId}.json`,
      size_bytes: 1,
      manifest_count: 0,
      created_by_type: "system",
    })
    .execute();
  return { id, client, workspace: ws, bundle: bundleId };
}

/** A script run, finished `days` ago, or still running when `days` is null. */
async function run(
  options: {
    tenantId?: string;
    days: number | null;
    flowRunId?: string;
    status?: string;
    payload?: boolean;
  } = { days: 2 },
) {
  const id = newId();
  const tenantId = options.tenantId ?? tenant;
  const inputRef = options.payload ? `runs/${id}/input.json` : null;
  if (inputRef) await t.kernel.storage.put(inputRef, '{"big":true}', "application/json");
  await t.db
    .insertInto("run")
    .values({
      id,
      tenant_id: tenantId,
      workspace_id: tenantId === tenant ? workspace : keeperWorkspace,
      resource_id: newId(),
      script_path: "job",
      bundle_id: tenantId === tenant ? bundle : keeperBundle,
      status: (options.status ?? (options.days === null ? "running" : "succeeded")) as never,
      max_attempts: 1,
      trigger_type: "manual",
      trigger_detail: JSON.stringify({}),
      started_by_type: "system",
      idempotency_key: id,
      input_ref: inputRef,
      flow_run_id: options.flowRunId ?? null,
      created_at: ago((options.days ?? 2) + 0.01),
      finished_at: options.days === null ? null : ago(options.days),
    } as never)
    .execute();
  await t.db
    .insertInto("run_log")
    .values({
      run_id: id,
      attempt: 1,
      logged_at: new Date(),
      level: "info",
      message: "hello",
      fields: JSON.stringify({}),
    })
    .execute();
  return id;
}

async function flowRun(options: { days: number | null; parent?: string; status?: string }) {
  const id = newId();
  await t.db
    .insertInto("flow_run")
    .values({
      id,
      tenant_id: tenant,
      workspace_id: workspace,
      resource_id: newId(),
      flow_path: "flow",
      bundle_id: bundle,
      trigger_node: "start",
      trigger_type: "manual",
      trigger_detail: JSON.stringify({}),
      status: (options.status ?? (options.days === null ? "running" : "succeeded")) as never,
      started_by_type: "system",
      idempotency_key: id,
      parent_flow_run_id: options.parent ?? null,
      finished_at: options.days === null ? null : ago(options.days),
    } as never)
    .execute();
  const ref = `flow-runs/${id}/step.json`;
  await t.kernel.storage.put(ref, "{}", "application/json");
  await t.db
    .insertInto("step_run")
    .values({ flow_run_id: id, node_id: "a", status: "succeeded", output_ref: ref } as never)
    .execute();
  return { id, ref };
}

const exists = async (table: "run" | "flow_run", id: string) =>
  (await t.db.selectFrom(table).select("id").where("id", "=", id).executeTakeFirst()) !== undefined;
const stored = async (key: string) =>
  t.kernel.storage.get(key).then(
    () => true,
    () => false,
  );

beforeAll(async () => {
  t = await startTestApp();
  const acme = await seedTenant("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  workspace = acme.workspace;
  bundle = acme.bundle;
  const kept = await seedTenant("keeper", "kim@keeper.example");
  keeper = kept.id;
  keeperWorkspace = kept.workspace;
  keeperBundle = kept.bundle;
  // The keeper keeps everything for as long as it may.
  expect(
    (
      await kept.client.put(`/tenants/${keeper}/retention`, {
        runsDays: 3650,
        eventsDays: 3650,
        refusalsDays: 3650,
      })
    ).status,
  ).toBe(200);
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("the policy", () => {
  test("defaults show until the tenant sets its own, within bounds, and the change is audited", async () => {
    const before = (await alice.get(`/tenants/${tenant}/retention`)).body;
    expect(before).toMatchObject({
      runsDays: null,
      effective: { runsDays: 30, eventsDays: 30, refusalsDays: 7, auditDays: 400 },
      defaults: { runsDays: 30, eventsDays: 30, refusalsDays: 7, auditDays: 400 },
      bounds: { auditDays: { min: 90, max: 3650 } },
    });
    const set = await alice.put(`/tenants/${tenant}/retention`, { runsDays: 1 });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.effective).toMatchObject({ runsDays: 1, eventsDays: 30 });
    expect((await alice.put(`/tenants/${tenant}/retention`, { auditDays: 30 })).status).toBe(400);
    expect((await alice.put(`/tenants/${tenant}/retention`, {})).status).toBe(400);
    const audited = await t.db
      .selectFrom("audit_entry")
      .select("details")
      .where("tenant_id", "=", tenant)
      .where("action", "=", "tenant.retention_set")
      .execute();
    expect(audited.map((row) => row.details)).toEqual([{ runsDays: 1 }]);
    // The runs list says how long it keeps them.
    const listed = await alice.get(`/tenants/${tenant}/workspaces/${workspace}/activity`);
    expect(listed.body.keptDays).toBe(1);
  });
});

describe("a retention pass", () => {
  test("removes runs past the policy, with their logs and payloads, and keeps the rest", async () => {
    const old = await run({ days: 2, payload: true });
    const going = await run({ days: null });
    const recent = await run({ days: 0.5 });
    const elsewhere = await run({ tenantId: keeper, days: 2 });
    const result = await pruneOnce(t.kernel);
    expect(result).not.toBe("busy");
    expect(await exists("run", old)).toBe(false);
    expect(await stored(`runs/${old}/input.json`)).toBe(false);
    const logs = await t.db
      .selectFrom("run_log")
      .select("run_id")
      .where("run_id", "=", old)
      .execute();
    expect(logs).toEqual([]);
    for (const kept of [going, recent, elsewhere]) expect(await exists("run", kept)).toBe(true);
  });

  test("removes a finished flow run whole, and leaves one with anything still going", async () => {
    const root = await flowRun({ days: 2 });
    const child = await flowRun({ days: 2, parent: root.id });
    const rootRun = await run({ days: 2, flowRunId: root.id, payload: true });
    const childRun = await run({ days: 2, flowRunId: child.id });

    const waiting = await flowRun({ days: 2 });
    const stillGoing = await flowRun({ days: null, parent: waiting.id });

    await pruneOnce(t.kernel);
    for (const id of [root.id, child.id]) expect(await exists("flow_run", id)).toBe(false);
    for (const id of [rootRun, childRun]) expect(await exists("run", id)).toBe(false);
    expect(await stored(root.ref)).toBe(false);
    expect(await stored(child.ref)).toBe(false);
    expect(await stored(`runs/${rootRun}/input.json`)).toBe(false);
    const steps = await t.db
      .selectFrom("step_run")
      .select("flow_run_id")
      .where("flow_run_id", "in", [root.id, child.id])
      .execute();
    expect(steps).toEqual([]);

    for (const id of [waiting.id, stillGoing.id]) expect(await exists("flow_run", id)).toBe(true);
    expect(await stored(waiting.ref)).toBe(true);
  });

  test("removes events and refused requests by their own periods, per tenant", async () => {
    const event = (tenantId: string, days: number) => ({
      id: newId(),
      tenant_id: tenantId,
      workspace_id: tenantId === tenant ? workspace : keeperWorkspace,
      name: "thing.happened",
      payload: JSON.stringify({}),
      source_type: "api",
      occurred_at: ago(days),
    });
    const oldEvent = event(tenant, 40);
    const newEvent = event(tenant, 10);
    const keptEvent = event(keeper, 40);
    await t.db
      .insertInto("event")
      .values([oldEvent, newEvent, keptEvent] as never)
      .execute();
    const refusal = (days: number) => ({
      id: newId(),
      tenant_id: tenant,
      workspace_id: workspace,
      path: "hook",
      reason: "signature",
      occurred_at: ago(days),
    });
    const oldRefusal = refusal(8);
    const newRefusal = refusal(2);
    await t.db
      .insertInto("webhook_refusal")
      .values([oldRefusal, newRefusal] as never)
      .execute();

    await pruneOnce(t.kernel);
    const events = (await t.db.selectFrom("event").select("id").execute()).map((row) => row.id);
    expect(events).not.toContain(oldEvent.id);
    expect(events).toEqual(expect.arrayContaining([newEvent.id, keptEvent.id]));
    const refusals = (await t.db.selectFrom("webhook_refusal").select("id").execute()).map(
      (row) => row.id,
    );
    expect(refusals).toEqual([newRefusal.id]);
  });

  test("one replica prunes at a time", async () => {
    await t.db.connection().execute(async (db) => {
      await sql`select pg_advisory_lock(hashtext('retention'))`.execute(db);
      try {
        expect(await pruneOnce(t.kernel)).toBe("busy");
      } finally {
        await sql`select pg_advisory_unlock(hashtext('retention'))`.execute(db);
      }
    });
    expect(await pruneOnce(t.kernel)).not.toBe("busy");
  });
});

describe("the audit log", () => {
  test("a month past every tenant's period is exported, then dropped, and the log stays append-only", async () => {
    const old = ago(500);
    await ensureAuditPartitions(t.kernel, old, old);
    const month = `${old.getUTCFullYear()}-${String(old.getUTCMonth() + 1).padStart(2, "0")}`;
    const partition = `audit_entry_y${month.slice(0, 4)}m${month.slice(5)}`;
    const ids = [newId(), newId()];
    await t.db
      .insertInto("audit_entry")
      .values(
        ids.map((id) => ({
          id,
          occurred_at: old,
          tenant_id: tenant,
          actor_type: "system",
          action: "old.thing",
          target_type: "tenant",
          details: JSON.stringify({ kept: "elsewhere" }),
        })) as never,
      )
      .execute();
    const recent = (await t.db.selectFrom("audit_entry").select("id").execute()).length;

    const result = await pruneOnce(t.kernel);
    expect(result !== "busy" && result.auditMonths).toContain(month);
    const found = await sql<{
      name: string | null;
    }>`select to_regclass(${partition})::text as name`.execute(t.db);
    expect(found.rows[0]?.name).toBeNull();

    const manifest = JSON.parse(
      (await t.kernel.storage.get(`audit/${month}/manifest.json`)).toString("utf8"),
    );
    expect(manifest).toMatchObject({ partition, month, rows: 2 });
    const lines = gunzipSync(await t.kernel.storage.get(manifest.parts[0].key))
      .toString("utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines.map((line) => line.id).sort()).toEqual([...ids].sort());
    expect(lines[0].details).toEqual({ kept: "elsewhere" });

    // What is recent is untouched, and nothing can be changed or removed row by row.
    expect((await t.db.selectFrom("audit_entry").select("id").execute()).length).toBe(recent - 2);
    await expect(t.db.updateTable("audit_entry").set({ action: "x" }).execute()).rejects.toThrow(
      /append-only/,
    );
    await expect(t.db.deleteFrom("audit_entry").execute()).rejects.toThrow(/append-only/);
    const current = new Date();
    const thisMonth = `audit_entry_y${current.getUTCFullYear()}m${String(current.getUTCMonth() + 1).padStart(2, "0")}`;
    await expect(sql`truncate ${sql.table(thisMonth)}`.execute(t.db)).rejects.toThrow(
      /append-only/,
    );
  });

  test("a tenant that keeps its log for less sees no further back, though the month is kept", async () => {
    const entry = newId();
    await t.db
      .insertInto("audit_entry")
      .values({
        id: entry,
        occurred_at: ago(100),
        tenant_id: tenant,
        actor_type: "system",
        action: "older.thing",
        target_type: "tenant",
        details: JSON.stringify({}),
      } as never)
      .execute()
      .catch(async () => {
        // The month may need its partition first.
        await ensureAuditPartitions(t.kernel, ago(100), ago(100));
        await t.db
          .insertInto("audit_entry")
          .values({
            id: entry,
            occurred_at: ago(100),
            tenant_id: tenant,
            actor_type: "system",
            action: "older.thing",
            target_type: "tenant",
            details: JSON.stringify({}),
          } as never)
          .execute();
      });
    const listed = async () =>
      (
        (await alice.get(`/tenants/${tenant}/audit?limit=200&action=older.thing`)).body.items as {
          id: string;
        }[]
      ).map((one) => one.id);
    expect(await listed()).toEqual([entry]);
    expect((await alice.put(`/tenants/${tenant}/retention`, { auditDays: 90 })).status).toBe(200);
    expect(await listed()).toEqual([]);
    // Another tenant's longer period keeps the month itself.
    await pruneOnce(t.kernel);
    const still = await t.db
      .selectFrom("audit_entry")
      .select("id")
      .where("id", "=", entry)
      .execute();
    expect(still).toHaveLength(1);
  });
});
