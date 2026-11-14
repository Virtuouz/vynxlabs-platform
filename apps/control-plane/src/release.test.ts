import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { describeChange } from "./kernel/describe.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client; // tenant admin
let dan: Client; // developer: deploys to dev, may not promote
let roles: Record<string, string>;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;

function bundle(note: string): Bundle {
  const manifests: BundleManifest[] = [
    {
      kind: "script",
      schemaVersion: 1,
      path: "orders/sync",
      ownership: "code",
      body: {
        entry: "sync",
        input: { type: "object" },
        output: { type: "object" },
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: ["erp"], secrets: [], variables: [] },
      },
    },
    {
      kind: "connection",
      schemaVersion: 1,
      path: "erp",
      ownership: "code",
      body: { connector: "http" },
    },
  ];
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: `export const sync = { execute: async () => ({ note: ${JSON.stringify(note)} }) };\n`,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: TENANT_ADMIN,
  });
  const member = async (email: string, role: string) => {
    const made = await t.admin.post(`/tenants/${tenant}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: made.body.id,
      roleId: roles[role],
    });
    return t.signIn(email, PASSWORD);
  };
  alice = await member("alice@acme.example", "tenant_admin");
  dan = await member("dan@acme.example", "developer");
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "orders",
      name: "Orders",
      type: "production",
    })
  ).body.id;
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "orders-dev",
      name: "Orders dev",
      type: "dev",
      linkedWorkspaceId: prod,
    })
  ).body.id;
}, 60_000);
afterAll(() => t?.stop());

describe("deploying with something unbound", () => {
  test("a dev workspace takes it with a warning; production refuses it", async () => {
    const uploaded = await alice.post(`${ws()}/bundles`, bundle("one"));
    const deployed = await alice.post(`${ws()}/deployments`, {
      bundleId: uploaded.body.id,
      message: "First version",
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.summary.warnings).toEqual([
      { path: "/connections/erp", message: 'the connection "erp" is not bound in this workspace' },
    ]);

    const toProd = await alice.post(`${ws(prod)}/bundles`, bundle("one"));
    const refused = await alice.post(`${ws(prod)}/deployments`, { bundleId: toProd.body.id });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("bindings_missing");
  });

  test("the ledger says who deployed, what they said, and where it runs", async () => {
    const ledger = (await alice.get(`${ws()}/deployments`)).body.items;
    expect(ledger[0]).toMatchObject({
      message: "First version",
      createdBy: "alice@acme.example",
      runningIn: [{ id: dev, name: "Orders dev", type: "dev" }],
    });
  });
});

describe("promoting", () => {
  test("needs promotion:write, which a developer does not hold", async () => {
    await alice.put(`${ws(prod)}/connection-bindings/erp`, {
      config: { baseUrl: "https://erp.example.test" },
    });
    const preview = (await alice.get(`${ws()}/promotion-preview`)).body;
    expect(preview.possible).toBe(true);
    expect(preview.tried).toEqual({ runs: 0, failed: 0, flowRuns: 0, flowRunsFailed: 0 });
    expect(typeof preview.triggers).toBe("number");

    const refused = await dan.post(`${ws()}/promotions`, {});
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("promotion:write");
    const promoted = await alice.post(`${ws()}/promotions`, {});
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(201);
    const ledger = (await alice.get(`${ws()}/deployments`)).body.items;
    expect(ledger[0].runningIn.map((one: { id: string }) => one.id).sort()).toEqual(
      [dev, prod].sort(),
    );
  });

  test("the built-in roles that could deploy may promote", async () => {
    const deployer = await t.db
      .selectFrom("role")
      .select("permissions")
      .where("name", "=", "deployer")
      .executeTakeFirstOrThrow();
    expect(deployer.permissions).toContain("promotion:write");
    const developer = await t.db
      .selectFrom("role")
      .select("permissions")
      .where("name", "=", "developer")
      .executeTakeFirstOrThrow();
    expect(developer.permissions).not.toContain("promotion:write");
  });
});

describe("drafts", () => {
  const save = (body: Record<string, unknown>, as = alice) =>
    as.put(`${ws()}/drafts/orders/note`, { kind: "variable", schemaVersion: 1, body });

  test("each save keeps what it replaced, and setting a draft aside keeps it whole", async () => {
    expect((await save({ description: "First" })).status).toBe(200);
    expect((await save({ description: "Second" })).status).toBe(200);
    expect((await alice.delete(`${ws()}/drafts/orders/note`)).status).toBe(204);
    const history = (await alice.get(`${ws()}/draft-history/orders/note`)).body.items;
    expect(
      history.map((one: { reason: string; body: { description: string } }) => [
        one.reason,
        one.body.description,
      ]),
    ).toEqual([
      ["set_aside", "Second"],
      ["replaced", "First"],
    ]);

    const restored = await alice.post(`${ws()}/draft-history/${history[1].id}/restore`, {});
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect((await alice.get(`${ws()}/drafts/orders/note`)).body.body).toEqual({
      description: "First",
    });
  });

  test("a draft says in words what deploying it changes", async () => {
    const drafts = (await alice.get(`${ws()}/drafts`)).body.items;
    expect(drafts.find((one: { path: string }) => one.path === "orders/note").about).toEqual([
      "A new variable.",
    ]);
  });
});

describe("describing a change", () => {
  test("a flow's steps and wiring", () => {
    const before = {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        send: { type: "script", script: "orders/send" },
      },
      edges: [{ from: "start", to: "send" }],
    };
    const after = {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        gate: { type: "approval", title: "Approve a large order" },
        send: { type: "script", script: "orders/send", input: "trigger" },
      },
      edges: [
        { from: "start", to: "gate" },
        { from: "gate", to: "send" },
      ],
    };
    expect(describeChange("flow", before, after)).toEqual([
      "Adds the step gate (an approval: Approve a large order).",
      "Changes input of the step send.",
      "Connects start → gate and gate → send.",
      "Disconnects start → send.",
    ]);
  });

  test("a script's reach and limits, a table's columns, and nothing at all", () => {
    expect(
      describeChange(
        "script",
        { uses: { connections: ["erp"] }, timeoutSeconds: 30 },
        { uses: { connections: ["erp", "alerts"] }, timeoutSeconds: 60 },
      ),
    ).toEqual(["Now uses the connection alerts.", "Gives up after 60s instead of 30s."]);
    expect(
      describeChange(
        "table",
        { columns: { a: { type: "text" } } },
        { columns: { b: { type: "text" } } },
      ),
    ).toEqual(["Adds the column b.", "Retires the column a; their data is kept."]);
    expect(describeChange("variable", { description: "x" }, { description: "x" })).toEqual([
      "No change that matters to how it runs.",
    ]);
    expect(describeChange("table", { columns: {} }, undefined)[0]).toContain("Retires the table");
  });
});

describe("the write path", () => {
  test("every change was audited", () => {
    expect(t.unaudited).toEqual([]);
    expect(t.unexercised((route) => route.includes("/draft-history/"))).toEqual([]);
  });
});
