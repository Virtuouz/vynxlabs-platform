import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";

let t: TestApp;
let tenant: string;
let prod: string;
let alice: Client;
let roles: Record<string, string>;
let runtime: string;

const ws = () => `/tenants/${tenant}/workspaces/${prod}`;
const manifest = (kind: string, path: string, body: object): BundleManifest =>
  ({ kind, path, schemaVersion: 1, ownership: "code", body }) as BundleManifest;

const at = { x: 0, y: 0, w: 12, h: 8 };
const screen = {
  title: "Invoices",
  pages: [
    {
      id: "main",
      title: "Invoices",
      widgets: [
        { id: "list", type: "table", table: "invoices", fields: [{ column: "number" }], at },
        {
          id: "by_team",
          type: "table",
          table: "invoices",
          summary: { groupBy: [{ column: "team" }], aggregates: [{ fn: "count", as: "invoices" }] },
          at,
        },
        { id: "gone", type: "table", table: "not-there", at },
      ],
    },
  ],
};

function bundle(): Bundle {
  const unsigned = {
    formatVersion: 3 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("table", "invoices", {
        description: "What customers have been billed.",
        columns: {
          number: { type: "text", required: true, description: "The number printed on it." },
          team: { type: "text", description: "The team that sent it." },
          total: { type: "number" },
        },
        policy: {
          type: "rules",
          rules: [{ allow: "read", when: { column: "team", in: "groups" } }],
        },
      }),
      manifest("table", "secrets", {
        description: "Notes nobody outside may read.",
        columns: { note: { type: "text", description: "The note." } },
      }),
      manifest("table", "plain", { columns: { note: { type: "text" } } }),
      manifest("interface", "screens/invoices", screen),
      manifest("interface", "screens/private", {
        title: "Private",
        pages: [
          { id: "p", title: "P", widgets: [{ id: "s", type: "table", table: "secrets", at }] },
        ],
      }),
      manifest("app", "billing", { title: "Invoices", interface: "screens/invoices" }),
      manifest("app", "private", { title: "Private", interface: "screens/private" }),
      manifest("binding", "bindings/app", {
        role: "portal_user",
        principal: { type: "end_users" },
        resource: "billing",
      }),
      manifest("binding", "bindings/rows", {
        role: "portal_user",
        principal: { type: "end_users" },
        resource: "invoices",
      }),
    ],
    code: "export {};",
    assets: [],
  };
  return { ...unsigned, digest: bundleDigest(unsigned) } as Bundle;
}

/** A browser at the instance's address: it keeps the cookies it is given. */
function browser(app: TestApp = t) {
  const jar = new Map<string, string>();
  const call = async (
    method: "GET" | "POST",
    url: string,
    form?: Record<string, string>,
    json?: object,
  ) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await app.app.inject({
      method,
      url,
      headers: {
        host: MAIN,
        ...(cookie ? { cookie } : {}),
        ...(form
          ? { origin: `http://${MAIN}`, "content-type": "application/x-www-form-urlencoded" }
          : {}),
        ...(json ? { origin: `http://${MAIN}`, "content-type": "application/json" } : {}),
      },
      ...(form ? { payload: new URLSearchParams(form).toString() } : {}),
      ...(json ? { payload: JSON.stringify(json) } : {}),
    });
    for (const line of ([] as string[]).concat(response.headers["set-cookie"] ?? [])) {
      const [pair = ""] = line.split(";");
      const split = pair.indexOf("=");
      jar.set(pair.slice(0, split), pair.slice(split + 1));
    }
    let body: Any = response.body;
    if ((response.headers["content-type"] ?? "").toString().includes("json"))
      body = response.json();
    return { status: response.statusCode, body, headers: response.headers };
  };
  return {
    get: (url: string) => call("GET", url),
    form: (url: string, form: Record<string, string>) => call("POST", url, form),
    post: (url: string, json: object) => call("POST", url, undefined, json),
  };
}

/** Makes an end user who has chosen a password, in a group, and signs them in. */
async function endUser(email: string, group?: string) {
  const created = await alice.post(`/tenants/${tenant}/end-users`, { email, name: email });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const visitor = browser();
  const token = new URL(created.body.invitation.url).searchParams.get("token") as string;
  expect(
    (await visitor.form("/portal/acme/set-password", { token, password: PASSWORD })).status,
  ).toBe(303);
  if (group) {
    const made = await alice.post(`/tenants/${tenant}/end-user-groups`, { name: group });
    await alice.put(
      `/tenants/${tenant}/end-user-groups/${made.body.id}/members/${created.body.endUser.id}`,
    );
  }
  return { id: created.body.endUser.id as string, browser: visitor };
}

