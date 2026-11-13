import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const TOKEN = "tok-git-9f31c2aa-secret";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client;
let scratch: string;
let remote: Server;
let repoUrl: string;
/** A developer's clone of the repository, used to change it from the other side. */
let clone: string;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;
const sh = (args: string[], cwd: string) =>
  execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
const bare = () => join(scratch, "repo.git");
const scriptBody = (code: string) => ({
  description: "Written in the console.",
  input: { type: "object" },
  output: { type: "object" },
  timeoutSeconds: 30,
  retries: { limit: 0, delaySeconds: 0, backoff: false },
  uses: { connections: [], secrets: [], variables: [] },
  source: { language: "typescript", code },
});
async function deployDraft(path: string, code: string, message?: string) {
  const saved = await alice.put(`${ws()}/drafts/${path}`, {
    kind: "script",
    schemaVersion: 1,
    body: scriptBody(code),
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const deployed = await alice.post(`${ws()}/changes/deploy`, message ? { message } : {});
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
}
const state = async () => (await alice.get(`${ws()}/git`)).body.state as string;
const sourceOf = async (path: string) =>
  ((await alice.get(`${ws()}/resources/${path}`)).body.body.source as { code: string }).code;
/** Fetches the workspace's branch into the developer's clone and checks it out. */
function checkout(branch = "vx/dev") {
  sh(["fetch", "-q", "origin", branch], clone);
  sh(["checkout", "-q", "-B", "work", "FETCH_HEAD"], clone);
}
/** Changes files on the branch as a developer would, and pushes. */
function commitOnBranch(files: Record<string, string | null>, message: string) {
  checkout();
  for (const [path, content] of Object.entries(files)) {
    const file = join(clone, path);
    if (content === null) rmSync(file);
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  }
  sh(["add", "-A"], clone);
  sh(
    ["-c", "user.name=Dev", "-c", "user.email=dev@acme.example", "commit", "-q", "-m", message],
    clone,
  );
  sh(["push", "-q", "origin", "work:vx/dev"], clone);
}

beforeAll(async () => {
  // A repository served over HTTP by git's own backend, behind a token.
  scratch = mkdtempSync(join(tmpdir(), "vx-git-test-"));
  sh(["init", "-q", "--bare", "-b", "main", "repo.git"], scratch);
  sh(["config", "http.receivepack", "true"], bare());
  const seed = join(scratch, "seed");
  mkdirSync(join(seed, "src"), { recursive: true });
  sh(["init", "-q", "-b", "main"], seed);
  writeFileSync(join(seed, "src/index.ts"), "export {};\n");
  writeFileSync(join(seed, "README.md"), "# Acme\n");
  sh(["add", "."], seed);
  sh(
    ["-c", "user.name=Seed", "-c", "user.email=seed@acme.example", "commit", "-q", "-m", "Start"],
    seed,
  );
  sh(["push", "-q", bare(), "main"], seed);

  const expected = `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`;
  remote = createServer((request, response) => {
    if (request.headers.authorization !== expected) {
      response.writeHead(401, { "www-authenticate": "Basic" }).end();
      return;
    }
    const [path = "", query = ""] = (request.url ?? "").split("?");
    const cgi = spawn("git", ["http-backend"], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: scratch,
        GIT_HTTP_EXPORT_ALL: "1",
        PATH_INFO: path,
        QUERY_STRING: query,
        REQUEST_METHOD: request.method ?? "GET",
        CONTENT_TYPE: request.headers["content-type"] ?? "",
        HTTP_CONTENT_ENCODING: request.headers["content-encoding"] ?? "",
        REMOTE_USER: "token",
      },
    });
    request.pipe(cgi.stdin);
    let pending = Buffer.alloc(0);
    let headed = false;
    cgi.stdout.on("data", (chunk: Buffer) => {
      if (headed) return void response.write(chunk);
      pending = Buffer.concat([pending, chunk]);
      const end = pending.indexOf("\r\n\r\n");
      if (end < 0) return;
      let status = 200;
      const headers: Record<string, string> = {};
      for (const line of pending.subarray(0, end).toString().split("\r\n")) {
        const [name = "", ...value] = line.split(": ");
        if (name.toLowerCase() === "status") status = Number(value.join(": ").split(" ")[0]);
        else headers[name] = value.join(": ");
      }
      response.writeHead(status, headers);
      response.write(pending.subarray(end + 4));
      headed = true;
    });
    cgi.stdout.on("end", () => response.end());
  });
  await new Promise<void>((resolve) => remote.listen(0, "127.0.0.1", resolve));
  repoUrl = `http://127.0.0.1:${(remote.address() as AddressInfo).port}/repo.git`;
  clone = join(scratch, "clone");
  sh(["clone", "-q", bare(), "clone"], scratch);

  t = await startTestApp({ version: "0.4.0" });
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
    name: "Alice Admin",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
      linkedWorkspaceId: prod,
    })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t.stop();
  await new Promise((resolve) => remote.close(resolve));
  rmSync(scratch, { recursive: true, force: true });
});

