import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
/** Each test works in a workspace of its own: the basis is the workspace's. */
let made = 0;

const ws = (id: string) => `/tenants/${tenant}/workspaces/${id}`;
/** A bundle as the CLI builds it from a repository whose resources are files. */
function bundleOf(manifests: BundleManifest[]): Bundle {
  const unsigned = {
    formatVersion: 4 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "",
    assets: [],
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
async function workspace(): Promise<string> {
  made += 1;
  const created = await alice.post(`/tenants/${tenant}/workspaces`, {
    slug: `pull-first-${made}`,
    name: `Pull first ${made}`,
    type: "dev",
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.id;
}
/** What `volvel deploy` does: upload the bundle, then deploy it. */
async function deploy(
  id: string,
  manifests: BundleManifest[],
  extra: Record<string, unknown> = {},
) {
  const uploaded = await alice.post(`${ws(id)}/bundles`, bundleOf(manifests));
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  return alice.post(`${ws(id)}/deployments`, { bundleId: uploaded.body.id, ...extra });
}
/** A change made in the console: saved as a draft and deployed. */
const basisOf = async (id: string, path: string) =>
  (
    await t.db
      .selectFrom("resource")
      .select("basis_hash")
      .where("workspace_id", "=", id)
      .where("path", "=", path)
      .executeTakeFirstOrThrow()
  ).basis_hash;

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
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
  alice = await t.signIn("alice@acme.example", PASSWORD);
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

const code = (path: string, columns: Record<string, object>): BundleManifest => ({
  kind: "table",
  schemaVersion: 1,
  path,
  ownership: "code",
  body: { columns },
});
const sells = { title: { type: "text", required: true } };
const takeOver = (id: string, path: string, columns: Record<string, object>, extra = {}) =>
  alice.put(`${ws(id)}/resources/${path}`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: { columns },
    takeOver: true,
    ...extra,
  });
const ownerOf = async (id: string, path: string) =>
  (await alice.get(`${ws(id)}/resources/${path}`)).body.ownership;

describe("a table defined in code, taken over in the console", () => {
  test("is refused without saying so, and taken over when it is said", async () => {
    const id = await workspace();
    expect((await deploy(id, [code("notes", sells)])).status).toBe(201);
    const plain = await alice.put(`${ws(id)}/resources/notes`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns: sells },
    });
    expect(plain.status).toBe(409);
    expect(await ownerOf(id, "notes")).toBe("code");

    const taken = await takeOver(id, "notes", { ...sells, body: { type: "text" } });
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    expect(taken.body.ownership).toBe("ui");
    const listed = (await alice.get(`${ws(id)}/tables/notes`)).body;
    expect(listed.managedIn).toBe("ui");
    expect(listed.columns.map((c: { name: string }) => c.name)).toContain("body");
    expect(await basisOf(id, "notes")).not.toBeNull();
    const entries = (await alice.get(`/tenants/${tenant}/audit?limit=200`)).body.items as {
      action: string;
      workspaceId?: string;
      details: { ownershipFrom?: string };
    }[];
    expect(
      entries.find((one) => one.action === "resource.updated" && one.workspaceId === id)?.details
        .ownershipFrom,
    ).toBe("code");
  });

  test("a repository deploy that still defines it is refused after a console change, and takes it back when forced", async () => {
    const id = await workspace();
    expect((await deploy(id, [code("notes", sells)])).status).toBe(201);
    expect((await takeOver(id, "notes", sells)).status).toBe(200);
    // Nothing changed since: the repository's definition simply takes it back.
    expect((await deploy(id, [code("notes", sells)])).status).toBe(201);
    expect(await ownerOf(id, "notes")).toBe("code");

    expect((await takeOver(id, "notes", sells)).status).toBe(200);
    const edited = { ...sells, body: { type: "text" } };
    const put = await alice.put(`${ws(id)}/resources/notes`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns: edited },
    });
    expect(put.status).toBe(200);
    const refused = await deploy(id, [code("notes", sells)]);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("console_changed");
    expect(await ownerOf(id, "notes")).toBe("ui");
    const forced = await deploy(id, [code("notes", sells)], { force: true });
    expect(forced.status, JSON.stringify(forced.body)).toBe(201);
    expect(await ownerOf(id, "notes")).toBe("code");
  });

  test("a change made in the same save that takes it over is the console's, and a deploy of the code is refused", async () => {
    const id = await workspace();
    expect((await deploy(id, [code("notes", sells)])).status).toBe(201);
    expect((await takeOver(id, "notes", { ...sells, body: { type: "text" } })).status).toBe(200);
    const refused = await deploy(id, [code("notes", sells)]);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("console_changed");
    expect(await ownerOf(id, "notes")).toBe("ui");
    const columns = (await alice.get(`${ws(id)}/tables/notes`)).body.columns as { name: string }[];
    expect(columns.map((c) => c.name)).toContain("body");
  });

  test("is refused in production, and so is retiring it", async () => {
    const prod = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "pull-first-prod",
        name: "Production",
        type: "production",
      })
    ).body.id;
    expect((await deploy(prod, [code("notes", sells)])).status).toBe(201);
    for (const refused of [
      await takeOver(prod, "notes", sells),
      await alice.delete(`${ws(prod)}/resources/notes`),
    ]) {
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("production_workspace");
    }
    expect(await ownerOf(prod, "notes")).toBe("code");
  });
});

