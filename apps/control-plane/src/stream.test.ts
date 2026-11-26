import { get, type IncomingMessage } from "node:http";
import { newId, sql } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { StreamHub } from "./kernel/stream.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let url: string;
let tenant: string;
let other: string;
let a: string;
let b: string;
let bundleA: string;
let bundleB: string;
let alice: Client; // tenant admin
let wendy: Client; // a developer in workspace A only
let sam: Client; // may read script runs in A, and nothing of flows
let olga: Client; // admin of another tenant

interface Event {
  event: string;
  data: Record<string, unknown>;
}

/** Opens the stream as `client` and gathers its events. */
async function open(client: Client, tenantId = tenant, headers: Record<string, string> = {}) {
  const events: Event[] = [];
  const request = get(`${url}/api/v1/tenants/${tenantId}/stream`, {
    headers: { ...client.headers, ...headers },
  });
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    request.on("response", resolve);
    request.on("error", reject);
  });
  let buffer = "";
  response.setEncoding("utf8");
  response.on("data", (chunk: string) => {
    buffer += chunk;
    for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (event && data) events.push({ event, data: JSON.parse(data) });
    }
  });
  response.on("error", () => {});
  return {
    status: response.statusCode,
    headers: response.headers,
    events,
    close: () => request.destroy(),
    /** Waits for an event that `match` accepts, or for `ms` to pass. */
    async next(match: (event: Event) => boolean, ms = 2000) {
      const deadline = Date.now() + ms;
      for (;;) {
        const found = events.find(match);
        if (found || Date.now() > deadline) return found;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  };
}

async function seed(slug: string, email: string) {
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
  return { id, client: await t.signIn(email, PASSWORD), roles };
}

async function bundleIn(tenantId: string, workspaceId: string) {
  const id = newId();
  await t.db
    .insertInto("bundle")
    .values({
      id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      version: 1,
      digest: "0".repeat(64),
      sdk_version: "0.5.0",
      core_min: "0.0.0",
      core_below: "99.0.0",
      storage_key: `bundles/${id}.json`,
      size_bytes: 1,
      manifest_count: 0,
      created_by_type: "system",
    })
    .execute();
  return id;
}

/** A queued script run, inserted as the platform would. */
async function run(workspace: string) {
  const id = newId();
  await t.db
    .insertInto("run")
    .values({
      id,
      tenant_id: tenant,
      workspace_id: workspace,
      resource_id: newId(),
      script_path: "orders/sync",
      bundle_id: workspace === a ? bundleA : bundleB,
      status: "queued",
      max_attempts: 1,
      trigger_type: "manual",
      trigger_detail: JSON.stringify({}),
      started_by_type: "system",
      idempotency_key: id,
    } as never)
    .execute();
  return id;
}

async function flowRun(workspace: string) {
  const id = newId();
  await t.db
    .insertInto("flow_run")
    .values({
      id,
      tenant_id: tenant,
      workspace_id: workspace,
      resource_id: newId(),
      flow_path: "orders/approve",
      bundle_id: workspace === a ? bundleA : bundleB,
      trigger_node: "start",
      trigger_type: "manual",
      trigger_detail: JSON.stringify({}),
      status: "running",
      started_by_type: "system",
      idempotency_key: id,
    } as never)
    .execute();
  return id;
}

beforeAll(async () => {
  t = await startTestApp();
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  olga = (await seed("globex", "olga@globex.example")).client;
  other = (
    await t.db
      .selectFrom("tenant")
      .select("id")
      .where("slug", "=", "globex")
      .executeTakeFirstOrThrow()
  ).id;
  const workspace = async (slug: string) =>
    (await alice.post(`/tenants/${tenant}/workspaces`, { slug, name: slug, type: "dev" })).body
      .id as string;
  a = await workspace("a");
  b = await workspace("b");
  bundleA = await bundleIn(tenant, a);
  bundleB = await bundleIn(tenant, b);

  const member = async (email: string) =>
    (await alice.post(`/tenants/${tenant}/members`, { email, name: email, password: PASSWORD }))
      .body.id as string;
  const wendyId = await member("wendy@acme.example");
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: a,
    principalType: "member",
    principalId: wendyId,
    roleId: acme.roles.developer,
  });
  wendy = await t.signIn("wendy@acme.example", PASSWORD);
  const scriptsOnly = await alice.post(`/tenants/${tenant}/roles`, {
    name: "script_reader",
    permissions: ["run:read", "workspace:read"],
  });
  expect(scriptsOnly.status, JSON.stringify(scriptsOnly.body)).toBe(201);
  const samId = await member("sam@acme.example");
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: a,
    principalType: "member",
    principalId: samId,
    roleId: scriptsOnly.body.id,
  });
  sam = await t.signIn("sam@acme.example", PASSWORD);
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("the run event stream", () => {
  test("a run's changes arrive as they happen, and log lines as pings", async () => {
    const stream = await open(alice);
    expect(stream.status).toBe(200);
    expect(await stream.next((one) => one.event === "ready")).toBeTruthy();

    const started = Date.now();
    const id = await run(a);
    const queued = await stream.next((one) => one.event === "run" && one.data.id === id);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(queued?.data).toEqual({ k: "run", w: a, id, flow: null, s: "queued", p: "orders/sync" });
    // Only what changed: nothing about who the tenant is or what the run holds.
    expect(Object.keys(queued?.data ?? {})).not.toContain("t");

    await t.db.updateTable("run").set({ status: "succeeded" }).where("id", "=", id).execute();
    expect(
      await stream.next(
        (one) => one.event === "run" && one.data.id === id && one.data.s === "succeeded",
      ),
    ).toBeTruthy();

    // Fifty lines in five writes, within a tenth of a second, make at most two pings.
    for (let i = 0; i < 5; i++) {
      await t.db
        .insertInto("run_log")
        .values(
          Array.from({ length: 10 }, (_, n) => ({
            run_id: id,
            attempt: 1,
            logged_at: new Date(),
            level: "info" as const,
            message: `line ${i * 10 + n}`,
            fields: JSON.stringify({}),
          })),
        )
        .execute();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    const pings = stream.events.filter((one) => one.event === "log" && one.data.id === id);
    expect(pings.length).toBeGreaterThanOrEqual(1);
    expect(pings.length).toBeLessThanOrEqual(2);
    stream.close();
  });

  test("a flow waiting for a person, and the decision, arrive as step and flow events", async () => {
    const stream = await open(alice);
    await stream.next((one) => one.event === "ready");
    const id = await flowRun(a);
    await t.db
      .insertInto("step_run")
      .values({
        flow_run_id: id,
        node_id: "gate",
        status: "waiting",
        detail: JSON.stringify({ title: "Approve the order" }),
      } as never)
      .execute();
    expect(
      await stream.next(
        (one) => one.event === "step" && one.data.id === id && one.data.s === "waiting",
      ),
    ).toMatchObject({ data: { node: "gate", p: "orders/approve" } });
    await t.db
      .updateTable("step_run")
      .set({ status: "succeeded" })
      .where("flow_run_id", "=", id)
      .execute();
    await t.db.updateTable("flow_run").set({ status: "succeeded" }).where("id", "=", id).execute();
    expect(
      await stream.next(
        (one) => one.event === "flow_run" && one.data.id === id && one.data.s === "succeeded",
      ),
    ).toBeTruthy();
    stream.close();
  });

  test("each caller is sent only what it may read", async () => {
    const theirs = await open(wendy);
    const scriptsOnly = await open(sam);
    await theirs.next((one) => one.event === "ready");
    await scriptsOnly.next((one) => one.event === "ready");
    const inA = await run(a);
    const inB = await run(b);
    const flowInA = await flowRun(a);
    expect(await theirs.next((one) => one.data.id === inA)).toBeTruthy();
    expect(await theirs.next((one) => one.data.id === flowInA)).toBeTruthy();
    expect(await scriptsOnly.next((one) => one.data.id === inA)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Workspace B is not Wendy's, and flows are not Sam's.
    expect(theirs.events.some((one) => one.data.id === inB)).toBe(false);
    expect(scriptsOnly.events.some((one) => one.data.id === inB || one.data.id === flowInA)).toBe(
      false,
    );
    theirs.close();
    scriptsOnly.close();

    // Someone of another tenant is told this one is not there.
    const outsider = await open(olga);
    expect(outsider.status).toBe(404);
    outsider.close();
    // And nobody signed in gets anything.
    const anonymous = await open(t.anonymous);
    expect(anonymous.status).toBe(401);
    anonymous.close();
    expect(other).not.toBe(tenant);
  });

  test("an end user follows the runs they started, and nobody else's", async () => {
    const endUser = async (email: string) => {
      const created = await alice.post(`/tenants/${tenant}/end-users`, { email, name: email });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const token = new URL(created.body.invitation.url).searchParams.get("token") as string;
      const set = await t.app.inject({
        method: "POST",
        url: "/portal/acme/set-password",
        headers: {
          host: "localhost:8080",
          origin: "http://localhost:8080",
          "content-type": "application/x-www-form-urlencoded",
        },
        payload: new URLSearchParams({ token, password: PASSWORD }).toString(),
      });
      expect(set.statusCode).toBe(303);
      const cookie = ([] as string[])
        .concat(set.headers["set-cookie"] ?? [])
        .map((line) => line.split(";")[0])
        .join("; ");
      return {
        id: created.body.endUser.id as string,
        client: { headers: { cookie, host: "localhost:8080" } } as unknown as Client,
      };
    };
    const ivy = await endUser("ivy@customer.example");
    const jon = await endUser("jon@customer.example");
    const stream = await open(ivy.client);
    expect(stream.status).toBe(200);
    await stream.next((one) => one.event === "ready");

    const startedBy = async (table: "run" | "flow_run", id: string, by: string) => {
      await t.db
        .updateTable(table)
        .set({ started_by_type: "end_user", started_by_id: by, status: "running" })
        .where("id", "=", id)
        .execute();
    };
    const hers = await run(a);
    await startedBy("run", hers, ivy.id);
    const his = await run(b);
    await startedBy("run", his, jon.id);
    const herFlow = await flowRun(b);
    await t.db
      .updateTable("flow_run")
      .set({ started_by_type: "end_user", started_by_id: ivy.id, status: "succeeded" })
      .where("id", "=", herFlow)
      .execute();
    const anyone = await run(a);

    expect(await stream.next((one) => one.event === "run" && one.data.id === hers)).toMatchObject({
      data: { s: "running" },
    });
    expect(
      await stream.next((one) => one.event === "flow_run" && one.data.id === herFlow),
    ).toBeTruthy();
    await t.db
      .insertInto("run_log")
      .values({
        run_id: hers,
        attempt: 1,
        logged_at: new Date(),
        level: "info",
        message: "hello",
        fields: JSON.stringify({}),
      })
      .execute();
    expect(await stream.next((one) => one.event === "log" && one.data.id === hers)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(stream.events.some((one) => one.data.id === his || one.data.id === anyone)).toBe(false);
    // Who started it decides who receives it, and is never sent.
    expect(stream.events.some((one) => "by" in one.data)).toBe(false);

    // Two streams at most, for someone following only their own.
    const second = await open(ivy.client);
    const third = await open(ivy.client);
    expect([second.status, third.status]).toEqual([200, 429]);
    second.close();
    third.close();
    stream.close();

    // A member keeps the full stream, and is never sent who started a run either.
    const full = await open(alice);
    await full.next((one) => one.event === "ready");
    const later = await run(a);
    expect(await full.next((one) => one.data.id === later)).toBeTruthy();
    expect(full.events.some((one) => "by" in one.data)).toBe(false);
    full.close();
  });

  test("a member who may read runs in another workspace still follows their own (APP-01)", async () => {
    const beaId = (
      await alice.post(`/tenants/${tenant}/members`, {
        email: "bea@acme.example",
        name: "bea",
        password: PASSWORD,
      })
    ).body.id as string;
    const reader = await alice.post(`/tenants/${tenant}/roles`, {
      name: "b_reader",
      permissions: ["run:read", "workspace:read"],
    });
    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: b,
      principalType: "member",
      principalId: beaId,
      roleId: reader.body.id,
    });
    const starter = await alice.post(`/tenants/${tenant}/roles`, {
      name: "a_starter",
      permissions: ["workspace:read"],
    });
    const author = await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: a,
      principalType: "member",
      principalId: beaId,
      roleId: starter.body.id,
    });
    expect(author.status, JSON.stringify(author.body)).toBe(201);
    const bea = await t.signIn("bea@acme.example", PASSWORD);
    const stream = await open(bea);
    expect(stream.status).toBe(200);
    await stream.next((one) => one.event === "ready");
    const hers = await run(a);
    await t.db
      .updateTable("run")
      .set({ started_by_type: "member", started_by_id: beaId, status: "running" })
      .where("id", "=", hers)
      .execute();
    const others = await run(a);
    expect(await stream.next((one) => one.data.id === hers)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(stream.events.some((one) => one.data.id === others)).toBe(false);
    stream.close();
  });

  test("a change made through one replica reaches a stream held on another", async () => {
    const replica = new StreamHub(t.database, t.kernel.log);
    const seen: unknown[] = [];
    const unsubscribe = await replica.subscribe({
      tenantId: tenant,
      may: new Map([[a, { scripts: true, flows: true }]]),
      principal: "member:replica-test",
      send: (event, data) => seen.push({ event, data }),
    });
    expect(unsubscribe).not.toBe(false);
    const id = await run(a);
    const deadline = Date.now() + 2000;
    while (!seen.some((one) => (one as Event).data.id === id) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(seen).toContainEqual({ event: "run", data: expect.objectContaining({ id }) });
    if (unsubscribe) unsubscribe();
    await replica.close();
  });

  test("when the listening connection is lost, it is made again, and streams are told to refresh", async () => {
    const stream = await open(alice);
    await stream.next((one) => one.event === "ready");
    const pid = await t.kernel.stream.listenerPid();
    expect(pid).toBeTypeOf("number");
    await sql`select pg_terminate_backend(${pid}::int)`.execute(t.db);
    expect(await stream.next((one) => one.event === "snapshot", 5000)).toBeTruthy();
    expect(await t.kernel.stream.listenerPid()).not.toBe(pid);
    const id = await run(a);
    expect(await stream.next((one) => one.data.id === id)).toBeTruthy();
    stream.close();
  });

  test("a browser coming back is told to refresh what it shows", async () => {
    const stream = await open(alice, tenant, { "last-event-id": String(Date.now() - 5000) });
    expect(await stream.next((one) => one.event === "snapshot")).toBeTruthy();
    stream.close();
  });

  test("one caller holds at most five streams", async () => {
    const streams = [];
    for (let i = 0; i < 5; i++) streams.push(await open(wendy));
    expect(streams.map((one) => one.status)).toEqual([200, 200, 200, 200, 200]);
    const sixth = await open(wendy);
    expect(sixth.status).toBe(429);
    // It says when to try again (C22).
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
    sixth.close();
    for (const one of streams) one.close();
    // Closed streams free their places.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const again = await open(wendy);
    expect(again.status).toBe(200);
    again.close();
  });

  test("a bulk load can keep quiet", async () => {
    const stream = await open(alice);
    await stream.next((one) => one.event === "ready");
    let quiet = "";
    await t.db.transaction().execute(async (trx) => {
      await sql`set local vx.quiet = 'on'`.execute(trx);
      quiet = newId();
      await trx
        .insertInto("run")
        .values({
          id: quiet,
          tenant_id: tenant,
          workspace_id: a,
          resource_id: newId(),
          script_path: "orders/sync",
          bundle_id: bundleA,
          status: "queued",
          max_attempts: 1,
          trigger_type: "manual",
          trigger_detail: JSON.stringify({}),
          started_by_type: "system",
          idempotency_key: quiet,
        } as never)
        .execute();
    });
    const loud = await run(a);
    expect(await stream.next((one) => one.data.id === loud)).toBeTruthy();
    expect(stream.events.some((one) => one.data.id === quiet)).toBe(false);
    stream.close();
  });
});
