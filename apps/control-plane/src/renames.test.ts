import { type Bundle, type BundleManifest, bundleDigest, formatFor } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
let dev: string;
let prod: string;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const manifest = (
  kind: string,
  path: string,
  body: Record<string, unknown>,
  key?: string,
): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
  ...(key !== undefined ? { key } : {}),
});
const object = { type: "object" };
const script = (path: string, uses: Record<string, string[]>, key?: string) =>
  manifest(
    "script",
    path,
    {
      entry: "main",
      input: object,
      output: object,
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [], ...uses },
    },
    key,
  );
const table = (path: string, key?: string) =>
  manifest("table", path, { columns: { name: { type: "text", required: true } } }, key);
const variable = (path: string, key?: string) =>
  manifest("variable", path, { default: "none" }, key);

function bundle(manifests: BundleManifest[]): Bundle {
  const unsigned = {
    formatVersion: formatFor(1, manifests),
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export const main = { execute: async () => ({}) };",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

/** As a repository from before keys has it: everything named by its path. */
const before = bundle([
  manifest("connection", "api", { connector: "http" }),
  variable("limits/size"),
  variable("limits/count"),
  table("items"),
  script("requests/submit", {
    connections: ["api"],
    tables: ["items"],
    variables: ["limits/size"],
  }),
]);
/** The same resources, moved into a folder. Each says the key it had. */
const moved = bundle([
  manifest("connection", "lending/api", { connector: "http" }, "api"),
  variable("limits/size"),
  variable("limits/count"),
  table("lending/items", "items"),
  script(
    "lending/requests/file",
    { connections: ["lending/api"], tables: ["lending/items"], variables: ["limits/size"] },
    "requests/submit",
  ),
]);

const ws = (id: string) => `/tenants/${tenant}/workspaces/${id}`;
async function deploy(workspace: string, content: Bundle, extra: object = {}) {
  const uploaded = await alice.post(`${ws(workspace)}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return alice.post(`${ws(workspace)}/deployments`, { bundleId: uploaded.body.id, ...extra });
}
const resource = async (workspace: string, path: string): Promise<Any> =>
  (await alice.get(`${ws(workspace)}/resources/${path}`)).body;
const bound = async (workspace: string) =>
  ((await alice.get(`${ws(workspace)}/connection-bindings`)).body.items as Any[])
    .filter((item) => item.bound)
    .map((item) => item.path);

beforeAll(async () => {
  t = await startTestApp();
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
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  const make = async (slug: string, type: string) =>
    (await alice.post(`/tenants/${tenant}/workspaces`, { slug, name: slug, type })).body
      .id as string;
  prod = await make("main", "production");
  dev = await make("dev", "dev");
  await alice.patch(ws(dev), { linkedWorkspaceId: prod });
  for (const workspace of [dev, prod]) {
    await alice.put(`${ws(workspace)}/connection-bindings/api`, {
      config: { baseUrl: "http://api.test" },
    });
  }
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("a resource moved to another path", () => {
  let submit: Any;
  let items: Any;
  let run: string;

  test("a bundle from before keys gives every resource its path as its key", async () => {
    const deployed = await deploy(dev, before);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.summary).toMatchObject({ created: 5, renamed: 0 });
    submit = await resource(dev, "requests/submit");
    items = await resource(dev, "items");
    expect(
      await t.db
        .selectFrom("resource")
        .select(["key", "path"])
        .where("workspace_id", "=", dev)
        .orderBy("path")
        .execute(),
    ).toEqual(
      ["api", "items", "limits/count", "limits/size", "requests/submit"].map((path) => ({
        key: path,
        path,
      })),
    );
    // It gets a run, a row, a value and access given by hand: what a rename has to keep.
    const started = await alice.post(`${ws(dev)}/runs`, {
      script: "requests/submit",
      input: {},
      idempotencyKey: "first",
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    run = started.body.id;
    expect((await alice.post(`${ws(dev)}/rows/items`, { name: "kept" })).status).toBe(201);
    expect(
      (await alice.put(`${ws(dev)}/variable-values/limits/size`, { value: "40" })).status,
    ).toBeLessThan(300);
    expect((await deploy(prod, before)).status).toBe(201);
    expect((await alice.post(`${ws(prod)}/rows/items`, { name: "production's" })).status).toBe(201);
  });

  test("is renamed in place: the same resource, with its runs, its rows and what was bound to it", async () => {
    const deployed = await deploy(dev, moved);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.summary).toMatchObject({
      created: 0,
      updated: 0,
      renamed: 3,
      unchanged: 2,
      deleted: 0,
    });
    expect(deployed.body.summary.changes).toEqual([
      { change: "renamed", kind: "connection", path: "lending/api", from: "api" },
      { change: "renamed", kind: "table", path: "lending/items", from: "items" },
      {
        change: "renamed",
        kind: "script",
        path: "lending/requests/file",
        from: "requests/submit",
      },
    ]);

    const now = await resource(dev, "lending/requests/file");
    expect(now).toMatchObject({ id: submit.id, path: "lending/requests/file" });
    expect(now.version).toBe(submit.version + 1);
    // Asked for by the path it had, it is still found, at the path it has.
    expect((await alice.get(`${ws(dev)}/resources/requests/submit`)).body).toMatchObject({
      id: submit.id,
      key: "requests/submit",
      path: "lending/requests/file",
    });

    // Its run is still its run, found under the path it has now.
    expect(
      (await t.db.selectFrom("run").select("resource_id").where("id", "=", run).executeTakeFirst())
        ?.resource_id,
    ).toBe(submit.id);
    const listed = (await alice.get(`${ws(dev)}/runs?script=lending/requests/file`)).body.items;
    expect(listed.map((item: Any) => item.id)).toEqual([run]);

    // The table kept its rows without saying what it was renamed from, and the connection its binding.
    expect((await resource(dev, "lending/items")).id).toBe(items.id);
    expect(
      (await alice.get(`${ws(dev)}/rows/lending/items`)).body.items.map((row: Any) => row.name),
    ).toEqual(["kept"]);
    expect(await bound(dev)).toEqual(["lending/api"]);
    expect(deployed.body.summary.warnings).toEqual([]);
  });

  test("the path it had still answers, says it is on its way out, and names the new one", async () => {
    const alias = await t.db
      .selectFrom("resource_alias")
      .selectAll()
      .where("workspace_id", "=", dev)
      .where("path", "=", "requests/submit")
      .executeTakeFirstOrThrow();
    expect(alias).toMatchObject({ resource_id: submit.id, kind: "script" });
    const days = (alias.expires_at.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(90);

    // A run asked for by the old path is a run of the script, under the path it has now.
    const started = await alice.post(`${ws(dev)}/runs`, { script: "requests/submit", input: {} });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body.script).toBe("lending/requests/file");
    expect(started.headers["vynx-resource-moved"]).toBe("lending/requests/file");
    expect(String(started.headers.deprecation)).toMatch(/^@\d+$/);
    expect(new Date(String(started.headers.sunset)).getTime()).toBeGreaterThan(Date.now());
    expect(String(started.headers.warning)).toContain(
      "requests/submit was renamed to lending/requests/file",
    );
    // By the path it has, nothing is said.
    const direct = await alice.post(`${ws(dev)}/runs`, {
      script: "lending/requests/file",
      input: {},
      idempotencyKey: "first",
    });
    expect(direct.headers["vynx-resource-moved"]).toBeUndefined();
    // And the request first sent before the rename is the same request after it.
    expect(direct.status).toBe(200);
    expect(direct.body.id).toBe(run);

    const rows = await alice.get(`${ws(dev)}/rows/items`);
    expect(rows.status).toBe(200);
    expect(rows.body.items.map((row: Any) => row.name)).toEqual(["kept"]);
    expect(rows.headers["vynx-resource-moved"]).toBe("lending/items");
    expect((await alice.get(`${ws(dev)}/rows/lending/items`)).headers.sunset).toBeUndefined();
  });

  test("the old paths are listed, an agent's tool keeps the name it had, and an old path can be ended now", async () => {
    const listed = (await alice.get(`${ws(dev)}/aliases`)).body.items as Any[];
    expect(listed.map((item) => [item.path, item.kind, item.now])).toEqual([
      ["api", "connection", "lending/api"],
      ["items", "table", "lending/items"],
      ["requests/submit", "script", "lending/requests/file"],
    ]);
    // Only the ones that were asked for say when.
    expect(listed.map((item) => item.lastUsedAt !== null)).toEqual([false, true, true]);

    const roles = Object.fromEntries(
      (
        await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
      ).map((role) => [role.name, role.id]),
    );
    const agent = await alice.post(`/tenants/${tenant}/service-accounts`, { name: "agent" });
    // It may start what it is bound to, and see the workspace it is in.
    for (const roleId of [roles.agent_runner, roles.viewer]) {
      await alice.post(`/tenants/${tenant}/bindings`, {
        workspaceId: dev,
        principalType: "service_account",
        principalId: agent.body.id,
        roleId,
      });
    }
    const offered = await alice.get(
      `/tenants/${tenant}/service-accounts/${agent.body.id}/tools?workspace=${dev}`,
    );
    expect(offered.status, JSON.stringify(offered.body)).toBe(200);
    const tools = offered.body.tools as { name: string; description: string }[];
    expect(tools.length, JSON.stringify(offered.body)).toBeGreaterThan(0);
    expect(tools.map((tool) => tool.name).filter((name) => name.startsWith("run_"))).toEqual([
      "run_lending__requests__file",
      "run_requests__submit",
    ]);
    expect(tools[1]?.description).toMatch(
      /^Renamed: call run_lending__requests__file instead\. This name stops working on \d{4}-\d{2}-\d{2}\. Runs the script lending\/requests\/file\./,
    );

    // Ending one by hand: the resource stays, and the old path answers nothing.
    expect((await alice.delete(`${ws(dev)}/aliases/api`)).status).toBe(204);
    expect((await alice.delete(`${ws(dev)}/aliases/api`)).status).toBe(404);
    expect((await alice.get(`${ws(dev)}/resources/api`)).status).toBe(404);
    const byOld = await alice.get(`${ws(dev)}/resources/items`);
    expect(byOld.body.path).toBe("lending/items");
    expect(byOld.body.key).toBe("items");
    expect(byOld.headers["vynx-resource-moved"]).toBe("lending/items");
  });

  test("an alias that has expired answers nothing, and a resource made at its path ends it", async () => {
    await t.db
      .updateTable("resource_alias")
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where("workspace_id", "=", dev)
      .where("path", "=", "items")
      .execute();
    expect((await alice.get(`${ws(dev)}/rows/items`)).status).toBe(404);

    // Something new at the path the connection had. Its path is the old one's key, so it
    // says a key of its own, as the build asks; then the path is that one's now.
    const unsaid = await deploy(
      dev,
      bundle([...moved.manifests, manifest("connection", "api", { connector: "http" })]),
    );
    expect(unsaid.status).toBe(400);
    expect(JSON.stringify(unsaid.body.errors)).toContain("A key belongs to one resource");
    const again = await deploy(
      dev,
      bundle([...moved.manifests, manifest("connection", "api", { connector: "http" }, "api-2")]),
    );
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.summary).toMatchObject({ created: 1, renamed: 0 });
    // Its alias was ended by hand already, so the deploy ended none.
    expect(again.body.summary.aliasesRemoved).toEqual([]);
    const left = await t.db
      .selectFrom("resource_alias")
      .select("path")
      .where("workspace_id", "=", dev)
      .orderBy("path")
      .execute();
    expect(left.map((row) => row.path)).toEqual(["items", "requests/submit"]);
    expect((await deploy(dev, moved)).body.summary).toMatchObject({ deleted: 1 });
  });

  test("promotion does the same rename, and a production connection keeps what it was bound to", async () => {
    const preview = (await alice.get(`${ws(dev)}/promotion-preview`)).body;
    expect(preview.possible, JSON.stringify(preview.refusal)).toBe(true);
    expect(preview.summary).toMatchObject({ renamed: 3, created: 0, deleted: 0 });
    const promoted = await alice.post(`${ws(dev)}/promotions`);
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(201);
    expect(promoted.body.summary).toEqual(preview.summary);
    expect(await bound(prod)).toEqual(["lending/api"]);
    expect(
      (await alice.get(`${ws(prod)}/rows/lending/items`)).body.items.map((row: Any) => row.name),
    ).toEqual(["production's"]);
  });

  test("deploying the earlier bundle again renames it back", async () => {
    const first = (await alice.get(`${ws(dev)}/bundles`)).body.items.find(
      (one: Any) => one.digest === before.digest,
    );
    const back = await alice.post(`${ws(dev)}/deployments`, { bundleId: first.id });
    expect(back.status, JSON.stringify(back.body)).toBe(201);
    expect(back.body.summary).toMatchObject({ renamed: 3, created: 0, deleted: 0 });
    expect((await resource(dev, "requests/submit")).id).toBe(submit.id);
    expect(
      (await alice.get(`${ws(dev)}/rows/items`)).body.items.map((row: Any) => row.name),
    ).toEqual(["kept"]);
    expect(await bound(dev)).toEqual(["api"]);
    // The paths are theirs again, and the ones they were moved to now answer for them.
    const aliases = await t.db
      .selectFrom("resource_alias")
      .select("path")
      .where("workspace_id", "=", dev)
      .orderBy("path")
      .execute();
    expect(aliases.map((row) => row.path)).toEqual([
      "lending/api",
      "lending/items",
      "lending/requests/file",
    ]);
  });
});

describe("an app moved to another path", () => {
  test("its old address sends the browser to the new one, with the rest of the address kept", async () => {
    const screen = manifest("interface", "screens/desk", {
      title: "Desk",
      pages: [{ id: "home", title: "Home", widgets: [] }],
    });
    const app = (path: string, key?: string) =>
      manifest("app", path, { title: "Desk", interface: "screens/desk" }, key);
    const withApp = (one: BundleManifest) => {
      const unsigned = {
        formatVersion: formatFor(2, [one]),
        sdkVersion: "0.5.0",
        core: { min: "0.0.0", below: "99.0.0" },
        manifests: [...before.manifests, screen, one],
        code: "export const main = { execute: async () => ({}) };",
        assets: [],
      };
      return { ...unsigned, digest: bundleDigest(unsigned) } as Bundle;
    };
    expect((await deploy(dev, withApp(app("desk")))).status).toBe(201);
    const moved = await deploy(dev, withApp(app("staff/desk", "desk")));
    expect(moved.status, JSON.stringify(moved.body)).toBe(201);
    expect(moved.body.summary).toMatchObject({ renamed: 1, created: 0, deleted: 0 });

    const old = await t.app.inject({ method: "GET", url: "/apps/acme/dev/desk/home?tab=2" });
    expect(old.statusCode).toBe(308);
    expect(old.headers.location).toBe("/apps/acme/dev/staff/desk/home?tab=2");
    // An address that was never an app's is simply not found.
    expect((await t.app.inject({ method: "GET", url: "/apps/acme/dev/nothing/" })).statusCode).toBe(
      404,
    );
    expect((await deploy(dev, before, { allowDelete: ["staff/desk"] })).status).toBe(201);
  });
});

describe("what a deploy by key refuses, and what it works out", () => {
  test("two resources swap paths in one deploy, each keeping what it had", async () => {
    const size = await resource(dev, "limits/size");
    const count = await resource(dev, "limits/count");
    const swapped = bundle(
      before.manifests.map((entry) =>
        entry.path === "limits/size"
          ? variable("limits/count", "limits/size")
          : entry.path === "limits/count"
            ? variable("limits/size", "limits/count")
            : entry.kind === "script"
              ? script(entry.path, {
                  connections: ["api"],
                  tables: ["items"],
                  variables: ["limits/count"],
                })
              : entry,
      ),
    );
    const deployed = await deploy(dev, swapped);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.summary).toMatchObject({ renamed: 2, created: 0, deleted: 0 });
    expect((await resource(dev, "limits/count")).id).toBe(size.id);
    expect((await resource(dev, "limits/size")).id).toBe(count.id);
    // The value set for the one that was `limits/size` went with it.
    const values = (await alice.get(`${ws(dev)}/variable-values`)).body.items as Any[];
    expect(values.find((item) => item.path === "limits/count")?.value).toBe("40");
    expect(values.find((item) => item.path === "limits/size")?.value ?? null).toBeNull();
    // No path of the middle of the swap is left anywhere.
    const stray = await t.db
      .selectFrom("resource")
      .select("path")
      .where("path", "like", "~swap/%")
      .execute();
    expect(stray).toEqual([]);
    expect((await deploy(dev, before)).body.summary).toMatchObject({ renamed: 2 });
  });

  test("a key that belongs to a resource of another kind is refused", async () => {
    const wrong = bundle([...before.manifests, variable("limits/other", "items")]);
    // Within one bundle a key is one resource's, so this never leaves the build.
    expect((await deploy(dev, wrong)).status).toBe(400);
    const taking = bundle([
      ...before.manifests.filter((entry) => entry.path !== "items" && entry.kind !== "script"),
      variable("limits/other", "items"),
    ]);
    const refused = await deploy(dev, taking);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("kind_changed");
    expect(refused.body.detail).toContain(
      'the key "items", which is the key of the table at items',
    );
  });

  test("a path that a resource made in the console has is not taken from it", async () => {
    const made = await alice.put(`${ws(dev)}/resources/notes`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns: { title: { type: "text" } } },
    });
    expect(made.status).toBe(201);
    const refused = await deploy(dev, bundle([...before.manifests, variable("notes")]));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("path_taken");
    expect(refused.body.detail).toContain('the table with the key "notes"');

    // A table defined at that path in the code is that table: the code takes it over, as before.
    const taken = await deploy(
      dev,
      bundle([
        ...before.manifests,
        manifest("table", "notes", { columns: { title: { type: "text" } } }),
      ]),
    );
    expect(taken.status, JSON.stringify(taken.body)).toBe(201);
    expect((await resource(dev, "notes")).id).toBe(made.body.id);
  });

  test("a resource renamed by hand is still matched by a bundle that names only its path", async () => {
    const before2 = await resource(dev, "notes");
    const byHand = await alice.put(`${ws(dev)}/resources/journal/notes`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "code",
      body: before2.body,
      renameFrom: "notes",
    });
    expect(byHand.status, JSON.stringify(byHand.body)).toBe(200);
    const deployed = await deploy(
      dev,
      bundle([
        ...before.manifests,
        manifest("table", "journal/notes", { columns: { title: { type: "text" } } }),
      ]),
    );
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.summary).toMatchObject({ created: 0, deleted: 0, renamed: 0 });
    const row = await t.db
      .selectFrom("resource")
      .select(["id", "key"])
      .where("workspace_id", "=", dev)
      .where("path", "=", "journal/notes")
      .executeTakeFirstOrThrow();
    // Its key is still the one it was made with: a key never changes.
    expect(row).toEqual({ id: made(before2), key: "notes" });
  });
});

describe("the name of an agent's tool", () => {
  const named = (name: string | undefined, path = "requests/submit") =>
    bundle(
      before.manifests.map((entry) =>
        entry.kind === "script"
          ? {
              ...script(path, entry.body.uses as Record<string, string[]>, "requests/submit"),
              ...(name ? { mcp: { name } } : {}),
            }
          : entry,
      ),
    );
  const offered = async () => {
    const agent = await t.db
      .selectFrom("service_account")
      .select("id")
      .where("tenant_id", "=", tenant)
      .where("name", "=", "agent")
      .executeTakeFirstOrThrow();
    const tools = (
      await alice.get(`/tenants/${tenant}/service-accounts/${agent.id}/tools?workspace=${dev}`)
    ).body.tools as { name: string }[];
    return tools.map((tool) => tool.name).filter((name) => !/^(get|list|decide)_/.test(name));
  };

  test("is the one its author chose, and stays through a rename", async () => {
    expect((await deploy(dev, before)).status).toBe(201);
    const chosen = await deploy(dev, named("submit_request"));
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(201);
    // The name made from the path is gone the moment one is chosen: that is said.
    expect(chosen.body.summary.breaking).toEqual([
      {
        path: "requests/submit",
        message:
          "the tool run_requests__submit is now called submit_request. An agent that calls it by the old name will fail.",
      },
    ]);
    expect(await offered()).toContain("submit_request");
    expect(await offered()).not.toContain("run_requests__submit");

    const moved = await deploy(dev, named("submit_request", "desk/submit"));
    expect(moved.status, JSON.stringify(moved.body)).toBe(201);
    expect(moved.body.summary).toMatchObject({ renamed: 1, breaking: [] });
    expect(await offered()).toContain("submit_request");
    expect((await offered()).filter((name) => name.includes("desk"))).toEqual([]);
  });

  test("cannot be another tool's, or one every agent has", async () => {
    const twice = bundle([
      ...named("submit_request").manifests,
      { ...script("other", {}), mcp: { name: "submit_request" } },
    ]);
    const refused = await deploy(dev, twice);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body.errors)).toContain(
      'its tool would be called \\"submit_request\\", which is the name of the tool for',
    );
    const reserved = await deploy(dev, named("get_run"));
    expect(reserved.status).toBe(400);
    expect(JSON.stringify(reserved.body.errors)).toContain("is the name of a tool every agent has");
    const onTable = bundle(
      before.manifests.map((entry) =>
        entry.kind === "table" ? { ...entry, mcp: { name: "read_items" } } : entry,
      ),
    );
    expect(JSON.stringify((await deploy(dev, onTable)).body.errors)).toContain(
      "only a script or a flow is offered to an agent as a tool",
    );
  });

  test("changing it is named as breaking, and promoting that to production has to be confirmed", async () => {
    // Production takes the chosen name first. Its old name was made from a path it is renamed
    // away from, so that name still answers there: nothing breaks.
    const first = await alice.post(`${ws(dev)}/promotions`);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.summary.breaking).toEqual([]);

    const changed = await deploy(dev, named("file_request", "desk/submit"));
    expect(changed.status, JSON.stringify(changed.body)).toBe(201);
    expect(changed.body.summary.breaking).toHaveLength(1);

    const preview = (await alice.get(`${ws(dev)}/promotion-preview`)).body;
    expect(preview.possible).toBe(true);
    expect(preview.summary.breaking).toEqual([
      {
        path: "desk/submit",
        message:
          "the tool submit_request is now called file_request. An agent that calls it by the old name will fail.",
      },
    ]);
    const unconfirmed = await alice.post(`${ws(dev)}/promotions`);
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.code).toBe("breaking_changes");
    expect(unconfirmed.body.errors).toEqual(preview.summary.breaking);

    const confirmed = await alice.post(`${ws(dev)}/promotions`, { confirmBreaking: true });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);
    expect(confirmed.body.summary.breaking).toEqual(preview.summary.breaking);
  });
});

const made = (one: Any) => one.id as string;