describe("what a pull brings of a resource taken over from code", () => {
  const files = async (id: string) =>
    (await alice.get(`${ws(id)}/resource-files`)).body as {
      files: { path: string; content: string }[];
      basis: { path: string }[];
      inCode: { path: string; kind: string; file?: string }[];
    };
  const flowBody = {
    nodes: {
      start: { type: "trigger", trigger: { type: "manual" } },
      done: { type: "set", values: { ok: "true" } },
    },
    edges: [{ from: "start", to: "done" }],
  };

  test("a table taken over is a file, is named as still defined in code, and the basis is only of what is written", async () => {
    const id = await workspace();
    expect((await deploy(id, [code("notes", sells)])).status).toBe(201);
    const before = await files(id);
    expect(before.files).toEqual([]);
    expect(before.basis).toEqual([]);

    expect((await takeOver(id, "notes", { ...sells, body: { type: "text" } })).status).toBe(200);
    const after = await files(id);
    expect(after.files.map((file) => file.path)).toEqual(["notes.table.yaml"]);
    expect(after.files[0]?.content).toContain("body:");
    expect(after.basis.map((one) => one.path)).toEqual(["notes"]);
    expect(after.inCode).toEqual([{ path: "notes", kind: "table" }]);

    // What the pull wrote is what the repository has now, and with the code definition gone
    // the next deploy carries the file: it is not in code any more, and the column is kept.
    const taken = await alice.post(`${ws(id)}/resource-basis`, { resources: after.basis });
    expect(taken.status).toBe(200);
    const asFile: BundleManifest = {
      kind: "table",
      schemaVersion: 1,
      path: "notes",
      ownership: "ui",
      body: { columns: { ...sells, body: { type: "text" } } },
    };
    expect((await deploy(id, [asFile])).status).toBe(201);
    expect((await files(id)).inCode).toEqual([]);
    const listed = (await alice.get(`${ws(id)}/tables/notes`)).body;
    expect(listed.columns.map((c: { name: string }) => c.name)).toContain("body");
  });

  test("a flow taken over by a draft is a file, and is named as still defined in code", async () => {
    const id = await workspace();
    expect(
      (
        await deploy(id, [
          { kind: "flow", schemaVersion: 1, path: "f/one", ownership: "code", body: flowBody },
        ])
      ).status,
    ).toBe(201);
    const put = await alice.put(`${ws(id)}/drafts/f/one`, {
      kind: "flow",
      schemaVersion: 1,
      body: {
        ...flowBody,
        nodes: { ...flowBody.nodes, done: { type: "set", values: { ok: "false" } } },
      },
    });
    expect(put.status, JSON.stringify(put.body)).toBeLessThan(300);
    expect((await alice.post(`${ws(id)}/changes/deploy`, {})).status).toBeLessThan(300);
    const after = await files(id);
    expect(after.files.map((file) => file.path)).toEqual(["f/one.flow.yaml"]);
    expect(after.inCode).toEqual([{ path: "f/one", kind: "flow" }]);
    // A deploy that still defines it in code is refused, not a silent take-back.
    const refused = await deploy(id, [
      { kind: "flow", schemaVersion: 1, path: "f/one", ownership: "code", body: flowBody },
    ]);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("console_changed");
    // The console edits it again: still named.
    expect((await alice.get(`${ws(id)}/drafts/f/one`)).status).toBe(404);
    const again = await alice.put(`${ws(id)}/drafts/f/one`, {
      kind: "flow",
      schemaVersion: 1,
      body: flowBody,
    });
    expect(again.status).toBeLessThan(300);
    expect((await alice.post(`${ws(id)}/changes/deploy`, {})).status).toBeLessThan(300);
    expect((await files(id)).inCode).toEqual([{ path: "f/one", kind: "flow" }]);
  });
});
