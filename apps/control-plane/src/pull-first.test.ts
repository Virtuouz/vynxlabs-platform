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
const variable = (path: string, value: string): BundleManifest => ({
  kind: "variable",
  schemaVersion: 1,
  path,
  ownership: "ui",
  body: { default: value },
});
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
async function editInConsole(id: string, path: string, value: string) {
  const seen = await alice.get(`${ws(id)}/drafts/${path}`);
  const saved = await alice.put(`${ws(id)}/drafts/${path}`, {
    kind: "variable",
    schemaVersion: 1,
    body: { default: value },
    ...(seen.status === 200 ? { revision: seen.body.revision } : {}),
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const done = await alice.post(`${ws(id)}/changes/deploy`, { paths: [path] });
  expect(done.status, JSON.stringify(done.body)).toBe(201);
}
const valueAt = async (id: string, path: string) =>
  ((await alice.get(`${ws(id)}/resources/${path}`)).body.body as { default: string }).default;
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

describe("a deploy from the repository, after the console changed a file resource", () => {
  test("is refused, with each path, what happened to it, and what to do", async () => {
    const id = await workspace();
    expect((await deploy(id, [variable("limit", "5"), variable("tier", "a")])).status).toBe(201);
    expect(await basisOf(id, "limit")).toMatch(/^[0-9a-f]{64}$/);
    await editInConsole(id, "limit", "9");

    const refused = await deploy(id, [variable("limit", "6"), variable("tier", "a")]);
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.code).toBe("console_changed");
    expect(refused.body.detail).toContain("Run `volvel pull`, review, commit, and deploy again.");
    expect(refused.body.errors).toEqual([
      { path: "limit", message: expect.stringContaining("changed in the console") },
    ]);
    // Nothing was replaced.
    expect(await valueAt(id, "limit")).toBe("9");
  });

  test("is refused when it would remove a resource made in the console since", async () => {
    const id = await workspace();
    expect((await deploy(id, [variable("limit", "5")])).status).toBe(201);
    await editInConsole(id, "extra", "1");

    const refused = await deploy(id, [variable("limit", "5")]);
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.code).toBe("console_changed");
    expect(refused.body.errors).toEqual([
      { path: "extra", message: expect.stringContaining("made in the console") },
    ]);
    expect((await alice.get(`${ws(id)}/resources/extra`)).status).toBe(200);

    // A removal asked for by name is not a surprise.
    const allowed = await deploy(id, [variable("limit", "5")], { allowDelete: ["extra"] });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
    expect((await alice.get(`${ws(id)}/resources/extra`)).status).toBe(404);
  });

  test("passes after a pull, which says what the console had", async () => {
    const id = await workspace();
    expect((await deploy(id, [variable("limit", "5")])).status).toBe(201);
    await editInConsole(id, "limit", "9");

    // `volvel pull` reads the files, and tells the server what it took.
    const pulled = (await alice.get(`${ws(id)}/resource-files?drafts=false`)).body as {
      basis: { path: string; hash: string }[];
    };
    expect(pulled.basis.map((one) => one.path)).toEqual(["limit"]);
    const told = await alice.post(`${ws(id)}/resource-basis`, { resources: pulled.basis });
    expect(told.status, JSON.stringify(told.body)).toBe(200);

    const deployed = await deploy(id, [variable("limit", "10")]);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(await valueAt(id, "limit")).toBe("10");
  });

  test("passes with --force, and the audit log says it was forced", async () => {
    const id = await workspace();
    expect((await deploy(id, [variable("limit", "5")])).status).toBe(201);
    await editInConsole(id, "limit", "9");

    const forced = await deploy(id, [variable("limit", "6")], { force: true });
    expect(forced.status, JSON.stringify(forced.body)).toBe(201);
    expect(await valueAt(id, "limit")).toBe("6");
    const entries = (await alice.get(`/tenants/${tenant}/audit?limit=200`)).body.items as {
      action: string;
      workspaceId?: string;
      details: { paths?: { path: string }[] };
    }[];
    const entry = entries.find(
      (one) => one.action === "deployment.forced" && one.workspaceId === id,
    );
    expect(entry?.details.paths?.map((one) => one.path)).toEqual(["limit"]);
    // A forced deploy is the repository's: the next one is not refused.
    expect((await deploy(id, [variable("limit", "7")])).status).toBe(201);
  });

  test("is shown refused by the preview, and not forced by it unless asked", async () => {
    const id = await workspace();
    expect((await deploy(id, [variable("limit", "5")])).status).toBe(201);
    await editInConsole(id, "limit", "9");
    const uploaded = await alice.post(`${ws(id)}/bundles`, bundleOf([variable("limit", "6")]));
    const preview = await alice.get(`${ws(id)}/deployment-preview?bundleId=${uploaded.body.id}`);
    expect(preview.body.possible).toBe(false);
    expect(preview.body.refusal.code).toBe("console_changed");
    const forced = await alice.get(
      `${ws(id)}/deployment-preview?bundleId=${uploaded.body.id}&force=true`,
    );
    expect(forced.body.possible).toBe(true);
  });
});

describe("a workspace that never had a deploy from a repository", () => {
  test("is not held back: a console-only workspace, and the first deploy into one", async () => {
    const id = await workspace();
    await editInConsole(id, "limit", "1");
    await editInConsole(id, "limit", "2");
    expect(await basisOf(id, "limit")).toBeNull();
    // The first bundle from a repository replaces what the console made, as it always did.
    const first = await deploy(id, [variable("tier", "a")]);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(await basisOf(id, "tier")).not.toBeNull();
  });
});

describe("the write path", () => {
  test("every change was audited", () => {
    expect(t.unaudited).toEqual([]);
  });
});