describe("connecting a repository", () => {
  test("it is reached before it is saved, and the token is never given back", async () => {
    const wrong = await alice.put(`/tenants/${tenant}/git-repository`, {
      url: repoUrl,
      token: "nope",
    });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe("repository_unreachable");
    expect(wrong.body.detail).toContain("refused the access token");
    expect((await alice.get(`/tenants/${tenant}/git-repository`)).body.repository).toBeNull();

    const insecure = await alice.put(`/tenants/${tenant}/git-repository`, {
      url: "http://example.com/acme/repo.git",
      token: TOKEN,
    });
    expect(insecure.status).toBe(400);
    const withUser = await alice.put(`/tenants/${tenant}/git-repository`, {
      url: "https://user:pass@example.com/acme/repo.git",
      token: TOKEN,
    });
    expect(withUser.status).toBe(400);

    const saved = await alice.put(`/tenants/${tenant}/git-repository`, {
      url: repoUrl,
      token: TOKEN,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toEqual({
      url: repoUrl,
      defaultBranch: "main",
      folder: "platform",
      paused: false,
    });
    expect(
      JSON.stringify((await alice.get(`/tenants/${tenant}/git-repository`)).body),
    ).not.toContain(TOKEN);
    // Stored encrypted, and kept when the repository is saved again without one.
    const row = await t.db
      .selectFrom("git_repository")
      .select("credential")
      .executeTakeFirstOrThrow();
    expect(row.credential.toString("utf8")).not.toContain(TOKEN);
    const again = await alice.put(`/tenants/${tenant}/git-repository`, { url: repoUrl });
    expect(again.status).toBe(200);
  });

  test("a dev workspace follows a branch of its own, never the default one", async () => {
    expect((await alice.put(`${ws()}/git`, { branch: "main" })).status).toBe(409);
    expect((await alice.put(`${ws()}/git`, { branch: "bad..name" })).status).toBe(400);
    const refused = await alice.put(`${ws(prod)}/git`, { branch: "vx/prod" });
    expect(refused.body.code).toBe("production_workspace");
    const followed = await alice.put(`${ws()}/git`, { branch: "vx/dev" });
    expect(followed.body).toMatchObject({ branch: "vx/dev", state: "never", syncedCommit: null });
  });
});

describe("pushing", () => {
  test("a deploy leaves the workspace ahead, and a push commits it as the person who asked", async () => {
    await deployDraft("orders/hello", "export default async () => ({ hello: 1 });\n", "Say hello");
    expect(await state()).toBe("ahead");
    const pushed = await alice.post(`${ws()}/git/push`, { message: "Say hello" });
    expect(pushed.body).toMatchObject({ status: "done", state: "synced" });
    expect(sh(["log", "--format=%an <%ae>|%cn|%s", "vx/dev", "-1"], bare())).toBe(
      "Alice Admin <alice@acme.example>|Platform|Say hello",
    );
    expect(sh(["rev-parse", "vx/dev"], bare())).toBe(pushed.body.commit);
    // The branch started from the default branch, and only the folder was written.
    expect(sh(["ls-tree", "-r", "--name-only", "vx/dev"], bare()).split("\n")).toEqual([
      "README.md",
      "platform/orders/hello.script.ts",
      "platform/orders/hello.script.yaml",
      "src/index.ts",
    ]);
    expect(sh(["show", "vx/dev:platform/orders/hello.script.ts"], bare())).toBe(
      "export default async () => ({ hello: 1 });",
    );
    expect(sh(["rev-parse", "main"], bare())).toBe(sh(["rev-parse", "vx/dev~1"], bare()));
    expect((await alice.get(`${ws()}/git`)).body.syncedCommit).toBe(pushed.body.commit);
  });

  test("pushing with nothing new says so and writes nothing", async () => {
    const before = sh(["rev-parse", "vx/dev"], bare());
    expect((await alice.post(`${ws()}/git/push`, {})).body).toMatchObject({ status: "nothing" });
    expect(sh(["rev-parse", "vx/dev"], bare())).toBe(before);
  });

  test("a change outside the folder on the branch does not get in the way", async () => {
    commitOnBranch({ "src/index.ts": "export const changed = true;\n" }, "Code change");
    await deployDraft("orders/hello", "export default async () => ({ hello: 2 });\n");
    const pushed = await alice.post(`${ws()}/git/push`, { message: "Second" });
    expect(pushed.body.status).toBe("done");
    expect(sh(["show", "vx/dev:src/index.ts"], bare())).toBe("export const changed = true;");
    expect(sh(["show", "vx/dev:platform/orders/hello.script.ts"], bare())).toContain("hello: 2");
  });

  test("a change inside the folder on the branch refuses the push until it is pulled", async () => {
    commitOnBranch(
      {
        "platform/orders/hello.script.ts":
          "export default async () => ({ hello: 'from the editor' });\n",
      },
      "Edit in an editor",
    );
    await deployDraft("orders/other", "export default async () => ({ other: true });\n");
    const refused = await alice.post(`${ws()}/git/push`, {});
    expect(refused.body).toMatchObject({
      status: "refused",
      state: "behind",
      changedOnBranch: ["orders/hello.script.ts"],
    });
    expect(await state()).toBe("behind");
  });
});

describe("pulling", () => {
  test("what a developer changed on the branch is deployed, and what the workspace added is kept", async () => {
    const pulled = await alice.post(`${ws()}/git/pull`, {});
    expect(pulled.body, JSON.stringify(pulled.body)).toMatchObject({
      status: "done",
      applied: ["orders/hello.script"],
      conflicts: [],
      // The workspace still has `orders/other`, which the branch does not.
      state: "ahead",
    });
    expect(await sourceOf("orders/hello")).toContain("from the editor");
    expect(await sourceOf("orders/other")).toContain("other: true");
    const deployment = await t.db
      .selectFrom("deployment")
      .select("message")
      .where("workspace_id", "=", dev)
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(deployment.message).toMatch(/^Pulled [0-9a-f]{7} from vx\/dev$/);

    expect((await alice.post(`${ws()}/git/push`, { message: "Add other" })).body.status).toBe(
      "done",
    );
    expect(await state()).toBe("synced");
    expect(sh(["ls-tree", "-r", "--name-only", "vx/dev", "platform"], bare()).split("\n")).toEqual([
      "platform/orders/hello.script.ts",
      "platform/orders/hello.script.yaml",
      "platform/orders/other.script.ts",
      "platform/orders/other.script.yaml",
    ]);
  });

  test("a resource added and one removed on the branch are added and removed here", async () => {
    checkout();
    const yaml = readFileSync(join(clone, "platform/orders/other.script.yaml"), "utf8");
    commitOnBranch(
      {
        "platform/orders/third.script.yaml": yaml,
        "platform/orders/third.script.ts": "export default async () => ({ third: true });\n",
        "platform/orders/other.script.yaml": null,
        "platform/orders/other.script.ts": null,
      },
      "Add third, remove other",
    );
    const pulled = await alice.post(`${ws()}/git/pull`, {});
    expect(pulled.body).toMatchObject({ status: "done", state: "synced" });
    expect(pulled.body.applied.sort()).toEqual(["orders/other.script", "orders/third.script"]);
    expect(await sourceOf("orders/third")).toContain("third: true");
    expect((await alice.get(`${ws()}/resources/orders/other`)).status).toBe(404);
  });

  test("a resource changed on both sides is a conflict, settled one way or the other", async () => {
    commitOnBranch(
      { "platform/orders/hello.script.ts": "export default async () => ({ hello: 'theirs' });\n" },
      "Theirs",
    );
    await deployDraft("orders/hello", "export default async () => ({ hello: 'mine' });\n");
    const conflict = await alice.post(`${ws()}/git/pull`, {});
    expect(conflict.body).toMatchObject({
      status: "refused",
      state: "conflict",
      conflicts: ["orders/hello.script"],
      applied: [],
    });
    expect(await sourceOf("orders/hello")).toContain("mine");

    // Keeping mine deploys nothing, and the next push puts mine on the branch.
    const mine = await alice.post(`${ws()}/git/pull`, {
      resolutions: { "orders/hello.script": "mine" },
    });
    expect(mine.body).toMatchObject({ status: "nothing", state: "ahead", conflicts: [] });
    expect((await alice.post(`${ws()}/git/push`, { message: "Keep mine" })).body.status).toBe(
      "done",
    );
    expect(sh(["show", "vx/dev:platform/orders/hello.script.ts"], bare())).toContain("mine");

    // And the other way: taking theirs deploys the branch's version.
    commitOnBranch(
      {
        "platform/orders/hello.script.ts":
          "export default async () => ({ hello: 'theirs again' });\n",
      },
      "Theirs again",
    );
    await deployDraft("orders/hello", "export default async () => ({ hello: 'mine again' });\n");
    const theirs = await alice.post(`${ws()}/git/pull`, {
      resolutions: { "orders/hello.script": "theirs" },
    });
    expect(theirs.body).toMatchObject({ status: "done", state: "synced" });
    expect(await sourceOf("orders/hello")).toContain("theirs again");
  });

  test("files on the branch that cannot be deployed are refused, and the workspace is left as it was", async () => {
    commitOnBranch(
      {
        "platform/orders/hello.script.ts":
          'import x from "../../src/index.ts";\nexport default async () => x;\n',
      },
      "Import the repository's code",
    );
    const pulled = await alice.post(`${ws()}/git/pull`, {});
    expect(pulled.body.status).toBe("failed");
    expect(pulled.body.problem).toContain("may import only @vynxlabs/sdk and node: modules");
    expect(await sourceOf("orders/hello")).toContain("theirs again");
    expect((await alice.get(`${ws()}/git`)).body).toMatchObject({ state: "error" });
    // Put right on the branch, the next pull goes through.
    commitOnBranch(
      { "platform/orders/hello.script.ts": "export default async () => ({ hello: 'fixed' });\n" },
      "Fix",
    );
    expect((await alice.post(`${ws()}/git/pull`, {})).body.status).toBe("done");
    expect(await sourceOf("orders/hello")).toContain("fixed");
  });

  test("a folder holding far more than resources is not read in", async () => {
    const { PULL_LIMITS } = await import("./kernel/git.js");
    const before = { ...PULL_LIMITS };
    commitOnBranch(
      {
        "platform/notes/long.script.ts": `// ${"x".repeat(5000)}\nexport default async () => 1;\n`,
      },
      "A long file",
    );
    try {
      PULL_LIMITS.bytes = 2000;
      const pulled = await alice.post(`${ws()}/git/pull`, {});
      expect(pulled.body.status).toBe("failed");
      expect(pulled.body.problem).toContain("holds more than a pull takes in");
      expect((await alice.get(`${ws()}/git`)).body).toMatchObject({ state: "error" });
    } finally {
      Object.assign(PULL_LIMITS, before);
    }
    // Within the limit, the same branch is taken in.
    commitOnBranch({ "platform/notes/long.script.ts": null }, "Remove it");
    expect((await alice.post(`${ws()}/git/pull`, {})).body.status).toMatch(/done|nothing/);
  });
});

describe("safety", () => {
  test("a paused repository is not pushed to, until it is saved again", async () => {
    await t.db
      .updateTable("git_repository")
      .set({ paused: true })
      .where("tenant_id", "=", tenant)
      .execute();
    const refused = await alice.post(`${ws()}/git/push`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("git_paused");
    await alice.put(`/tenants/${tenant}/git-repository`, { url: repoUrl });
    expect((await alice.post(`${ws()}/git/push`, {})).status).toBe(200);
  });

  test("every push and pull is recorded, and the token is in none of it", async () => {
    const operations = (await alice.get(`${ws()}/git/operations`)).body.items as {
      kind: string;
      status: string;
    }[];
    expect(
      operations.filter((one) => one.kind === "push" && one.status === "done").length,
    ).toBeGreaterThan(3);
    expect(operations.some((one) => one.status === "refused")).toBe(true);
    const audit = (await alice.get(`/tenants/${tenant}/audit?limit=200`)).body.items as {
      action: string;
    }[];
    expect(audit.some((entry) => entry.action === "workspace_git.pushed")).toBe(true);
    expect(audit.some((entry) => entry.action === "workspace_git.pulled")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(TOKEN);
    expect(JSON.stringify(operations)).not.toContain(TOKEN);
  });

  test("disconnecting leaves the repository as it is", async () => {
    const before = sh(["rev-parse", "vx/dev"], bare());
    expect((await alice.delete(`/tenants/${tenant}/git-repository`)).status).toBe(204);
    expect((await alice.get(`${ws()}/git`)).body).toMatchObject({ repository: null, branch: null });
    expect((await alice.post(`${ws()}/git/push`, {})).body.code).toBe("no_repository");
    expect(sh(["rev-parse", "vx/dev"], bare())).toBe(before);
  });

  test("every change left an audit entry, and every git route was used", () => {
    expect(t.unaudited).toEqual([]);
    expect(t.unexercised((route) => /\/(git-repository|git)(\/|$)/.test(route))).toEqual([]);
  });
});
