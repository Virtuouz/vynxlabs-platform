import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, startTestApp, type TestApp } from "@volvel/control-plane/testing";
import { Worker } from "@volvel/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { run } from "./cli.js";
import { SseParser } from "./follow.js";

/**
 * The CLI going both ways (phase 10, milestone 5): a console draft pulled into
 * the repository, a local build tried on the platform, and a run followed to
 * its end, against a real instance and worker.
 */

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const PASSWORD = "a-good-long-password";

let t: TestApp;
let url: string;
let alice: Client;
let home: string;
let repo: string;
let base: string;
let worker: Worker;
let working: Promise<unknown>;
const target = ["--tenant", "acme", "--workspace", "dev"];

async function cli(args: string[], env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: { XDG_CONFIG_HOME: home, ...env },
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const SOURCE = `
import { defineFlow, defineScript, step, trigger, z } from "@volvel/sdk";

export const greet = defineScript({
  path: "greet",
  input: z.object({ name: z.string() }),
  output: z.object({ said: z.string() }),
  async run(input, ctx) {
    ctx.log.info("Greeting", { name: input.name });
    await new Promise((done) => setTimeout(done, 400));
    ctx.log.info("Greeted");
    return { said: "Hello " + input.name };
  },
});

export const boom = defineScript({
  path: "boom",
  input: z.object({}),
  output: z.object({}),
  async run() {
    throw new Error("It broke on purpose");
  },
});

export const welcome = defineFlow({
  path: "welcome",
  nodes: {
    start: trigger.manual(),
    hello: step.script(greet, { input: "{'name': trigger.name}" }),
    done: step.set({ said: "steps.hello.output.said" }),
  },
  edges: [
    ["start", "hello"],
    ["hello", "done"],
  ],
});
`;

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  home = await mkdtemp(join(tmpdir(), "cli-remote-"));
  repo = await mkdtemp(join(tmpdir(), "cli-remote-repo-"));
  await mkdir(join(repo, "src"));
  await mkdir(join(repo, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(repo, "node_modules", "@volvel", "sdk"),
  );
  await writeFile(join(repo, "package.json"), '{"type":"module"}');
  await writeFile(join(repo, "src", "index.ts"), SOURCE);

  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
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
  const dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  await alice.post(`/tenants/${tenant}/workspaces`, {
    slug: "prod",
    name: "Prod",
    type: "production",
  });
  base = `/tenants/${tenant}/workspaces/${dev}`;
  const token = (await alice.post("/api-keys", { name: "cli" })).body.token;
  expect((await cli(["login", "--url", url, "--token", token])).code).toBe(0);
  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "cli" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
}, 120_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await t?.stop();
  await rm(home, { recursive: true });
  await rm(repo, { recursive: true });
});

describe("server-sent events, read in pieces", () => {
  test("make events whatever the chunks, and skip comments and retry", () => {
    const parser = new SseParser();
    expect(parser.push("retry: 3000\n\nevent: ready\nda")).toEqual([]);
    expect(parser.push('ta: {}\n\n: ping\n\nevent: run\r\ndata: {"id":"a"')).toEqual([
      { event: "ready", data: "{}" },
    ]);
    expect(parser.push(',"s":"running"}\r\n\r\ndata: one\ndata: two\n\n')).toEqual([
      { event: "run", data: '{"id":"a","s":"running"}' },
      { event: "message", data: "one\ntwo" },
    ]);
  });
});

describe("a local build, run on the platform", () => {
  test("runs a script from this build, streams its logs and prints its output", async () => {
    const result = await cli([
      "run",
      "greet",
      "--remote",
      ...target,
      "--dir",
      repo,
      "--input",
      '{"name":"Ada"}',
    ]);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toMatch(
      /Test run .* of greet in dev, from this build \(preview, version \d+\)/,
    );
    expect(result.out).toMatch(/info {2}Greeting \{"name":"Ada"\}/);
    expect(result.out).toMatch(/info {2}Greeted/);
    expect(result.out).toMatch(/Succeeded in /);
    expect(result.out).toContain('"said": "Hello Ada"');
    // Nothing was deployed.
    expect((await alice.get(`${base}/resources/greet`)).status).toBe(404);
  }, 60_000);

  test("a failing script exits 1 with its error, and input can come from a file", async () => {
    await writeFile(join(repo, "input.json"), "{}");
    const result = await cli([
      "run",
      "boom",
      "--remote",
      ...target,
      "--dir",
      repo,
      "--input",
      `@${join(repo, "input.json")}`,
    ]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("Failed: It broke on purpose");
  }, 60_000);

  test("a flow is followed step by step, with each step's logs", async () => {
    const result = await cli([
      "run",
      "welcome",
      "--remote",
      ...target,
      "--dir",
      repo,
      "--input",
      '{"name":"Grace"}',
    ]);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toMatch(/✓ start succeeded/);
    expect(result.out).toMatch(/\[hello\] .*info {2}Greeting \{"name":"Grace"\}/);
    expect(result.out).toMatch(/✓ hello succeeded/);
    expect(result.out).toMatch(/✓ done succeeded/);
    expect(result.out).toContain("The flow run succeeded.");
    expect(result.out).toContain('"said": "Hello Grace"');
  }, 60_000);

  test("is refused in production, and for what the build does not have", async () => {
    expect(
      await cli([
        "run",
        "greet",
        "--remote",
        "--tenant",
        "acme",
        "--workspace",
        "prod",
        "--dir",
        repo,
      ]),
    ).toMatchObject({ code: 1, err: expect.stringContaining("is a production workspace") });
    expect(await cli(["run", "nope", "--remote", ...target, "--dir", repo])).toMatchObject({
      code: 1,
      err: expect.stringContaining("boom (script), greet (script), welcome (flow)"),
    });
  }, 60_000);
});

describe("following a run", () => {
  test("logs -f follows a run started elsewhere to its end; without -f, prints what there is", async () => {
    await cli(["deploy", ...target, "--dir", repo]);
    const started = await alice.post(`${base}/runs`, { script: "greet", input: { name: "Lin" } });
    const followed = await cli(["logs", started.body.id, "-f", ...target]);
    expect(followed.code, followed.err).toBe(0);
    expect(followed.out).toMatch(/Greeting \{"name":"Lin"\}[\s\S]*Greeted[\s\S]*Succeeded in/);
    const once = await cli(["logs", started.body.id, ...target]);
    expect(once.out.split("\n").filter((line) => line.includes("Greet"))).toHaveLength(2);
    // A failed run's exit code says so.
    const failed = await alice.post(`${base}/runs`, { script: "boom", input: {} });
    expect((await cli(["logs", failed.body.id, "-f", ...target])).code).toBe(1);
    expect((await cli(["logs", "01a1e000-0000-7000-8000-000000000000", ...target])).err).toContain(
      "There is no run or flow run",
    );
  }, 60_000);

  test("without the stream, it follows by looking every two seconds", async () => {
    const started = await alice.post(`${base}/runs`, { script: "greet", input: { name: "Kay" } });
    // The stream is refused: every stream this key may open is taken.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith("/stream")
        ? new Response('{"code":"too_many_streams"}', { status: 429 })
        : realFetch(input, init)) as typeof fetch;
    try {
      const followed = await cli(["logs", started.body.id, "-f", ...target]);
      expect(followed.code, followed.err).toBe(0);
      expect(followed.out).toMatch(/Greeting \{"name":"Kay"\}[\s\S]*Succeeded/);
    } finally {
      globalThis.fetch = realFetch;
    }
  }, 60_000);
});

