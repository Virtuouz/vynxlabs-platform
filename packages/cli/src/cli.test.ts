import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startTestApp, type TestApp } from "@vynxlabs/control-plane/testing";
import { afterAll, beforeAll, expect, test } from "vitest";
import { run, settingsPath } from "./cli.js";

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
    err: expect.stringContaining("platform login"),
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
  const result = await cli(["status"], { PLATFORM_URL: "http://127.0.0.1:1" });
  expect(result).toMatchObject({
    code: 1,
    err: expect.stringContaining("Could not reach http://127.0.0.1:1"),
  });
});

test("help and unknown commands", async () => {
  expect((await cli([])).out).toContain("Usage: platform <command>");
  expect(await cli(["explode"])).toMatchObject({
    code: 2,
    err: expect.stringContaining('Unknown command "explode"'),
  });
});
