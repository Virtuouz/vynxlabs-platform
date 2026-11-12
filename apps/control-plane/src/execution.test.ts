import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { reapDeadRuns, requeueLostRuns } from "./kernel/execution/runs.js";
import { fireDueSchedules } from "./kernel/execution/triggers.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const SECRET_VALUE = "tok-5f9a1c7e-super-secret";

let t: TestApp;
let url: string;
let tenant: string;
let other: string; // another tenant
let dev: string;
let prod: string;
let alice: Client; // tenant admin
let bob: { id: string; client: Client }; // developer in dev
let worker: Worker;
let working: Promise<unknown>;
let roles: Record<string, string>;
const received: {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}[] = [];
let api: ReturnType<typeof createServer>;
let apiUrl: string;

// ----- Bundles written by hand, the way a build in any language could produce them -----

const object = (properties: Record<string, object> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});
const script = (
  path: string,
  entry: string,
  extra: Record<string, unknown> = {},
): BundleManifest => ({
  kind: "script",
  schemaVersion: 1,
  path,
  ownership: "code",
  body: {
    entry,
    input: object(),
    output: object(),
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    ...extra,
  },
});
const pure = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});

const code = (version: number) => `
const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
export const greet = { execute: async (input, ctx) => {
  ctx.log.info("Greeting", { name: input.name });
  ctx.log.debug("Run details", { attempt: ctx.run.attempt, trigger: ctx.run.trigger.type });
  return { greeting: "Hello " + input.name, version: ${version} };
} };
export const useAll = { execute: async (input, ctx) => {
  const api = await ctx.connection("api");
  const pong = await api.get("/ping");
  const token = await ctx.secret("TOKEN");
  ctx.log.info("Read everything");
  return { status: pong.status, tokenLength: token.length, size: await ctx.variable("config/size") };
} };
export const sneaky = { execute: async (input, ctx) => ({ value: await ctx.secret("OTHER") }) };
export const flaky = { execute: async (input, ctx) => {
  if (ctx.run.attempt < input.succeedOn) throw new Error("Not yet, attempt " + ctx.run.attempt);
  return { attempt: ctx.run.attempt };
} };
export const slow = { execute: async (input, ctx) => {
  ctx.log.info("Starting slow work");
  await wait(input.ms, ctx.signal);
  return { version: ${version} };
} };
export const stubborn = { execute: () => new Promise(() => {}) };
export const onFailure = { execute: async (input, ctx) => { ctx.log.error("A run failed", input.run); return { seen: input.run.id }; } };
`;

function bundle(
  version: number,
  change: (manifests: BundleManifest[]) => BundleManifest[] = (m) => m,
): Bundle {
  const manifests = change([
    pure("connection", "api", { connector: "http" }),
    pure("connection", "chat", { connector: "http" }),
    pure("variable", "config/size", { default: "5" }),
    script("greet", "greet", {
      input: object({ name: { type: "string" } }, ["name"]),
    }),
    script("use-all", "useAll", {
      uses: { connections: ["api"], secrets: ["TOKEN"], variables: ["config/size"] },
    }),
    script("sneaky", "sneaky"),
    script("flaky", "flaky", {
      retries: { limit: 2, delaySeconds: 1, backoff: false },
      onFailure: { script: "on-failure", notify: "chat" },
    }),
    script("slow", "slow", { concurrency: 1 }),
    script("stubborn", "stubborn", { timeoutSeconds: 1 }),
    script("on-failure", "onFailure"),
    pure("schedule", "greet-hourly", {
      script: "greet",
      cron: "0 * * * *",
      input: { name: "schedule" },
    }),
    pure("trigger", "greet-hook", { type: "webhook", script: "greet" }),
  ]);
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: code(version),
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;

async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  seconds = 10,
): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await sleep(100);
  }
}
const ended = (run: { status: string }) => !["queued", "running"].includes(run.status);
// biome-ignore lint/suspicious/noExplicitAny: run bodies are inspected freely
const finished = (id: string, seconds = 10, base = ws()): Promise<any> =>
  until(async () => (await alice.get(`${base}/runs/${id}`)).body, ended, seconds);
async function start(scriptPath: string, input: unknown = {}, extra: object = {}) {
  const response = await alice.post(`${ws()}/runs`, { script: scriptPath, input, ...extra });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.id as string;
}
async function deploy(content: Bundle, base = ws(), as = alice) {
  const uploaded = await as.post(`${base}/bundles`, content);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  return as.post(`${base}/deployments`, { bundleId: uploaded.body.id });
}

/** Speaks the worker protocol directly, as a worker in another language would. */
function protocol(token: string) {
  const call = async (method: "GET" | "POST", path: string, body?: object) => {
    const response = await t.app.inject({
      method,
      url: `/api/v1/worker${path}`,
      headers: { authorization: `Bearer ${token}` },
      ...(body ? { payload: body } : {}),
    });
    return { status: response.statusCode, body: response.body ? response.json() : null };
  };
  return {
    claim: (workerId = "018f0000-0000-7000-8000-000000000001") =>
      call("POST", "/claim", { workerId, waitSeconds: 0 }),
    get: (path: string) => call("GET", path),
    post: (path: string, body: object) => call("POST", path, body),
  };
}

