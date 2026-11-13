import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let prod: string;
let dev: string;
let alice: Client;
let worker: Worker;
let working: Promise<unknown>;

/** A mail server that takes whatever it is sent and remembers it. */
let mail: TcpServer;
let mailPort: number;
const delivered: { from: string; to: string[]; data: string; auth: string | undefined }[] = [];

const ws = (id = prod) => `/tenants/${tenant}/workspaces/${id}`;
const resource = (kind: string, path: string, body: object): BundleManifest =>
  ({ kind, schemaVersion: 1, path, ownership: "code", body }) as BundleManifest;
const script = (path: string, entry: string, uses: Record<string, unknown>) =>
  resource("script", path, {
    entry,
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], ...uses },
  });
const greeterSchema = {
  type: "object",
  properties: { greeting: { type: "string", minLength: 1 }, loud: { type: "boolean" } },
  required: ["greeting"],
  additionalProperties: false,
};

function bundle(change: (manifests: BundleManifest[]) => BundleManifest[] = (m) => m): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.4.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: change([
      resource("connector", "connectors/greeter", {
        entry: "greeter",
        description: "Greets people, the way one outside system wants it.",
        configSchema: greeterSchema,
      }),
      resource("connection", "hello", { connector: "connectors/greeter" }),
      resource("connection", "post", { connector: "smtp" }),
      script("greet", "greet", { connections: ["hello"] }),
      script("send", "send", { connections: ["post"] }),
    ]),
    code: `
export const greeter = { create: (config, credential, signal) => ({
  greet: (name) => {
    const text = config.greeting + ", " + name;
    return { text: config.loud ? text.toUpperCase() : text, key: credential, cancellable: typeof signal.aborted };
  },
}) };
export const greet = { execute: async (input, ctx) => (await ctx.connection("hello")).greet(input.name) };
export const send = { execute: async (input, ctx) => (await ctx.connection("post")).send(input) };
`,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

