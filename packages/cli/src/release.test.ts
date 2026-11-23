import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, startTestApp, type TestApp } from "@volvel/control-plane/testing";
import { afterAll, beforeAll, expect, test } from "vitest";
import { run, settingsPath } from "./cli.js";

/**
 * What a person releasing from a terminal can do: look before deploying, say why, go back,
 * read the answer as JSON, keep another sign-in, and say where the code is (phase 29, CLI-MP1 to 4, 6).
 */

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const PASSWORD = "a-good-long-password";
const target = ["--tenant", "acme", "--workspace", "dev"];

let t: TestApp;
let url: string;
let alice: Client;
let home: string;
let repo: string;
let base: string;
let token: string;

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

const source = (word: string, more = "") => `
import { defineScript, z } from "@volvel/sdk";
${more}
export const greet = defineScript({
  path: "greet",
  input: z.object({}),
  output: z.object({ said: z.string() }),
  async run() {
    return { said: "${word}" };
  },
});
`;

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
  url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  home = await mkdtemp(join(tmpdir(), "cli-release-"));
  repo = await mkdtemp(join(tmpdir(), "cli-release-repo-"));
  await mkdir(join(repo, "src"));
  await mkdir(join(repo, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(repo, "node_modules", "@volvel", "sdk"),
  );
  await writeFile(join(repo, "package.json"), '{"type":"module"}');
  await writeFile(join(repo, "src", "index.ts"), source("one"));

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
  base = `/tenants/${tenant}/workspaces/${dev}`;
  token = (await alice.post("/api-keys", { name: "cli" })).body.token;
  expect((await cli(["login", "--url", url, "--token", token])).code).toBe(0);
}, 120_000);

afterAll(async () => {
  await t?.stop();
  await rm(home, { recursive: true });
  await rm(repo, { recursive: true });
});

const deployments = async () => (await alice.get(`${base}/deployments`)).body.items;

test("deploy --preview says what would change, and changes nothing (CLI-MP1)", async () => {
  const before = (await deployments()).length;
  const preview = await cli(["deploy", ...target, "--dir", repo, "--preview"]);
  expect(preview.code, preview.err).toBe(0);
  expect(preview.out).toContain("Deploying would leave dev (dev) with: 1 created");
  expect(preview.out).toContain("Nothing was changed. Run it again without --preview to deploy.");
  expect(await deployments()).toHaveLength(before);
  // Nothing is running, and no resource was made.
  expect((await alice.get(`${base}/resources/greet`)).status).toBe(404);

  const done = await cli(["deploy", ...target, "--dir", repo]);
  expect(done.code, done.err).toBe(0);
  expect(await deployments()).toHaveLength(before + 1);
});

test("--message is kept with the version; in CI the last commit's subject is used (CLI-MP2)", async () => {
  await writeFile(join(repo, "src", "index.ts"), source("two"));
  const said = await cli(["deploy", ...target, "--dir", repo, "--message", "Say two"]);
  expect(said.code, said.err).toBe(0);
  expect((await deployments())[0].message).toBe("Say two");

  await writeFile(join(repo, "src", "index.ts"), source("three"));
  const { execFileSync } = await import("node:child_process");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t.test", "commit", "-q", "-m", "Make it three");
  const ci = await cli(["deploy", ...target, "--dir", repo], { CI: "true" });
  expect(ci.code, ci.err).toBe(0);
  expect((await deployments())[0].message).toBe("Make it three");
  // Outside CI nothing is read from git.
  await writeFile(join(repo, "src", "index.ts"), source("four"));
  expect((await cli(["deploy", ...target, "--dir", repo])).code).toBe(0);
  expect((await deployments())[0].message).toBeNull();
  expect((await cli(["deploy", ...target, "--dir", repo, "--message", " "])).err).toContain(
    "--message needs some words",
  );
});

test("rollback puts an earlier version back, and says when it cannot (CLI-MP3)", async () => {
  const bundles = (await alice.get(`${base}/bundles`)).body.items as {
    version: number;
    active: boolean;
  }[];
  const latest = bundles.find((one) => one.active)?.version as number;
  const earlier = Math.min(...bundles.map((one) => one.version));
  expect(earlier).toBeLessThan(latest);
  const back = await cli(["rollback", String(earlier), ...target]);
  expect(back.code, back.err).toBe(0);
  expect(back.out).toContain(`runs version ${earlier} again`);
  const now = (await alice.get(`${base}/bundles`)).body.items as typeof bundles;
  expect(now.find((one) => one.active)?.version).toBe(earlier);
  expect((await deployments())[0].message).toBe(`Went back to version ${earlier}`);

  expect((await cli(["rollback", String(earlier), ...target])).err).toContain(
    "is the one dev runs now",
  );
  expect((await cli(["rollback", "999", ...target])).err).toContain("has no version 999");
  expect((await cli(["rollback", "last", ...target])).err).toContain("Say which version");
});

