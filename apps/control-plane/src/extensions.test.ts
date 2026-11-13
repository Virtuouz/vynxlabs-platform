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

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    expect(t.unaudited).toEqual([]);
  });
});