beforeAll(async () => {
  t = await startTestApp({ queue: { superviseIntervalSeconds: 1, heartbeatSeconds: 10 } });
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });

  api = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body,
      });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ pong: true }));
    });
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const seed = async (slug: string, email: string) => {
    const created = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
    const grant = await t.admin.post(`/tenants/${created}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const member = await t.admin.post(`/tenants/${created}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${created}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
    await t.admin.delete(`/tenants/${created}/access-grants/${grant.body.id}`);
    return { id: created, client: await t.signIn(email, PASSWORD) };
  };
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  other = (await seed("globex", "gina@globex.example")).id;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;

  const member = await alice.post(`/tenants/${tenant}/members`, {
    email: "bob@acme.example",
    name: "Bob",
    password: PASSWORD,
  });
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: dev,
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.developer,
  });
  bob = { id: member.body.id, client: await t.signIn("bob@acme.example", PASSWORD) };
}, 60_000);

afterAll(async () => {
  worker?.stop();
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
  await t.stop();
});

describe("deploying", () => {
  test("a bundle is refused, by name, until everything it needs is bound", async () => {
    const refused = await deploy(bundle(1));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("bindings_missing");
    expect(refused.body.errors).toEqual([
      { path: "/connections/api", message: 'the connection "api" is not bound in this workspace' },
      {
        path: "/connections/chat",
        message: 'the connection "chat" is not bound in this workspace',
      },
      { path: "/secrets/TOKEN", message: 'the secret "TOKEN" is not set in this workspace' },
    ]);
    // Nothing was deployed: the refusal left no resources behind.
    expect((await alice.get(`${ws()}/resources`)).body.items).toEqual([]);
    expect((await alice.get(`${ws()}/scripts`)).body.items).toEqual([]);
  });

  test("connections, secrets and variables are bound per workspace", async () => {
    expect(
      (await alice.put(`${ws()}/connection-bindings/api`, { config: { baseUrl: "not a url" } }))
        .status,
    ).toBe(400);
    const bound = await alice.put(`${ws()}/connection-bindings/api`, {
      config: { baseUrl: apiUrl, headers: { "x-client": "platform" }, auth: { type: "bearer" } },
      credential: "api-credential-123",
    });
    expect(bound.status).toBe(204);
    expect(
      (
        await alice.put(`${ws()}/connection-bindings/chat`, {
          config: { baseUrl: `${apiUrl}/chat-hook` },
        })
      ).status,
    ).toBe(204);
    expect((await alice.put(`${ws()}/secrets/TOKEN`, { value: SECRET_VALUE })).status).toBe(204);

    const listed = (await alice.get(`${ws()}/connection-bindings`)).body.items;
    expect(listed[0]).toMatchObject({
      path: "api",
      bound: true,
      hasCredential: true,
      defined: false,
    });
    expect(JSON.stringify(listed)).not.toContain("api-credential-123");
    // Rebinding without a credential keeps the stored one.
    await alice.put(`${ws()}/connection-bindings/api`, {
      config: { baseUrl: apiUrl, headers: { "x-client": "platform" }, auth: { type: "bearer" } },
    });
    expect((await alice.get(`${ws()}/connection-bindings`)).body.items[0].hasCredential).toBe(true);
  });

  test("a binding can be removed, and a deploy then names it as missing again", async () => {
    await alice.put(`${ws()}/connection-bindings/temporary`, { config: { baseUrl: apiUrl } });
    expect((await alice.delete(`${ws()}/connection-bindings/temporary`)).status).toBe(204);
    expect((await alice.delete(`${ws()}/connection-bindings/temporary`)).status).toBe(404);
    const audit = await alice.get(`/tenants/${tenant}/audit?action=connection.unbound`);
    expect(audit.body.items[0]).toMatchObject({ targetId: "temporary" });
  });

  test("a developer uploads but cannot activate, a deployer can", async () => {
    // The refused deploy above already stored this bundle, so uploading it again returns that one.
    const stored = (await alice.get(`${ws()}/bundles`)).body.items;
    expect(stored).toHaveLength(1);
    const uploaded = await bob.client.post(`${ws()}/bundles`, bundle(1));
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toMatchObject({
      id: stored[0].id,
      version: 1,
      active: false,
      manifestCount: 12,
    });
    expect(
      (await bob.client.post(`${ws()}/deployments`, { bundleId: uploaded.body.id })).status,
    ).toBe(403);

    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: dev,
      principalType: "member",
      principalId: bob.id,
      roleId: roles.deployer,
    });
    const deployed = await bob.client.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status).toBe(201);
    expect(deployed.body).toMatchObject({
      bundleVersion: 1,
      summary: { created: 12, updated: 0, unchanged: 0, deleted: 0 },
    });
    expect((await alice.get(`${ws()}/bundles`)).body.items[0].active).toBe(true);
  });

  test("deployed resources are code-managed and cannot be changed through the interface", async () => {
    const stored = (await alice.get(`${ws()}/resources/greet`)).body;
    expect(stored).toMatchObject({
      kind: "script",
      ownership: "code",
      workspace: "main-dev",
      version: 1,
    });
    const edit = await alice.put(`${ws()}/resources/greet`, {
      kind: "script",
      schemaVersion: 1,
      ownership: "ui",
      body: stored.body,
    });
    expect(edit.status).toBe(409);
  });

  test("a tampered or malformed bundle is refused", async () => {
    const good = bundle(1);
    expect(
      (await alice.post(`${ws()}/bundles`, { ...good, code: `${good.code}// changed` })).body
        .detail,
    ).toMatch(/digest/);
    expect((await alice.post(`${ws()}/bundles`, { nonsense: true })).status).toBe(400);
    const badManifest = bundle(1, (m) => [...m, script("broken", "x", { timeoutSeconds: 0 })]);
    const refused = await alice.post(`${ws()}/bundles`, badManifest);
    expect(refused.status).toBe(400);
    expect(refused.body.errors[0]).toEqual({
      path: "broken (script)",
      message: "/body/timeoutSeconds must be >= 1",
    });
  });

  test("a bundle built for another core version is refused with the reason", async () => {
    const future = { ...bundle(1), core: { min: "50.0.0", below: "51.0.0" } };
    const uploaded = await alice.post(`${ws()}/bundles`, {
      ...future,
      digest: bundleDigest(future),
    });
    const refused = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "incompatible_bundle" });
    expect(refused.body.detail).toContain("This instance runs 1.2.3");
    expect(
      (await alice.get(`${ws()}/bundles`)).body.items.find((b: { active: boolean }) => b.active)
        .version,
    ).toBe(1);
  });
});

