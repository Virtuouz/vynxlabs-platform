import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { Worker } from "@volvel/worker";
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
// A save says which draft it saw: the helper reads the revision there is, as a client does.
const draft = async (path: string, body: Record<string, unknown>, kind = "script", as = alice) => {
  const seen = await as.get(`${ws()}/drafts/${path}`);
  return as.put(`${ws()}/drafts/${path}`, {
    kind,
    schemaVersion: 1,
    body,
    ...(seen.status === 200 ? { revision: seen.body.revision } : {}),
  });
};

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
    sdkVersion: "0.5.0",
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
  t = await startTestApp({ version: "0.5.0" });
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

  test("the keys of the tenant's groups, members' and end users', are listed for the publish check", async () => {
    const managers = await alice.post(`/tenants/${tenant}/groups`, { name: "Billing team" });
    expect(managers.status, JSON.stringify(managers.body)).toBe(201);
    const owners = await alice.post(`/tenants/${tenant}/end-user-groups`, { name: "Pet owners" });
    expect(owners.status, JSON.stringify(owners.body)).toBe(201);
    const listed = await alice.get(`${ws()}/group-keys`);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const items = listed.body.items as { key: string; name: string; kind: string }[];
    expect(items.filter((one) => one.name === "Billing team").map((one) => one.kind)).toEqual([
      "member",
    ]);
    expect(items.filter((one) => one.name === "Pet owners").map((one) => one.kind)).toEqual([
      "end_user",
    ]);
    expect(items.every((one) => one.key !== "")).toBe(true);
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

  test("a save without a revision never replaces a draft, of any kind (BLD-01, DAT-08)", async () => {
    const put = (path: string, kind: string, body: Record<string, unknown>, more = {}) =>
      alice.put(`${ws()}/drafts/${path}`, { kind, schemaVersion: 1, body, ...more });
    const code = scriptBody("export default async () => 1;\n");
    // A first draft over nothing needs no revision; a second save with none is refused, and the
    // first person's text stays.
    expect((await put("lock/script", "script", code)).status).toBe(200);
    const bare = await put("lock/script", "script", scriptBody("export default async () => 2;\n"));
    expect(bare.status).toBe(409);
    expect(bare.body.code).toBe("draft_changed");
    expect(bare.body.detail).toContain("Someone else saved this draft");
    expect((await alice.get(`${ws()}/drafts/lock/script`)).body.revision).toBe(1);
    // A create over a draft is still refused as taken.
    expect((await put("lock/script", "script", code, { create: true })).body.code).toBe(
      "path_taken",
    );
    // A revision for a draft that is gone (discarded) is refused, not made a draft again.
    expect((await alice.delete(`${ws()}/drafts/lock/script`)).status).toBe(204);
    const gone = await put("lock/script", "script", code, { revision: 1 });
    expect(gone.status).toBe(409);
    expect(gone.body.code).toBe("draft_changed");
    expect((await alice.get(`${ws()}/drafts/lock/script`)).status).toBe(404);
  });

  test("a flow draft holds a step not yet finished, and a deploy refuses it (FLW-09)", async () => {
    const flow = (script: string) => ({
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        run: { type: "script", script },
      },
      edges: [{ from: "start", to: "run" }],
    });
    const saved = await draft("flows/unfinished", flow(""), "flow");
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // Not a flow at all: still refused.
    expect((await draft("flows/notaflow", { nodes: [] }, "flow")).status).toBe(400);
    const deploy = await alice.post(`${ws()}/changes/deploy`, { paths: ["flows/unfinished"] });
    expect(deploy.status).toBe(400);
    // It names the step and the field, and none of the shapes the step is not.
    expect(deploy.body.errors).toEqual([
      {
        path: "flows/unfinished (flow)",
        message: expect.stringContaining("/body/nodes/run/script "),
      },
    ]);
    expect((await alice.get(`${ws()}/drafts/flows/unfinished`)).status).toBe(200);
    expect((await alice.delete(`${ws()}/drafts/flows/unfinished`)).status).toBe(204);
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

    // The bundle made for it is kept a while and then removed, with the run that ran on it.
    const { removeOldPreviews } = await import("./kernel/execution/bundles.js");
    const previews = () =>
      t.db.selectFrom("bundle").select("id").where("origin", "=", "preview").execute();
    // Saving a script made previews too, for reading its schemas.
    const made = (await previews()).length;
    expect(made).toBeGreaterThanOrEqual(1);
    const others = (await t.db.selectFrom("bundle").select("id").execute()).length - made;
    expect(await removeOldPreviews(t.kernel)).toBe(0);
    expect(await previews()).toHaveLength(made);
    expect(await removeOldPreviews(t.kernel, 0)).toBe(made);
    expect(await previews()).toEqual([]);
    expect((await alice.get(`${ws()}/runs/${started.body.runId}`)).status).toBe(404);
    // Nothing that was deployed or uploaded is touched.
    expect(await t.db.selectFrom("bundle").select("id").execute()).toHaveLength(others);
    expect(await removeOldPreviews(t.kernel, 0)).toBe(0);
  });

  test("what a script's code declares as its input and output is read by a worker onto its draft", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: task bodies are inspected freely
    const ended = async (id: string): Promise<any> => {
      for (let i = 0; i < 150; i++) {
        const task = (await alice.get(`${ws()}/tasks/${id}`)).body;
        if (task.status === "succeeded" || task.status === "failed") return task;
        await sleep(100);
      }
      throw new Error(`Task ${id} did not end.`);
    };
    const typed =
      'import { z } from "@volvel/sdk";\n' +
      "export const input = z.object({ name: z.string().min(1) });\n" +
      "export const output = z.object({ hello: z.string() });\n" +
      "export default async (input: { name: string }) => ({ hello: input.name });\n";
    const saved = await draft("orders/typed", scriptBody(typed));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.schemaTaskId).toEqual(expect.any(String));
    expect((await ended(saved.body.schemaTaskId)).status).toBe("succeeded");
    const read = (await alice.get(`${ws()}/drafts/orders/typed`)).body;
    expect(read.revision).toBe(1);
    expect(read.body).toMatchObject({
      schemaSource: "code",
      input: {
        type: "object",
        properties: { name: { type: "string", minLength: 1 } },
        required: ["name"],
      },
      output: { type: "object", properties: { hello: { type: "string" } } },
    });

    // Two saves in a row: only the newer one's reading is written.
    const first = await draft("orders/typed", scriptBody(typed.replace("min(1)", "min(2)")));
    const second = await draft("orders/typed", scriptBody(typed.replace("min(1)", "min(3)")));
    await ended(first.body.schemaTaskId);
    await ended(second.body.schemaTaskId);
    expect(
      (await alice.get(`${ws()}/drafts/orders/typed`)).body.body.input.properties.name.minLength,
    ).toBe(3);

    // Code that declares nothing keeps the schema written by hand.
    const plain = await draft(
      "orders/plain",
      scriptBody("export default async () => ({});\n", {
        input: { type: "object", properties: { id: { type: "integer" } } },
      }),
    );
    expect((await ended(plain.body.schemaTaskId)).result).toEqual({});
    const kept = (await alice.get(`${ws()}/drafts/orders/plain`)).body.body;
    expect(kept.input).toEqual({ type: "object", properties: { id: { type: "integer" } } });
    expect(kept.schemaSource).toBeUndefined();

    // Code that does not build is not read.
    const broken = await draft("orders/unbuilt", scriptBody("export default async () => (;\n"));
    expect(broken.status).toBe(200);
    expect(broken.body.schemaTaskId).toBeUndefined();
    for (const path of ["orders/typed", "orders/plain", "orders/unbuilt"]) {
      await alice.delete(`${ws()}/drafts/${path}`);
    }
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
    ).toContain("may import only @volvel/sdk and node: modules");
    await alice.delete(`${ws()}/drafts/orders/broken`);
    await alice.delete(`${ws()}/drafts/orders/reads`);
  });

  test("what a draft would use is told apart from what is deployed", async () => {
    await draft(
      "orders/uses-erp",
      scriptBody("export default async () => ({});\n", {
        uses: { connections: ["erp"], secrets: [], variables: [] },
      }),
    );
    const deployed = (await alice.get(`${ws()}/references?kind=connection&name=erp`)).body.items;
    expect(
      deployed.some((one: { by: { path: string } }) => one.by.path === "orders/uses-erp"),
    ).toBe(false);
    const withDrafts = (await alice.get(`${ws()}/references?kind=connection&name=erp&drafts=true`))
      .body.items;
    expect(withDrafts).toContainEqual(
      expect.objectContaining({ by: { kind: "script", path: "orders/uses-erp" }, draft: true }),
    );
    await alice.delete(`${ws()}/drafts/orders/uses-erp`);
  });

  test("a failure in code written in the console points at its own line", async () => {
    await draft(
      "orders/throws",
      scriptBody(
        [
          "type Order = { id: string };",
          "",
          "function check(order: Order) {",
          '  throw new Error("No warehouse for " + order.id);',
          "}",
          "",
          "export default async (input: Order) => {",
          "  check(input);",
          "  return {};",
          "};",
          "",
        ].join("\n"),
      ),
    );
    const started = await alice.post(`${ws()}/test-runs`, {
      script: "orders/throws",
      input: { id: "o-1" },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const done = await finished(started.body.runId);
    expect(done.status).toBe("failed");
    const insight = (await alice.get(`${ws()}/runs/${started.body.runId}/insight`)).body;
    expect(insight.location).toMatchObject({ file: "orders/throws.script.ts", line: 4 });
    // The code as that run ran it, to show beside the failure.
    const source = (
      await alice.get(`${ws()}/script-source/orders/throws?run=${started.body.runId}`)
    ).body;
    expect(source).toMatchObject({ available: true, file: "orders/throws.script.ts" });
    expect(source.files[0].content).toContain("No warehouse for");
    await alice.delete(`${ws()}/drafts/orders/throws`);
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

  test("a resource is renamed in the console, and is the same resource at its new path", async () => {
    const before = (await alice.get(`${ws()}/resources/orders/hello`)).body;
    const body = scriptBody("export default async () => ({ hello: 'changed' });\n");
    const renamed = await alice.put(`${ws()}/drafts/orders/hello`, {
      kind: "script",
      schemaVersion: 1,
      body,
      path: "greetings/hello",
      title: "Say hello",
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body).toMatchObject({
      path: "greetings/hello",
      key: "orders/hello",
      title: "Say hello",
      change: "rename",
      renamedFrom: "orders/hello",
    });
    // The draft is at the path the resource is to have. What runs has not moved yet.
    expect((await alice.get(`${ws()}/drafts/orders/hello`)).status).toBe(404);
    expect((await alice.get(`${ws()}/drafts/greetings/hello`)).body.change).toBe("rename");
    expect((await alice.get(`${ws()}/resources/orders/hello`)).body.path).toBe("orders/hello");

    // A path that something else has is not taken.
    await draft("orders/other", scriptBody("export default async () => ({});\n"));
    const taken = await alice.put(`${ws()}/drafts/orders/other`, {
      kind: "script",
      schemaVersion: 1,
      body,
      path: "greetings/hello",
    });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("path_taken");
    expect((await alice.delete(`${ws()}/drafts/orders/other`)).status).toBeLessThan(300);

    const preview = (await alice.get(`${ws()}/changes/preview`)).body;
    expect(preview.summary).toMatchObject({ renamed: 1, created: 0, deleted: 0 });
    const deployed = await alice.post(`${ws()}/changes/deploy`, { message: "Move the greeting" });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.summary.changes).toEqual([
      { change: "renamed", kind: "script", path: "greetings/hello", from: "orders/hello" },
    ]);
    const after = (await alice.get(`${ws()}/resources/greetings/hello`)).body;
    expect(after).toMatchObject({
      id: before.id,
      key: "orders/hello",
      path: "greetings/hello",
      title: "Say hello",
    });
    // Its code runs at the new path, and still answers at the old one for a while.
    expect((await run("greetings/hello")).output).toEqual({ hello: "changed" });
    expect((await run("orders/hello")).output).toEqual({ hello: "changed" });
    expect((await alice.get(`${ws()}/drafts`)).body.items).toEqual([]);

    // A draft that does not speak of the title keeps it. One that says null takes it away.
    const titled = async (title?: string | null) => {
      const saved = await alice.put(`${ws()}/drafts/greetings/hello`, {
        kind: "script",
        schemaVersion: 1,
        body,
        ...(title !== undefined ? { title } : {}),
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      const done = await alice.post(`${ws()}/changes/deploy`, { paths: ["greetings/hello"] });
      return done.status === 201
        ? (await alice.get(`${ws()}/resources/greetings/hello`)).body.title
        : done.body.code;
    };
    expect(await titled()).toBe("Say hello");
    expect(await titled(null)).toBeNull();
    expect(await titled("Say hello")).toBe("Say hello");
  });
});

describe("a file the repository keeps outside the console's folder", () => {
  test("is deployed with where it is, is changed in the console like any other, and is written back to its own file", async () => {
    // As the CLI builds it: the active bundle, and one more resource from a file under src/.
    const active = await t.db
      .selectFrom("workspace")
      .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
      .select("bundle.storage_key")
      .where("workspace.id", "=", dev)
      .executeTakeFirstOrThrow();
    const { digest: _digest, ...content } = JSON.parse(
      (await t.kernel.storage.get(active.storage_key)).toString("utf8"),
    ) as Bundle;
    const kept: BundleManifest = {
      kind: "variable",
      schemaVersion: 1,
      path: "lending/limit",
      title: "Lending limit",
      source: { file: "src/lending/limit.variable.yaml", generated: false },
      ownership: "ui",
      body: { default: "5" },
    };
    const unsigned = {
      ...content,
      formatVersion: 4 as const,
      assets: content.assets ?? [],
      manifests: [...content.manifests, kept],
    };
    const uploaded = await alice.post(`${ws()}/bundles`, {
      ...unsigned,
      digest: bundleDigest(unsigned),
    });
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect((await alice.get(`${ws()}/resources/lending/limit`)).body).toMatchObject({
      title: "Lending limit",
      definedIn: "src/lending/limit.variable.yaml",
      ownership: "ui",
    });

    // What `volvel pull` writes into the console's folder does not hold it: it is given
    // apart, by where the repository keeps it.
    const pulled = (await alice.get(`${ws()}/resource-files?roots=src`)).body as {
      files: { path: string }[];
      elsewhere: { path: string; content: string; resource: string }[];
    };
    expect(pulled.files.some((file) => file.path.includes("limit"))).toBe(false);
    expect(pulled.elsewhere).toEqual([
      {
        path: "src/lending/limit.variable.yaml",
        resource: "lending/limit",
        content: 'title: Lending limit\nschemaVersion: 1\nbody:\n  default: "5"\n',
      },
    ]);

    // It is changed in the console like any other, and its draft is written to its own file.
    const saved = await alice.put(`${ws()}/drafts/lending/limit`, {
      kind: "variable",
      schemaVersion: 1,
      body: { default: "6" },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const drafted = (await alice.get(`${ws()}/resource-files`)).body as {
      elsewhere: { path: string; content: string }[];
    };
    // Without the repository's roots, the file is made to say its path.
    expect(drafted.elsewhere.map((file) => [file.path, file.content])).toEqual([
      [
        "src/lending/limit.variable.yaml",
        'path: lending/limit\ntitle: Lending limit\nschemaVersion: 1\nbody:\n  default: "6"\n',
      ],
    ]);
    // Deployed with other drafts, it is still the repository's file.
    await draft("orders/extra", scriptBody("export default async () => ({});\n"));
    const again = await alice.post(`${ws()}/changes/deploy`, {});
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect((await alice.get(`${ws()}/resources/lending/limit`)).body.definedIn).toBe(
      "src/lending/limit.variable.yaml",
    );
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

describe("testing a flow", () => {
  const flowRun = async (id: string) => {
    let run:
      | {
          status: string;
          steps: { node: string; status: string; output: unknown; copiedFrom: unknown }[];
        }
      | undefined;
    for (let i = 0; i < 200; i++) {
      run = (await alice.get(`${ws()}/flow-runs/${id}`)).body;
      if (run?.status !== "running") break;
      await sleep(100);
    }
    return run as NonNullable<typeof run>;
  };
  const pipe = (input: string) => ({
    description: "",
    nodes: {
      start: { type: "trigger", trigger: { type: "manual" } },
      nightly: { type: "trigger", trigger: { type: "schedule", cron: "0 3 * * *" } },
      a: { type: "script", script: "pipe/double", input },
      b: { type: "script", script: "pipe/check", input: "{'n': steps.a.output.n}" },
    },
    edges: [
      { from: "start", to: "a" },
      { from: "nightly", to: "a" },
      { from: "a", to: "b" },
    ],
  });
  const check = (limit: number) =>
    scriptBody(
      `export default async (input: { n: number }) => {\n  if (input.n > ${limit}) throw new Error("too big: " + input.n);\n  return { ok: true };\n};\n`,
    );

  test("from a step: what came before is kept from an earlier run, and only the rest runs on the draft", async () => {
    await draft(
      "pipe/double",
      scriptBody("export default async (input: { n?: number }) => ({ n: (input.n ?? 1) * 2 });\n"),
    );
    await draft("pipe/check", check(10));
    await draft("pipe/flow", pipe("{'n': trigger.n}"), "flow");
    const first = await alice.post(`${ws()}/test-runs`, { flow: "pipe/flow", input: { n: 6 } });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const failed = await flowRun(first.body.runId);
    expect(failed.status).toBe("failed");

    // The check is fixed; a stays as it ran, b runs again on the fix.
    await draft("pipe/check", check(100));
    const again = await alice.post(`${ws()}/test-runs`, {
      flow: "pipe/flow",
      testFrom: { flowRunId: first.body.runId, node: "b" },
    });
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    const done = await flowRun(again.body.runId);
    expect(done.status).toBe("succeeded");
    expect(done.steps.find((one) => one.node === "a")?.copiedFrom).toMatchObject({
      flowRunId: first.body.runId,
    });
    expect(done.steps.find((one) => one.node === "b")?.output).toEqual({ ok: true });

    // A draft that changes a step before it cannot reuse what that step did.
    await draft("pipe/flow", pipe("{'n': trigger.n + 1}"), "flow");
    const refused = await alice.post(`${ws()}/test-runs`, {
      flow: "pipe/flow",
      testFrom: { flowRunId: first.body.runId, node: "b" },
    });
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toContain("(a)");
  });

  test("a flow is tested from any of its triggers, with what that trigger would receive", async () => {
    await draft("pipe/flow", pipe("{'n': 3}"), "flow");
    const started = await alice.post(`${ws()}/test-runs`, {
      flow: "pipe/flow",
      triggerNode: "nightly",
      input: {},
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const done = await flowRun(started.body.runId);
    expect(done.status).toBe("succeeded");
    expect(done.steps.map((one) => one.node).sort()).toEqual(["a", "b", "nightly"]);
    for (const path of ["pipe/flow", "pipe/check", "pipe/double"]) {
      await alice.delete(`${ws()}/drafts/${path}`);
    }
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

describe("what is drafted is listed where it will be", () => {
  // biome-ignore lint/suspicious/noExplicitAny: list rows are inspected freely
  const triggers = async (): Promise<Record<string, any>> =>
    Object.fromEntries(
      // biome-ignore lint/suspicious/noExplicitAny: as above
      (await alice.get(`${ws()}/triggers`)).body.items.map((one: any) => [one.path, one]),
    );

  test("a trigger made in the console is in the list at once, marked, and fires nothing", async () => {
    await draft("listed/target", scriptBody("export default async () => ({});\n"));
    await alice.post(`${ws()}/changes/deploy`, {});
    const nightly = await draft(
      "listed/nightly",
      { script: "listed/target", cron: "0 3 * * *", timezone: "UTC" },
      "schedule",
    );
    expect(nightly.status, JSON.stringify(nightly.body)).toBe(200);
    const hook = await draft(
      "listed/hook",
      { type: "webhook", script: "listed/target" },
      "trigger",
    );
    expect(hook.status, JSON.stringify(hook.body)).toBe(200);

    const listed = await triggers();
    expect(listed["listed/nightly"]).toMatchObject({
      draft: "new",
      resourceKind: "schedule",
      type: "schedule",
      script: "listed/target",
      targetKind: "script",
      cron: "0 3 * * *",
      lastFiredAt: null,
      url: null,
    });
    // When it would first fire if it were deployed now: nothing has registered it.
    expect(new Date(listed["listed/nightly"].nextFireAt).getTime()).toBeGreaterThan(Date.now());
    expect(listed["listed/hook"]).toMatchObject({
      draft: "new",
      resourceKind: "trigger",
      type: "webhook",
      url: null,
    });
    // One script's triggers include the ones drafted for it.
    const forTarget = (await alice.get(`${ws()}/triggers?target=listed/target`)).body.items;
    expect(forTarget.map((one: { path: string }) => one.path).sort()).toEqual([
      "listed/hook",
      "listed/nightly",
    ]);
  });

  test("deployed, it is a trigger like any other; changed or removed by a draft, it says so", async () => {
    await alice.post(`${ws()}/changes/deploy`, {});
    let listed = await triggers();
    expect(listed["listed/nightly"]).toMatchObject({ draft: null, resourceKind: "schedule" });
    expect(listed["listed/hook"].draft).toBeNull();
    expect(listed["listed/hook"].url).toContain("/api/v1/hooks/");

    await draft(
      "listed/nightly",
      { script: "listed/target", cron: "0 4 * * *", timezone: "UTC" },
      "schedule",
    );
    await alice.put(`${ws()}/drafts/listed/hook`, {
      kind: "trigger",
      schemaVersion: 1,
      body: {},
      deleted: true,
    });
    listed = await triggers();
    // What is listed is what fires: the deployed time, with a note that a change waits.
    expect(listed["listed/nightly"]).toMatchObject({ draft: "changed", cron: "0 3 * * *" });
    expect(listed["listed/hook"].draft).toBe("removed");
    await alice.post(`${ws()}/changes/deploy`, {});
    listed = await triggers();
    expect(listed["listed/nightly"]).toMatchObject({ draft: null, cron: "0 4 * * *" });
    expect(listed["listed/hook"]).toBeUndefined();
  });

  test("a variable made in the console is in the list before it is deployed", async () => {
    await draft("listed/limit", { description: "How many", default: "5" }, "variable");
    // biome-ignore lint/suspicious/noExplicitAny: as above
    const find = async (): Promise<any> =>
      (await alice.get(`${ws()}/variable-values`)).body.items.find(
        (one: { path: string }) => one.path === "listed/limit",
      );
    expect(await find()).toMatchObject({
      draft: "new",
      description: "How many",
      default: "5",
      value: null,
    });
    await alice.post(`${ws()}/changes/deploy`, {});
    expect((await find()).draft).toBeNull();
    await draft("listed/limit", { description: "How many", default: "6" }, "variable");
    // The default a script reads is still the deployed one.
    expect(await find()).toMatchObject({ draft: "changed", default: "5" });
  });
  test("a connection group made in the console is listed before it is deployed", async () => {
    const saved = await draft(
      "listed/customers",
      { description: "Each customer's account", connector: "http" },
      "connection_group",
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: as above
    const find = async (): Promise<any> =>
      (await alice.get(`${ws()}/connection-groups`)).body.items.find(
        (one: { path: string }) => one.path === "listed/customers",
      );
    expect(await find()).toMatchObject({ draft: "new", connector: "http", members: [] });
    await alice.post(`${ws()}/changes/deploy`, {});
    expect((await find()).draft).toBeNull();
  });
});
