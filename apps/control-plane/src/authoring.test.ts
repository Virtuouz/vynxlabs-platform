import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client; // tenant admin
let carol: Client; // workspace admin in dev: may change resources, not write code
let worker: Worker;
let working: Promise<unknown>;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;
const scriptBody = (code: string, extra: Record<string, unknown> = {}) => ({
  description: "Written in the console.",
  input: { type: "object" },
  output: { type: "object" },
  timeoutSeconds: 30,
  retries: { limit: 0, delaySeconds: 0, backoff: false },
  uses: { connections: [], secrets: [], variables: [] },
  source: { language: "typescript", code },
  ...extra,
});
const draft = (path: string, body: Record<string, unknown>, kind = "script", as = alice) =>
  as.put(`${ws()}/drafts/${path}`, { kind, schemaVersion: 1, body });

// A bundle as a CLI that predates console-managed resources would build it.
function fromRepository(version: number): Bundle {
  const manifest: BundleManifest = {
    kind: "script",
    schemaVersion: 1,
    path: "repo/greet",
    ownership: "code",
    body: {
      entry: "greet",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
    },
  };
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.4.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [manifest],
    code: `export const greet = { execute: async () => ({ from: "repository", version: ${version} }) };\n`,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

// biome-ignore lint/suspicious/noExplicitAny: run bodies are inspected freely
async function finished(id: string, base = ws()): Promise<any> {
  for (let i = 0; i < 150; i++) {
    const run = (await alice.get(`${base}/runs/${id}`)).body;
    if (!["queued", "running"].includes(run.status)) return run;
    await sleep(100);
  }
  throw new Error(`Run ${id} did not finish.`);
}
async function run(script: string, input: unknown = {}, base = ws()) {
  const started = await alice.post(`${base}/runs`, { script, input });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  return finished(started.body.id, base);
}
const resources = async (base = ws()) =>
  Object.fromEntries(
    (
      (await alice.get(`${base}/resources?limit=200`)).body.items as {
        path: string;
        ownership: string;
      }[]
    ).map((resource) => [resource.path, resource.ownership]),
  );

beforeAll(async () => {
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
  const member = async (email: string) =>
    (await t.admin.post(`/tenants/${tenant}/members`, { email, name: email, password: PASSWORD }))
      .body.id as string;
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: await member("alice@acme.example"),
    roleId: roles.tenant_admin,
  });
  const carolId = await member("carol@acme.example");
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
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: dev,
    principalType: "member",
    principalId: carolId,
    roleId: roles.workspace_admin,
  });
  carol = await t.signIn("carol@acme.example", PASSWORD);

  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "test" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await t.stop();
});