describe("running", () => {
  test("a manual run is executed by a worker, with output, logs and the bundle version", async () => {
    const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, {
      name: "test worker",
    });
    expect(credential.body.token).toMatch(/^vxw_/);
    worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1, concurrency: 4 });
    working = worker.run();

    const id = await start("greet", { name: "Ada" });
    const run = await finished(id);
    expect(run).toMatchObject({
      status: "succeeded",
      script: "greet",
      attempt: 1,
      bundleVersion: 1,
      input: { name: "Ada" },
      output: { greeting: "Hello Ada", version: 1 },
      trigger: { type: "manual" },
      error: null,
    });
    expect(run.startedBy.type).toBe("member");
    expect(Date.parse(run.finishedAt)).toBeGreaterThanOrEqual(Date.parse(run.startedAt));

    const logs = await until(
      async () => (await alice.get(`${ws()}/runs/${id}/logs`)).body,
      (l) => l.items.length >= 2,
    );
    expect(logs.done).toBe(true);
    expect(
      logs.items.map((line: { level: string; message: string }) => [line.level, line.message]),
    ).toEqual([
      ["info", "Greeting"],
      ["debug", "Run details"],
    ]);
    expect(logs.items[0]).toMatchObject({ attempt: 1, fields: { name: "Ada" } });
    expect(
      (await alice.get(`${ws()}/runs/${id}/logs?after=${logs.items[0].seq}`)).body.items,
    ).toHaveLength(1);

    const listed = await alice.get(`${ws()}/runs?script=greet&status=succeeded`);
    expect(listed.body.items.map((r: { id: string }) => r.id)).toEqual([id]);
    expect(
      (await alice.get(`${ws()}/scripts`)).body.items.find(
        (s: { path: string }) => s.path === "greet",
      ).lastRun,
    ).toMatchObject({
      id,
      status: "succeeded",
    });
    const audit = await alice.get(`/tenants/${tenant}/audit?action=run.started`);
    expect(audit.body.items[0]).toMatchObject({ targetId: id, details: { script: "greet" } });
    expect((await alice.get(`/tenants/${tenant}/workers`)).body.items[0]).toMatchObject({
      credentialName: "test worker",
      managed: false,
    });
  });

  test("input that does not match the script's schema is refused before anything is queued", async () => {
    const refused = await alice.post(`${ws()}/runs`, { script: "greet", input: { name: 42 } });
    expect(refused.status).toBe(400);
    expect(refused.body.errors).toEqual([{ path: "/input/name", message: "must be string" }]);
    expect((await alice.post(`${ws()}/runs`, { script: "no-such-script" })).status).toBe(404);
    expect(
      (await bob.client.post(`${ws()}/runs`, { script: "greet", input: { name: "Bob" } })).status,
    ).toBe(201);
  });

  test("starting again with the same idempotency key returns the first run", async () => {
    const first = await alice.post(`${ws()}/runs`, {
      script: "greet",
      input: { name: "Once" },
      idempotencyKey: "order-17",
    });
    const second = await alice.post(`${ws()}/runs`, {
      script: "greet",
      input: { name: "Twice" },
      idempotencyKey: "order-17",
    });
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body.id).toBe(first.body.id);
    expect((await finished(first.body.id)).input).toEqual({ name: "Once" });
  });

  test("a script reads its connection, secret and variable, and only what it declared", async () => {
    const id = await start("use-all");
    expect(await finished(id)).toMatchObject({
      status: "succeeded",
      output: { status: 200, tokenLength: SECRET_VALUE.length, size: "5" },
    });
    const call = received.find((request) => request.url === "/ping");
    expect(call?.headers).toMatchObject({
      authorization: "Bearer api-credential-123",
      "x-client": "platform",
    });

    // A workspace value overrides the variable's default.
    expect((await alice.put(`${ws()}/variable-values/config/size`, { value: "80" })).status).toBe(
      204,
    );
    expect((await alice.get(`${ws()}/variable-values`)).body.items).toEqual([
      { path: "config/size", description: "", default: "5", value: "80" },
    ]);
    expect((await finished(await start("use-all"))).output.size).toBe("80");
    await alice.delete(`${ws()}/variable-values/config/size`);
    expect((await finished(await start("use-all"))).output.size).toBe("5");

    const undeclared = await finished(await start("sneaky"));
    expect(undeclared.status).toBe("failed");
    expect(undeclared.error.message).toContain('a declared use of the secret "OTHER"');
  });

  test("a secret's value never reaches a run record, a log line or the audit log", async () => {
    const runs = (await alice.get(`${ws()}/runs?limit=200`)).body.items;
    let everything =
      JSON.stringify(runs) +
      JSON.stringify((await alice.get(`/tenants/${tenant}/audit?limit=200`)).body);
    for (const run of runs) {
      everything += JSON.stringify((await alice.get(`${ws()}/runs/${run.id}`)).body);
      everything += JSON.stringify((await alice.get(`${ws()}/runs/${run.id}/logs`)).body);
    }
    expect(everything).not.toContain(SECRET_VALUE);
    expect(everything).not.toContain("api-credential-123");
  });

  test("a failed attempt is retried, and the run succeeds on a later attempt", async () => {
    const run = await finished(await start("flaky", { succeedOn: 2 }), 20);
    expect(run).toMatchObject({
      status: "succeeded",
      attempt: 2,
      maxAttempts: 3,
      output: { attempt: 2 },
    });
  }, 30_000);

  test("a final failure starts the handler script and posts the notification", async () => {
    const id = await start("flaky", { succeedOn: 99 });
    const run = await until(
      async () => (await alice.get(`${ws()}/runs/${id}`)).body,
      (r) => ended(r) && r.alert !== null,
      30,
    );
    expect(run).toMatchObject({
      status: "failed",
      attempt: 3,
      error: { message: "Not yet, attempt 3" },
    });
    expect(run.alert).toMatchObject({ notified: true });

    const handler = await finished(run.alert.handlerRunId);
    expect(handler).toMatchObject({
      status: "succeeded",
      script: "on-failure",
      trigger: { type: "alert", failedRunId: id },
      output: { seen: id },
    });
    const post = received.find((request) => request.url === "/chat-hook");
    expect(JSON.parse(post?.body ?? "{}")).toMatchObject({
      text: "Run failed: flaky in main-dev. Not yet, attempt 3",
      run: { id, script: "flaky", attempt: 3 },
    });
  }, 45_000);

  test("a waiting run and a running run can both be cancelled", async () => {
    const running = await start("slow", { ms: 20_000 });
    await until(
      async () => (await alice.get(`${ws()}/runs/${running}`)).body,
      (r) => r.status === "running",
    );
    // The script allows one run at a time, so the second waits.
    const waiting = await start("slow", { ms: 20_000 });
    await sleep(1500);
    expect((await alice.get(`${ws()}/runs/${waiting}`)).body.status).toBe("queued");

    expect((await alice.post(`${ws()}/runs/${waiting}/cancel`)).body.status).toBe("cancelled");
    expect((await alice.post(`${ws()}/runs/${running}/cancel`)).body.status).toBe("cancelled");
    expect((await alice.post(`${ws()}/runs/${running}/cancel`)).status).toBe(409);
    expect((await bob.client.post(`${ws()}/runs/${running}/cancel`)).status).toBe(409);

    // The slot is free again: a new run of the same script starts.
    const next = await start("slow", { ms: 10 });
    expect((await finished(next, 20)).status).toBe("succeeded");
  }, 40_000);

  test("a run that ignores its time limit is ended at the limit", async () => {
    const run = await finished(await start("stubborn"), 20);
    expect(run.status).toBe("failed");
    expect(run.error.message).toBe("The run took longer than its limit of 1 seconds.");
  }, 30_000);
});

