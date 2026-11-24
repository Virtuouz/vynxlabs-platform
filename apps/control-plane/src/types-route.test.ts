import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let alice: Client;
let dave: Client; // a member of the tenant who holds nothing in the workspace

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;

const manifest = (
  kind: string,
  path: string,
  body: Record<string, unknown>,
  ownership: "code" | "ui" = "code",
): BundleManifest => ({ kind, schemaVersion: 1, path, ownership, body });

function bundleOf(manifests: BundleManifest[]): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export {};\n",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

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
  const member = async (email: string) =>
    (await t.admin.post(`/tenants/${tenant}/members`, { email, name: email, password: PASSWORD }))
      .body.id as string;
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: await member("alice@acme.example"),
    roleId: roles.tenant_admin,
  });
  await member("dave@acme.example");
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  dave = await t.signIn("dave@acme.example", PASSWORD);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main-dev",
      name: "Dev",
      type: "dev",
    })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("the workspace's types", () => {
  test("an empty workspace has declarations that name nothing", async () => {
    const got = await alice.get(`${ws()}/types.d.ts`);
    expect(got.status).toBe(200);
    expect(got.headers["content-type"]).toContain("text/plain");
    expect(got.bytes.toString()).toContain('declare module "@volvel/sdk"');
    expect(got.bytes.toString()).not.toContain("interface Volvel");
  });

  test("what is deployed by a repository and what is saved as a draft are both named, and a deleting draft removes", async () => {
    const uploaded = await alice.post(
      `${ws()}/bundles`,
      bundleOf([
        manifest("table", "clinics", {
          columns: { name: { type: "text", required: true }, size: { type: "integer" } },
        }),
        manifest("variable", "limit", { default: "5" }),
        manifest("event", "paid", {
          payload: {
            type: "object",
            properties: { order: { type: "string" } },
            required: ["order"],
          },
        }),
      ]),
    );
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);

    const saved = await alice.put(`${ws()}/drafts/visits`, {
      kind: "table",
      schemaVersion: 1,
      body: { columns: { clinic: { type: "reference", references: "clinics", required: true } } },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);

    const text = (await alice.get(`${ws()}/types.d.ts`)).bytes.toString();
    expect(text).toContain("interface VolvelTables");
    expect(text).toContain(
      '"clinics": { row: { id: string; created_at: string; updated_at: string; name: string;',
    );
    expect(text).toContain("size?: number | null;");
    expect(text).toContain('"visits"');
    expect(text).toContain('"limit": { default: string }');
    expect(text).toContain('"paid": { order: string; }');

    // A draft that removes a deployed resource takes its name out.
    const settled = await alice.post(`${ws()}/changes/deploy`, { paths: ["visits"] });
    expect(settled.status, JSON.stringify(settled.body)).toBeLessThan(300);
    const gone = await alice.put(`${ws()}/drafts/visits`, {
      kind: "table",
      schemaVersion: 1,
      body: { columns: { clinic: { type: "reference", references: "clinics", required: true } } },
      deleted: true,
      revision: (await alice.get(`${ws()}/drafts/visits`)).body?.revision,
    });
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    const after = (await alice.get(`${ws()}/types.d.ts`)).bytes.toString();
    expect(after).not.toContain('"visits"');
    expect(after).toContain('"clinics"');
  });

  test("it is for those who may read scripts, and the answer says who can give it", async () => {
    const refused = await dave.get(`${ws()}/types.d.ts`);
    expect(refused.status).toBe(403);
  });
});