describe("drafts", () => {
  test("a save is a draft: checked, kept, and changing nothing that runs", async () => {
    const saved = await draft(
      "orders/hello",
      scriptBody("export default async (input: { name: string }) => ({ hello: input.name });\n"),
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({
      path: "orders/hello",
      kind: "script",
      change: "create",
      revision: 1,
      deleted: false,
    });
    // The export it will have in the bundle is worked out from the path, never typed.
    expect(saved.body.body.entry).toBe("ui_script_orders_shello");
    expect(await resources()).toEqual({});
    expect((await alice.post(`${ws()}/runs`, { script: "orders/hello" })).status).toBe(404);

    const listed = await alice.get(`${ws()}/drafts`);
    expect(listed.body.items.map((item: { path: string }) => item.path)).toEqual(["orders/hello"]);
    expect((await alice.get(`${ws()}/drafts/orders/hello`)).body.body.source.code).toContain(
      "hello: input.name",
    );
  });

  test("a draft that is not valid is refused, naming what is wrong", async () => {
    const noSource = await draft("orders/empty", { ...scriptBody(""), source: undefined });
    expect(noSource.status).toBe(400);
    expect(noSource.body.errors[0].path).toBe("/body/source");
    const badBody = await draft(
      "orders/bad",
      scriptBody("export default async () => 1;\n", { timeoutSeconds: 0 }),
    );
    expect(badBody.status).toBe(400);
    expect(JSON.stringify(badBody.body.errors)).toContain("timeoutSeconds");
    expect((await draft("Orders/Bad", scriptBody("export default async () => 1;\n"))).status).toBe(
      400,
    );
  });

  test("two people saving one draft find out, and a draft can be discarded", async () => {
    const body = scriptBody("export default async () => ({ n: 1 });\n");
    const first = await alice.put(`${ws()}/drafts/orders/shared`, {
      kind: "script",
      schemaVersion: 1,
      body,
    });
    expect(first.body.revision).toBe(1);
    const second = await alice.put(`${ws()}/drafts/orders/shared`, {
      kind: "script",
      schemaVersion: 1,
      body,
      revision: 1,
    });
    expect(second.body.revision).toBe(2);
    const stale = await alice.put(`${ws()}/drafts/orders/shared`, {
      kind: "script",
      schemaVersion: 1,
      body,
      revision: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("draft_changed");
    expect((await alice.delete(`${ws()}/drafts/orders/shared`)).status).toBe(204);
    expect((await alice.get(`${ws()}/drafts/orders/shared`)).status).toBe(404);
    expect((await alice.delete(`${ws()}/drafts/orders/shared`)).status).toBe(404);
  });

  test("a production workspace has no drafts", async () => {
    const refused = await alice.put(`${ws(prod)}/drafts/orders/hello`, {
      kind: "script",
      schemaVersion: 1,
      body: scriptBody("export default async () => 1;\n"),
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("production_workspace");
  });

  test("writing code needs its own permission, and the tenant's switch", async () => {
    const body = scriptBody("export default async () => 1;\n");
    // A workspace admin may change resources, and still may not write code.
    const variable = await draft("orders/size", { default: "5" }, "variable", carol);
    expect(variable.status, JSON.stringify(variable.body)).toBe(200);
    expect((await draft("orders/sneaky", body, "script", carol)).status).toBe(403);
    expect((await carol.post(`${ws()}/test-runs`, { script: "orders/hello" })).status).toBe(403);
    // Deploying a draft with code in it is writing code too.
    expect((await carol.post(`${ws()}/changes/deploy`, {})).status).toBe(403);
    expect((await carol.post(`${ws()}/changes/deploy`, { paths: ["orders/size"] })).status).toBe(
      201,
    );

    await t.db
      .updateTable("tenant")
      .set({ console_code: false })
      .where("id", "=", tenant)
      .execute();
    const off = await draft("orders/later", body);
    expect(off.status).toBe(403);
    expect(off.body.code).toBe("console_code_off");
    await t.db.updateTable("tenant").set({ console_code: true }).where("id", "=", tenant).execute();
  });
});

describe("trying a draft out", () => {
  test("a test run runs the draft on a worker and deploys nothing", async () => {
    const started = await alice.post(`${ws()}/test-runs`, {
      script: "orders/hello",
      input: { name: "ada" },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const done = await finished(started.body.runId);
    expect(done.status, JSON.stringify(done.error)).toBe("succeeded");
    expect(done.output).toEqual({ hello: "ada" });
    expect(done.trigger).toMatchObject({ type: "manual", draft: true });
    expect(Object.keys(await resources())).toEqual(["orders/size"]);
    expect((await alice.get(`${ws()}/drafts/orders/hello`)).status).toBe(200);
  });

  test("code that does not build says where", async () => {
    await draft("orders/broken", scriptBody("export default async () => {\n  return (;\n};\n"));
    const preview = await alice.get(`${ws()}/changes/preview`);
    expect(preview.body.possible).toBe(false);
    expect(preview.body.refusal.errors).toEqual([
      { path: "orders/broken.script.ts:2", message: expect.any(String) },
    ]);
    const deployed = await alice.post(`${ws()}/changes/deploy`, {});
    expect(deployed.status).toBe(400);
    await draft(
      "orders/reads",
      scriptBody('import x from "/etc/passwd";\nexport default async () => x;\n'),
    );
    expect(
      (await alice.get(`${ws()}/changes/preview?paths=orders/reads`)).body.refusal.errors[0]
        .message,
    ).toContain("may import only @vynxlabs/sdk and node: modules");
    await alice.delete(`${ws()}/drafts/orders/broken`);
    await alice.delete(`${ws()}/drafts/orders/reads`);
  });
});

describe("deploying drafts", () => {
  test("a preview says what a deploy would do, and does none of it", async () => {
    const preview = await alice.get(`${ws()}/changes/preview`);
    expect(preview.body).toMatchObject({
      possible: true,
      refusal: null,
      summary: {
        created: 1,
        changes: [{ change: "created", kind: "script", path: "orders/hello" }],
      },
    });
    expect(Object.keys(await resources())).toEqual(["orders/size"]);
    expect((await alice.get(`${ws()}/drafts`)).body.items).toHaveLength(1);
  });

  test("a deploy makes the drafts live as console-managed resources, and clears them", async () => {
    const deployed = await alice.post(`${ws()}/changes/deploy`, { message: "Say hello" });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.applied).toEqual(["orders/hello"]);
    expect(await resources()).toEqual({ "orders/hello": "ui", "orders/size": "ui" });
    expect((await alice.get(`${ws()}/drafts`)).body.items).toEqual([]);
    expect((await run("orders/hello", { name: "grace" })).output).toEqual({ hello: "grace" });

    const row = await t.db
      .selectFrom("deployment")
      .innerJoin("bundle", "bundle.id", "deployment.bundle_id")
      .select(["deployment.message", "bundle.origin"])
      .where("deployment.id", "=", deployed.body.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ message: "Say hello", origin: "compose" });
    // Nothing left to deploy is said, not done.
    expect((await alice.post(`${ws()}/changes/deploy`, {})).body.code).toBe("nothing_to_deploy");
  });

  test("an existing resource is changed by a draft, and removed by one", async () => {
    await draft("orders/hello", scriptBody("export default async () => ({ hello: 'changed' });\n"));
    expect((await alice.get(`${ws()}/drafts/orders/hello`)).body.change).toBe("update");
    // Until it is deployed, what runs is what was deployed.
    expect((await run("orders/hello", { name: "x" })).output).toEqual({ hello: "x" });
    await alice.post(`${ws()}/changes/deploy`, {});
    expect((await run("orders/hello")).output).toEqual({ hello: "changed" });

    const removal = await alice.put(`${ws()}/drafts/orders/size`, {
      kind: "variable",
      schemaVersion: 1,
      body: {},
      deleted: true,
    });
    expect(removal.body.change).toBe("delete");
    const gone = await alice.post(`${ws()}/changes/deploy`, {});
    expect(gone.body.summary).toMatchObject({ deleted: 1 });
    expect(await resources()).toEqual({ "orders/hello": "ui" });
  });

  test("a bundle from a CLI that knows nothing of console-managed resources keeps them", async () => {
    const uploaded = await alice.post(`${ws()}/bundles`, fromRepository(1));
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    // What was deployed is a composite of the upload and the console's resources.
    expect(deployed.body.bundleId).not.toBe(uploaded.body.id);
    expect(await resources()).toEqual({ "orders/hello": "ui", "repo/greet": "code" });
    expect((await run("repo/greet")).output).toEqual({ from: "repository", version: 1 });
    expect((await run("orders/hello")).output).toEqual({ hello: "changed" });

    // And the other way: a console deploy leaves the repository's code as it is.
    await draft("orders/second", scriptBody("export default async () => ({ second: true });\n"));
    await alice.post(`${ws()}/changes/deploy`, {});
    expect((await run("repo/greet")).output).toEqual({ from: "repository", version: 1 });
    expect((await run("orders/second")).output).toEqual({ second: true });
  });

  test("a resource from the repository is taken over by a draft at its path", async () => {
    const taken = await draft(
      "repo/greet",
      scriptBody("export default async () => ({ from: 'console' });\n"),
    );
    expect(taken.body.change).toBe("take_over");
    await alice.post(`${ws()}/changes/deploy`, {});
    expect((await resources())["repo/greet"]).toBe("ui");
    expect((await run("repo/greet")).output).toEqual({ from: "console" });
    // A resource of the repository's is not removed from the console.
    const upload = await alice.post(`${ws()}/bundles`, fromRepository(2));
    await alice.post(`${ws()}/deployments`, { bundleId: upload.body.id });
    // The repository defines the path again, so it is the repository's again.
    expect((await resources())["repo/greet"]).toBe("code");
    expect((await run("repo/greet")).output).toEqual({ from: "repository", version: 2 });
  });

  test("rolling back and promoting carry console-managed resources like any other", async () => {
    const deployments = (await alice.get(`${ws()}/deployments?limit=50`)).body.items as {
      bundleId: string;
    }[];
    // Promote what is live: production gets the same bundle, console-managed resources included.
    const promoted = await alice.post(`${ws()}/promotions`);
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(201);
    expect(await resources(ws(prod))).toEqual(await resources());
    expect((await run("orders/second", {}, ws(prod))).output).toEqual({ second: true });

    // Roll dev back to the bundle before `orders/second` existed: it goes, as code would.
    const earlier = deployments.at(-4)?.bundleId as string;
    const rolled = await alice.post(`${ws()}/deployments`, { bundleId: earlier });
    expect(rolled.status, JSON.stringify(rolled.body)).toBe(201);
    const after = await resources();
    expect(after["orders/second"]).toBeUndefined();
    expect(after["orders/hello"]).toBe("ui");
  });
});

describe("flows drawn in the console", () => {
  test("a flow is a draft like any other, carries where its steps sit, and needs no permission to write code", async () => {
    const body = {
      description: "Says hello.",
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        hello: { type: "script", script: "orders/hello", input: "{'name': 'flow'}" },
      },
      edges: [{ from: "start", to: "hello" }],
      layout: { start: { x: 0, y: 0 }, hello: { x: 280, y: 40 } },
    };
    const saved = await draft("orders/greet", body, "flow", carol);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // A flow that names a script that is not there is refused when it is deployed, by name.
    await draft(
      "orders/broken-flow",
      { ...body, nodes: { ...body.nodes, hello: { type: "script", script: "nope" } } },
      "flow",
    );
    const preview = await alice.get(`${ws()}/changes/preview`);
    expect(preview.body.possible).toBe(false);
    expect(JSON.stringify(preview.body.refusal.errors)).toContain("nope");
    await alice.delete(`${ws()}/drafts/orders/broken-flow`);

    const deployed = await carol.post(`${ws()}/changes/deploy`, { paths: ["orders/greet"] });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const flow = (await alice.get(`${ws()}/flows/orders/greet`)).body;
    expect(flow.layout).toEqual(body.layout);
    expect(Object.keys(flow.nodes).sort()).toEqual(["hello", "start"]);
    // The bundle, which is what is written to a repository, keeps the steps in their author's order.
    const stored = await t.db
      .selectFrom("bundle")
      .select("storage_key")
      .where("id", "=", deployed.body.bundleId)
      .executeTakeFirstOrThrow();
    const bundle = JSON.parse(
      (await t.kernel.storage.get(stored.storage_key)).toString("utf8"),
    ) as {
      manifests: { path: string; body: { nodes: object } }[];
    };
    expect(
      Object.keys(bundle.manifests.find((one) => one.path === "orders/greet")?.body.nodes ?? {}),
    ).toEqual(["start", "hello"]);

    const started = await alice.post(`${ws()}/flow-runs`, { flow: "orders/greet", input: {} });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    let run: { status: string; steps: { node: string; output: unknown }[] } | undefined;
    for (let i = 0; i < 150; i++) {
      run = (await alice.get(`${ws()}/flow-runs/${started.body.id}`)).body;
      if (run?.status !== "running") break;
      await sleep(100);
    }
    expect(run?.status).toBe("succeeded");
    expect(run?.steps.find((step) => step.node === "hello")?.output).toEqual({ hello: "changed" });
  });
});

describe("the write path", () => {
  test("every change left an audit entry, and every authoring route was used", () => {
    expect(t.unaudited).toEqual([]);
    expect(t.unexercised((route) => /\/(drafts|changes|test-runs)(\/|$)/.test(route))).toEqual([]);
  });

  test("the audit log says a draft was saved, and never holds its source", async () => {
    const entries = (await alice.get(`/tenants/${tenant}/audit?limit=200&area=resource`)).body
      .items as { action: string; details: Record<string, unknown> }[];
    const saved = entries.filter((entry) => entry.action === "resource.draft_saved");
    expect(saved.length).toBeGreaterThan(3);
    expect(JSON.stringify(saved)).not.toContain("export default");
    expect(entries.some((entry) => entry.action === "resource.draft_discarded")).toBe(true);
  });
});
