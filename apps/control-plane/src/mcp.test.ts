import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { Worker } from "@volvel/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { leanSchema } from "./routes/mcp.js";
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
      script("orders/keys", "keys", { description: "Gives back a key." }),
      script("orders/call-back", "callBack", {
        description: "Schedules a call to a customer.",
        input: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            at: {
              type: "string",
              format: "date-time",
              pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
            },
            idempotencyKey: { type: "string" },
          },
          required: ["at"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: { scheduled: { type: "string" } },
          required: ["scheduled"],
        },
      }),
      script("orders/break", "fail", { description: "Always fails." }),
      {
        kind: "flow",
        schemaVersion: 1,
        path: "orders/escalate",
        ownership: "code" as const,
        body: {
          description: "Escalates an order to a person.",
          nodes: {
            start: {
              type: "trigger",
              trigger: {
                type: "manual",
                input: {
                  type: "object",
                  properties: { order: { type: "string", description: "The order's number." } },
                  required: ["order"],
                },
              },
            },
            done: { type: "set", values: { escalated: "trigger.order" } },
          },
          edges: [{ from: "start", to: "done" }],
        },
      },
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
        path: "orders/write-off",
        ownership: "code" as const,
        body: {
          description: "Writes off a debt once finance approves.",
          nodes: {
            start: { type: "trigger", trigger: { type: "manual" } },
            ok: {
              type: "approval",
              title: "Write off the debt",
              detail: "trigger",
              surface: "tenant",
              approvers: { groups: ["Finance"] },
            },
            done: { type: "set", values: { written_off: "trigger.order" } },
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
      "export const purge = { execute: async () => ({ purged: true }) };\n" +
      'export const keys = { execute: async () => ({ token: "t-live-12345", ok: 1 }) };\n' +
      "export const callBack = { execute: async (input) => ({ scheduled: input.at }) };\n" +
      'export const fail = { execute: async () => { throw new Error("The phone line is down."); } };\n',
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
    expect(greet?.description).toBe(
      "Runs the script orders/greet. Greets someone by name. Waits a short while for it to end. Pass idempotencyKey to make a retry safe.",
    );
    // The script's own input schema is the tool's, with the reserved key for a safe retry.
    expect(greet?.inputSchema).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        idempotencyKey: expect.objectContaining({ type: "string" }),
      },
      required: ["name"],
    });

    // With more access come more tools. A flow with no manual trigger is never one.
    expect((await wide.listTools()).tools.map((tool) => tool.name)).toEqual([
      "start_orders__escalate",
      "run_orders__greet",
      "start_orders__refund",
      "start_orders__write_off",
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

describe("what an agent is shown of another's work", () => {
  test("is masked as it is on screen, and the agent's own run is given as it is (D13)", async () => {
    // An agent that may read runs and approvals, started nothing of its own.
    const reads = (
      await alice.post(`/tenants/${tenant}/roles`, {
        name: "reads_everything",
        description: "reads",
        permissions: ["workspace:read", "run:read", "flow_run:read", "approval:read"],
      })
    ).body.id as string;
    const account = (await alice.post(`/tenants/${tenant}/service-accounts`, { name: "reader" }))
      .body.id as string;
    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: workspace,
      principalType: "service_account",
      principalId: account,
      roleId: reads,
    });
    const reader = await connect(await keyOf(account));
    try {
      // Another's script run: the output has a key that names a secret.
      const hers = await alice.post(`${ws()}/runs`, { script: "orders/keys", input: {} });
      let got = answer(
        await reader.callTool({ name: "get_run", arguments: { runId: hers.body.id } }),
      );
      for (let i = 0; i < 50 && ["queued", "running"].includes(got.status); i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        got = answer(
          await reader.callTool({ name: "get_run", arguments: { runId: hers.body.id } }),
        );
      }
      expect(got.output).toEqual({ token: "[redacted]", ok: 1 });
      // The same run, as the API shows it.
      expect((await alice.get(`${ws()}/runs/${hers.body.id}`)).body.output).toEqual({
        token: "[redacted]",
        ok: 1,
      });

      // Another's flow run.
      const flow = await alice.post(`${ws()}/flow-runs`, {
        flow: "orders/escalate",
        input: { order: "A-1" },
      });
      for (let i = 0; i < 50; i++) {
        const state = (await alice.get(`${ws()}/flow-runs/${flow.body.id}`)).body.status;
        if (state === "succeeded") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await t.db
        .updateTable("flow_run")
        .set({ output: JSON.stringify({ password: "hunter22", ok: 1 }) })
        .where("id", "=", flow.body.id)
        .execute();
      const seen = answer(
        await reader.callTool({ name: "get_flow_run", arguments: { flowRunId: flow.body.id } }),
      );
      expect(seen.output).toEqual({ password: "[redacted]", ok: 1 });

      // A waiting approval.
      const waiting = {
        flowRunId: (
          await alice.post(`${ws()}/flow-runs`, {
            flow: "orders/refund",
            input: { order: "A-8", apiKey: "k-live-98765" },
          })
        ).body.id as string,
      };
      await new Promise((resolve) => setTimeout(resolve, 500));
      const listed = answer(await reader.callTool({ name: "list_approvals", arguments: {} }));
      const mine = listed.approvals.find(
        (one: { flowRunId: string }) => one.flowRunId === waiting.flowRunId,
      );
      expect(mine.detail).toEqual({ order: "A-8", apiKey: "[redacted]" });
    } finally {
      await reader.close();
    }
  }, 60_000);
});

describe("an approval that names its approvers", () => {
  test("is neither shown to nor decided by an agent outside them, and a person among them decides it", async () => {
    const started = answer(
      await wide.callTool({ name: "start_orders__write_off", arguments: { order: "A-9" } }),
    );
    expect(started.flow).toBe("orders/write-off");

    const listed = answer(await wide.callTool({ name: "list_approvals", arguments: {} })).approvals;
    expect(listed.map((one: { flowRunId: string }) => one.flowRunId)).not.toContain(
      started.flowRunId,
    );
    const refused = await wide.callTool({
      name: "decide_approval",
      arguments: { flowRunId: started.flowRunId, node: "ok", decision: "approve" },
    });
    expect(refused.isError).toBe(true);
    expect(answer(refused).error).toContain("may decide this approval");
    const still = (await alice.get(`${ws()}/flow-runs/${started.flowRunId}`)).body;
    expect(still.status).toBe("running");

    const finance = await alice.post(`/tenants/${tenant}/groups`, { name: "Finance" });
    const me = (await alice.get("/me")).body;
    await alice.put(`/tenants/${tenant}/groups/${finance.body.id}/members/${me.principal.id}`);
    const decided = await alice.post(`${ws()}/flow-runs/${started.flowRunId}/approvals/ok`, {
      decision: "approve",
    });
    expect(decided.status, JSON.stringify(decided.body)).toBeLessThan(300);
  }, 60_000);

  test("the group is renamed while a step waits, and its members still decide it", async () => {
    const started = answer(
      await wide.callTool({ name: "start_orders__write_off", arguments: { order: "A-10" } }),
    );
    const waiting = async () =>
      (
        (await alice.get(`/tenants/${tenant}/approvals`)).body.items as {
          flowRunId: string;
          approvers: { text: string } | null;
        }[]
      ).find((one) => one.flowRunId === started.flowRunId);
    expect((await waiting())?.approvers?.text).toBe("the Finance group");
    // Who may decide was settled, by ID, when the step began to wait.
    const kept = await t.db
      .selectFrom("step_run")
      .select("detail")
      .where("flow_run_id", "=", started.flowRunId)
      .where("node_id", "=", "ok")
      .executeTakeFirstOrThrow();
    const finance = (
      (await alice.get(`/tenants/${tenant}/groups`)).body.items as {
        id: string;
        key: string;
        name: string;
      }[]
    ).find((group) => group.name === "Finance");
    expect(finance?.key).toBe("finance");
    expect(kept.detail).toMatchObject({
      approvers: { groups: ["Finance"] },
      approverIds: { groups: [finance?.id], roles: [] },
    });

    const renamed = await alice.patch(`/tenants/${tenant}/groups/${finance?.id}`, {
      name: "Finance and Treasury",
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    // While the step waits for it, the group cannot be deleted: nobody could decide the step.
    const kept2 = await alice.delete(`/tenants/${tenant}/groups/${finance?.id}`);
    expect(kept2.status).toBe(409);
    expect(kept2.body.code).toBe("principal_in_use");
    expect(kept2.body.detail).toContain("orders/write-off");
    // The step says who may decide it by what the group is called now.
    expect((await waiting())?.approvers?.text).toBe("the Finance and Treasury group");
    const decided = await alice.post(`${ws()}/flow-runs/${started.flowRunId}/approvals/ok`, {
      decision: "approve",
    });
    expect(decided.status, JSON.stringify(decided.body)).toBeLessThan(300);
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
      (await narrow.listTools()).tools.map(({ name, description, inputSchema, outputSchema }) => ({
        name,
        description,
        inputSchema,
        ...(outputSchema ? { outputSchema } : {}),
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
    // The refused decision left nothing: only what was done is recorded.
    expect(byAgents.map((entry) => entry.action).sort()).toEqual([
      "approval.approved",
      "flow_run.started",
      "flow_run.started",
      // The write-off started to see a group renamed while its approval waits.
      "flow_run.started",
      "run.started",
    ]);
    expect(byAgents.every((entry) => entry.actorType === "service_account")).toBe(true);
    expect(byAgents.find((entry) => entry.action === "approval.approved")?.actorLabel).toBe(
      "wide-agent",
    );
  });
});

describe("what an agent is told, and what it can rely on", () => {
  let careful: McpClient;

  beforeAll(async () => {
    const created = await alice.post(`/tenants/${tenant}/service-accounts`, {
      name: "careful-agent",
    });
    const key = await alice.post(
      `/tenants/${tenant}/service-accounts/${created.body.id}/api-keys`,
      { name: "agent" },
    );
    const roleId = async (name: string, permissions: string[]) =>
      (await alice.post(`/tenants/${tenant}/roles`, { name, description: name, permissions })).body
        .id as string;
    const see = await roleId("careful_sees", ["workspace:read"]);
    const runs = await roleId("careful_runs", ["run:write", "run:read"]);
    const flows = await roleId("careful_flows", ["flow_run:write", "flow_run:read"]);
    const bind = (roleIdValue: string, path?: string) =>
      (async () => {
        const resourceId = path
          ? ((await alice.get(`${ws()}/resources/${path}`)).body.id as string)
          : undefined;
        await alice.post(`/tenants/${tenant}/bindings`, {
          workspaceId: workspace,
          ...(resourceId ? { resourceId } : {}),
          principalType: "service_account",
          principalId: created.body.id,
          roleId: roleIdValue,
        });
      })();
    await bind(see);
    await bind(runs, "orders/call-back");
    await bind(runs, "orders/break");
    await bind(flows, "orders/escalate");
    careful = await connect(key.body.token);
  });

  test("tools carry lean input schemas, a safe-retry key, and the shape of their answers", async () => {
    const { tools } = await careful.listTools();
    const call = tools.find((tool) => tool.name === "run_orders__call_back");
    const text = JSON.stringify(call?.inputSchema);
    expect(text).not.toContain("$schema");
    expect(text).not.toContain("pattern");
    expect(call?.inputSchema.properties).toMatchObject({
      at: { type: "string", format: "date-time" },
      // The script's own input has an idempotencyKey, so the reserved argument steps aside.
      _idempotencyKey: { type: "string" },
    });
    expect(call?.description).toContain("_idempotencyKey");
    expect(call?.outputSchema).toMatchObject({
      type: "object",
      required: ["runId", "script", "status"],
    });

    const escalate = tools.find((tool) => tool.name === "start_orders__escalate");
    expect(escalate?.inputSchema).toMatchObject({
      type: "object",
      properties: { order: { type: "string" }, idempotencyKey: { type: "string" } },
      required: ["order"],
    });
    expect(escalate?.outputSchema).toMatchObject({ required: ["flowRunId", "flow", "status"] });
  });

  test("an answer comes as structured content too, and a failed run is an error result", async () => {
    const done = await careful.callTool({
      name: "run_orders__call_back",
      arguments: { at: "2026-11-17T10:00:00Z" },
    });
    expect(done.isError).toBeFalsy();
    expect(done.structuredContent).toMatchObject({
      status: "succeeded",
      output: { scheduled: "2026-11-17T10:00:00Z" },
    });

    const broken = await careful.callTool({ name: "run_orders__break", arguments: {} });
    expect(broken.isError).toBe(true);
    expect(answer(broken)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("The phone line is down."),
    });
  }, 60_000);

  test("input in the wrong format is explained in words, not with the format's pattern", async () => {
    const bad = await careful.callTool({
      name: "run_orders__call_back",
      arguments: { at: "next tuesday at ten" },
    });
    expect(bad.isError).toBe(true);
    expect(answer(bad).problems).toEqual([
      {
        path: "/input/at",
        message: "must be a date and time in ISO 8601, such as 2026-11-17T10:00:00Z",
      },
    ]);
    // The API says the same to anyone else who starts the script.
    const direct = await alice.post(`${ws()}/runs`, {
      script: "orders/call-back",
      input: { at: "tomorrow" },
    });
    expect(direct.status).toBe(400);
    expect(JSON.stringify(direct.body)).toContain("must be a date and time in ISO 8601");
  });

  test("a call repeated with the same key answers with the first run, and starts nothing", async () => {
    const twice = async () =>
      answer(
        await careful.callTool({
          name: "run_orders__call_back",
          arguments: { at: "2026-11-18T09:00:00Z", _idempotencyKey: "ticket-41" },
        }),
      );
    const first = await twice();
    const second = await twice();
    expect(second.runId).toBe(first.runId);
    // The key's own name in the script's input is the script's, and reaches it untouched.
    const own = await careful.callTool({
      name: "run_orders__call_back",
      arguments: { at: "2026-11-18T09:00:00Z", idempotencyKey: "the script's own" },
    });
    expect(answer(own).runId).not.toBe(first.runId);

    const flowOnce = async () =>
      answer(
        await careful.callTool({
          name: "start_orders__escalate",
          arguments: { order: "A-12", idempotencyKey: "call-7" },
        }),
      );
    const flowFirst = await flowOnce();
    expect(flowFirst).toMatchObject({
      status: "succeeded",
      output: { done: { escalated: "A-12" } },
    });
    expect((await flowOnce()).flowRunId).toBe(flowFirst.flowRunId);
  }, 60_000);
});

describe("a tool's schema, as an agent is given it", () => {
  test("keeps what constrains the input and drops what only restates it", () => {
    expect(
      leanSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          when: { type: "string", format: "date-time", pattern: "^\\d{4}-…$" },
          code: { type: "string", pattern: "^[A-Z]{3}$" },
          count: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 },
          quantity: { type: "integer", minimum: 1, maximum: 9007199254740991 },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        when: { type: "string", format: "date-time" },
        code: { type: "string", pattern: "^[A-Z]{3}$" },
        count: { type: "integer" },
        quantity: { type: "integer", minimum: 1 },
      },
    });
  });
});

describe("a script offered to an agent", () => {
  let offered: { id: string; key: string };
  let agent: McpClient;

  beforeAll(async () => {
    const roles = Object.fromEntries(
      (
        await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
      ).map((role) => [role.name, role.id]),
    );
    const created = await alice.post(`/tenants/${tenant}/service-accounts`, { name: "offered" });
    const key = await alice.post(
      `/tenants/${tenant}/service-accounts/${created.body.id}/api-keys`,
      {
        name: "agent",
      },
    );
    offered = { id: created.body.id, key: key.body.token };
    const greet = (await alice.get(`${ws()}/resources/orders/greet`)).body.id as string;
    // What "Offer to an agent" makes: the runner role at the script, and nothing in the workspace.
    const bound = await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: workspace,
      resourceId: greet,
      principalType: "service_account",
      principalId: offered.id,
      roleId: roles.agent_runner,
    });
    expect(bound.status, JSON.stringify(bound.body)).toBe(201);
    agent = await connect(offered.key);
  });
  afterAll(async () => {
    await agent?.close();
  });

  test("reaches the workspace's tools for that script alone, without reading the workspace", async () => {
    expect((await agent.listTools()).tools.map((tool) => tool.name)).toEqual([
      "run_orders__greet",
      "get_run",
      "get_flow_run",
    ]);
    const listed = await alice.get(
      `/tenants/${tenant}/service-accounts/${offered.id}/tools?workspace=${workspace}`,
    );
    expect(listed.body).toMatchObject({ reachable: true });
    expect(listed.body.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "run_orders__greet",
      "get_run",
      "get_flow_run",
    ]);
    const result = answer(
      await agent.callTool({ name: "run_orders__greet", arguments: { name: "Bo" } }),
    );
    expect(result).toMatchObject({ status: "succeeded", output: { greeting: "Hello Bo" } });
    // It reads the run it started, and nothing else of the workspace.
    expect(
      answer(await agent.callTool({ name: "get_run", arguments: { runId: result.runId } })).status,
    ).toBe("succeeded");
    const asAgent = t.withKey(offered.key);
    expect((await asAgent.get(`${ws()}/runs`)).status).toBe(403);
    expect((await asAgent.get(`${ws()}/resources`)).status).toBe(403);
  });

  test("is tried from the console as the account, and the member who asked is on record", async () => {
    const tried = await alice.post(`/tenants/${tenant}/service-accounts/${offered.id}/tool-calls`, {
      workspace,
      tool: "run_orders__greet",
      arguments: { name: "Cy" },
    });
    expect(tried.status, JSON.stringify(tried.body)).toBe(200);
    expect(tried.body).toMatchObject({
      tool: "run_orders__greet",
      isError: false,
      result: { status: "succeeded", output: { greeting: "Hello Cy" } },
    });
    const run = (await alice.get(`${ws()}/runs/${tried.body.result.runId}`)).body;
    expect(run.startedBy).toEqual({ type: "service_account", id: offered.id });

    const entries = (await alice.get(`/tenants/${tenant}/audit?limit=50`)).body.items as {
      action: string;
      actorType: string;
      targetId: string;
      details: Record<string, unknown>;
    }[];
    expect(entries.find((entry) => entry.action === "service_account.tool_tried")).toMatchObject({
      actorType: "member",
      targetId: offered.id,
      details: { tool: "run_orders__greet" },
    });
    expect(entries.find((entry) => entry.targetId === tried.body.result.runId)).toMatchObject({
      action: "run.started",
      actorType: "member",
      details: { asServiceAccount: offered.id, via: "console" },
    });
  });

  test("is refused what the account may not do, whoever asks, and only an admin may ask", async () => {
    const call = (tool: string, args: Record<string, unknown> = {}) =>
      alice.post(`/tenants/${tenant}/service-accounts/${offered.id}/tool-calls`, {
        workspace,
        tool,
        arguments: args,
      });
    // Alice may start the flow. The account may not, so it has no such tool.
    const flow = await call("start_orders__refund");
    expect(flow.body).toMatchObject({ isError: true });
    expect(flow.body.result.error).toContain("There is no tool start_orders__refund");
    // Bad input is the tool's answer, as an agent would get it.
    const bad = await call("run_orders__greet", { name: 7 });
    expect(bad.body.isError).toBe(true);
    // An agent cannot try another account's tools.
    const asAgent = await t
      .withKey(await keyOf(accounts.wide))
      .post(`/tenants/${tenant}/service-accounts/${offered.id}/tool-calls`, {
        workspace,
        tool: "run_orders__greet",
        arguments: { name: "x" },
      });
    expect(asAgent.status).toBe(403);
  });
});