describe("pulling the console's resources", () => {
  const folder = () => join(repo, "platform");
  const read = (path: string) => readFile(join(folder(), path), "utf8");

  test("writes them, and a second pull changes nothing", async () => {
    await alice.put(`${base}/drafts/notes/hello`, {
      kind: "flow",
      schemaVersion: 1,
      body: {
        nodes: {
          start: { type: "trigger", trigger: { type: "manual" } },
          note: { type: "set", values: { said: "'from the console'" } },
        },
        edges: [{ from: "start", to: "note" }],
      },
    });
    const first = await cli(["pull", ...target, "--dir", repo]);
    expect(first.code, first.err).toBe(0);
    expect(first.out).toContain("new      platform/notes/hello.flow.yaml");
    expect(first.out).toMatch(/1 new, 0 updated, 0 removed, 0 unchanged/);
    expect(await read("notes/hello.flow.yaml")).toContain("'from the console'");
    const second = await cli(["pull", ...target, "--dir", repo]);
    expect(second.out).toMatch(/0 new, 0 updated, 0 removed, 1 unchanged/);
  }, 60_000);

  test("takes a change made in the console, and keeps one made here unless forced", async () => {
    const body = (said: string) => ({
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        note: { type: "set", values: { said } },
      },
      edges: [{ from: "start", to: "note" }],
    });
    await alice.put(`${base}/drafts/notes/hello`, {
      kind: "flow",
      schemaVersion: 1,
      body: body("'changed in the console'"),
    });
    expect((await cli(["pull", ...target, "--dir", repo])).out).toMatch(/1 updated/);
    expect(await read("notes/hello.flow.yaml")).toContain("'changed in the console'");

    const mine = (await read("notes/hello.flow.yaml")).replace("in the console", "here");
    await writeFile(join(folder(), "notes/hello.flow.yaml"), mine);
    await alice.put(`${base}/drafts/notes/hello`, {
      kind: "flow",
      schemaVersion: 1,
      body: body("'and again in the console'"),
    });
    const kept = await cli(["pull", ...target, "--dir", repo]);
    expect(kept.code).toBe(1);
    expect(kept.err).toContain("platform/notes/hello.flow.yaml: changed here since it was pulled");
    expect(await read("notes/hello.flow.yaml")).toBe(mine);
    expect((await cli(["pull", ...target, "--dir", repo, "--force"])).code).toBe(0);
    expect(await read("notes/hello.flow.yaml")).toContain("'and again in the console'");
  }, 60_000);

  test("round-trips: pulled, edited, deployed, and nothing is left to pull or deploy", async () => {
    const file = join(folder(), "notes/hello.flow.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("again in the console", "edited in the repository"),
    );
    const deployed = await cli(["deploy", ...target, "--dir", repo]);
    expect(deployed.code, deployed.err).toBe(0);
    // The draft the deploy made true is gone; the deployed flow has the edit.
    expect((await alice.get(`${base}/drafts`)).body.items).toEqual([]);
    const resource = (await alice.get(`${base}/resources/notes/hello`)).body;
    expect(resource.ownership).toBe("ui");
    expect(JSON.stringify(resource.body)).toContain("edited in the repository");
    const again = await cli(["pull", ...target, "--dir", repo]);
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/0 new, 0 updated, 0 removed, 1 unchanged/);

    // Removed in the console: removed here, as it was not changed since.
    await alice.put(`${base}/drafts/notes/hello`, {
      kind: "flow",
      schemaVersion: 1,
      body: {},
      deleted: true,
    });
    const removed = await cli(["pull", ...target, "--dir", repo]);
    expect(removed.out).toContain("removed  platform/notes/hello.flow.yaml");
    await expect(readFile(file, "utf8")).rejects.toThrow();
  }, 120_000);
});
