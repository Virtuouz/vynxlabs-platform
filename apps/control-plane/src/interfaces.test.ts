import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
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
    sdkVersion: "0.4.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("table", "invoices", {
        columns: {
          number: { type: "text", required: true },
          team: { type: "text" },
          total: { type: "number" },
        },
        policy: {
          type: "rules",
          rules: [{ allow: "read", when: { column: "team", in: "groups" } }],
        },
      }),
      manifest("table", "secrets", { columns: { note: { type: "text" } } }),
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
  const call = async (method: "GET" | "POST", url: string, form?: Record<string, string>) => {
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
      },
      ...(form ? { payload: new URLSearchParams(form).toString() } : {}),
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

describe("an app that serves an interface", () => {
  let ivy: Awaited<ReturnType<typeof endUser>>;
  let jon: Awaited<ReturnType<typeof endUser>>;
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
        { name: "number", type: "text", required: true, references: null },
        { name: "team", type: "text", required: false, references: null },
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
      {
        path: "screens/stock",
        title: "Stock",
        deployed: false,
        draft: true,
        removing: false,
        app: "stock-app",
      },
    ]);
  });

  test("they deploy what they made by name, and cannot deploy everything", async () => {
    const everything = await mona.post(`${devWs()}/changes/deploy`, {});
    expect(everything.status).toBe(403);
    expect(everything.body.detail).toContain("Say which interfaces to deploy");
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
      {
        path: "screens/stock",
        title: "Stock",
        deployed: true,
        draft: false,
        removing: false,
        app: "stock-app",
      },
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

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    // A row written is an event of its own, not an audit entry.
    expect(t.unaudited.filter((route) => !/\/rows?\//.test(route))).toEqual([]);
  });

  test("the routes a maintainer is held to were all exercised", () => {
    expect(t.unexercised((route) => /\/(drafts|changes\/deploy)(\/|$)/.test(route))).toEqual([]);
  });
});