beforeAll(async () => {
  // The files of the app that draws interfaces, as the image would hold them.
  runtime = mkdtempSync(join(tmpdir(), "vx-screens-"));
  mkdirSync(join(runtime, "assets"));
  writeFileSync(
    join(runtime, "index.html"),
    '<!doctype html><html><head><title>App</title></head><body><div id="app"></div><script type="module" src="./assets/runtime-4be1c09a.js"></script></body></html>',
  );
  writeFileSync(join(runtime, "assets/runtime-4be1c09a.js"), 'console.log("runtime");');

  t = await startTestApp({ config: { screensDir: runtime } });
  roles = Object.fromEntries(
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
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
});

afterAll(async () => {
  await t?.stop();
  rmSync(runtime, { recursive: true, force: true });
});

let ivy: Awaited<ReturnType<typeof endUser>>;
let jon: Awaited<ReturnType<typeof endUser>>;
describe("an app that serves an interface", () => {
  const view = (who: { browser: ReturnType<typeof browser> }, path = "screens/invoices") =>
    who.browser.get(`/api/v1${ws()}/interfaces/${path}`);

  test("it deploys with no files of its own, and is listed with the workspace's apps", async () => {
    const uploaded = await alice.post(`${ws()}/bundles`, bundle());
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const apps = (await alice.get(`${ws()}/apps`)).body.items;
    expect(apps.map((app: Any) => [app.path, app.url])).toEqual([
      ["billing", "http://localhost:8080/apps/acme/main/billing/"],
      ["private", "http://localhost:8080/apps/acme/main/private/"],
    ]);
    const seeded = await alice.post(`${ws()}/rows/invoices`, {
      rows: [
        { number: "INV-1", team: "finance", total: 10 },
        { number: "INV-2", team: "finance", total: 20 },
        { number: "INV-3", team: "sales", total: 5 },
      ],
    });
    expect(seeded.status, JSON.stringify(seeded.body)).toBe(201);
    ivy = await endUser("ivy@customer.example", "finance");
    jon = await endUser("jon@customer.example", "sales");
  });

  test("it is served the platform's own files, with the interface named in the page", async () => {
    // Someone not signed in is sent to sign in, as for any app.
    const guest = await browser().get("/apps/acme/main/billing/");
    expect(guest.status).toBe(303);
    expect(guest.headers.location).toContain("/portal/acme/sign-in");

    const page = await ivy.browser.get("/apps/acme/main/billing/");
    expect(page.status).toBe(200);
    expect(page.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(page.body).toContain('<base href="/apps/acme/main/billing/">');
    expect(page.body).toContain('"interface":"screens/invoices"');
    expect(page.body).toContain('"path":"billing"');
    const script = await ivy.browser.get("/apps/acme/main/billing/assets/runtime-4be1c09a.js");
    expect(script.status).toBe(200);
    expect(script.headers["content-type"]).toContain("text/javascript");
    expect(script.body).toBe('console.log("runtime");');
    expect(script.headers["cache-control"]).toContain("immutable");
    // An address that names no file is a screen of the app.
    expect((await ivy.browser.get("/apps/acme/main/billing/main")).body).toContain('id="app"');
    expect((await ivy.browser.get("/apps/acme/main/billing/assets/nope.js")).status).toBe(404);
    // It is among the apps the portal offers her. The one she may not open is not.
    const home = await ivy.browser.get("/portal/acme/");
    expect(home.body).toContain("/apps/acme/main/billing/");
    expect(home.body).not.toContain("/apps/acme/main/private/");
    expect((await ivy.browser.get("/apps/acme/main/private/")).status).toBe(403);
  });

  test("whoever may open the app may read its interface, and what its tables hold", async () => {
    const seen = await view(ivy);
    expect(seen.status, JSON.stringify(seen.body)).toBe(200);
    expect(seen.body.path).toBe("screens/invoices");
    expect(seen.body.interface).toEqual(screen);
    expect(seen.body.tables.invoices).toEqual({
      found: true,
      canRead: true,
      canWrite: true,
      columns: [
        { name: "id", type: "uuid", required: true, references: null },
        { name: "created_at", type: "timestamp", required: true, references: null },
        { name: "updated_at", type: "timestamp", required: true, references: null },
        {
          name: "number",
          description: "The number printed on it.",
          type: "text",
          required: true,
          references: null,
        },
        {
          name: "team",
          description: "The team that sent it.",
          type: "text",
          required: false,
          references: null,
        },
        // A column that says nothing of itself has no description at all.
        { name: "total", type: "number", required: false, references: null },
      ],
    });
    // A table that is gone is said to be gone. The page still loads.
    expect(seen.body.tables["not-there"]).toEqual({
      found: false,
      canRead: false,
      canWrite: false,
      columns: [],
    });
    // Nothing of the table's policy, its size or where it is stored.
    const text = JSON.stringify(seen.body);
    for (const leak of ["policy", "rules", "rowCount", "stored", "t_invoices"]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  test("an interface is not there for someone who may open none of its apps", async () => {
    expect((await view(ivy, "screens/private")).status).toBe(404);
    expect((await view(ivy, "screens/never-was")).status).toBe(404);
    expect((await view({ browser: browser() })).status).toBe(404);
    // Staff who may read the workspace's resources see any of them.
    const staff = await alice.get(`${ws()}/interfaces/screens/private`);
    expect(staff.status).toBe(200);
    expect(staff.body.tables.secrets.canWrite).toBe(true);
    // Another tenant's member is told the tenant is not there.
    const globex = (await t.admin.post("/tenants", { slug: "globex", name: "Globex" })).body.id;
    await t.admin.post(`/tenants/${globex}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    await t.admin.post(`/tenants/${globex}/members`, {
      email: "gina@globex.example",
      name: "Gina",
      password: PASSWORD,
    });
    const gina = await t.signIn("gina@globex.example", PASSWORD);
    expect((await gina.get(`${ws()}/interfaces/screens/invoices`)).status).toBe(404);
  });

  test("two groups open the same app and are given different rows and different totals", async () => {
    const rows = async (who: typeof ivy) =>
      ((await who.browser.get(`/api/v1${ws()}/rows/invoices?sort=number`)).body.items as Any[]).map(
        (row) => row.number,
      );
    expect(await rows(ivy)).toEqual(["INV-1", "INV-2"]);
    expect(await rows(jon)).toEqual(["INV-3"]);
    const totals = async (who: typeof ivy) =>
      (
        await who.browser.get(
          `/api/v1${ws()}/aggregate/invoices?group=team&measure=count,sum:total`,
        )
      ).body.items;
    expect(await totals(ivy)).toEqual([
      { by: { team: "finance" }, values: { count: 2, "sum:total": 30 } },
    ]);
    expect(await totals(jon)).toEqual([
      { by: { team: "sales" }, values: { count: 1, "sum:total": 5 } },
    ]);
  });

  test("what a table and its columns are for is told to whoever may read the table or its rows, and to nobody else", async () => {
    const terms = async (who: { get: (url: string) => Promise<Any> }, prefix = "") =>
      (await who.get(`${prefix}${ws()}/terms`)).body;
    // This workspace has no documentation: no terms of its own, and no pages to list.
    const NOTHING = { terms: [], resources: [], extensions: [], attachments: [], topics: [] };
    const invoices = {
      kind: "table",
      path: "invoices",
      title: null,
      description: "What customers have been billed.",
      columns: [
        { name: "number", description: "The number printed on it." },
        { name: "team", description: "The team that sent it." },
      ],
    };
    const secrets = {
      kind: "table",
      path: "secrets",
      title: null,
      description: "Notes nobody outside may read.",
      columns: [{ name: "note", description: "The note." }],
    };
    // A member who reads the workspace is told of both, and not of a table that says nothing.
    const all = await terms(alice);
    expect(all.terms).toEqual([]);
    expect(all.resources.filter((one: Any) => one.kind === "table")).toEqual([invoices, secrets]);
    // Apps are described by their titles alone here, and have nothing to say.
    expect(all.resources.every((one: Any) => one.kind === "table")).toBe(true);

    // A member who may read tables' definitions, and no rows, is told the same.
    const role = await alice.post(`/tenants/${tenant}/roles`, {
      name: "table_reader",
      permissions: ["table:read"],
    });
    expect(role.status, JSON.stringify(role.body)).toBe(201);
    const made = await alice.post(`/tenants/${tenant}/members`, {
      email: "tess@acme.example",
      name: "Tess",
      password: PASSWORD,
    });
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: made.body.id,
      roleId: role.body.id,
      workspaceId: prod,
    });
    const tess = await t.signIn("tess@acme.example", PASSWORD);
    expect((await terms(tess)).resources).toEqual([invoices, secrets]);

    // A member bound to nothing is told nothing, and not that there is anything to tell.
    await alice.post(`/tenants/${tenant}/members`, {
      email: "nora@acme.example",
      name: "Nora",
      password: PASSWORD,
    });
    const nora = await t.signIn("nora@acme.example", PASSWORD);
    expect(await terms(nora)).toEqual(NOTHING);

    // An end user is told of the table whose rows an app shows them, and not of the other.
    const forIvy = await terms(ivy.browser, "/api/v1");
    expect(forIvy).toEqual({ ...NOTHING, resources: [invoices] });
    expect(JSON.stringify(forIvy)).not.toContain("secrets");
    // Someone not signed in is told nothing.
    expect(await terms(browser(), "/api/v1")).toEqual(NOTHING);
    // A workspace that is not there is not there.
    expect((await alice.get(`/tenants/${tenant}/workspaces/${tenant}/terms`)).status).toBe(404);
  });

  test("an instance without the files says so in place of the app", async () => {
    const empty = mkdtempSync(join(tmpdir(), "vx-screens-empty-"));
    const bare = await startTestApp({ config: { screensDir: empty } });
    try {
      const id = (await bare.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
      await bare.admin.post(`/tenants/${id}/access-grants`, {
        reason: "Setup",
        roleId: roles.tenant_admin,
      });
      const workspace = (
        await bare.admin.post(`/tenants/${id}/workspaces`, {
          slug: "main",
          name: "Main",
          type: "production",
        })
      ).body.id;
      const base = `/tenants/${id}/workspaces/${workspace}`;
      const uploaded = await bare.admin.post(`${base}/bundles`, bundle());
      expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
      expect(
        (await bare.admin.post(`${base}/deployments`, { bundleId: uploaded.body.id })).status,
      ).toBe(201);
      const signedIn = await bare.app.inject({
        method: "POST",
        url: "/api/v1/auth/sign-in/email",
        headers: { origin: "http://localhost:8080" },
        payload: { email: "operator@example.com", password: "operator-password-1" },
      });
      const cookie = ([] as string[])
        .concat(signedIn.headers["set-cookie"] ?? [])
        .map((line) => line.split(";")[0])
        .join("; ");
      const page = await bare.app.inject({
        method: "GET",
        url: "/apps/acme/main/billing/",
        headers: { host: MAIN, cookie },
      });
      expect(page.statusCode).toBe(503);
      expect(page.body).toContain("SCREENS_DIR");
    } finally {
      await bare.stop();
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("actions on a page", () => {
  test("an action is offered to those who may start what it starts, runs as them, and the builder names who would not see it", async () => {
    const base = bundle();
    const { digest: _digest, ...rest } = base;
    const withActions = {
      ...rest,
      code: "export const remind = { execute: async () => ({}) };",
      manifests: [
        ...rest.manifests,
        manifest("role", "roles/reminders", { name: "reminder", permissions: ["run:write"] }),
        manifest("script", "invoices/remind", {
          entry: "remind",
          description: "A reminder is on its way.",
          input: {
            type: "object",
            properties: { number: { type: "string" }, note: { type: "string" } },
            required: ["number"],
          },
          output: { type: "object" },
          timeoutSeconds: 30,
          retries: { limit: 0, delaySeconds: 0, backoff: false },
          uses: { connections: [], secrets: [], variables: [] },
        }),
        manifest("interface", "screens/chase", {
          title: "Chase",
          pages: [
            {
              id: "main",
              title: "Chase",
              widgets: [
                {
                  id: "list",
                  type: "table",
                  table: "invoices",
                  at,
                  actions: [
                    {
                      label: "Remind",
                      target: { kind: "script", path: "invoices/remind" },
                      input: { number: "row.number" },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        manifest("app", "chase", { title: "Chase", interface: "screens/chase" }),
        manifest("binding", "bindings/chase", {
          role: "portal_user",
          principal: { type: "end_users" },
          resource: "chase",
        }),
        manifest("binding", "bindings/remind", {
          role: "reminder",
          principal: { type: "end_user_group", name: "finance" },
          resource: "invoices/remind",
        }),
      ],
    };
    const signed = { ...withActions, digest: bundleDigest(withActions as never) } as Bundle;
    const uploaded = await alice.post(`${ws()}/bundles`, signed);
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);

    const seenBy = async (who: { browser: ReturnType<typeof browser> }) =>
      (await who.browser.get(`/api/v1${ws()}/interfaces/screens/chase`)).body.targets;
    // Finance may start it, and is told what it takes; sales may not, and is told nothing of it.
    expect(await seenBy(ivy)).toEqual({
      "script:invoices/remind": {
        canStart: true,
        description: "A reminder is on its way.",
        inputSchema: {
          type: "object",
          properties: { number: { type: "string" }, note: { type: "string" } },
          required: ["number"],
        },
      },
    });
    expect(await seenBy(jon)).toEqual({
      "script:invoices/remind": { canStart: false, description: null, inputSchema: null },
    });

    // What the script is for is told on the same terms: to who may start it, and to nobody else.
    const scripts = async (who: { browser: ReturnType<typeof browser> }) =>
      (await who.browser.get(`/api/v1${ws()}/terms`)).body.resources.filter(
        (one: Any) => one.kind === "script",
      );
    expect(await scripts(ivy)).toEqual([
      {
        kind: "script",
        path: "invoices/remind",
        title: null,
        description: "A reminder is on its way.",
      },
    ]);
    expect(await scripts(jon)).toEqual([]);

    // The builder says the app's audience at large would not all see it.
    const facts = await alice.get(
      `${ws()}/interface-targets?targets=${encodeURIComponent("script:invoices/remind,flow:nope")}&interface=screens/chase`,
    );
    expect(facts.status, JSON.stringify(facts.body)).toBe(200);
    expect(facts.body.items).toEqual([
      {
        key: "script:invoices/remind",
        found: true,
        startable: true,
        description: "A reminder is on its way.",
        inputSchema: expect.any(Object),
        notFor: ["every end user"],
      },
      {
        key: "flow:nope",
        found: false,
        startable: false,
        description: null,
        inputSchema: null,
        notFor: [],
      },
    ]);

    // Pressed in the app, it starts as the end user, not as the app.
    const started = await ivy.browser.post(`/api/v1${ws()}/runs`, {
      script: "invoices/remind",
      input: { number: "INV-1" },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const run = await t.db
      .selectFrom("run")
      .select(["started_by_type", "started_by_id"])
      .where("id", "=", started.body.id)
      .executeTakeFirstOrThrow();
    expect(run).toEqual({ started_by_type: "end_user", started_by_id: ivy.id });
    expect(
      (
        await jon.browser.post(`/api/v1${ws()}/runs`, {
          script: "invoices/remind",
          input: { number: "INV-1" },
        })
      ).status,
    ).toBe(403);
  });
});

describe("someone who maintains apps made in the console, and is not a developer", () => {
  let mona: Client;
  let dev: string;
  const devWs = () => `/tenants/${tenant}/workspaces/${dev}`;
  const page = (widgets: object[] = []) => ({
    title: "Stock",
    pages: [{ id: "main", title: "Stock", widgets }],
  });
  const draft = (who: Client, path: string, kind: string, body: object, more: object = {}) =>
    who.put(`${devWs()}/drafts/${path}`, { kind, schemaVersion: 1, body, ...more });

  test("they hold a role that builds interfaces and deploys no code", async () => {
    dev = (
      await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
    ).body.id;
    const member = await alice.post(`/tenants/${tenant}/members`, {
      email: "mona@acme.example",
      name: "Mona",
      password: PASSWORD,
    });
    expect(member.status, JSON.stringify(member.body)).toBe(201);
    const bound = await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.app_maintainer,
    });
    expect(bound.status, JSON.stringify(bound.body)).toBe(201);
    mona = await t.signIn("mona@acme.example", PASSWORD);
    // Things in the workspace that are not hers: a variable in draft, and one deployed.
    expect(
      (await draft(alice, "limits/batch", "variable", { description: "A limit." })).status,
    ).toBe(200);
    expect(
      (
        await alice.put(`${devWs()}/resources/stock`, {
          kind: "table",
          schemaVersion: 1,
          ownership: "ui",
          body: { columns: { item: { type: "text" }, held: { type: "integer" } } },
        })
      ).status,
    ).toBe(201);
  });

  test("they save an interface, and an app that serves it, and nothing else", async () => {
    const widgets = [
      { id: "list", type: "table", table: "stock", fields: [{ column: "item" }], at },
    ];
    const saved = await draft(mona, "screens/stock", "interface", page(widgets));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(
      (await draft(mona, "stock-app", "app", { title: "Stock", interface: "screens/stock" }))
        .status,
    ).toBe(200);
    expect(saved.body.problems).toEqual([]);
    // A draft that is not right yet is saved, and says what is wrong as the workspace stands:
    // against a table made in the console, which no bundle carries.
    const unfinished = await draft(
      mona,
      "screens/scrap",
      "interface",
      page([
        { id: "a", type: "table", table: "stock", fields: [{ column: "nope" }], at },
        { id: "b", type: "table", table: "no-such-table", at },
        { id: "c", type: "chart", table: "stock", at },
      ]),
    );
    expect(unfinished.status).toBe(200);
    expect(unfinished.body.problems.map((problem: Any) => problem.message)).toEqual([
      'there is no column "nope" in the table "stock"',
      "a chart needs a shape",
      "a chart needs what to draw along x",
      "a chart needs what to draw along y",
      'there is no table "no-such-table" in this workspace',
    ]);
    // Saved again, with the revision she holds.
    expect(
      (
        await draft(mona, "screens/stock", "interface", page(widgets), {
          revision: saved.body.revision,
        })
      ).status,
    ).toBe(200);

    // Not a script, a variable, or an app with files of its own.
    const script = await draft(mona, "jobs/sync", "script", {
      source: { language: "typescript", code: "" },
    });
    expect(script.status).toBe(403);
    expect(
      (await draft(mona, "limits/other", "variable", { description: "A limit." })).status,
    ).toBe(403);
    expect((await draft(mona, "site", "app", { title: "Site", entry: "index.html" })).status).toBe(
      403,
    );
    // Not over something that is there and is not hers to change, deployed or in draft.
    expect((await draft(mona, "stock", "interface", page())).status).toBe(403);
    expect((await draft(mona, "limits/batch", "interface", page())).status).toBe(403);
    expect((await mona.delete(`${devWs()}/drafts/limits/batch`)).status).toBe(403);
    // A draft of her own she can throw away.
    expect((await draft(mona, "screens/scrap", "interface", page())).status).toBe(200);
    expect((await mona.delete(`${devWs()}/drafts/screens/scrap`)).status).toBe(204);
    // A body that is not an interface is refused as anyone's would be.
    expect((await draft(mona, "screens/bad", "interface", { title: "Bad" })).status).toBe(400);

    // She sees her drafts and not the rest.
    const listed = (await mona.get(`${devWs()}/drafts`)).body.items.map((item: Any) => item.path);
    expect(listed).toEqual(["screens/stock", "stock-app"]);
    expect((await mona.get(`${devWs()}/drafts/screens/stock`)).body.body.title).toBe("Stock");
    expect((await mona.get(`${devWs()}/drafts/limits/batch`)).status).toBe(404);
    expect((await alice.get(`${devWs()}/drafts`)).body.items).toHaveLength(3);
    expect((await mona.get(`${devWs()}/interfaces`)).body.items).toEqual([
      expect.objectContaining({
        path: "screens/stock",
        title: "Stock",
        deployed: false,
        draft: true,
        removing: false,
        app: "stock-app",
        pages: 1,
      }),
    ]);
  });

  test("they deploy what they made by name, and cannot deploy everything", async () => {
    const everything = await mona.post(`${devWs()}/changes/deploy`, {});
    expect(everything.status).toBe(403);
    expect(everything.body.detail).toContain("Say which interfaces or pages to deploy");
    expect(
      (await mona.post(`${devWs()}/changes/deploy`, { paths: ["screens/stock", "limits/batch"] }))
        .status,
    ).toBe(403);
    expect(
      (await mona.post(`${devWs()}/changes/deploy`, { paths: ["screens/never"] })).status,
    ).toBe(403);

    const deployed = await mona.post(`${devWs()}/changes/deploy`, {
      paths: ["screens/stock", "stock-app"],
      message: "A screen for the stock room",
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    expect(deployed.body.applied.sort()).toEqual(["screens/stock", "stock-app"]);
    // The other draft is still a draft, and was not deployed.
    expect((await alice.get(`${devWs()}/drafts`)).body.items.map((item: Any) => item.path)).toEqual(
      ["limits/batch"],
    );
    expect((await mona.get(`${devWs()}/interfaces`)).body.items).toEqual([
      expect.objectContaining({
        path: "screens/stock",
        title: "Stock",
        deployed: true,
        draft: false,
        removing: false,
        app: "stock-app",
        pages: 1,
      }),
    ]);
    // The app is there for her to open.
    const view = await mona.get(`${devWs()}/interfaces/screens/stock`);
    expect(view.status, JSON.stringify(view.body)).toBe(200);
    expect(view.body.tables.stock).toMatchObject({ found: true, canRead: true, canWrite: true });
  });

  test("they can take down what they made, and only that", async () => {
    expect((await draft(mona, "stock", "table", {}, { deleted: true })).status).toBe(403);
    expect((await draft(mona, "stock-app", "app", {}, { deleted: true })).status).toBe(200);
    expect((await draft(mona, "screens/stock", "interface", {}, { deleted: true })).status).toBe(
      200,
    );
    expect((await mona.get(`${devWs()}/interfaces`)).body.items[0]).toMatchObject({
      deployed: true,
      draft: true,
      removing: true,
    });
    const removed = await mona.post(`${devWs()}/changes/deploy`, {
      paths: ["screens/stock", "stock-app"],
    });
    expect(removed.status, JSON.stringify(removed.body)).toBe(201);
    expect((await mona.get(`${devWs()}/interfaces`)).body.items).toEqual([]);
    // A viewer of the tenant holds no way to write an interface.
    expect((await mona.get(`${devWs()}/resources`)).status).toBe(403);
  });
});

describe("a member's own dashboards", () => {
  let mona: Client;
  let dev: string;
  let id: string;
  const base = () => `/tenants/${tenant}/workspaces/${dev}/dashboards`;
  const board = (widgets: object[], filters: object[] = []) => ({
    version: 2,
    ...(filters.length > 0 ? { filters } : {}),
    widgets,
  });
  const held = {
    id: "held",
    type: "table",
    source: { visual: { table: "stock", columns: ["item", "held"], sort: [{ by: "item" }] } },
  };
  const data = (client: Client, widget: string, filters?: object) =>
    client.get(
      `${base()}/${id}/widgets/${widget}/data${filters ? `?filters=${encodeURIComponent(JSON.stringify(filters))}` : ""}`,
    );

  test("a dashboard is made empty, and saved as widgets that each ask a question, with no deploy", async () => {
    mona = await t.signIn("mona@acme.example", PASSWORD);
    dev = (await alice.get(`/tenants/${tenant}/workspaces`)).body.items.find(
      (workspace: Any) => workspace.slug === "dev",
    ).id;
    const made = await mona.post(base(), { title: " Stock at a glance " });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    id = made.body.id;
    expect(made.body).toMatchObject({
      kind: "member",
      title: "Stock at a glance",
      mine: true,
      owner: "Mona",
      shared: false,
      revision: 1,
      body: { version: 2, widgets: [] },
      upgraded: false,
    });
    await alice.post(`/tenants/${tenant}/workspaces/${dev}/rows/stock`, {
      item: "Bolts",
      held: 40,
    });
    await alice.post(`/tenants/${tenant}/workspaces/${dev}/rows/stock`, { item: "Nuts", held: 25 });
    const saved = await mona.put(`${base()}/${id}`, {
      revision: 1,
      body: board([
        held,
        {
          id: "bad",
          type: "table",
          source: { visual: { table: "stock", columns: ["nope"] } },
        },
      ]),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.revision).toBe(2);
    expect(saved.body.body.widgets).toHaveLength(2);
    // Each widget is asked for what it shows.
    const shown = await data(mona, "held");
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    expect(shown.body.columns.map((column: Any) => column.name)).toEqual(["item", "held"]);
    expect(shown.body.rows).toEqual([
      ["Bolts", 40],
      ["Nuts", 25],
    ]);
    // What is wrong with one is said when it is asked, against the tables that are there.
    const wrong = await data(mona, "bad");
    expect(wrong.status).toBe(400);
    expect(JSON.stringify(wrong.body)).toContain('stock has no column \\"nope\\"');
    expect((await data(mona, "nothing")).status).toBe(404);
  });

  test("a dashboard that is not one is refused, and so is a save over a newer one", async () => {
    const wrong = await mona.put(`${base()}/${id}`, {
      body: { version: 2, widgets: [{ id: "a" }] },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors[0].path).toContain("/body/widgets/0");
    // A widget that shows something must say what it asks, and a filter it takes must be there.
    const hollow = await mona.put(`${base()}/${id}`, {
      body: board([
        { id: "a", type: "figure" },
        { ...held, filters: [{ filter: "when", column: "created_at" }] },
      ]),
    });
    expect(hollow.status).toBe(400);
    expect(hollow.body.errors.map((one: Any) => one.message)).toEqual([
      "a figure needs a query to show",
      'the dashboard has no filter "when"',
    ]);
    const stale = await mona.put(`${base()}/${id}`, { revision: 1, title: "Late" });
    expect(stale.status).toBe(409);
    expect((await mona.put(`${base()}/${id}`, { title: "Stock" })).body).toMatchObject({
      title: "Stock",
      revision: 3,
    });
  });

  test("it is the member's own until shared, and read-only to everyone else then", async () => {
    expect((await alice.get(base())).body.items).toEqual([]);
    expect((await alice.get(`${base()}/${id}`)).status).toBe(404);
    const shared = await mona.put(`${base()}/${id}`, { shared: true });
    expect(shared.body.shared).toBe(true);
    expect((await alice.get(base())).body.items).toMatchObject([
      { id, title: "Stock", mine: false, owner: "Mona", shared: true },
    ]);
    expect((await alice.get(`${base()}/${id}`)).body.body.widgets).toHaveLength(2);
    expect((await alice.put(`${base()}/${id}`, { title: "Mine now" })).status).toBe(403);
    expect((await alice.delete(`${base()}/${id}`)).status).toBe(403);
    await mona.put(`${base()}/${id}`, { shared: false });
    expect((await alice.get(`${base()}/${id}`)).status).toBe(404);
    const actions = (
      await t.db
        .selectFrom("audit_entry")
        .select("action")
        .where("target_id", "=", id)
        .orderBy("id")
        .execute()
    ).map((row) => row.action);
    expect(actions).toEqual([
      "dashboard.created",
      "dashboard.saved",
      "dashboard.saved",
      "dashboard.shared",
      "dashboard.unshared",
    ]);
  });

  test("it can be shown to some groups only", async () => {
    const group = await alice.post(`/tenants/${tenant}/groups`, { name: "Stock keepers" });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    const shared = await mona.put(`${base()}/${id}`, { sharedWith: [group.body.id] });
    expect(shared.status, JSON.stringify(shared.body)).toBe(200);
    expect(shared.body.sharedWith).toEqual([{ id: group.body.id, name: "Stock keepers" }]);
    // Alice is not in the group, so she still does not see it.
    expect((await alice.get(`${base()}/${id}`)).status).toBe(404);
    expect((await data(alice, "held")).status).toBe(404);
    const me = (await alice.get("/me")).body.principal.id;
    await alice.put(`/tenants/${tenant}/groups/${group.body.id}/members/${me}`);
    expect((await alice.get(`${base()}/${id}`)).status).toBe(200);
    expect((await data(alice, "held")).status).toBe(200);
    expect((await alice.get(base())).body.items[0].sharedWith).toHaveLength(1);
    expect(
      (await mona.put(`${base()}/${id}`, { sharedWith: ["00000000-0000-7000-8000-00000000dead"] }))
        .status,
    ).toBe(400);
    await mona.put(`${base()}/${id}`, { sharedWith: [] });
    expect((await alice.get(`${base()}/${id}`)).status).toBe(404);
  });

  test("a figure shows one total, a filter narrows what every widget bound to it asks, and groups come in order", async () => {
    const saved = await mona.put(`${base()}/${id}`, {
      body: board(
        [
          {
            id: "total",
            type: "figure",
            source: {
              visual: {
                table: "stock",
                measures: [
                  { fn: "count", as: "items" },
                  { fn: "sum", column: "held", as: "held" },
                ],
              },
            },
            filters: [
              { filter: "when", column: "created_at" },
              { filter: "named", column: "item" },
            ],
            options: { value: "held" },
          },
          {
            id: "by-item",
            type: "chart",
            source: {
              visual: {
                table: "stock",
                groupBy: [{ column: "item" }, { column: "created_at", bucket: "month" }],
                measures: [{ fn: "avg", column: "held", as: "average" }],
              },
            },
            options: { mark: "bar", x: "item", y: "average" },
          },
        ],
        [
          { name: "when", label: "Added", type: "date_range", default: "last_30_days" },
          { name: "named", type: "text" },
        ],
      ),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await data(mona, "total")).body.rows).toEqual([[2, 65]]);
    const today = new Date().toISOString().slice(0, 10);
    // The whole of a range's last day counts, and a day before anything was added leaves nothing.
    expect((await data(mona, "total", { when: { from: today, to: today } })).body.rows).toEqual([
      [2, 65],
    ]);
    expect(
      (await data(mona, "total", { when: { from: "2020-01-01", to: "2020-12-31" } })).body.rows,
    ).toEqual([[0, null]]);
    expect((await data(mona, "total", { named: "bol" })).body.rows).toEqual([[1, 40]]);
    // A filter that is not set narrows nothing, and one the dashboard does not have is not looked at.
    expect((await data(mona, "total", { named: "", other: 1 })).body.rows).toEqual([[2, 65]]);
    const grouped = await data(mona, "by-item");
    expect(grouped.body.columns.map((column: Any) => column.name)).toEqual([
      "item",
      "created_at_month",
      "average",
    ]);
    expect(grouped.body.rows.map((row: Any[]) => [row[0], row[2]])).toEqual([
      ["Bolts", 40],
      ["Nuts", 25],
    ]);
    expect(grouped.body.rows[0][1]).toBe(`${today.slice(0, 7)}-01`);
  });

  test("SQL written into a widget needs the permission to write SQL, and is read as any query is", async () => {
    const written = (sql: string) =>
      board([{ id: "q", type: "table", source: { sql, values: [30] }, filters: [] }]);
    // Mona keeps dashboards and may not write SQL.
    const hers = await mona.put(`${base()}/${id}`, {
      body: written("select item from stock where held > $1"),
    });
    expect(hers.status).toBe(403);
    // Alice may, on a dashboard of her own.
    const own = (await alice.post(base(), { title: "Alice's" })).body.id;
    const refused = await alice.put(`${base()}/${own}`, { body: written("delete from stock") });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("Only SELECT");
    const saved = await alice.put(`${base()}/${own}`, {
      body: written("select item, held from stock where held > $1 order by item"),
      shared: true,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // Mona looks at it without the permission to write SQL: the query is the dashboard's.
    const seen = await mona.get(`${base()}/${own}/widgets/q/data`);
    expect(seen.status, JSON.stringify(seen.body)).toBe(200);
    expect(seen.body.rows).toEqual([["Bolts", 40]]);
    expect((await alice.delete(`${base()}/${own}`)).status).toBe(204);
  });

  test("a dashboard made before phase 18 is shown as one of now, and asks what it asked", async () => {
    // As it was kept: one page of an interface, with a table, a figure, a chart and a page filter.
    const at = { x: 0, y: 0, w: 6, h: 4 };
    const old = {
      id: "main",
      title: "Old",
      filters: [{ id: "added-on", label: "Added", column: "created_at", type: "date" }],
      widgets: [
        {
          id: "list",
          type: "table",
          table: "stock",
          fields: [{ column: "item" }, { column: "held" }],
          sort: [{ column: "held", desc: true }],
          filter: { column: "held", op: "gt", value: 10 },
          at: { ...at, y: 4 },
        },
        {
          id: "count",
          type: "figure",
          table: "stock",
          summary: { groupBy: [], aggregates: [{ fn: "sum", column: "held", as: "held" }] },
          at,
        },
        {
          id: "chart",
          type: "chart",
          table: "stock",
          summary: {
            groupBy: [{ column: "created_at", bucket: "month" }],
            aggregates: [{ fn: "count", as: "items" }],
          },
          options: { mark: "line", x: "created_at", y: "items" },
          at: { ...at, x: 6 },
        },
        {
          id: "note",
          type: "text",
          options: { text: "Counted weekly." },
          at: { ...at, y: 8, w: 12 },
        },
        { id: "followed", type: "card", table: "stock", link: { from: "list", type: "same" }, at },
      ],
    };
    await t.db
      .updateTable("member_dashboard")
      .set({ body: JSON.stringify(old) })
      .where("id", "=", id)
      .execute();
    const now = (await mona.get(`${base()}/${id}`)).body;
    expect(now.upgraded).toBe(true);
    expect(now.body).toMatchObject({
      version: 2,
      filters: [{ name: "added_on", label: "Added", type: "date_range" }],
    });
    // In reading order, and without the card that followed another widget's row.
    expect(now.body.widgets.map((widget: Any) => `${widget.id} ${widget.type}`)).toEqual([
      "count figure",
      "chart chart",
      "list table",
      "note text",
    ]);
    expect(now.body.widgets[1].options).toMatchObject({
      mark: "line",
      x: "created_at_month",
      y: "items",
    });
    expect((await data(mona, "count")).body.rows).toEqual([[65]]);
    expect((await data(mona, "list")).body.rows).toEqual([
      ["Bolts", 40],
      ["Nuts", 25],
    ]);
    expect((await data(mona, "chart")).body.rows).toHaveLength(1);
    expect(
      (await data(mona, "count", { added_on: { from: "2020-01-01", to: "2020-01-31" } })).body.rows,
    ).toEqual([[null]]);
    // Saved, it is kept as it reads now.
    const kept = await mona.put(`${base()}/${id}`, { body: now.body });
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    expect(kept.body.upgraded).toBe(false);
  });

  test("a dashboard belongs to a member, there is a limit to them, and deleting one touches no table", async () => {
    // Not a key, and not an end user.
    const account = await alice.post(`/tenants/${tenant}/service-accounts`, { name: "robot" });
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "service_account",
      principalId: account.body.id,
      roleId: roles.tenant_admin,
    });
    const key = await alice.post(
      `/tenants/${tenant}/service-accounts/${account.body.id}/api-keys`,
      {
        name: "k",
      },
    );
    expect((await t.withKey(key.body.token).post(base(), { title: "Robot's" })).status).toBe(403);
    // In another workspace it is not there.
    expect((await mona.get(`/tenants/${tenant}/workspaces/${prod}/dashboards/${id}`)).status).toBe(
      404,
    );

    for (let count = 1; count < 20; count += 1) {
      expect((await mona.post(base(), { title: `Board ${count}` })).status).toBe(201);
    }
    const tooMany = await mona.post(base(), { title: "One more" });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.code).toBe("limit_reached");
    expect((await mona.get(base())).body.items).toHaveLength(20);
    expect((await mona.delete(`${base()}/${id}`)).status).toBe(204);
    expect((await mona.get(`${base()}/${id}`)).status).toBe(404);
    expect((await alice.get(`/tenants/${tenant}/workspaces/${dev}/rows/stock`)).status).toBe(200);
  });
  // Phase 19.
  test("a figure's trend is its number a period at a time, and a widget is kept where it is placed", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    const made = await mona.post(base(), { title: "Trends" });
    const trends = made.body.id;
    const at = { x: 3, y: 0, w: 4, h: 3 };
    const saved = await mona.put(`${base()}/${trends}`, {
      body: {
        version: 2,
        refresh: 15,
        filters: [{ name: "added", type: "date_range" }],
        widgets: [
          {
            id: "items",
            type: "figure",
            subtitle: "Kinds of thing held",
            at,
            source: { visual: { table: "stock", measures: [{ fn: "count", as: "items" }] } },
            filters: [{ filter: "added", column: "created_at" }],
            options: {
              value: "items",
              compareTo: "added",
              trend: { by: "created_at" },
              delta: "absolute",
              goodWhen: "down",
              caption: "{previous} the week before",
            },
          },
          {
            ...held,
            options: { cells: [{ column: "held", as: "bar", label: "On hand" }], totals: true },
          },
        ],
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // Kept as it was placed, with how often it refreshes.
    expect(saved.body.body.widgets[0].at).toEqual(at);
    expect(saved.body.body.refresh).toBe(15);
    const path = (widget: string, more: string) =>
      `${base()}/${trends}/widgets/${widget}/data?filters=${encodeURIComponent(
        JSON.stringify({ added: { from: weekAgo, to: today } }),
      )}${more}`;
    // The figure itself is one number.
    const figure = await mona.get(path("items", ""));
    expect(figure.body.rows).toHaveLength(1);
    // Its trend is the same count, a day at a time for a range of a week, oldest first.
    const trend = await mona.get(path("items", "&part=trend"));
    expect(trend.status, JSON.stringify(trend.body)).toBe(200);
    expect(trend.body.columns.map((column: Any) => column.name)).toEqual([
      "created_at_day",
      "items",
    ]);
    // Everything in stock was added today.
    expect(trend.body.rows).toEqual([[today, figure.body.rows[0][0]]]);
    // A widget that draws no trend has none to ask for.
    expect((await mona.get(path("held", "&part=trend"))).status).toBe(400);

    // A place past the twelfth column is refused, saying where.
    const wide = await mona.put(`${base()}/${trends}`, {
      body: { version: 2, widgets: [{ ...held, at: { x: 9, y: 0, w: 6, h: 4 } }] },
    });
    expect(wide.status).toBe(400);
    expect(JSON.stringify(wide.body)).toContain("past the twelfth");
    await mona.delete(`${base()}/${trends}`);
  });
});

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    // A row written is an event of its own, not an audit entry.
    expect(t.unaudited.filter((route) => !/\/rows?\//.test(route))).toEqual([]);
  });

  test("the routes a maintainer is held to were all exercised", () => {
    expect(
      t.unexercised((route) => /\/(drafts|changes\/deploy|dashboards)(\/|$)/.test(route)),
    ).toEqual([]);
  });
});