async function deploy(content: Bundle, workspace = prod) {
  const uploaded = await alice.post(`${ws(workspace)}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return alice.post(`${ws(workspace)}/deployments`, { bundleId: uploaded.body.id });
}
async function run(scriptPath: string, input: unknown, workspace = prod): Promise<Any> {
  const started = await alice.post(`${ws(workspace)}/runs`, { script: scriptPath, input });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  for (let i = 0; i < 150; i++) {
    const body = (await alice.get(`${ws(workspace)}/runs/${started.body.id}`)).body;
    if (!["queued", "running"].includes(body.status)) return body;
    await sleep(100);
  }
  throw new Error("The run did not finish.");
}

beforeAll(async () => {
  mail = createTcpServer((socket) => {
    let from = "";
    let to: string[] = [];
    let auth: string | undefined;
    let data: string | undefined;
    let buffer = "";
    socket.write("220 mail.test ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (data !== undefined) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          delivered.push({ from, to, data, auth });
          data = undefined;
          to = [];
          socket.write("250 queued\r\n");
          continue;
        }
        const line = buffer.indexOf("\r\n");
        if (line < 0) return;
        const command = buffer.slice(0, line);
        buffer = buffer.slice(line + 2);
        const verb = command.split(" ")[0]?.toUpperCase();
        if (verb === "EHLO") socket.write("250-mail.test\r\n250 AUTH PLAIN\r\n");
        else if (verb === "AUTH") {
          auth = Buffer.from(command.split(" ")[2] ?? "", "base64").toString("utf8");
          socket.write("235 welcome\r\n");
        } else if (verb === "MAIL") {
          from = /<(.*)>/.exec(command)?.[1] ?? "";
          socket.write("250 ok\r\n");
        } else if (verb === "RCPT") {
          to.push(/<(.*)>/.exec(command)?.[1] ?? "");
          socket.write("250 ok\r\n");
        } else if (verb === "DATA") {
          data = "";
          socket.write("354 go on\r\n");
        } else if (verb === "QUIT") {
          socket.end("221 bye\r\n");
        } else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => mail.listen(0, "127.0.0.1", resolve));
  mailPort = (mail.address() as AddressInfo).port;

  t = await startTestApp({ version: "0.4.0" });
  const url = await t.app.listen({ host: "127.0.0.1", port: 0 });
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
  const created = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: created.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  const make = async (slug: string, type: string) =>
    (await alice.post(`/tenants/${tenant}/workspaces`, { slug, name: slug, type })).body.id;
  prod = await make("main", "production");
  dev = await make("dev", "dev");
  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "test" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await new Promise((resolve) => mail.close(resolve));
  await t.stop();
});

describe("a connector of the tenant's own", () => {
  test("a connection must name a connector that exists, and a connector a schema that is one", async () => {
    const unknown = await alice.post(
      `${ws()}/bundles`,
      bundle((manifests) => [
        ...manifests,
        resource("connection", "other", { connector: "connectors/nope" }),
      ]),
    );
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body.errors)).toContain(
      'connector refers to \\"connectors/nope\\", which is not a connector in this repository',
    );
    const taken = await alice.post(
      `${ws()}/bundles`,
      bundle((manifests) => [
        ...manifests,
        resource("connector", "smtp", { entry: "greeter", configSchema: { type: "object" } }),
      ]),
    );
    expect(JSON.stringify(taken.body.errors)).toContain(
      "is the name of a connector every worker has",
    );
    const broken = await alice.post(
      `${ws()}/bundles`,
      bundle((manifests) => [
        ...manifests,
        resource("connector", "connectors/bad", {
          entry: "greeter",
          configSchema: { type: "nonsense" },
        }),
      ]),
    );
    expect(broken.status).toBe(400);
    expect(JSON.stringify(broken.body.errors)).toContain("/body/configSchema is not a JSON Schema");
  });

  test("a connection is checked against its connector's own schema when it is bound", async () => {
    const refused = await deploy(bundle());
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("bindings_missing");

    const bind = (path: string, config: object, credential?: string) =>
      alice.put(`${ws()}/connection-bindings/${path}`, {
        config,
        ...(credential ? { credential } : {}),
      });
    // The bundle is uploaded and not deployed. What it declares is already what a binding
    // is checked against: the built-in HTTP shape is not what this connector takes.
    const asHttp = await bind("hello", { baseUrl: "https://example.com" });
    expect(asHttp.status).toBe(400);
    expect(JSON.stringify(asHttp.body.errors)).toContain("greeting");
    expect((await bind("hello", { greeting: "" })).status).toBe(400);
    // A mail server needs a host and an address to send from.
    const noFrom = await bind("post", { host: "127.0.0.1" });
    expect(noFrom.status).toBe(400);
    expect(JSON.stringify(noFrom.body.errors)).toContain("from");
    // A connection nothing declares is taken to be HTTP.
    expect((await bind("undeclared", { greeting: "x" })).status).toBe(400);

    expect((await bind("hello", { greeting: "Good day", loud: true }, "s3cret-key")).status).toBe(
      204,
    );
    expect(
      (
        await bind(
          "post",
          {
            host: "127.0.0.1",
            port: mailPort,
            security: "none",
            from: "Acme <orders@acme.example>",
            username: "acme",
          },
          "mail-pass-7",
        )
      ).status,
    ).toBe(204);
    const deployed = await deploy(bundle());
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    // A connector that changes what it takes is caught by the deploy that brings the change:
    // what is bound no longer fits, and nothing is activated.
    const stricter = await deploy(
      bundle((manifests) =>
        manifests.map((manifest) =>
          manifest.kind === "connector"
            ? resource("connector", manifest.path, {
                entry: "greeter",
                configSchema: { ...greeterSchema, required: ["greeting", "language"] },
              })
            : manifest,
        ),
      ),
    );
    expect(stricter.status).toBe(409);
    expect(stricter.body.code).toBe("bindings_invalid");
    expect(stricter.body.errors[0].path).toBe("/connections/hello");
    expect(stricter.body.errors[0].message).toContain(
      'does not fit the "connectors/greeter" connector',
    );

    // What was bound is in the audit log by where it points, never by its credential.
    const entries = await t.db
      .selectFrom("audit_entry")
      .select(["target_id", "details"])
      .where("action", "in", ["connection.bound", "connection.rebound"])
      .execute();
    expect(JSON.stringify(entries)).not.toContain("s3cret-key");
    expect(JSON.stringify(entries)).not.toContain("mail-pass-7");
    expect(entries.find((entry) => entry.target_id === "post")?.details).toMatchObject({
      host: "127.0.0.1",
    });
    const listed = (await alice.get(`${ws()}/connection-bindings`)).body.items;
    expect(listed.map((item: Any) => [item.path, item.connector]).sort()).toEqual([
      ["hello", "connectors/greeter"],
      ["post", "smtp"],
    ]);
  });

  test("a script is given the client the connector builds, from the bundle the run is pinned to", async () => {
    const done = await run("greet", { name: "Ada" });
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output).toEqual({
      text: "GOOD DAY, ADA",
      key: "s3cret-key",
      cancellable: "boolean",
    });
  });

  test("mail goes out through the tenant's own server, with the tenant's own credential", async () => {
    const done = await run("send", {
      to: ["pat@customer.example", "sam@customer.example"],
      subject: "Your order has shipped",
      text: "It left the warehouse this morning.",
    });
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output.messageId).toMatch(/@/);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      from: "orders@acme.example",
      to: ["pat@customer.example", "sam@customer.example"],
      auth: "\u0000acme\u0000mail-pass-7",
    });
    expect(delivered[0]?.data).toContain("Subject: Your order has shipped");
    expect(delivered[0]?.data).toContain("It left the warehouse this morning.");
    // A message with nothing in it is the script's mistake, and the run says so.
    const empty = await run("send", { to: "pat@customer.example", subject: "Nothing" });
    expect(empty.status).toBe("failed");
    expect(empty.error.message).toContain("A message needs text or html.");
    // A server that cannot be reached fails the run, and nothing is sent anywhere else.
    await alice.put(`${ws()}/connection-bindings/post`, {
      config: { host: "127.0.0.1", port: 9, security: "none", from: "orders@acme.example" },
    });
    const unreachable = await run("send", { to: "pat@customer.example", subject: "x", text: "y" });
    expect(unreachable.status).toBe("failed");
    expect(delivered).toHaveLength(1);
  });

  test("a connector written in the console is compiled, deployed and used like one from the repository", async () => {
    const draft = (path: string, kind: string, body: object) =>
      alice.put(`${ws(dev)}/drafts/${path}`, { kind, schemaVersion: 1, body });
    const connector = await draft("connectors/shout", "connector", {
      description: "Says things loudly.",
      configSchema: {
        type: "object",
        properties: { suffix: { type: "string" } },
        required: ["suffix"],
        additionalProperties: false,
      },
      source: {
        language: "typescript",
        code: "export default (config: { suffix: string }, credential: string | undefined) => ({\n  shout: (text: string) => text.toUpperCase() + config.suffix + (credential ? '' : ' (no key)'),\n});\n",
      },
    });
    expect(connector.status, JSON.stringify(connector.body)).toBe(200);
    // A connector with no source is not one.
    expect(
      (await draft("connectors/empty", "connector", { configSchema: { type: "object" } })).status,
    ).toBe(400);
    expect((await draft("megaphone", "connection", { connector: "connectors/shout" })).status).toBe(
      200,
    );
    const caller = await draft("say", "script", {
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: ["megaphone"], secrets: [], variables: [] },
      source: {
        language: "typescript",
        code: 'import type { ScriptContext } from "@vynxlabs/sdk";\nexport default async (input: { text: string }, ctx: ScriptContext) => ({\n  said: (await ctx.connection<{ shout(text: string): string }>("megaphone")).shout(input.text),\n});\n',
      },
    });
    expect(caller.status, JSON.stringify(caller.body)).toBe(200);
    // The connector is only a draft, and a binding is already checked against it.
    expect(
      (await alice.put(`${ws(dev)}/connection-bindings/megaphone`, { config: { volume: 11 } }))
        .status,
    ).toBe(400);
    expect(
      (await alice.put(`${ws(dev)}/connection-bindings/megaphone`, { config: { suffix: "!" } }))
        .status,
    ).toBe(204);
    const first = await alice.post(`${ws(dev)}/changes/deploy`, {
      paths: ["connectors/shout", "megaphone"],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(
      (await alice.put(`${ws(dev)}/connection-bindings/megaphone`, { config: { volume: 11 } }))
        .status,
    ).toBe(400);
    const second = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["say"] });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const done = await run("say", { text: "hello" }, dev);
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output).toEqual({ said: "HELLO! (no key)" });
  });
});

describe("a trigger source", () => {
  const sign = (body: string, secret: string, at = Math.floor(Date.now() / 1000)) =>
    `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
  let hook: string;

  /** The runs of one script, oldest first, once there are `count` of them and none is still going. */
  async function runsOf(path: string, count: number, workspace = prod): Promise<Any[]> {
    let items: Any[] = [];
    for (let i = 0; i < 100; i++) {
      items = ((await alice.get(`${ws(workspace)}/runs?limit=100`)).body.items as Any[])
        .filter((item) => item.script === path)
        .reverse();
      const settled = items.every((item) => !["queued", "running"].includes(item.status));
      if (items.length >= count && settled) return items;
      await sleep(100);
    }
    throw new Error(`Expected ${count} finished runs of ${path}, and found ${items.length}.`);
  }

  function sourced(): Bundle {
    const unsigned = {
      formatVersion: 1 as const,
      sdkVersion: "0.4.0",
      core: { min: "0.0.0", below: "99.0.0" },
      manifests: [
        // A sender that signs "<timestamp>.<body>" and sends both in one header, as Stripe does.
        resource("trigger_source", "sources/payments", {
          entry: "payments",
          mode: "webhook",
          uses: { secrets: ["PAYMENTS_SIGNING"] },
        }),
        resource("trigger_source", "sources/inbox", { entry: "inbox", mode: "poll" }),
        script("on-payment", "onPayment", {}),
        script("on-letter", "onLetter", {}),
        resource("trigger", "hooks/payments", {
          type: "webhook",
          script: "on-payment",
          source: "sources/payments",
        }),
        resource("schedule", "every-minute", {
          script: "on-letter",
          cron: "* * * * *",
          source: "sources/inbox",
        }),
      ],
      code: `
import { createHmac, timingSafeEqual } from "node:crypto";
export const payments = { execute: async (request, ctx) => {
  const header = request.headers["payments-signature"] ?? "";
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const expected = createHmac("sha256", await ctx.secret("PAYMENTS_SIGNING"))
    .update(parts.t + "." + request.rawBody).digest("hex");
  const given = Buffer.from(parts.v1 ?? "", "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, Buffer.from(expected))) {
    return { accept: false, reason: "The signature does not match." };
  }
  // One request carries several events. Each starts a run of its own.
  return { inputs: request.body.events.map((event) => ({ id: event.id, amount: event.amount })) };
} };
export const inbox = { execute: async (tick) => {
  const from = tick.cursor ?? 0;
  const letters = [from + 1, from + 2].map((number) => ({ letter: number }));
  return { items: letters, cursor: from + 2 };
} };
export const onPayment = { execute: async (input, ctx) => ({ got: input, by: ctx.run.trigger }) };
export const onLetter = { execute: async (input) => ({ read: input.letter }) };
`,
    };
    return { ...unsigned, digest: bundleDigest(unsigned) };
  }

  test("a trigger names a source of the kind that fits it", async () => {
    const mismatched = sourced();
    const wrong = {
      ...mismatched,
      manifests: mismatched.manifests.map((manifest) =>
        manifest.path === "every-minute"
          ? resource("schedule", "every-minute", {
              script: "on-letter",
              cron: "* * * * *",
              source: "sources/payments",
            })
          : manifest,
      ),
    };
    const refused = await alice.post(`${ws()}/bundles`, {
      ...wrong,
      digest: bundleDigest({ ...wrong, digest: undefined } as never),
    });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body.errors)).toContain(
      "which is a source for a webhook, not for a schedule",
    );
  });

  test("a webhook's request goes to its source, which decides what starts", async () => {
    await alice.put(`${ws()}/secrets/PAYMENTS_SIGNING`, { value: "whsec_test_1" });
    // The connections of the earlier bundle are no longer declared, and what was bound to them stays.
    const deployed = await deploy(sourced());
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const listed = (await alice.get(`${ws()}/triggers`)).body.items.find(
      (item: Any) => item.path === "hooks/payments",
    );
    hook = new URL(listed.url).pathname.replace("/api/v1", "");
    const body = JSON.stringify({
      events: [
        { id: "evt_1", amount: 500 },
        { id: "evt_2", amount: 70 },
      ],
    });
    const send = (signature: string) =>
      t.anonymous.upload(hook, body, "application/json", { "payments-signature": signature });

    const accepted = await send(sign(body, "whsec_test_1"));
    expect(accepted.status).toBe(202);
    const started = await runsOf("on-payment", 2);
    expect(started.map((item) => item.status)).toEqual(["succeeded", "succeeded"]);
    const first = (await alice.get(`${ws()}/runs/${started[0].id}`)).body;
    expect(first.output.got).toEqual({ id: "evt_1", amount: 500 });
    // The run knows the webhook that started it, and the source it came through.
    expect(first.output.by).toMatchObject({
      type: "webhook",
      trigger: "hooks/payments",
      source: "sources/payments",
    });

    // A request signed with another secret runs the source and starts nothing.
    expect((await send(sign(body, "not-the-secret"))).status).toBe(202);
    const sourceRuns = await runsOf("sources/payments", 2);
    expect(sourceRuns).toHaveLength(2);
    expect((await alice.get(`${ws()}/runs/${sourceRuns[1].id}`)).body.output).toEqual({
      accept: false,
      reason: "The signature does not match.",
    });
    expect(await runsOf("on-payment", 2)).toHaveLength(2);
    // The secret reached the source and no one else: it is in no run's input or output.
    const everything = JSON.stringify(
      await Promise.all(
        [...sourceRuns, ...started].map(
          async (item) => (await alice.get(`${ws()}/runs/${item.id}`)).body,
        ),
      ),
    );
    expect(everything).not.toContain("whsec_test_1");
  });

  test("nobody starts a trigger source by hand", async () => {
    const byHand = await alice.post(`${ws()}/runs`, { script: "sources/payments", input: {} });
    expect(byHand.status).toBe(404);
  });

  test("a schedule's tick runs its source, which finds what is new and keeps its place", async () => {
    const { fireDueSchedules } = await import("./kernel/execution/triggers.js");
    const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
    expect(await fireDueSchedules(t.kernel, later(2))).toBe(1);
    expect(await runsOf("on-letter", 2)).toHaveLength(2);
    // The next tick picks up where the last left off.
    expect(await fireDueSchedules(t.kernel, later(4))).toBe(1);
    const read = await Promise.all(
      (await runsOf("on-letter", 4)).map(
        async (item) => (await alice.get(`${ws()}/runs/${item.id}`)).body.output.read,
      ),
    );
    expect(read.sort()).toEqual([1, 2, 3, 4]);
    const state = await t.db
      .selectFrom("trigger_state")
      .select("cursor")
      .where("type", "=", "schedule")
      .executeTakeFirstOrThrow();
    expect(state.cursor).toBe(4);
  });
});