describe("deploys and runs in progress", () => {
  test("a run finishes on the bundle it started with, and a rollback restores the old one", async () => {
    const before = await start("slow", { ms: 2500 });
    await until(
      async () => (await alice.get(`${ws()}/runs/${before}`)).body,
      (r) => r.status === "running",
    );

    const second = await deploy(
      bundle(2, (m) => m.filter((manifest) => manifest.path !== "sneaky")),
    );
    expect(second.body).toMatchObject({
      bundleVersion: 3,
      summary: { created: 0, updated: 0, unchanged: 11, deleted: 1 },
    });
    expect((await alice.get(`${ws()}/resources/sneaky`)).status).toBe(404);

    expect(await finished(before, 20)).toMatchObject({
      status: "succeeded",
      bundleVersion: 1,
      output: { version: 1 },
    });
    expect(await finished(await start("slow", { ms: 10 }), 20)).toMatchObject({
      bundleVersion: 3,
      output: { version: 2 },
    });

    const first = (await alice.get(`${ws()}/bundles`)).body.items.find(
      (b: { version: number }) => b.version === 1,
    );
    const rolledBack = await alice.post(`${ws()}/deployments`, { bundleId: first.id });
    expect(rolledBack.body.summary).toEqual({ created: 1, updated: 0, unchanged: 11, deleted: 0 });
    expect(await finished(await start("slow", { ms: 10 }), 20)).toMatchObject({
      bundleVersion: 1,
      output: { version: 1 },
    });

    const history = (await alice.get(`${ws()}/deployments`)).body.items;
    expect(history.map((d: { bundleVersion: number }) => d.bundleVersion)).toEqual([1, 3, 1]);
    expect(history[0].previousBundleId).toBe(history[1].bundleId);
  }, 60_000);
});

