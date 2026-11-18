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
    const started = await alice.post(`${ws(dev)}/runs`, { script: "requests/submit", input: {} });
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
    expect((await alice.get(`${ws(dev)}/resources/requests/submit`)).status).toBe(404);

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

const made = (one: Any) => one.id as string;
