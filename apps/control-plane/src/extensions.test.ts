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

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    expect(t.unaudited).toEqual([]);
  });
});