describe("the core nodes, and nodes of a tenant's own", () => {
  const draft = (path: string, kind: string, body: object) =>
    alice.put(`${ws(dev)}/drafts/${path}`, { kind, schemaVersion: 1, body });
  const manual = { type: "trigger", trigger: { type: "manual" } };
  const core = (name: string, inputs: Record<string, string>, grants?: object) => ({
    type: "script",
    script: `core/${name}`,
    inputs,
    ...(grants ? { with: grants } : {}),
  });
  async function flowRun(flow: string, input: unknown): Promise<Any> {
    const started = await alice.post(`${ws(dev)}/flow-runs`, { flow, input });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    for (let i = 0; i < 200; i++) {
      const body = (await alice.get(`${ws(dev)}/flow-runs/${started.body.id}`)).body;
      if (body.status !== "running") return body;
      await sleep(100);
    }
    throw new Error("The flow did not finish.");
  }
  const step = (run: Any, node: string) => run.steps.find((s: Any) => s.node === node);

  test("the platform says which nodes it comes with, and keeps their paths to itself", async () => {
    const listed = await alice.get("/core-nodes");
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: Any) => item.path)).toEqual([
      "core/http-request",
      "core/send-email",
      "core/table-read",
      "core/table-write",
      "core/publish-event",
    ]);
    const send = listed.body.items[1];
    expect(send).toMatchObject({ label: "Send email", category: "Core", takes: ["connection"] });
    expect(send.input.properties.connection["x-pick"]).toBe("connection");
    // Nothing of a tenant's may sit where the platform's nodes do.
    const taken = await draft("core/mine", "variable", { type: "string" });
    expect(taken.status).toBe(400);
    expect(JSON.stringify(taken.body)).toContain("kept for the platform's own nodes");
    const uploaded = await alice.post(
      `${ws()}/bundles`,
      bundle((m) => [...m, script("core/http-request", "greet", {})]),
    );
    expect(uploaded.status).toBe(400);
    expect(JSON.stringify(uploaded.body)).toContain("kept for the platform's own nodes");
  });

  test("a flow drawn from core nodes reads and writes a table, calls out, sends mail and publishes", async () => {
    delivered.length = 0;
    for (const [path, kind, body] of [
      ["notes", "table", { columns: { title: { type: "text", required: true } } }],
      ["outbox", "connection", { connector: "smtp" }],
      ["self", "connection", { connector: "http" }],
      [
        "notes/added",
        "event",
        { payload: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
      ],
      [
        "note",
        "flow",
        {
          nodes: {
            start: manual,
            add: core(
              "table-write",
              { table: "'notes'", values: "{'title': trigger.title}" },
              { tables: ["notes"] },
            ),
            read: core(
              "table-read",
              {
                table: "'notes'",
                filter: "{'column': 'title', 'op': 'eq', 'value': trigger.title}",
              },
              { tables: ["notes"] },
            ),
            ping: core(
              "http-request",
              { connection: "'self'", url: "'/api/v1/healthz'" },
              { connections: ["self"] },
            ),
            mail: core(
              "send-email",
              {
                connection: "'outbox'",
                to: "trigger.to",
                subject: "'Note: ' + steps.read.output.row.title",
                text: "'The service answered ' + string(steps.ping.output.status) + '.'",
              },
              { connections: ["outbox"] },
            ),
            tell: core(
              "publish-event",
              { event: "'notes/added'", payload: "{'id': steps.add.output.row.id}" },
              { events: ["notes/added"] },
            ),
          },
          edges: [
            { from: "start", to: "add" },
            { from: "add", to: "read" },
            { from: "read", to: "ping" },
            { from: "ping", to: "mail" },
            { from: "mail", to: "tell" },
          ],
        },
      ],
    ] as const) {
      const saved = await draft(path, kind, body);
      expect(saved.status, `${path}: ${JSON.stringify(saved.body)}`).toBe(200);
    }
    const address = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
    expect(
      (await alice.put(`${ws(dev)}/connection-bindings/self`, { config: { baseUrl: address } }))
        .status,
    ).toBe(204);
    expect(
      (
        await alice.put(`${ws(dev)}/connection-bindings/outbox`, {
          config: {
            host: "127.0.0.1",
            port: mailPort,
            security: "none",
            from: "notes@acme.example",
          },
        })
      ).status,
    ).toBe(204);
    const deployed = await alice.post(`${ws(dev)}/changes/deploy`, {});
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);

    // The bundle carries the nodes the flow uses, and no others.
    const scripts = (await alice.get(`${ws(dev)}/resources?kind=script&limit=200`)).body.items
      .map((item: Any) => item.path)
      .filter((path: string) => path.startsWith("core/"));
    expect(scripts.sort()).toEqual([
      "core/http-request",
      "core/publish-event",
      "core/send-email",
      "core/table-read",
      "core/table-write",
    ]);

    const done = await flowRun("note", { title: "Call the bank", to: "pat@customer.example" });
    expect(done.status, JSON.stringify(done.steps)).toBe("succeeded");
    expect(step(done, "add").output.row.title).toBe("Call the bank");
    expect(step(done, "read").output).toMatchObject({ count: 1, row: { title: "Call the bank" } });
    expect(step(done, "ping").output).toMatchObject({ status: 200, body: { status: "ok" } });
    expect(step(done, "tell").output).toEqual({ published: true });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      from: "notes@acme.example",
      to: ["pat@customer.example"],
    });
    expect(delivered[0]?.data).toContain("Subject: Note: Call the bank");
    expect(delivered[0]?.data).toContain("The service answered 200.");
    const events = await alice.get(`${ws(dev)}/events?event=notes/added`);
    expect(events.body.items).toHaveLength(1);
  });

  test("a node reaches what its step hands it, and nothing else", async () => {
    // Started by hand, a core node was handed nothing.
    const byHand = await run("core/table-read", { table: "notes" }, dev);
    expect(byHand.status).toBe("failed");
    expect(byHand.error.message).toContain("notes");
    // A step that names a table in its input and does not hand it over gets nowhere either.
    const sly = await draft("sly", "flow", {
      nodes: { start: manual, read: core("table-read", { table: "'notes'" }) },
      edges: [{ from: "start", to: "read" }],
    });
    expect(sly.status, JSON.stringify(sly.body)).toBe(200);
    expect((await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["sly"] })).status).toBe(201);
    const refused = await flowRun("sly", {});
    expect(refused.status).toBe("failed");
    expect(step(refused, "read").error.message).toContain("notes");
    // What is handed over must exist, and must be of a kind the script takes.
    const missing = await draft("sly", "flow", {
      nodes: {
        start: manual,
        read: core("table-read", { table: "'ghosts'" }, { tables: ["ghosts"] }),
      },
      edges: [{ from: "start", to: "read" }],
    });
    expect(missing.status).toBe(200);
    const unmade = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["sly"] });
    expect(unmade.status).toBe(400);
    expect(JSON.stringify(unmade.body)).toContain("which is not a table in this repository");
    await draft("sly", "flow", {
      nodes: {
        start: manual,
        read: core("table-read", { table: "'notes'" }, { connections: ["outbox"] }),
      },
      edges: [{ from: "start", to: "read" }],
    });
    const mistaken = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["sly"] });
    expect(mistaken.status).toBe(400);
    expect(JSON.stringify(mistaken.body)).toContain("which does not take one");
    // `input` and `inputs` are two ways to say one thing.
    const both = await draft("sly", "flow", {
      nodes: {
        start: manual,
        read: { ...core("table-read", { table: "'notes'" }), input: "{}" },
      },
      edges: [{ from: "start", to: "read" }],
    });
    expect(both.status).toBe(200);
    const twice = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["sly"] });
    expect(twice.status).toBe(400);
    expect(JSON.stringify(twice.body)).toContain("not both");
    expect((await alice.delete(`${ws(dev)}/drafts/sly`)).status).toBeLessThan(300);
  });

  test("a tenant's own script becomes a node, and takes what it says it takes", async () => {
    const counter = await draft("count-rows", "script", {
      description: "Counts the rows of a table.",
      input: {
        type: "object",
        properties: { table: { type: "string", "x-pick": "table" } },
        required: ["table"],
      },
      output: { type: "object" },
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      node: { label: "Count rows", icon: "hash", category: "Ours", takes: ["table"] },
      source: {
        language: "typescript",
        code: 'import type { ScriptContext } from "@vynxlabs/sdk";\nexport default async (input: { table: string }, ctx: ScriptContext) => ({\n  rows: (await ctx.table(input.table).find({ limit: 100 })).length,\n});\n',
      },
    });
    expect(counter.status, JSON.stringify(counter.body)).toBe(200);
    const counting = await draft("counting", "flow", {
      nodes: {
        start: manual,
        count: {
          type: "script",
          script: "count-rows",
          inputs: { table: "'notes'" },
          with: { tables: ["notes"] },
        },
      },
      edges: [{ from: "start", to: "count" }],
    });
    expect(counting.status, JSON.stringify(counting.body)).toBe(200);
    const deployed = await alice.post(`${ws(dev)}/changes/deploy`, {
      paths: ["count-rows", "counting"],
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const done = await flowRun("counting", {});
    expect(done.status, JSON.stringify(done.steps)).toBe("succeeded");
    expect(step(done, "count").output).toEqual({ rows: 1 });
    const listed = (await alice.get(`${ws(dev)}/resources?kind=script&limit=200`)).body.items;
    expect(listed.find((item: Any) => item.path === "count-rows").body?.node ?? null).not.toBe(
      undefined,
    );
  });
});

