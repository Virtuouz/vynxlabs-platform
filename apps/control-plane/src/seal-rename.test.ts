import { type Bundle, type BundleManifest, bundleDigest, formatFor } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readSourcePassword } from "./kernel/data/sources.js";
import { readConnection, readGroupMember } from "./kernel/execution/bindings.js";
import { tenantKey } from "./kernel/tenant-keys.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
let dev: string;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const manifest = (
  kind: string,
  path: string,
  body: Record<string, unknown>,
  key?: string,
): BundleManifest => ({
  kind,
  schemaVersion: kind === "interface" ? 2 : kind === "dashboard" ? 3 : 1,
  path,
  ownership: "code",
  body,
  ...(key !== undefined ? { key } : {}),
});
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

const ws = (id: string) => `/tenants/${tenant}/workspaces/${id}`;
async function deploy(workspace: string, content: Bundle, extra: object = {}) {
  const uploaded = await alice.post(`${ws(workspace)}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return alice.post(`${ws(workspace)}/deployments`, { bundleId: uploaded.body.id, ...extra });
}
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
  dev = await make("dev", "dev");
}, 60_000);

afterAll(async () => {
  await t.stop();
});

const hook = (path: string, key?: string) =>
  manifest("connection", path, { connector: "http" }, key);
const group = (path: string, key?: string) =>
  manifest("connection_group", path, { connector: "http" }, key);
const source = (path: string, key?: string) =>
  manifest("data_source", path, { connector: "postgres" }, key);

async function cloned(body: Record<string, unknown>) {
  const asked = await alice.post(`${ws(dev)}/clones`, body);
  if (asked.status !== 202) return asked;
  for (let i = 0; i < 200; i++) {
    const now = await alice.get(`/tenants/${tenant}/workspace-clones/${asked.body.id}`);
    if (now.body.status !== "running" && now.body.status !== "queued") return now;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("the clone did not finish");
}

const at = (workspace: string, path: string) => ({
  tenantId: tenant,
  workspaceId: workspace,
  path,
});

describe("what a workspace keeps sealed follows a rename", () => {
  test("a credential is read after a rename, a swap, a rename back and a clone", async () => {
    const first = bundle([hook("hook"), hook("other"), group("crm"), source("warehouse")]);
    expect((await deploy(dev, first)).status).toBe(201);
    expect(
      (
        await alice.put(`${ws(dev)}/connection-bindings/hook`, {
          config: { baseUrl: "http://hook.test" },
          credential: "hook-secret",
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await alice.put(`${ws(dev)}/connection-bindings/other`, {
          config: { baseUrl: "http://hook.test" },
          credential: "other-secret",
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await alice.put(`${ws(dev)}/connection-group-members/one/crm`, {
          config: { baseUrl: "http://crm.test" },
          credential: "member-secret",
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await alice.put(`${ws(dev)}/data-source-bindings/warehouse`, {
          config: { host: "db.test", database: "w", user: "u" },
          password: "db-secret",
        })
      ).status,
    ).toBe(204);

    // Renamed: the same resources, under folders.
    const moved = bundle([
      hook("ops/hook", "hook"),
      hook("other", "other"),
      group("ops/crm", "crm"),
      source("ops/warehouse", "warehouse"),
    ]);
    const renamed = await deploy(dev, moved);
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(201);
    expect(renamed.body.summary).toMatchObject({ renamed: 3 });
    expect((await readConnection(t.kernel, t.db, at(dev, "ops/hook")))?.credential).toBe(
      "hook-secret",
    );
    expect(
      (
        await readGroupMember(t.kernel, t.db, {
          tenantId: tenant,
          workspaceId: dev,
          group: "ops/crm",
          key: "one",
        })
      )?.credential,
    ).toBe("member-secret");
    const binding = await t.db
      .selectFrom("data_source_binding")
      .select(["id", "credential"])
      .where("workspace_id", "=", dev)
      .where("path", "=", "ops/warehouse")
      .executeTakeFirstOrThrow();
    expect(await readSourcePassword(t.kernel, t.db, at(dev, "ops/warehouse"), binding)).toBe(
      "db-secret",
    );

    // Two connections trade paths.
    const swapped = bundle([
      hook("ops/hook", "hook"),
      hook("other", "other"),
      group("ops/crm", "crm"),
      source("ops/warehouse", "warehouse"),
    ]);
    const traded = bundle(
      swapped.manifests.map((entry) =>
        entry.path === "ops/hook"
          ? hook("other", "hook")
          : entry.path === "other"
            ? hook("ops/hook", "other")
            : entry,
      ),
    );
    const swap = await deploy(dev, traded);
    expect(swap.status, JSON.stringify(swap.body)).toBe(201);
    expect((await readConnection(t.kernel, t.db, at(dev, "other")))?.credential).toBe(
      "hook-secret",
    );
    expect((await readConnection(t.kernel, t.db, at(dev, "ops/hook")))?.credential).toBe(
      "other-secret",
    );

    // A clone with safety off copies what a renamed connection holds.
    const done = await cloned({ slug: "copy", name: "Copy", safe: false });
    expect(done.body.status, JSON.stringify(done.body)).toBe("succeeded");
    expect(
      (await readConnection(t.kernel, t.db, at(done.body.workspaceId, "other")))?.credential,
    ).toBe("hook-secret");
  });

  test("a row sealed under its path before, and renamed since, opens and is sealed again", async () => {
    const legacy = await t.db
      .selectFrom("connection_binding")
      .select(["id", "credential"])
      .where("workspace_id", "=", dev)
      .where("path", "=", "other")
      .executeTakeFirstOrThrow();
    // As the platform used to seal: under the path it had, which is not the one it has.
    const key = await tenantKey(t.db, t.kernel.vault, tenant);
    const old = t.kernel.vault.encrypt(
      key,
      { tenantId: tenant, workspaceId: dev, name: "connection:hook" },
      "from-before",
    );
    await t.db
      .updateTable("connection_binding")
      .set({ credential: old })
      .where("id", "=", legacy.id)
      .execute();
    expect((await readConnection(t.kernel, t.db, at(dev, "other")))?.credential).toBe(
      "from-before",
    );
    const after = await t.db
      .selectFrom("connection_binding")
      .select("credential")
      .where("id", "=", legacy.id)
      .executeTakeFirstOrThrow();
    expect(after.credential?.equals(old as Buffer)).toBe(false);
  });

  test("a credential no name opens is said in words, and saving does not keep it", async () => {
    const row = await t.db
      .selectFrom("connection_binding")
      .select("id")
      .where("workspace_id", "=", dev)
      .where("path", "=", "other")
      .executeTakeFirstOrThrow();
    await t.db
      .updateTable("connection_binding")
      .set({ credential: Buffer.from("not sealed by anything") })
      .where("id", "=", row.id)
      .execute();
    await expect(readConnection(t.kernel, t.db, at(dev, "other"))).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringMatching(/cannot be read.*enter it again/i),
    });
    const kept = await alice.put(`${ws(dev)}/connection-bindings/other`, {
      config: { baseUrl: "http://hook.test" },
    });
    expect(kept.status).toBe(422);
    const fixed = await alice.put(`${ws(dev)}/connection-bindings/other`, {
      config: { baseUrl: "http://hook.test" },
      credential: "again",
    });
    expect(fixed.status).toBe(204);
    expect((await readConnection(t.kernel, t.db, at(dev, "other")))?.credential).toBe("again");
  });
});

describe("a credential stays with the address it was given for", () => {
  test("another origin without a credential drops it; the same origin keeps it", async () => {
    await alice.put(`${ws(dev)}/connection-bindings/other`, {
      config: { baseUrl: "http://hook.test/v1" },
    });
    expect((await readConnection(t.kernel, t.db, at(dev, "other")))?.credential).toBe("again");
    const moved = await alice.put(`${ws(dev)}/connection-bindings/other`, {
      config: { baseUrl: "http://elsewhere.test" },
    });
    expect(moved.status).toBe(204);
    expect((await readConnection(t.kernel, t.db, at(dev, "other")))?.credential).toBeUndefined();
    const listed = (await alice.get(`${ws(dev)}/connection-bindings`)).body.items.find(
      (item: Any) => item.path === "other",
    );
    expect(listed.hasCredential).toBe(false);
  });

  test("a data source pointed at another host drops its password", async () => {
    await alice.put(`${ws(dev)}/data-source-bindings/ops/warehouse`, {
      config: { host: "else.test", database: "w", user: "u" },
    });
    const row = await t.db
      .selectFrom("data_source_binding")
      .select("credential")
      .where("workspace_id", "=", dev)
      .where("path", "=", "ops/warehouse")
      .executeTakeFirstOrThrow();
    expect(row.credential).toBeNull();
  });
});

describe("the workspace's default alert follows the connection it names", () => {
  test("renaming the connection renames what the alert points at", async () => {
    await alice.patch(ws(dev), { failureAlert: { notify: "ops/hook" } });
    const back = bundle([
      hook("elsewhere/hook", "other"),
      hook("other", "hook"),
      group("ops/crm", "crm"),
      source("ops/warehouse", "warehouse"),
    ]);
    const deployed = await deploy(dev, back);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const settings = (await alice.get(ws(dev))).body.failureAlert;
    expect(settings.notify).toBe("elsewhere/hook");
  });
});

describe("a clone keeps the key, title and meta of a console resource", () => {
  test("the clone's row equals the source's", async () => {
    await alice.put(`${ws(dev)}/resources/notes`, {
      kind: "variable",
      schemaVersion: 1,
      ownership: "ui",
      body: { default: "x" },
    });
    await t.db
      .updateTable("resource")
      .set({ key: "old/notes", title: "Notes" })
      .where("workspace_id", "=", dev)
      .where("path", "=", "notes")
      .execute();
    const done = await cloned({ slug: "second", name: "Second", safe: true });
    expect(done.body.status, JSON.stringify(done.body)).toBe("succeeded");
    const made = await t.db
      .selectFrom("resource")
      .select(["workspace_id", "key", "title", "meta"])
      .where("path", "=", "notes")
      .execute();
    expect(made).toHaveLength(2);
    expect(made[0]).toMatchObject({ key: "old/notes", title: "Notes" });
    expect(made[1]).toMatchObject({ key: "old/notes", title: "Notes" });
  });
});
