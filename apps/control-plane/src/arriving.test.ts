import { type Bundle, type BundleManifest, bundleDigest, formatFor } from "@volvel/manifest";
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
  prod = await make("main", "production");
  dev = await make("dev", "dev");
  await alice.patch(ws(dev), { linkedWorkspaceId: prod });
}, 60_000);

afterAll(async () => {
  await t.stop();
});

const object = { type: "object" };
const script = (path: string, uses: Record<string, string[]>) =>
  manifest("script", path, {
    entry: "main",
    input: object,
    output: object,
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], sources: [], ...uses },
  });

describe("production is set up for what a promotion brings, before it arrives", () => {
  test("the promotion is refused, what it lists can be set up here, and then it goes through", async () => {
    const content = bundle([
      manifest("connection", "mail", { connector: "smtp" }),
      manifest("variable", "region", {}),
      manifest("data_source", "warehouse", { connector: "postgres" }),
      script("send", { connections: ["mail"], variables: ["region"], sources: ["warehouse"] }),
    ]);
    const deployed = await deploy(dev, content);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);

    const preview = (await alice.get(`${ws(dev)}/promotion-preview`)).body;
    expect(preview.possible).toBe(false);
    expect(preview.refusal.errors.map((one: Any) => one.path).sort()).toEqual([
      "/connections/mail",
      "/sources/warehouse",
      "/variables/region",
    ]);

    // Production lists each as arriving, as what it is.
    const connections = (await alice.get(`${ws(prod)}/connection-bindings`)).body.items;
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      path: "mail",
      connector: "smtp",
      arrives: true,
      defined: false,
      bound: false,
    });
    expect(connections[0].configSchema.properties.host).toBeDefined();
    const variables = (await alice.get(`${ws(prod)}/variable-values`)).body.items;
    expect(variables).toMatchObject([{ path: "region", arrives: true, value: null }]);
    const sources = (await alice.get(`${ws(prod)}/data-source-bindings`)).body.items;
    expect(sources).toMatchObject([{ path: "warehouse", arrives: true, bound: false }]);

    // An SMTP connection takes SMTP's settings and not HTTP's.
    const http = await alice.put(`${ws(prod)}/connection-bindings/mail`, {
      config: { baseUrl: "http://mail.test" },
    });
    expect(http.status).toBe(400);
    const set = await alice.put(`${ws(prod)}/connection-bindings/mail`, {
      config: { host: "smtp.test", from: "ops@acme.example" },
      credential: "pw",
    });
    expect(set.status, JSON.stringify(set.body)).toBe(204);
    expect((await alice.put(`${ws(prod)}/variable-values/region`, { value: "eu" })).status).toBe(
      204,
    );
    expect(
      (
        await alice.put(`${ws(prod)}/data-source-bindings/warehouse`, {
          config: { host: "db.test", database: "w", user: "u" },
          password: "x",
        })
      ).status,
    ).toBe(204);
    expect((await alice.get(`${ws(prod)}/connection-bindings`)).body.items[0]).toMatchObject({
      connector: "smtp",
      bound: true,
      arrives: true,
    });

    const promoted = await alice.post(`${ws(dev)}/promotions`);
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(201);
    const after = (await alice.get(`${ws(prod)}/connection-bindings`)).body.items[0];
    expect(after).toMatchObject({ connector: "smtp", bound: true, arrives: false, defined: true });
  });
});