describe("a flow that answers the request that started it", () => {
  const draft = (path: string, body: object) =>
    alice.put(`${ws(dev)}/drafts/${path}`, { kind: "flow", schemaVersion: 1, body });
  const hooked = { type: "trigger", trigger: { type: "webhook", respond: "flow" } };
  const address = async (flow: string) => {
    const listed = (await alice.get(`${ws(dev)}/triggers`)).body.items.find(
      (item: Any) => item.path === flow,
    );
    return new URL(listed.url).pathname;
  };
  const call = (url: string, payload: object) =>
    t.app.inject({
      method: "POST",
      url,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(payload),
    });

  test("a respond step answers with its own status, headers and body, and the flow carries on", async () => {
    const saved = await draft("answer", {
      nodes: {
        hook: hooked,
        which: { type: "branch", cases: [{ name: "quiet", when: "trigger.quiet == true" }] },
        greet: {
          type: "respond",
          status: 201,
          headers: { "X-Greeted": "trigger.name", Location: "'/people/' + trigger.name" },
          body: "{'hello': trigger.name, 'tags': ['a', 'b']}",
        },
        echo: { type: "respond", body: "trigger.challenge" },
        after: { type: "set", values: { done: "true" } },
        late: { type: "respond", status: 500, body: "'too late'" },
        nothing: { type: "set", values: { said: "false" } },
      },
      edges: [
        { from: "hook", to: "which" },
        { from: "which", to: "nothing", output: "quiet" },
        { from: "which", to: "greet", output: "otherwise" },
        { from: "greet", to: "after" },
        { from: "after", to: "late" },
      ],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // `echo` is reached by nothing, and the build says so.
    const loose = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["answer"] });
    expect(loose.status).toBe(400);
    const again = await draft("answer", {
      nodes: {
        hook: hooked,
        which: {
          type: "branch",
          cases: [
            { name: "quiet", when: "has(trigger.quiet)" },
            { name: "challenge", when: "has(trigger.challenge)" },
          ],
        },
        greet: {
          type: "respond",
          status: 201,
          headers: { "X-Greeted": "trigger.name", Location: "'/people/' + trigger.name" },
          body: "{'hello': trigger.name, 'tags': ['a', 'b']}",
        },
        echo: { type: "respond", body: "trigger.challenge" },
        after: { type: "set", values: { done: "true" } },
        late: { type: "respond", status: 500, body: "'too late'" },
        nothing: { type: "set", values: { said: "false" } },
      },
      edges: [
        { from: "hook", to: "which" },
        { from: "which", to: "nothing", output: "quiet" },
        { from: "which", to: "echo", output: "challenge" },
        { from: "which", to: "greet", output: "otherwise" },
        { from: "greet", to: "after" },
        { from: "after", to: "late" },
      ],
    });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    const deployed = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["answer"] });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const url = await address("answer");

    const greeted = await call(url, { name: "ada" });
    expect(greeted.statusCode).toBe(201);
    expect(greeted.json()).toEqual({ hello: "ada", tags: ["a", "b"] });
    expect(greeted.headers["content-type"]).toContain("application/json");
    expect(greeted.headers["x-greeted"]).toBe("ada");
    expect(greeted.headers.location).toBe("/people/ada");
    // The answer is a tenant's, from the platform's address. A browser may not run it.
    expect(greeted.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(greeted.headers["x-content-type-options"]).toBe("nosniff");
    // The flow went on after it answered, and a second answer changed nothing.
    const id = String(greeted.headers["x-flow-run"]);
    let run: Any;
    for (let i = 0; i < 100; i++) {
      run = (await alice.get(`${ws(dev)}/flow-runs/${id}`)).body;
      if (run.status !== "running") break;
      await sleep(50);
    }
    expect(run.status).toBe("succeeded");
    const late = run.steps.find((s: Any) => s.node === "late");
    expect(late.output).toEqual({ status: 500, answered: false });

    // Text is sent as text: what a sender's handshake asks for.
    const echoed = await call(url, {
      challenge: "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P",
    });
    expect(echoed.statusCode).toBe(200);
    expect(echoed.headers["content-type"]).toContain("text/plain");
    expect(echoed.body).toBe("3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P");

    // A flow that ends having said nothing leaves the usual answer.
    const quiet = await call(url, { quiet: true });
    expect(quiet.statusCode).toBe(202);
    expect(quiet.json().runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("what a flow may not answer with is refused when it is built", async () => {
    const build = async (nodes: object, edges: object[]) => {
      expect((await draft("badly", { nodes, edges })).status).toBe(200);
      const tried = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["badly"] });
      expect(tried.status).toBe(400);
      return JSON.stringify(tried.body);
    };
    expect(
      await build({ hook: hooked, set: { type: "set", values: { a: "1" } } }, [
        { from: "hook", to: "set" },
      ]),
    ).toContain("no respond step follows it");
    expect(
      await build(
        {
          hook: hooked,
          say: { type: "respond", headers: { "Set-Cookie": "'session=1'" }, body: "'x'" },
        },
        [{ from: "hook", to: "say" }],
      ),
    ).toContain("may not set the header");
    expect((await alice.delete(`${ws(dev)}/drafts/badly`)).status).toBeLessThan(300);
  });
});