describe("triggers", () => {
  test("a schedule starts one run when it is due, and waits for its next time", async () => {
    const listed = (await alice.get(`${ws()}/triggers`)).body.items;
    const schedule = listed.find((trigger: { type: string }) => trigger.type === "schedule");
    expect(schedule).toMatchObject({
      path: "greet-hourly",
      script: "greet",
      cron: "0 * * * *",
      timezone: "UTC",
      enabled: true,
    });
    const due = new Date(schedule.nextFireAt);
    expect(due.getUTCMinutes()).toBe(0);

    expect(await fireDueSchedules(t.kernel, new Date(due.getTime() - 1000))).toBe(0);
    // Three hours late: it runs once, not three times.
    const late = new Date(due.getTime() + 3 * 3600_000 + 60_000);
    expect(await fireDueSchedules(t.kernel, late)).toBe(1);
    expect(await fireDueSchedules(t.kernel, late)).toBe(0);

    const runs = (await alice.get(`${ws()}/runs?script=greet`)).body.items.filter(
      (run: { trigger: { type: string } }) => run.trigger.type === "schedule",
    );
    expect(runs).toHaveLength(1);
    expect(await finished(runs[0].id)).toMatchObject({
      status: "succeeded",
      output: { greeting: "Hello schedule" },
      trigger: { type: "schedule", schedule: "greet-hourly", scheduledFor: due.toISOString() },
      startedBy: { type: "trigger" },
    });
    const after = (await alice.get(`${ws()}/triggers`)).body.items.find(
      (x: { type: string }) => x.type === "schedule",
    );
    expect(new Date(after.nextFireAt).getTime()).toBeGreaterThan(late.getTime());
  });

  test("a schedule with a bad expression or a missing script cannot be deployed", async () => {
    const bad = await deploy(
      bundle(3, (m) => [
        ...m,
        pure("schedule", "broken", { script: "greet", cron: "every tuesday" }),
      ]),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].path).toBe("/body/cron");
    // A trigger for a script the bundle does not have is caught when the bundle is uploaded.
    const orphan = await alice.post(
      `${ws()}/bundles`,
      bundle(4, (m) => [...m, pure("trigger", "orphan", { type: "webhook", script: "missing" })]),
    );
    expect(orphan.status).toBe(400);
    expect(orphan.body.errors[0]).toEqual({
      path: "orphan (trigger)",
      message: 'script refers to "missing", which is not a script in this repository.',
    });
    // Neither failed deploy changed what is active.
    expect(
      (await alice.get(`${ws()}/bundles`)).body.items.find((b: { active: boolean }) => b.active)
        .version,
    ).toBe(1);
  });

  test("a webhook starts a run from its address, which only those who may manage it can see", async () => {
    const hook = (await alice.get(`${ws()}/triggers`)).body.items.find(
      (x: { type: string }) => x.type === "webhook",
    );
    expect(hook.url).toMatch(/^http:\/\/localhost:8080\/api\/v1\/hooks\/vxh_[A-Za-z0-9_-]{43}$/);
    const viewer = (await bob.client.get(`${ws()}/triggers`)).body.items.find(
      (x: { type: string }) => x.type === "webhook",
    );
    expect(viewer.url).toBeNull();

    const path = new URL(hook.url).pathname.replace("/api/v1", "");
    const accepted = await t.anonymous.post(path, { name: "Webhook" });
    expect(accepted.status).toBe(202);
    expect(await finished(accepted.body.runId)).toMatchObject({
      status: "succeeded",
      output: { greeting: "Hello Webhook" },
      trigger: { type: "webhook", trigger: "greet-hook" },
    });

    expect((await t.anonymous.post("/hooks/vxh_not-a-real-token", {})).status).toBe(404);
    expect((await t.anonymous.post(path, { name: 7 })).status).toBe(400);

    // A redelivery with the same key starts nothing new.
    const send = () =>
      t.app.inject({
        method: "POST",
        url: `/api/v1${path}`,
        headers: { "idempotency-key": "delivery-1" },
        payload: { name: "Dup" },
      });
    const [once, twice] = [(await send()).json().runId, (await send()).json().runId];
    expect(once).toBe(twice);
    expect((await finished(once)).status).toBe("succeeded");
  });

  test("webhooks are rate limited", async () => {
    const statuses = new Set<number>();
    for (let i = 0; i < 130; i++) {
      statuses.add(
        (await t.app.inject({ method: "POST", url: "/api/v1/hooks/vxh_nobody", payload: {} }))
          .statusCode,
      );
    }
    expect([...statuses].sort()).toEqual([404, 429]);
  });
});

