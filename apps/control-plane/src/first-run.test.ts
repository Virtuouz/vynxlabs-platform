import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

/**
 * The first minutes in a new tenant (phase 14, P2-13): whoever makes it can
 * be its first member, a new workspace says what it has and lacks, and a
 * script written and not yet deployed is listed with the rest.
 */

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

const script = (code: string) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});

describe("a new tenant's first minutes", () => {
  let tenant: string;
  let ws: string;

  test("the operator who makes a tenant can be its first member, holding tenant_admin", async () => {
    const made = await t.admin.post("/tenants", {
      slug: "first",
      name: "First",
      addCreator: true,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    tenant = made.body.id;
    // Inside it as its own people are: no access grant is needed to make a workspace.
    const workspace = await t.admin.post(`/tenants/${tenant}/workspaces`, {
      slug: "dev",
      name: "Dev",
      type: "dev",
    });
    expect(workspace.status, JSON.stringify(workspace.body)).toBe(201);
    ws = workspace.body.id;
    const bindings = (await t.admin.get(`/tenants/${tenant}/bindings`)).body.items as {
      principalType: string;
      roleName: string;
    }[];
    expect(bindings).toEqual([
      expect.objectContaining({ principalType: "member", roleName: "tenant_admin" }),
    ]);
    const actions = (await t.admin.get(`/tenants/${tenant}/audit?limit=50`)).body.items.map(
      (entry: { action: string }) => entry.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(["tenant.created", "tenant_member.added", "binding.created"]),
    );
    // Without it, an operator has no way in but an access grant: inside, the tenant is not found.
    const other = await t.admin.post("/tenants", { slug: "second", name: "Second" });
    expect((await t.admin.get(`/tenants/${other.body.id}/bindings`)).status).toBe(404);
  });

  test("a new workspace's summary says what it has and lacks, for its first steps", async () => {
    const summary = async () =>
      (await t.admin.get(`/tenants/${tenant}/workspaces/${ws}/summary`)).body;
    expect(await summary()).toMatchObject({
      scripts: 0,
      flows: 0,
      everRan: false,
      workersOnline: 0,
      version: null,
    });
    // A script written and not yet deployed is a script here, and listed with the rest.
    const drafted = await t.admin.put(
      `/tenants/${tenant}/workspaces/${ws}/drafts/hello/greet`,
      script("export default async () => ({ hello: 'world' });\n"),
    );
    expect(drafted.status, JSON.stringify(drafted.body)).toBe(200);
    expect((await summary()).scripts).toBe(1);
    const listed = (await t.admin.get(`/tenants/${tenant}/workspaces/${ws}/scripts`)).body.items;
    expect(listed).toEqual([
      expect.objectContaining({ path: "hello/greet", draft: true, deployed: false, lastRun: null }),
    ]);
  });
});