describe("a trigger that is a form", () => {
  const HOST = "localhost:8080";
  /** A browser at the instance's own address: it keeps its cookies. */
  function browser() {
    const jar = new Map<string, string>();
    const call = async (
      method: "GET" | "POST",
      url: string,
      form?: Record<string, string>,
      origin?: string,
    ) => {
      const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      const response = await t.app.inject({
        method,
        url,
        headers: {
          host: HOST,
          ...(cookie ? { cookie } : {}),
          ...(form
            ? {
                origin: origin ?? `http://${HOST}`,
                "content-type": "application/x-www-form-urlencoded",
              }
            : {}),
        },
        ...(form ? { payload: new URLSearchParams(form).toString() } : {}),
      });
      for (const line of ([] as string[]).concat(response.headers["set-cookie"] ?? [])) {
        const [pair = ""] = line.split(";");
        const at = pair.indexOf("=");
        jar.set(pair.slice(0, at), pair.slice(at + 1));
      }
      return {
        status: response.statusCode,
        body: response.body,
        headers: response.headers,
        location: response.headers.location as string | undefined,
      };
    };
    return {
      get: (url: string) => call("GET", url),
      send: (url: string, form: Record<string, string>, origin?: string) =>
        call("POST", url, form, origin),
    };
  }
  const keyOf = (page: string) => /name="key" value="([0-9a-f-]{36})"/.exec(page)?.[1] ?? "";
  const flowRuns = async (flow: string): Promise<Any[]> =>
    (await alice.get(`${ws(dev)}/flow-runs?flow=${flow}&limit=50`)).body.items;
  const settled = async (flow: string, count: number): Promise<Any[]> => {
    for (let i = 0; i < 100; i++) {
      const items = await flowRuns(flow);
      if (items.length >= count && items.every((item) => item.status !== "running")) return items;
      await sleep(50);
    }
    throw new Error(`${flow} did not get to ${count} finished runs.`);
  };
  const feedback = (trigger: object) => ({
    nodes: {
      asked: { type: "trigger", trigger: { type: "form", ...trigger } },
      note: { type: "set", values: { summary: "trigger.name + ' said ' + trigger.rating" } },
    },
    edges: [{ from: "asked", to: "note" }],
  });
  const fields = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", help: "Only if you want an answer." },
    {
      name: "rating",
      label: "How was it?",
      type: "select",
      options: ["good", "bad"],
      required: true,
    },
    { name: "amount", label: "What you paid", type: "number" },
    { name: "on", label: "When", type: "date" },
    { name: "note", label: "Anything else", type: "textarea" },
    { name: "agree", label: "You may keep this", type: "checkbox", required: true },
  ];
  let address: string;

  test("a form is a page of the tenant's portal, and what is sent starts the flow", async () => {
    const draft = await alice.put(`${ws(dev)}/drafts/feedback`, {
      kind: "flow",
      schemaVersion: 1,
      body: feedback({
        title: "Tell us how it went",
        description: "It takes a minute.",
        fields,
        submitLabel: "Send it",
        success: "Thanks. We read every one <3",
      }),
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(200);
    const deployed = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["feedback"] });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const listed = (await alice.get(`${ws(dev)}/triggers`)).body.items.find(
      (item: Any) => item.path === "feedback",
    );
    expect(listed.type).toBe("form");
    address = new URL(listed.url).pathname;
    expect(address).toMatch(/^\/portal\/acme\/forms\/vxf_[A-Za-z0-9_-]+$/);

    const visitor = browser();
    const page = await visitor.get(address);
    expect(page.status).toBe(200);
    // The page is the platform's own: it carries no script, and may load none.
    expect(page.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(page.body).not.toContain("<script");
    expect(page.body).toContain("<h1>Tell us how it went</h1>");
    expect(page.body).toContain('<textarea id="f-note" name="note"');
    expect(page.body).toContain('<option value="good">good</option>');
    expect(page.body).toContain("Only if you want an answer.");
    expect(page.body).toContain(">Send it</button>");
    const key = keyOf(page.body);
    expect(key).not.toBe("");

    // What does not hold is said beside its field, and what was typed is kept.
    const short = await visitor.send(address, {
      key,
      name: "Pat <b>",
      email: "nope",
      amount: "lots",
    });
    expect(short.status).toBe(400);
    expect(short.body).toContain("Some answers need another look.");
    expect(short.body).toContain('value="Pat &lt;b&gt;"');
    expect(short.body).toContain("Give an email address.");
    expect(short.body).toContain("Give a number.");
    expect(short.body).toContain("This is needed.");
    expect(await flowRuns("feedback")).toHaveLength(0);

    const sent = await visitor.send(address, {
      key,
      name: "Pat",
      rating: "good",
      amount: "12.5",
      on: "2026-11-02",
      note: "Quick and kind.",
      agree: "yes",
    });
    expect(sent.status, sent.body).toBe(200);
    expect(sent.body).toContain("Thanks. We read every one &lt;3");
    // Sending the same page again starts nothing more.
    expect(
      (await visitor.send(address, { key, name: "Pat", rating: "good", agree: "yes" })).status,
    ).toBe(200);
    const runs = await settled("feedback", 1);
    expect(runs).toHaveLength(1);
    const run = (await alice.get(`${ws(dev)}/flow-runs/${runs[0].id}`)).body;
    expect(run.status).toBe("succeeded");
    expect(run.trigger).toMatchObject({ type: "form", trigger: "feedback#asked" });
    expect(run.steps.find((step: Any) => step.node === "note").output).toEqual({
      summary: "Pat said good",
    });
    const input = (
      await t.db
        .selectFrom("flow_run")
        .select("input")
        .where("id", "=", runs[0].id)
        .executeTakeFirstOrThrow()
    ).input;
    expect(input).toEqual({
      name: "Pat",
      rating: "good",
      amount: 12.5,
      on: "2026-11-02",
      note: "Quick and kind.",
      agree: true,
    });
  });

  test("a form is not for machines, for other sites, or for another tenant", async () => {
    const visitor = browser();
    const key = keyOf((await visitor.get(address)).body);
    const answer = { key, name: "Bot", rating: "bad", agree: "yes" };
    // A field no person sees was filled in: it is told it worked, and nothing starts.
    const trapped = await visitor.send(address, { ...answer, website: "https://spam.example" });
    expect(trapped.status).toBe(200);
    expect(trapped.body).toContain("Thanks. We read every one");
    // A page of another site cannot send it.
    expect((await visitor.send(address, answer, "https://elsewhere.example")).status).toBe(403);
    expect(await flowRuns("feedback")).toHaveLength(1);
    // The address belongs to one tenant, and to forms.
    await t.admin.post("/tenants", { slug: "other", name: "Other" });
    expect((await visitor.get(address.replace("/portal/acme/", "/portal/other/"))).status).toBe(
      404,
    );
    expect((await visitor.get("/portal/acme/forms/vxf_aaaaaaaaaaaaaaaaaaaaaaaa")).status).toBe(404);
    const token = address.split("/").at(-1) as string;
    expect((await t.anonymous.upload(`/hooks/${token}`, "{}", "application/json")).status).toBe(
      404,
    );
    // A paused workspace takes no answers, and says so.
    expect((await alice.patch(ws(dev), { triggersPaused: true })).status).toBeLessThan(300);
    const paused = await visitor.get(address);
    expect(paused.status).toBe(503);
    expect(paused.body).toContain("not taking answers");
    expect((await alice.patch(ws(dev), { triggersPaused: false })).status).toBeLessThan(300);
  });

  test("a form can ask for a sign-in, and a script can be what it starts", async () => {
    t.kernel.mail.deliver = async () => {};
    for (const [path, kind, body] of [
      [
        "members-only",
        "flow",
        feedback({ title: "Members only", fields: fields.slice(0, 3), access: "signed_in" }),
      ],
      [
        "shout-form",
        "trigger",
        {
          type: "form",
          script: "say",
          title: "Say it loudly",
          fields: [{ name: "text", label: "What to say", type: "text", required: true }],
        },
      ],
    ] as const) {
      const saved = await alice.put(`${ws(dev)}/drafts/${path}`, { kind, schemaVersion: 1, body });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    }
    const deployed = await alice.post(`${ws(dev)}/changes/deploy`, {
      paths: ["members-only", "shout-form"],
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const listed = (await alice.get(`${ws(dev)}/triggers`)).body.items;
    const at = (path: string) =>
      new URL(listed.find((item: Any) => item.path === path).url).pathname;

    const visitor = browser();
    const turned = await visitor.get(at("members-only"));
    expect(turned.status).toBe(303);
    expect(turned.location).toBe(
      `/portal/acme/sign-in?return=${encodeURIComponent(at("members-only"))}`,
    );
    const created = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "pat@customer.example",
      name: "Pat",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const invitation = new URL(created.body.invitation.url);
    expect(
      (
        await visitor.send("/portal/acme/set-password", {
          token: invitation.searchParams.get("token") as string,
          password: PASSWORD,
        })
      ).status,
    ).toBe(303);
    const page = await visitor.get(at("members-only"));
    expect(page.status).toBe(200);
    const sent = await visitor.send(at("members-only"), {
      key: keyOf(page.body),
      name: "Pat",
      rating: "bad",
    });
    expect(sent.status, sent.body).toBe(200);
    expect(sent.body).toContain("Thank you. Your answer was sent.");
    const [run] = await settled("members-only", 1);
    // The run knows who sent the form.
    expect((await alice.get(`${ws(dev)}/flow-runs/${run.id}`)).body.trigger.submittedBy).toEqual({
      type: "end_user",
      id: created.body.endUser.id,
    });

    const open = browser();
    const shout = await open.get(at("shout-form"));
    expect(
      (await open.send(at("shout-form"), { key: keyOf(shout.body), text: "hello" })).status,
    ).toBe(200);
    for (let i = 0; i < 100; i++) {
      const runs = (await alice.get(`${ws(dev)}/runs?script=say&limit=50`)).body.items.filter(
        (item: Any) => item.trigger?.type === "form" && item.status === "succeeded",
      );
      if (runs.length === 1) {
        expect((await alice.get(`${ws(dev)}/runs/${runs[0].id}`)).body.output).toEqual({
          said: "HELLO! (no key)",
        });
        return;
      }
      await sleep(50);
    }
    throw new Error("The form did not start its script.");
  });

  test("a form's fields are checked when it is built", async () => {
    const tried = async (extra: object[]) => {
      await alice.put(`${ws(dev)}/drafts/badly`, {
        kind: "flow",
        schemaVersion: 1,
        body: feedback({ title: "x", fields: [...fields.slice(0, 3), ...extra] }),
      });
      const response = await alice.post(`${ws(dev)}/changes/deploy`, { paths: ["badly"] });
      expect(response.status).toBe(400);
      return JSON.stringify(response.body);
    };
    expect(await tried([{ name: "name", label: "Again", type: "text" }])).toContain(
      "two fields are named",
    );
    expect(await tried([{ name: "website", label: "Site", type: "text" }])).toContain(
      "kept for the form itself",
    );
    expect(await tried([{ name: "pick", label: "Pick", type: "select" }])).toContain(
      "a select needs options",
    );
    expect((await alice.delete(`${ws(dev)}/drafts/badly`)).status).toBeLessThan(300);
  });
});

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    expect(t.unaudited).toEqual([]);
  });
});