describe("the worker protocol", () => {
  test("a credential reaches only its own tenant, and a workspace credential only its workspace", async () => {
    await deploy(bundle(1), `/tenants/${tenant}/workspaces/${prod}`).then((refused) =>
      expect(refused.status).toBe(409),
    );
    for (const path of ["api", "chat"]) {
      await alice.put(`/tenants/${tenant}/workspaces/${prod}/connection-bindings/${path}`, {
        config: { baseUrl: apiUrl },
      });
    }
    await alice.put(`/tenants/${tenant}/workspaces/${prod}/secrets/TOKEN`, { value: "prod-token" });
    expect((await deploy(bundle(1), `/tenants/${tenant}/workspaces/${prod}`)).status).toBe(201);

    worker.stop();
    await working;
    const gina = await t.signIn("gina@globex.example", PASSWORD);
    const theirs = protocol(
      (await gina.post(`/tenants/${other}/worker-credentials`, { name: "theirs" })).body.token,
    );
    const prodOnly = protocol(
      (
        await alice.post(`/tenants/${tenant}/worker-credentials`, {
          name: "prod only",
          workspaceId: prod,
        })
      ).body.token,
    );
    const ours = protocol(
      (await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "ours" })).body.token,
    );

    const devRun = await start("greet", { name: "Dev" });
    const run = (await alice.get(`${ws()}/runs/${devRun}`)).body;

    // Neither the other tenant's worker nor the production-only worker is offered the job.
    expect((await theirs.claim()).body).toEqual({ job: null });
    expect((await prodOnly.claim()).body).toEqual({ job: null });
    expect((await theirs.get(`/bundles/${run.bundleId}`)).status).toBe(404);
    expect((await prodOnly.get(`/bundles/${run.bundleId}`)).status).toBe(404);

    const claimed = (await ours.claim()).body.job;
    expect(claimed).toMatchObject({
      runId: devRun,
      attempt: 1,
      workspaceId: dev,
      script: { path: "greet", entry: "greet" },
      input: { name: "Dev" },
      timeoutSeconds: 30,
      trigger: { type: "manual" },
    });
    expect((await ours.get(`/bundles/${claimed.bundle.id}`)).body.digest).toBe(
      claimed.bundle.digest,
    );

    // Others cannot touch a run in progress, even knowing its ID.
    for (const stranger of [theirs, prodOnly]) {
      expect((await stranger.post(`/runs/${devRun}/heartbeat`, { attempt: 1 })).status).toBe(404);
      expect(
        (await stranger.post(`/runs/${devRun}/complete`, { attempt: 1, output: {} })).status,
      ).toBe(404);
      expect((await stranger.get(`/runs/${devRun}/secrets/TOKEN?attempt=1`)).status).toBe(404);
    }
    // A wrong attempt number is refused too.
    expect((await ours.post(`/runs/${devRun}/complete`, { attempt: 2, output: {} })).status).toBe(
      409,
    );
    expect((await ours.post(`/runs/${devRun}/heartbeat`, { attempt: 1 })).body).toEqual({
      cancelled: false,
    });
    expect(
      (await ours.post(`/runs/${devRun}/complete`, { attempt: 1, output: { greeting: "by hand" } }))
        .status,
    ).toBe(204);
    expect((await alice.get(`${ws()}/runs/${devRun}`)).body).toMatchObject({
      status: "succeeded",
      output: { greeting: "by hand" },
    });
    // Reporting twice changes nothing.
    expect((await ours.post(`/runs/${devRun}/complete`, { attempt: 1, output: {} })).status).toBe(
      409,
    );

    expect((await protocol("vxw_made-up").claim()).status).toBe(401);
    expect((await protocol("vxk_an-api-key").claim()).status).toBe(401);
  });

  test("the script limit and the workspace limit both hold, and a busy workspace does not starve another", async () => {
    const ours = protocol(
      (await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "limits" })).body.token,
    );
    const prodBase = `/tenants/${tenant}/workspaces/${prod}`;

    // "slow" allows one run at a time.
    const [first, second] = [await start("slow", { ms: 5 }), await start("slow", { ms: 5 })];
    const one = (await ours.claim()).body.job;
    expect(one.runId).toBe(first);
    expect((await ours.claim()).body.job).toBeNull();
    await ours.post(`/runs/${first}/complete`, { attempt: 1, output: {} });
    expect((await ours.claim()).body.job.runId).toBe(second);
    await ours.post(`/runs/${second}/complete`, { attempt: 1, output: {} });

    // The workspace allows two runs at a time.
    expect((await alice.patch(ws(), { concurrencyLimit: 2 })).body.concurrencyLimit).toBe(2);
    for (const name of ["a", "b", "c"]) await start("greet", { name });
    const prodRun = (
      await alice.post(`${prodBase}/runs`, { script: "greet", input: { name: "prod" } })
    ).body.id;
    const claimed: { runId: string; workspaceId: string }[] = [];
    for (let job = (await ours.claim()).body.job; job; job = (await ours.claim()).body.job)
      claimed.push(job);
    expect(claimed.filter((job) => job.workspaceId === dev)).toHaveLength(2);
    // The production run was served even though dev had more waiting.
    expect(claimed.map((job) => job.runId)).toContain(prodRun);

    for (const job of claimed)
      await ours.post(`/runs/${job.runId}/complete`, { attempt: 1, output: {} });
    const last = (await ours.claim()).body.job;
    expect(last.workspaceId).toBe(dev);
    await ours.post(`/runs/${last.runId}/complete`, { attempt: 1, output: {} });
    await alice.patch(ws(), { concurrencyLimit: 10 });
  });

  test("a worker that goes silent loses its job, and another worker gets it", async () => {
    const ours = protocol(
      (await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "silent" })).body.token,
    );
    const id = await start("flaky", { succeedOn: 1 });
    expect((await ours.claim()).body.job).toMatchObject({ runId: id, attempt: 1 });
    // No heartbeat is sent. After the heartbeat window the job is offered again.
    const again = await until(
      async () => (await ours.claim()).body.job,
      (job) => job !== null,
      40,
    );
    expect(again).toMatchObject({ runId: id, attempt: 2 });
    // The first worker's late report is refused. The second worker's counts.
    expect((await ours.post(`/runs/${id}/complete`, { attempt: 1, output: {} })).status).toBe(409);
    expect(
      (await ours.post(`/runs/${id}/complete`, { attempt: 2, output: { attempt: 2 } })).status,
    ).toBe(204);
    expect((await alice.get(`${ws()}/runs/${id}`)).body).toMatchObject({
      status: "succeeded",
      attempt: 2,
    });
  }, 60_000);

  test("a run whose worker vanished shows as waiting again, so a worker is started for it", async () => {
    const { WorkerSupervisor } = await import("./kernel/execution/supervisor.js");
    const ours = protocol(
      (await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "vanishes" })).body.token,
    );
    const id = await start("flaky", { succeedOn: 1 });
    expect((await ours.claim()).body.job.runId).toBe(id);
    expect(await requeueLostRuns(t.kernel)).toBe(0);

    // The worker is gone. Nothing claims the job, and yet the run must not stay "running".
    const requeued = await until(
      async () => {
        await requeueLostRuns(t.kernel);
        return (await alice.get(`${ws()}/runs/${id}`)).body;
      },
      (run) => run.status === "queued",
      40,
    );
    expect(requeued).toMatchObject({
      status: "queued",
      error: { message: expect.stringContaining("stopped responding") },
    });

    // Now the supervisor sees work for the tenant and starts a worker, which finishes the run.
    const supervisor = new WorkerSupervisor(t.kernel, { url, idleExitSeconds: 2 });
    await supervisor.tick();
    expect(supervisor.tenants).toEqual([tenant]);
    expect(await finished(id, 30)).toMatchObject({ status: "succeeded", attempt: 2, error: null });
    await supervisor.stop();
  }, 90_000);

  test("a run with no retries left whose worker vanished is closed as failed", async () => {
    const ours = protocol(
      (await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "vanishing" })).body.token,
    );
    const id = await start("stubborn");
    expect((await ours.claim()).body.job.runId).toBe(id);
    // biome-ignore lint/suspicious/noExplicitAny: run bodies are inspected freely
    const closed: any = await until(
      async () => {
        await reapDeadRuns(t.kernel);
        return (await alice.get(`${ws()}/runs/${id}`)).body;
      },
      ended,
      40,
    );
    expect(closed.status).toBe("failed");
    expect(closed.error.message).toMatch(/timed out, or its worker stopped responding/);
  }, 60_000);

  test("a revoked credential stops working", async () => {
    const created = await alice.post(`/tenants/${tenant}/worker-credentials`, {
      name: "short-lived",
    });
    expect((await protocol(created.body.token).claim()).status).toBe(200);
    expect(
      (await alice.delete(`/tenants/${tenant}/worker-credentials/${created.body.id}`)).status,
    ).toBe(204);
    expect((await protocol(created.body.token).claim()).status).toBe(401);
    const listed = (await alice.get(`/tenants/${tenant}/worker-credentials`)).body.items;
    expect(listed.find((c: { id: string }) => c.id === created.body.id).revokedAt).not.toBeNull();
    expect(JSON.stringify(listed)).not.toContain(created.body.token);
  });
});

