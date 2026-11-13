import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let url: string;
let tenant: string;
let workspace: string;
let alice: Client;
let worker: Worker;
let working: Promise<unknown>;
/** An agent that may run one script. */
let narrow: McpClient;
/** An agent that may also start flows and decide approvals. */
let wide: McpClient;

const ws = () => `/tenants/${tenant}/workspaces/${workspace}`;
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
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    ...extra,
  },
});
function bundle(): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      script("orders/greet", "greet", {
        description: "Greets someone by name.",
        input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      }),
      script("orders/purge", "purge", { description: "Removes everything." }),
      {
        kind: "flow",
        schemaVersion: 1,
        path: "orders/refund",
        ownership: "code" as const,
        body: {
          description: "Refunds an order once someone approves.",
          nodes: {
            start: { type: "trigger", trigger: { type: "manual" } },
            ok: { type: "approval", title: "Refund the order", detail: "trigger" },
            done: { type: "set", values: { refunded: "trigger.order" } },
          },
          edges: [
            { from: "start", to: "ok" },
            { from: "ok", to: "done" },
          ],
        },
      },
      {
        kind: "flow",
        schemaVersion: 1,
        path: "orders/nightly",
        ownership: "code" as const,
        body: {
          nodes: {
            at_night: { type: "trigger", trigger: { type: "schedule", cron: "0 2 * * *" } },
            done: { type: "set", values: { ran: "true" } },
          },
          edges: [{ from: "at_night", to: "done" }],
        },
      },
    ],
    code:
      'export const greet = { execute: async (input) => ({ greeting: "Hello " + input.name }) };\n' +
      "export const purge = { execute: async () => ({ purged: true }) };\n",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