test("--json gives one JSON document and nothing else (CLI-MP6)", async () => {
  const me = await cli(["whoami", "--json"]);
  expect(JSON.parse(me.out)).toMatchObject({
    url,
    principal: { email: "alice@acme.example" },
    tenants: [{ slug: "acme" }],
  });
  expect(JSON.parse((await cli(["status", "--json"])).out)).toMatchObject({
    url,
    version: "0.5.0",
    ready: true,
  });
  const listed = JSON.parse((await cli(["runs", ...target, "--json"])).out);
  expect(Array.isArray(listed.items)).toBe(true);

  const more = `export const extra = defineScript({ path: "extra", input: z.object({}), output: z.object({}), async run() { return {}; } });`;
  await writeFile(join(repo, "src", "index.ts"), source("five", more));
  const preview = await cli(["deploy", ...target, "--dir", repo, "--preview", "--json"]);
  expect(JSON.parse(preview.out)).toMatchObject({ preview: true, summary: { created: 1 } });
  const deployed = await cli(["deploy", ...target, "--dir", repo, "--json", "--message", "Five"]);
  expect(deployed.code, deployed.err).toBe(0);
  expect(JSON.parse(deployed.out)).toMatchObject({
    workspace: "dev",
    summary: { created: 1 },
    message: "Five",
  });
  const first = Math.min(
    ...((await alice.get(`${base}/bundles`)).body.items as { version: number }[]).map(
      (one) => one.version,
    ),
  );
  const back = await cli(["rollback", String(first), ...target, "--json"]);
  expect(JSON.parse(back.out)).toMatchObject({ workspace: "dev", version: first });
});

test("profiles keep several sign-ins; logout removes one (CLI-MP6)", async () => {
  const env = { XDG_CONFIG_HOME: home };
  expect((await cli(["login", "--url", url, "--token", token, "--profile", "staging"])).code).toBe(
    0,
  );
  const saved = settingsPath({ ...env, VOLVEL_PROFILE: "staging" });
  expect(JSON.parse(await readFile(saved, "utf8"))).toEqual({ url, token });
  expect(saved).not.toBe(settingsPath(env));
  const listed = await cli(["profiles"]);
  expect(listed.out).toContain("staging");
  expect(listed.out).toContain(url);
  // A profile is used by a flag or by the environment, and the default is untouched.
  expect((await cli(["whoami", "--profile", "staging"])).code).toBe(0);
  expect((await cli(["whoami"], { VOLVEL_PROFILE: "staging" })).code).toBe(0);
  expect((await cli(["whoami", "--profile", "nope"])).err).toContain("Not signed in");
  expect((await cli(["whoami", "--profile", "a b"])).err).toContain("A profile name is");

  const out = await cli(["logout", "--profile", "staging"]);
  expect(out.out).toContain("Signed out");
  expect((await cli(["whoami", "--profile", "staging"])).err).toContain("Not signed in");
  expect((await cli(["whoami"])).code).toBe(0);
  expect((await cli(["logout", "--profile", "staging"])).out).toContain("Nothing was saved");
});

test("the entry file and the console's folder come from a flag or volvel.yaml (CLI-MP4)", async () => {
  await mkdir(join(repo, "code"), { recursive: true });
  await writeFile(join(repo, "code", "main.ts"), source("six"));
  await writeFile(join(repo, "src", "index.ts"), "export {};\n");
  const refused = await cli(["build", "--dir", repo]);
  expect(refused.err).toContain("src/index.ts exports no resources");
  const flagged = await cli(["build", "--dir", repo, "--entry", "code/main.ts"]);
  expect(flagged.code, flagged.err).toBe(0);
  expect(flagged.out).toContain("greet");
  await writeFile(join(repo, "volvel.yaml"), "entry: code/main.ts\nresources: console\n");
  const said = await cli(["build", "--dir", repo]);
  expect(said.code, said.err).toBe(0);
  await writeFile(join(repo, "volvel.yaml"), "entry: 3\n");
  expect((await cli(["build", "--dir", repo])).err).toContain("entry is one path");
  await rm(join(repo, "volvel.yaml"));
});

test("promote --message is kept with the version it makes (CLI-MP2)", async () => {
  const seen: { path: string; body: string }[] = [];
  const { createServer } = await import("node:http");
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const path = (request.url ?? "").split("?")[0] ?? "";
      seen.push({ path, body });
      const answer: [number, unknown] =
        path === "/api/v1/tenants"
          ? [200, { items: [{ id: "t1", slug: "acme", name: "Acme" }] }]
          : path === "/api/v1/tenants/t1/workspaces"
            ? [200, { items: [{ id: "w1", slug: "main", type: "dev" }] }]
            : path.endsWith("/promotion-preview")
              ? [
                  200,
                  {
                    target: { slug: "live", type: "production" },
                    bundle: { digest: "abcdef0123456789", version: 4 },
                    possible: true,
                    summary: { created: 0, updated: 1, deleted: 0, unchanged: 2 },
                  },
                ]
              : [
                  201,
                  {
                    bundleVersion: 4,
                    summary: { created: 0, updated: 1, deleted: 0, unchanged: 2 },
                  },
                ];
      response.writeHead(answer[0], { "content-type": "application/json" });
      response.end(JSON.stringify(answer[1]));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await cli(
      ["promote", "--tenant", "acme", "--workspace", "main", "--message", "Ship it", "--json"],
      { VOLVEL_URL: address, VOLVEL_TOKEN: "k" },
    );
    expect(result.code, result.err).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ version: 4, message: "Ship it" });
    expect(JSON.parse(seen.find((one) => one.path.endsWith("/promotions"))?.body ?? "{}")).toEqual({
      message: "Ship it",
    });
  } finally {
    await new Promise((done) => server.close(done));
  }
});