describe("operator health and guards", () => {
  test("metrics are served in Prometheus text format to operators only", async () => {
    const response = await t.app.inject({ url: "/api/v1/metrics", headers: { cookie: "" } });
    expect(response.statusCode).toBe(401);
    expect((await alice.get("/metrics")).status).toBe(403);
    const metrics = await t.admin.get("/metrics");
    expect(metrics.status).toBe(200);
    expect(metrics.headers["content-type"]).toMatch(/^text\/plain/);
    expect(metrics.body).toMatch(/^platform_runs_queued \d+$/m);
    expect(metrics.body).toMatch(/^platform_workers\{kind="standalone"\} \d+$/m);
  });

  test("large inputs and outputs are kept in file storage, not in the run row", async () => {
    const ours = protocol(
      (await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "big" })).body.token,
    );
    const big = "x".repeat(300 * 1024);
    const id = await start("greet", { name: big });
    const row = await t.db
      .selectFrom("run")
      .select(["input", "input_ref"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ input: null, input_ref: `runs/${id}/input.json` });
    expect((await ours.claim()).body.job.input).toEqual({ name: big });
    await ours.post(`/runs/${id}/complete`, { attempt: 1, output: { echo: big } });
    const run = (await alice.get(`${ws()}/runs/${id}`)).body;
    expect(run.input.name).toHaveLength(big.length);
    expect(run.output.echo).toHaveLength(big.length);
  });

  test("every change by a principal left an audit entry, and every such route was exercised", () => {
    expect(t.unaudited).toEqual([]);
    const execution =
      /\/(bundles|deployments|runs|connection-bindings|variable-values|worker-credentials)(\/|$)/;
    // Worker protocol routes are not changes by a principal. The protocol tests cover them.
    expect(t.unexercised((route) => execution.test(route) && !route.includes("/worker/"))).toEqual(
      [],
    );
  });
});