async function connect(key: string): Promise<McpClient> {
  const client = new McpClient({ name: "test-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/api/v1${ws()}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    }),
  );
  return client;
}
// biome-ignore lint/suspicious/noExplicitAny: tool answers are read freely
const answer = (result: any) => JSON.parse(result.content[0].text);

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
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
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  const uploaded = await alice.post(`${ws()}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  expect((await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id })).status).toBe(
    201,
  );

  const role = async (name: string, permissions: string[]) =>
    (await alice.post(`/tenants/${tenant}/roles`, { name, description: name, permissions })).body
      .id as string;
  const account = async (name: string) => {
    const created = await alice.post(`/tenants/${tenant}/service-accounts`, { name });
    const key = await alice.post(
      `/tenants/${tenant}/service-accounts/${created.body.id}/api-keys`,
      { name: "agent" },
    );
    return { id: created.body.id as string, key: key.body.token as string };
  };
  const bind = (principalId: string, roleId: string, resourceId?: string) =>
    alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: workspace,
      ...(resourceId ? { resourceId } : {}),
      principalType: "service_account",
      principalId,
      roleId,
    });
  const see = await role("sees_workspace", ["workspace:read"]);
  const runs = await role("runs_scripts", ["run:write"]);
  const flows = await role("handles_refunds", [
    "flow_run:write",
    "approval:read",
    "approval:write",
  ]);
  const greet = (await alice.get(`${ws()}/resources/orders/greet`)).body.id as string;

  const one = await account("narrow-agent");
  await bind(one.id, see);
  await bind(one.id, runs, greet);
  const two = await account("wide-agent");
  await bind(two.id, see);
  await bind(two.id, runs, greet);
  await bind(two.id, flows);

  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "test" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
  narrow = await connect(one.key);
  wide = await connect(two.key);
  accounts = { narrow: one.id, wide: two.id };
}, 60_000);

afterAll(async () => {
  await narrow?.close();
  await wide?.close();
  worker?.stop();
  await working;
  await t.stop();
});

/** A fresh API key for a service account. */
const keyOf = async (account: string) =>
  (await alice.post(`/tenants/${tenant}/service-accounts/${account}/api-keys`, { name: "extra" }))
    .body.token as string;

/** The service accounts the two agents connect as. */
let accounts: { narrow: string; wide: string };

describe("an agent's tools", () => {
  test("are the scripts and flows its service account may start, and no others", async () => {
    const tools = (await narrow.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "run_orders__greet",
      "get_run",
      "get_flow_run",
    ]);
    const greet = tools[0];
    expect(greet?.description).toBe("Runs the script orders/greet. Greets someone by name.");
    // The script's own input schema is the tool's.
    expect(greet?.inputSchema).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });

    // With more access come more tools. A flow with no manual trigger is never one.
    expect((await wide.listTools()).tools.map((tool) => tool.name)).toEqual([
      "run_orders__greet",
      "start_orders__refund",
      "get_run",
      "get_flow_run",
      "list_approvals",
      "decide_approval",
    ]);
  });

  test("a script runs on a worker and its output comes back", async () => {
    const result = await narrow.callTool({ name: "run_orders__greet", arguments: { name: "Ada" } });
    expect(result.isError).toBeFalsy();
    const body = answer(result);
    expect(body).toMatchObject({
      script: "orders/greet",
      status: "succeeded",
      output: { greeting: "Hello Ada" },
    });
    expect(
      answer(await narrow.callTool({ name: "get_run", arguments: { runId: body.runId } })).status,
    ).toBe("succeeded");
    // The run is the service account's, started by hand through the agent surface.
    const run = (await alice.get(`${ws()}/runs/${body.runId}`)).body;
    expect(run.startedBy.type).toBe("service_account");
    expect(run.trigger).toMatchObject({ type: "manual", via: "mcp" });
  });

  test("a refusal is an answer the agent can read: bad input, a tool it has not got, a run that is not its own", async () => {
    const bad = await narrow.callTool({ name: "run_orders__greet", arguments: { name: 7 } });
    expect(bad.isError).toBe(true);
    expect(answer(bad).error).toBe("The input does not match the script's schema.");
    expect(JSON.stringify(answer(bad).problems)).toContain("/input/name");

    const hidden = await narrow.callTool({ name: "run_orders__purge", arguments: {} });
    expect(hidden.isError).toBe(true);
    expect(answer(hidden).error).toBe("There is no tool run_orders__purge, or you may not use it.");
    expect(
      answer(await narrow.callTool({ name: "decide_approval", arguments: {} })).error,
    ).toContain("no tool");

    const hers = await alice.post(`${ws()}/runs`, { script: "orders/purge", input: {} });
    const peek = await narrow.callTool({ name: "get_run", arguments: { runId: hers.body.id } });
    expect(peek.isError).toBe(true);
  });

  test("a flow is started, waits for approval, and the agent with the right to decide lets it finish", async () => {
    const started = answer(
      await wide.callTool({ name: "start_orders__refund", arguments: { order: "A-7" } }),
    );
    expect(started.flow).toBe("orders/refund");

    const waiting = answer(
      await wide.callTool({ name: "list_approvals", arguments: {} }),
    ).approvals;
    expect(waiting).toEqual([
      expect.objectContaining({
        flowRunId: started.flowRunId,
        node: "ok",
        title: "Refund the order",
        detail: { order: "A-7" },
      }),
    ]);
    const decided = await wide.callTool({
      name: "decide_approval",
      arguments: {
        flowRunId: started.flowRunId,
        node: "ok",
        decision: "approve",
        comment: "Within policy.",
      },
    });
    expect(answer(decided)).toEqual({
      decided: "approved",
      flow: "orders/refund",
      title: "Refund the order",
    });

    let run = answer(
      await wide.callTool({ name: "get_flow_run", arguments: { flowRunId: started.flowRunId } }),
    );
    for (let i = 0; i < 50 && run.status === "running"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      run = answer(
        await wide.callTool({ name: "get_flow_run", arguments: { flowRunId: started.flowRunId } }),
      );
    }
    expect(run).toMatchObject({ status: "succeeded", output: { done: { refunded: "A-7" } } });
  }, 60_000);
});

describe("what an agent would be offered, seen from the console", () => {
  const offered = (account: string, at = workspace) =>
    alice.get(`/tenants/${tenant}/service-accounts/${account}/tools?workspace=${at}`);

  test("is what the agent itself is told, worked out for the account and not for whoever asks", async () => {
    const narrowly = await offered(accounts.narrow);
    expect(narrowly.status, JSON.stringify(narrowly.body)).toBe(200);
    expect(narrowly.body.address).toBe(`http://localhost:8080/api/v1${ws()}/mcp`);
    expect(narrowly.body.reachable).toBe(true);
    // Alice may do everything here. The list is the account's all the same.
    expect(narrowly.body.tools).toEqual(
      (await narrow.listTools()).tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    );
    expect(
      (await offered(accounts.wide)).body.tools.map((tool: { name: string }) => tool.name),
    ).toEqual((await wide.listTools()).tools.map((tool) => tool.name));
  });

  test("says when the account has no place in the workspace, and is not for everyone to read", async () => {
    const stranger = await alice.post(`/tenants/${tenant}/service-accounts`, { name: "idle" });
    const none = await offered(stranger.body.id);
    expect(none.body).toMatchObject({ reachable: false, tools: [] });
    expect((await offered("00000000-0000-7000-8000-00000000dead")).status).toBe(404);
    expect((await offered(accounts.narrow, "00000000-0000-7000-8000-00000000dead")).status).toBe(
      404,
    );
    // An agent cannot ask what another account would be offered.
    const asAgent = await t
      .withKey(await keyOf(accounts.wide))
      .get(`/tenants/${tenant}/service-accounts/${accounts.narrow}/tools?workspace=${workspace}`);
    expect(asAgent.status).toBe(403);
  });
});

describe("who may connect", () => {
  test("nobody without a key, and nobody with no place in the workspace", async () => {
    const post = (headers: Record<string, string>) =>
      t.app.inject({
        method: "POST",
        url: `/api/v1${ws()}/mcp`,
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
    expect((await post({})).statusCode).toBe(401);
    expect((await post({ authorization: "Bearer vxk_not-a-key" })).statusCode).toBe(401);
    const stranger = await alice.post(`/tenants/${tenant}/service-accounts`, { name: "stranger" });
    const key = await alice.post(
      `/tenants/${tenant}/service-accounts/${stranger.body.id}/api-keys`,
      { name: "k" },
    );
    expect((await post({ authorization: `Bearer ${key.body.token}` })).statusCode).toBe(403);
  });

  test("what an agent did is in the audit log, marked as done through the agent surface", async () => {
    const entries = (await alice.get(`/tenants/${tenant}/audit?limit=200`)).body.items as {
      action: string;
      actorType: string;
      actorLabel: string | null;
      details: { via?: string };
    }[];
    const byAgents = entries.filter((entry) => entry.details.via === "mcp");
    expect(byAgents.map((entry) => entry.action).sort()).toEqual([
      "approval.approved",
      "flow_run.started",
      "run.started",
    ]);
    expect(byAgents.every((entry) => entry.actorType === "service_account")).toBe(true);
    expect(byAgents.find((entry) => entry.action === "approval.approved")?.actorLabel).toBe(
      "wide-agent",
    );
  });
});
