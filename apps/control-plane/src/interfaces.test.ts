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

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    // A row written is an event of its own, not an audit entry.
    expect(t.unaudited.filter((route) => !/\/rows?\//.test(route))).toEqual([]);
  });
});