describe("managed workers", () => {
  test("one starts for a tenant with work, runs it, and exits when idle, holding no instance secrets", async () => {
    const { WorkerSupervisor } = await import("./kernel/execution/supervisor.js");
    const supervisor = new WorkerSupervisor(t.kernel, { url, idleExitSeconds: 2 });

    const environment = supervisor.environment("vxw_example");
    expect(
      Object.keys(environment)
        .sort()
        .filter((name) => name.startsWith("PLATFORM_")),
    ).toEqual(["PLATFORM_URL", "PLATFORM_WORKER_IDLE_EXIT", "PLATFORM_WORKER_TOKEN"]);
    for (const secret of [
      "DATABASE_URL",
      "MASTER_KEY",
      "AUTH_SECRET",
      "S3_SECRET_ACCESS_KEY",
      "BOOTSTRAP_ADMIN_PASSWORD",
    ]) {
      expect(environment).not.toHaveProperty(secret);
    }

    await supervisor.tick();
    expect(supervisor.tenants).toEqual([]);

    const id = await start("greet", { name: "Managed" });
    await supervisor.tick();
    await supervisor.tick();
    // One worker for the tenant, however many times the supervisor looks.
    expect(supervisor.tenants).toEqual([tenant]);
    expect(await finished(id, 30)).toMatchObject({
      status: "succeeded",
      output: { greeting: "Hello Managed" },
    });
    const workers = (await alice.get(`/tenants/${tenant}/workers`)).body.items;
    expect(workers.some((w: { managed: boolean }) => w.managed)).toBe(true);

    // With nothing to do it exits by itself, and its credential is revoked.
    await until(
      async () => supervisor.tenants,
      (tenants) => tenants.length === 0,
      40,
    );
    expect(supervisor.tenants).toEqual([]);
    const credentials = await until(
      () =>
        t.db
          .selectFrom("worker_credential")
          .select("revoked_at")
          .where("managed", "=", true)
          .execute(),
      (rows) => rows.every((row) => row.revoked_at !== null),
    );
    expect(credentials.length).toBeGreaterThan(0);
    expect(credentials.every((row) => row.revoked_at !== null)).toBe(true);
    await supervisor.stop();
  }, 90_000);
});
