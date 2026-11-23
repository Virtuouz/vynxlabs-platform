import { type Bundle, type BundleManifest, bundleDigest, formatFor } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sendAlerts } from "./kernel/execution/alerts.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
let dev: string;
let prod: string;
let lone: string;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const manifest = (
  kind: string,
  path: string,
  body: Record<string, unknown>,
  key?: string,
): BundleManifest => ({
  kind,
  schemaVersion: kind === "interface" ? 2 : kind === "dashboard" ? 3 : 1,
  path,
  ownership: "code",
  body,
  ...(key !== undefined ? { key } : {}),
});
function bundle(manifests: BundleManifest[]): Bundle {
  const unsigned = {
    formatVersion: formatFor(1, manifests),
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export const main = { execute: async () => ({}) };",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

const ws = (id: string) => `/tenants/${tenant}/workspaces/${id}`;
async function deploy(workspace: string, content: Bundle, extra: object = {}) {
  const uploaded = await alice.post(`${ws(workspace)}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return alice.post(`${ws(workspace)}/deployments`, { bundleId: uploaded.body.id, ...extra });
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
  const make = async (slug: string, type: string) =>
    (await alice.post(`/tenants/${tenant}/workspaces`, { slug, name: slug, type })).body
      .id as string;
  prod = await make("main", "production");
  dev = await make("dev", "dev");
  await alice.patch(ws(dev), { linkedWorkspaceId: prod });
  lone = await make("lone", "dev");
}, 60_000);

afterAll(async () => {
  await t.stop();
});

const object = { type: "object" };
const withUses = (
  path: string,
  uses: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) =>
  manifest("script", path, {
    entry: "main",
    input: object,
    output: object,
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], sources: [], ...uses },
    ...extra,
  });
const connectionOf = async (workspace: string, path: string) =>
  (await alice.get(`${ws(workspace)}/connection-bindings`)).body.items.find(
    (one: Any) => one.path === path,
  );

describe("a connection says what it is, and what is drafted is listed (CFG-05, CFG-08)", () => {
  test("an SMTP connection bound from an uploaded bundle, and after its declaration was deployed away, is still SMTP", async () => {
    const upload = await alice.post(
      `${ws(lone)}/bundles`,
      bundle([manifest("connection", "mail", { connector: "smtp" })]),
    );
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    const bound = await alice.put(`${ws(lone)}/connection-bindings/mail`, {
      config: { host: "smtp.test", from: "ops@acme.example" },
      credential: "pw",
    });
    expect(bound.status, JSON.stringify(bound.body)).toBe(204);
    const before = await connectionOf(lone, "mail");
    expect(before.connector).toBe("smtp");
    expect(before.configSchema.properties.host).toBeDefined();

    // Declared, then deployed away: the binding stays what it was bound as.
    expect(
      (await deploy(lone, bundle([manifest("connection", "mail", { connector: "smtp" })]))).status,
    ).toBe(201);
    expect((await deploy(lone, bundle([manifest("variable", "other", {})]))).status).toBe(201);
    const after = await connectionOf(lone, "mail");
    expect(after).toMatchObject({ defined: false, bound: true, connector: "smtp" });
    expect(after.configSchema.properties.host).toBeDefined();
  });

  test("a drafted connection is listed with its draft state, and found by its path", async () => {
    const saved = await alice.put(`${ws(lone)}/drafts/crm`, {
      kind: "connection",
      schemaVersion: 1,
      body: { connector: "http", description: "The CRM" },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const item = await connectionOf(lone, "crm");
    expect(item).toMatchObject({ path: "crm", draft: "new", defined: false, bound: false });
    expect((await alice.get(`${ws(lone)}/connection-bindings/crm`)).status).toBe(200);
    // One that is deployed and then removed in a draft says so.
    await alice.delete(`${ws(lone)}/drafts/crm`);
    expect(await connectionOf(lone, "crm")).toBeUndefined();
  });
});

describe("connection groups (CFG-10, CFG-11, D46)", () => {
  const group = manifest("connection_group", "pool", { connector: "http" });
  test("members of a group that is no longer declared are listed, and can be removed", async () => {
    expect((await deploy(lone, bundle([group]))).status).toBe(201);
    const added = await alice.put(`${ws(lone)}/connection-group-members/east/pool`, {
      config: { baseUrl: "http://east.test" },
      credential: "k",
    });
    expect(added.status, JSON.stringify(added.body)).toBe(204);
    expect((await deploy(lone, bundle([manifest("variable", "other", {})]))).status).toBe(201);
    const groups = (await alice.get(`${ws(lone)}/connection-groups`)).body.items;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ path: "pool", declared: false });
    expect(groups[0].members.map((one: Any) => one.key)).toEqual(["east"]);
    // Declared again, as another kind: the leftover is what the refusal is about.
    const again = await deploy(
      lone,
      bundle([manifest("connection_group", "pool", { connector: "smtp" })]),
    );
    expect(again.status).toBe(409);
    expect((await alice.delete(`${ws(lone)}/connection-group-members/east/pool`)).status).toBe(204);
    expect((await alice.get(`${ws(lone)}/connection-groups`)).body.items).toEqual([]);
  });

  test("a clone with safety off takes the members of its groups, and says so", async () => {
    expect((await deploy(lone, bundle([group]))).status).toBe(201);
    await alice.put(`${ws(lone)}/connection-group-members/west/pool`, {
      config: { baseUrl: "http://west.test" },
      credential: "k2",
    });
    const asked = await alice.post(`${ws(lone)}/clones`, {
      slug: "lone-copy",
      name: "Lone copy",
      safe: false,
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    let done: Any;
    for (let i = 0; i < 200; i++) {
      done = await alice.get(`/tenants/${tenant}/workspace-clones/${asked.body.id}`);
      if (done.body.status !== "running" && done.body.status !== "queued") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(done.body.status, JSON.stringify(done.body)).toBe("succeeded");
    expect(done.body.report.connectionGroupMembers).toBe(1);
    const members = (await alice.get(`${ws(done.body.workspaceId)}/connection-groups`)).body
      .items[0].members;
    expect(members.map((one: Any) => one.key)).toEqual(["west"]);
    expect(members[0].hasCredential).toBe(true);
  });
});

describe("a production deploy or promotion checks a trigger source (CFG-14)", () => {
  test("a source's unbound connection and unset secret refuse the promotion", async () => {
    const content = bundle([
      manifest("connection", "ghost", { connector: "http" }),
      manifest("trigger_source", "src", {
        entry: "src",
        mode: "webhook",
        uses: { connections: ["ghost"], secrets: ["SRC_KEY"] },
      }),
    ]);
    const deployed = await deploy(dev, content);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const preview = (await alice.get(`${ws(dev)}/promotion-preview`)).body;
    expect(preview.possible).toBe(false);
    expect(preview.refusal.errors.map((one: Any) => one.path)).toEqual(
      expect.arrayContaining(["/connections/ghost", "/secrets/SRC_KEY"]),
    );
  });
});

describe("what uses a connection (CFG-15)", () => {
  test("the workspace's default alert and a script's use of a group are listed", async () => {
    const content = bundle([
      manifest("connection", "alerts", { connector: "http" }),
      manifest("connection_group", "pool", { connector: "http" }),
      withUses("send", { connectionGroups: ["pool"] }),
    ]);
    expect((await deploy(lone, content)).status).toBe(201);
    await alice.put(`${ws(lone)}/connection-bindings/alerts`, {
      config: { baseUrl: "http://alerts.test" },
    });
    const set = await alice.patch(ws(lone), { failureAlert: { notify: "alerts" } });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const uses = async (kind: string, name: string) =>
      (await alice.get(`${ws(lone)}/references?kind=${kind}&name=${name}`)).body.items;
    expect(await uses("connection", "alerts")).toMatchObject([
      { by: { kind: "workspace", path: "settings" }, how: expect.stringContaining("failures") },
    ]);
    expect(await uses("connection_group", "pool")).toMatchObject([
      { by: { kind: "script", path: "send" } },
    ]);
  });
});

describe("an alert names a connection that can post it (CFG-18)", () => {
  test("a missing connection and one that is not HTTP are refused", async () => {
    const missing = await alice.patch(ws(lone), { failureAlert: { notify: "nowhere" } });
    expect(missing.status, JSON.stringify(missing.body)).toBe(400);
    const mail = manifest("connection", "mail", { connector: "smtp" });
    expect((await deploy(lone, bundle([mail]))).status).toBe(201);
    const notHttp = await deploy(
      lone,
      bundle([mail, withUses("send", {}, { onFailure: { notify: "mail" } })]),
    );
    expect(notHttp.status, JSON.stringify(notHttp.body)).toBe(400);
    expect(JSON.stringify(notHttp.body)).toMatch(/HTTP/);
    const patched = await alice.patch(ws(lone), { failureAlert: { notify: "mail" } });
    expect(patched.status, JSON.stringify(patched.body)).toBe(400);
  });
});

describe("a webhook whose secret is not set (CFG-25)", () => {
  test("the refusal kept for the operator names the secret, the sender is told the same as before", async () => {
    const content = bundle([
      withUses("take", {}),
      manifest("trigger", "hook", {
        type: "webhook",
        script: "take",
        verify: { scheme: "hmac-sha256", header: "X-Sig", secret: "NOT_SET" },
      }),
    ]);
    expect((await deploy(lone, content)).status).toBe(201);
    await alice.patch(ws(lone), { triggersPaused: false });
    const url = (await alice.get(`${ws(lone)}/triggers`)).body.items.find(
      (item: Any) => item.path === "hook",
    ).url as string;
    const sent = await t.app.inject({ method: "POST", url: new URL(url).pathname, payload: {} });
    expect(sent.statusCode).toBeGreaterThanOrEqual(400);
    expect(sent.body).not.toMatch(/NOT_SET/);
    const kept = await t.db
      .selectFrom("webhook_refusal")
      .select("problem")
      .where("workspace_id", "=", lone)
      .execute();
    expect(kept.map((one) => one.problem)).toEqual([
      "The secret NOT_SET is not set in this workspace.",
    ]);
  });
});

describe("a Test and an alert speak from the pool that can reach the connection (CFG-29, D42)", () => {
  test("a Test, a test alert and the alert of a failed run go to the pool of the script", async () => {
    const content = bundle([
      manifest("connection", "chat", { connector: "http" }),
      withUses("far", { connections: ["chat"] }, { worker: "inside" }),
    ]);
    expect((await deploy(lone, content)).status).toBe(201);
    await alice.put(`${ws(lone)}/connection-bindings/chat`, {
      config: { baseUrl: "http://chat.test" },
    });
    const test = await alice.post(`${ws(lone)}/connection-tests`, { path: "chat" });
    expect(test.status, JSON.stringify(test.body)).toBe(202);
    expect(
      (
        await t.db
          .selectFrom("task")
          .select("pool")
          .where("id", "=", test.body.id)
          .executeTakeFirstOrThrow()
      ).pool,
    ).toBe("inside");
    const alertTest = await alice.post(`${ws(lone)}/alert-tests`, { connection: "chat" });
    expect(alertTest.status, JSON.stringify(alertTest.body)).toBe(202);
    const tasks = await t.db
      .selectFrom("task")
      .select(["id", "pool", "kind"])
      .where("workspace_id", "=", lone)
      .execute();
    expect(tasks.find((one) => one.id === alertTest.body.id)?.pool).toBe("inside");

    // A failed run alerts from the pool it ran on.
    await alice.patch(ws(lone), { failureAlert: { notify: "chat" } });
    const started = await alice.post(`${ws(lone)}/runs`, { script: "far", input: {} });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const run = await t.db
      .selectFrom("run")
      .selectAll()
      .where("id", "=", started.body.id)
      .executeTakeFirstOrThrow();
    await sendAlerts(t.kernel, {
      id: run.id,
      tenant_id: run.tenant_id,
      workspace_id: run.workspace_id,
      resource_id: run.resource_id,
      script_path: run.script_path,
      attempt: 1,
      trigger_type: "manual",
      error: { message: "boom" },
    });
    const delivered = await t.db
      .selectFrom("task")
      .select("pool")
      .where("subject", "=", `run:${run.id}`)
      .executeTakeFirstOrThrow();
    expect(delivered.pool).toBe("inside");
  });
});
