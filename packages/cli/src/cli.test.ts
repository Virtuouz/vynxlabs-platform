import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startTestApp, type TestApp } from "@volvel/control-plane/testing";
import { afterAll, beforeAll, expect, test } from "vitest";
import { consoleResourcesLeft, refusal, run, settingsPath } from "./cli.js";

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

/** An instance that answers as a script says, for what the test app cannot be made to do. */
async function standIn(answers: (method: string, path: string) => [number, unknown] | undefined) {
  const { createServer } = await import("node:http");
  const server = createServer((request, response) => {
    const [status, body] = answers(
      request.method ?? "GET",
      (request.url ?? "").split("?")[0] ?? "",
    ) ?? [404, { detail: "no such route" }];
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { address, close: () => new Promise((done) => server.close(done)) };
}

const tenantRoutes =
  (
    extra: (method: string, path: string) => [number, unknown] | undefined,
    workspaceType = "production",
  ) =>
  (method: string, path: string): [number, unknown] | undefined => {
    if (path === "/api/v1/tenants")
      return [200, { items: [{ id: "t1", slug: "acme", name: "Acme" }] }];
    if (path === "/api/v1/tenants/t1/workspaces")
      return [200, { items: [{ id: "w1", slug: "main", type: workspaceType }] }];
    return extra(method, path);
  };

test("an unexpected reply is one line, and the trace comes with VOLVEL_DEBUG (CLI-07)", async () => {
  const instance = await standIn((_method, path) =>
    path === "/api/v1/me" ? [200, {}] : undefined,
  );
  try {
    const env = { VOLVEL_URL: instance.address, VOLVEL_TOKEN: "k" };
    const plain = await cli(["whoami"], env);
    expect(plain.code).toBe(1);
    expect(plain.err.split("\n")).toHaveLength(1);
    expect(plain.err).not.toContain("    at ");
    const debug = await cli(["whoami"], { ...env, VOLVEL_DEBUG: "1" });
    expect(debug.code).toBe(1);
    expect(debug.err.split("\n").length).toBeGreaterThan(0);
  } finally {
    await instance.close();
  }
});

test("a record of the last pull that is not JSON is explained (CLI-07)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pulled-"));
  try {
    await mkdir(join(dir, ".platform"), { recursive: true });
    await writeFile(join(dir, ".platform", "pulled.json"), "{not json");
    const { readPulled } = await import("./pull.js");
    await expect(readPulled(dir)).rejects.toThrow("is not valid JSON");
    await expect(readPulled(dir)).rejects.toBeInstanceOf((await import("./errors.js")).CliError);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("--version and <command> --help answer, and name no other command (CLI-08)", async () => {
  const version = await cli(["--version"]);
  expect(version).toMatchObject({ code: 0, out: expect.stringMatching(/^volvel \d+\.\d+\.\d+/) });
  const help = await cli(["build", "--help"]);
  expect(help.code).toBe(0);
  expect(help.out).toContain("build");
  expect(help.out).not.toContain("promote");
  expect((await cli(["tenant", "-h"])).out).toContain("tenant export");
});

test("a port that is not a whole number from 1 to 65535 is refused before anything else (CLI-09)", async () => {
  for (const port of ["abc", "0", "70000", "80.5"]) {
    const result = await cli(["dev", "--port", port], {
      VOLVEL_URL: "http://127.0.0.1:1",
      VOLVEL_TOKEN: "k",
    });
    expect(result.code).toBe(1);
    expect(result.err).toContain("--port is a whole number from 1 to 65535");
  }
  expect(
    (await cli(["runs", "cancel", "--older-than", "x"], { VOLVEL_URL: url, VOLVEL_TOKEN: token }))
      .err,
  ).toContain("--older-than is a whole number");
});

const breakingRoutes = (promotions: unknown) =>
  tenantRoutes((method, path) => {
    if (path === "/api/v1/tenants/t1/workspaces/w1/promotion-preview")
      return [
        200,
        {
          target: { slug: "live", type: "production" },
          bundle: { digest: "abcdef0123456789", version: 4 },
          possible: true,
          summary: {
            created: 0,
            updated: 1,
            deleted: 0,
            unchanged: 2,
            breaking: [{ path: "orders/place", message: "orders/place no longer answers." }],
          },
        },
      ];
    if (method === "POST" && path === "/api/v1/tenants/t1/workspaces/w1/promotions")
      return [201, promotions];
    return undefined;
  }, "dev");

test("promote --preview says breaking changes need --confirm-breaking, and exits 4 (CLI-10, D49)", async () => {
  const instance = await standIn(breakingRoutes({}));
  try {
    const env = { VOLVEL_URL: instance.address, VOLVEL_TOKEN: "k" };
    const target = ["--tenant", "acme", "--workspace", "main"];
    const preview = await cli(["promote", ...target, "--preview"], env);
    expect(preview.code).toBe(4);
    expect(preview.err).toContain("--confirm-breaking");
    expect(preview.out).toContain("Breaking: orders/place no longer answers.");
    expect(preview.out).not.toContain("Run it again without --preview to promote");
    const confirmed = await cli(["promote", ...target, "--preview", "--confirm-breaking"], env);
    expect(confirmed.code).toBe(0);
  } finally {
    await instance.close();
  }
});

test("rollback names the version it put back and the one it made, when they differ", async () => {
  const instance = await standIn(
    tenantRoutes((method, path) => {
      if (path === "/api/v1/tenants/t1/workspaces/w1/bundles")
        return [
          200,
          {
            items: [
              { id: "b5", version: 5, active: true },
              { id: "b3", version: 3, active: false },
            ],
          },
        ];
      if (method === "POST" && path === "/api/v1/tenants/t1/workspaces/w1/deployments")
        return [
          201,
          { bundleVersion: 6, summary: { created: 0, updated: 1, deleted: 0, unchanged: 2 } },
        ];
      return undefined;
    }, "dev"),
  );
  try {
    const env = { VOLVEL_URL: instance.address, VOLVEL_TOKEN: "k" };
    const target = ["--tenant", "acme", "--workspace", "main"];
    const said = await cli(["rollback", "3", ...target], env);
    expect(said.code, said.err).toBe(0);
    expect(said.out).toContain("runs what version 3 had, as version 6");
    expect(said.out).not.toContain("runs version 6 again");
    const json = JSON.parse((await cli(["rollback", "3", ...target, "--json"], env)).out);
    expect(json).toMatchObject({ version: 6, restoredFrom: 3 });
  } finally {
    await instance.close();
  }
});

test("promote says why the instance refuses it, with or without --preview", async () => {
  const refused = await standIn(
    tenantRoutes((_method, path) => {
      if (path === "/api/v1/tenants/t1/workspaces/w1/promotion-preview")
        return [
          200,
          {
            target: { slug: "live", type: "production" },
            bundle: { digest: "abcdef0123456789", version: 4 },
            possible: false,
            refusal: {
              code: "validation_failed",
              detail: "Nothing is deployed to promote.",
              errors: [{ path: "/", message: "Deploy the workspace first." }],
            },
            summary: null,
          },
        ];
      return undefined;
    }, "dev"),
  );
  try {
    const env = { VOLVEL_URL: refused.address, VOLVEL_TOKEN: "k" };
    for (const extra of [[], ["--preview"]]) {
      const result = await cli(
        ["promote", "--tenant", "acme", "--workspace", "main", ...extra],
        env,
      );
      expect(result.code).toBe(1);
      expect(result.err).not.toContain("Unexpected");
      expect(result.err).toContain("It cannot be promoted. Nothing is deployed to promote.");
      expect(result.err).toContain("Deploy the workspace first.");
    }
  } finally {
    await refused.close();
  }
});

test("promote shows a failed release push as a warning and a done one as the branch (CLI-11, D49)", async () => {
  const summary = { created: 0, updated: 1, deleted: 0, unchanged: 2 };
  const target = ["--tenant", "acme", "--workspace", "main", "--confirm-breaking"];
  const failed = await standIn(
    breakingRoutes({
      bundleVersion: 4,
      summary,
      release: {
        status: "failed",
        branch: "release/live",
        problem: "The remote refused the push.",
      },
    }),
  );
  try {
    const result = await cli(["promote", ...target], {
      VOLVEL_URL: failed.address,
      VOLVEL_TOKEN: "k",
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain("Promoted to live (production) as version 4");
    expect(result.err).toContain("The remote refused the push.");
  } finally {
    await failed.close();
  }
  const done = await standIn(
    breakingRoutes({
      bundleVersion: 4,
      summary,
      release: { status: "done", branch: "release/live" },
    }),
  );
  try {
    const result = await cli(["promote", ...target], {
      VOLVEL_URL: done.address,
      VOLVEL_TOKEN: "k",
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain("release/live");
    expect(result.err).toBe("");
  } finally {
    await done.close();
  }
});

test("pull refuses a volvel.yaml that build refuses, before asking the instance (CLI-12)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pull-config-"));
  try {
    await writeFile(join(dir, "volvel.yaml"), "roots: 5\n");
    const result = await cli(["pull", "--dir", dir, "--tenant", "acme", "--workspace", "main"], {
      VOLVEL_URL: url,
      VOLVEL_TOKEN: token,
    });
    expect(result.code).toBe(1);
    expect(result.err).toContain("volvel.yaml");
    expect(result.err).toContain("The build failed");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("init says how to install the CLI and sign in, and writes a tsconfig (CLI-14)", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "init-")), "repo");
  try {
    const created = await cli(["init", dir]);
    expect(created.out).toContain("npm install --global @volvel/cli");
    expect(created.out).toContain("volvel login --url");
    expect(JSON.parse(await readFile(join(dir, "tsconfig.json"), "utf8")).include).toEqual([
      "src",
      ".platform/*.d.ts",
    ]);
  } finally {
    await rm(join(dir, ".."), { recursive: true });
  }
});

test("instance triggers pause and resume, and show where they stand (INS-MP10)", async () => {
  await cli(["login", "--url", url, "--token", token]);
  expect((await cli(["instance", "triggers"])).out).toContain("Triggers are running.");
  const paused = await cli(["instance", "triggers", "pause", "--reason", "database move"]);
  expect(paused).toMatchObject({ code: 0, out: expect.stringContaining("paused") });
  const shown = await cli(["instance", "triggers"]);
  expect(shown.out).toContain("Every trigger is paused");
  expect(shown.out).toContain("database move");
  expect((await t.admin.get("/instance/triggers")).body).toMatchObject({ paused: true });
  expect((await cli(["instance", "triggers", "resume"])).out).toContain("running again");
  expect((await t.admin.get("/instance/triggers")).body).toMatchObject({ paused: false });
  expect((await cli(["instance", "triggers", "stop"])).err).toContain("pause|resume");
  expect((await cli(["instance", "--help"])).out).toContain("instance triggers");
});

test("status says when the database takes no writes (INS-MP5)", async () => {
  const { createServer } = await import("node:http");
  const stub = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      request.url?.endsWith("/readyz")
        ? JSON.stringify({
            status: "ready",
            checks: { database: { ok: true, readOnly: true }, objectStore: { ok: true } },
          })
        : JSON.stringify({ coreVersion: "1.2.3", migrationLevel: 5 }),
    );
  });
  await new Promise<void>((done) => stub.listen(0, "127.0.0.1", done));
  const { port } = stub.address() as { port: number };
  try {
    const result = await cli(["status"], { VOLVEL_URL: `http://127.0.0.1:${port}` });
    expect(result.out).toContain("Ready");
    expect(result.out).toContain("Read only: the database takes no writes");
  } finally {
    stub.close();
  }
});

test("an instance from before page types refuses the key by name, and the CLI says the instance may be older", () => {
  const older = refusal(
    {
      status: 422,
      body: {
        detail: "The bundle was refused.",
        errors: [
          { message: 'handbook/how/refund (doc): There is no "type" here. It can have: title.' },
        ],
      },
    },
    "deploy",
  );
  expect(older.message).toContain("the instance may be older than this CLI");
  expect(older.message).toContain('There is no "type" here');
  // A changelog entry's date is as new as types are.
  const dated = refusal(
    {
      status: 422,
      body: {
        detail: "The bundle was refused.",
        errors: [
          { message: 'handbook/changelog/a (doc): There is no "date" here. It can have: title.' },
        ],
      },
    },
    "deploy",
  );
  expect(dated.message).toContain("the instance may be older than this CLI");
  // The advice names the key the instance refused.
  expect(dated.message).toMatch(/take type, subjects, moved_from and date out/);
  const other = refusal(
    {
      status: 422,
      body: { detail: "No.", errors: [{ message: "a (doc): The link leads nowhere." }] },
    },
    "deploy",
  );
  expect(other.message).not.toContain("older");
});
