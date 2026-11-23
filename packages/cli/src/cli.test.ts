import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startTestApp, type TestApp } from "@volvel/control-plane/testing";
import { afterAll, beforeAll, expect, test } from "vitest";
import { consoleResourcesLeft, run, settingsPath } from "./cli.js";

let t: TestApp;
let url: string;
let token: string;
let home: string;

beforeAll(async () => {
  t = await startTestApp();
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  token = (await t.admin.post("/api-keys", { name: "cli" })).body.token;
  home = await mkdtemp(join(tmpdir(), "cli-"));
});
afterAll(async () => {
  await t.stop();
  await rm(home, { recursive: true });
});

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

test("commands that need a sign-in say how to sign in", async () => {
  expect(await cli(["whoami"])).toMatchObject({
    code: 1,
    err: expect.stringContaining("volvel login"),
  });
});

test("login refuses a bad key and saves nothing", async () => {
  const result = await cli(["login", "--url", url, "--token", "vxk_wrong"]);
  expect(result).toMatchObject({ code: 1, err: expect.stringContaining("was not accepted") });
  await expect(stat(settingsPath({ XDG_CONFIG_HOME: home }))).rejects.toThrow();
  expect((await cli(["login", "--url", url])).code).toBe(1);
  expect((await cli(["login", "--url", "localhost", "--token", token])).err).toContain("http://");
});

test("login saves the settings for the user only, then whoami and status work", async () => {
  const login = await cli(["login", "--url", `${url}/`, "--token", token]);
  expect(login).toMatchObject({ code: 0, out: `Signed in to ${url} as operator@example.com.` });
  const path = settingsPath({ XDG_CONFIG_HOME: home });
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ url, token });
  expect((await stat(path)).mode & 0o777).toBe(0o600);

  const whoami = await cli(["whoami"]);
  expect(whoami.out).toBe(`operator@example.com on ${url}\nTenants: none`);

  const status = await cli(["status"]);
  expect(status.code).toBe(0);
  expect(status.out).toContain("Version 1.2.3, migration level");
  expect(status.out).toContain("Ready");
});

test("the environment overrides saved settings, and an unreachable instance is explained", async () => {
  const result = await cli(["status"], { VOLVEL_URL: "http://127.0.0.1:1" });
  expect(result).toMatchObject({
    code: 1,
    err: expect.stringContaining("Could not reach http://127.0.0.1:1"),
  });
});

test("help and unknown commands", async () => {
  expect((await cli([])).out).toContain("Usage: volvel <command>");
  expect(await cli(["explode"])).toMatchObject({
    code: 2,
    err: expect.stringContaining('Unknown command "explode"'),
  });
});

test("a saved key is sent only to the instance it was saved for (CLI-01)", async () => {
  await cli(["login", "--url", url, "--token", token]);
  const { createServer } = await import("node:http");
  const seen: (string | undefined)[] = [];
  const other = createServer((request, response) => {
    seen.push(request.headers.authorization);
    response.end(
      JSON.stringify({ principal: { type: "member", name: "x", email: "x@y.test" }, tenants: [] }),
    );
  });
  await new Promise<void>((done) => other.listen(0, "127.0.0.1", done));
  const port = (other.address() as { port: number }).port;
  try {
    const elsewhere = `http://127.0.0.1:${port}`;
    const refused = await cli(["whoami"], { VOLVEL_URL: elsewhere });
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("VOLVEL_TOKEN");
    expect(seen).toEqual([]);
    // With its own key it goes there; the same instance with a trailing slash is the same.
    await cli(["whoami"], { VOLVEL_URL: elsewhere, VOLVEL_TOKEN: "other-key" });
    expect(seen).toEqual(["Bearer other-key"]);
    expect((await cli(["whoami"], { VOLVEL_URL: `${url}/` })).code).toBe(0);
  } finally {
    await new Promise((done) => other.close(done));
  }
});

test("login warns about a plain http address that is not this machine", async () => {
  const result = await cli(["login", "--url", "http://203.0.113.9", "--token", "k"]);
  expect(result.err).toContain("plain http");
});

test("a deploy names the console resources it would delete before it uploads (CLI-13)", () => {
  const deployed = {
    files: [{ path: "orders/size.variable.yaml" }, { path: "docs/guide/intro.md" }],
    elsewhere: [{ resource: "lending/limit" }],
  };
  expect(consoleResourcesLeft(deployed, ["orders/size"], [])).toEqual([
    "guide/intro",
    "lending/limit",
  ]);
  expect(consoleResourcesLeft(deployed, ["orders/size"], ["guide/intro", "lending/limit"])).toEqual(
    [],
  );
  expect(
    consoleResourcesLeft(deployed, ["orders/size", "guide/intro", "lending/limit"], []),
  ).toEqual([]);
});
