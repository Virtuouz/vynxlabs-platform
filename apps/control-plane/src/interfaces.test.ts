import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, putSeen, startTestApp, type TestApp } from "./testing.js";

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
  ({
    kind,
    path,
    schemaVersion: kind === "interface" ? 2 : kind === "dashboard" ? 3 : 1,
    ownership: "code",
    body,
  }) as BundleManifest;

const at = { x: 0, y: 0, w: 12, h: 8 };
/** A table widget over a table, reading its rows, and what to show of them. */
const tableOf = (id: string, table: string, columns?: string[], where = at) => ({
  id,
  type: "core/table",
  at: where,
  data: {
    rows: {
      source: {
        visual: {
          table,
          ...(columns ? { columns } : {}),
          ...(table === "invoices" ? { sort: [{ by: "number" }] } : {}),
        },
      },
    },
  },
});
const screen = {
  title: "Invoices",
  pages: [
    {
      id: "main",
      title: "Invoices",
      widgets: [
        tableOf("list", "invoices", ["number"]),
        {
          id: "by_team",
          type: "core/chart",
          at: { x: 0, y: 8, w: 6, h: 5 },
          data: {
            rows: {
              source: {
                visual: {
                  table: "invoices",
                  groupBy: [{ column: "team" }],
                  measures: [{ fn: "count", as: "invoices" }],
                },
              },
            },
          },
          config: { mark: "bar" },
        },
        tableOf("gone", "not-there"),
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
        pages: [{ id: "p", title: "P", widgets: [tableOf("s", "secrets")] }],
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
    more: Record<string, string> = {},
  ) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await app.app.inject({
      method,
      url,
      headers: {
        host: MAIN,
        ...more,
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
    return {
      status: response.statusCode,
      body,
      headers: response.headers,
      bytes: response.rawPayload,
    };
  };
  return {
    get: (url: string, more?: Record<string, string>) =>
      call("GET", url, undefined, undefined, more),
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
  writeFileSync(
    join(runtime, "assets/big-1a2b3c4d.js"),
    'console.log("a long script");\n'.repeat(400),
  );

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
    // The platform's own scripts are sent compressed to a browser that takes it, and as they are to one that does not.
    const text = 'console.log("a long script");\n'.repeat(400);
    const bigAddress = "/apps/acme/main/billing/assets/big-1a2b3c4d.js";
    const asked = async (encoding: string) => {
      const got = await ivy.browser.get(bigAddress, { "accept-encoding": encoding });
      return got;
    };
    const packed = await asked("gzip, br");
    expect(packed.status).toBe(200);
    expect(packed.headers["content-encoding"]).toBe("br");
    expect(packed.headers.vary).toContain("accept-encoding");
    expect(brotliDecompressSync(packed.bytes).toString()).toBe(text);
    expect(packed.bytes.length).toBeLessThan(text.length / 10);
    const zipped = await asked("gzip");
    expect(zipped.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(zipped.bytes).toString()).toBe(text);
    const plain = await asked("identity");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body).toBe(text);
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
    expect(seen.body.body).toEqual(screen);
    expect(seen.body.targets).toBeUndefined();
    expect(seen.body.tables.invoices).toEqual({
      found: true,
      canRead: true,
      canWrite: true,
      columns: [
        { name: "id", label: "Id", type: "uuid", required: true, references: null },
        {
          name: "created_at",
          label: "Created at",
          type: "timestamp",
          required: true,
          references: null,
        },
        {
          name: "updated_at",
          label: "Updated at",
          type: "timestamp",
          required: true,
          references: null,
        },
        {
          name: "number",
          label: "Number",
          description: "The number printed on it.",
          type: "text",
          required: true,
          references: null,
        },
        {
          name: "team",
          label: "Team",
          description: "The team that sent it.",
          type: "text",
          required: false,
          references: null,
        },
        // A column that says nothing of itself has no description at all.
        { name: "total", label: "Total", type: "number", required: false, references: null },
      ],
    });
    // A widget's rows say what each column holds too: the help behind a heading in the app.
    const rows = await ivy.browser.get(
      `/api/v1${ws()}/widget-data?of=interface&path=screens/invoices&page=main&widget=list`,
    );
    expect(rows.status, JSON.stringify(rows.body)).toBe(200);
    expect(
      rows.body.inputs.rows.columns.find((column: { name: string }) => column.name === "number"),
    ).toMatchObject({ label: "Number", description: "The number printed on it." });
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

describe("a script an end user may start", () => {
  test("it is told to who may start it, runs as them, and is refused to everyone else", async () => {
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
              widgets: [tableOf("list", "invoices", ["number"])],
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
    putSeen(who, `${devWs()}/drafts/${path}`, {
      kind,
      schemaVersion: kind === "interface" ? 2 : kind === "dashboard" ? 3 : 1,
      body,
      ...more,
    });

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
    const widgets = [tableOf("list", "stock", ["item"])];
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
        tableOf("a", "stock", ["nope"]),
        tableOf("b", "no-such-table"),
        {
          id: "c",
          type: "core/chart",
          at,
          data: { rows: { source: { visual: { table: "stock" } } } },
        },
      ]),
    );
    expect(unfinished.status).toBe(200);
    expect(unfinished.body.problems.map((problem: Any) => problem.message)).toEqual([
      'there is no column "nope" in the table "stock"',
      "works out 1 to 6 values",
      "is broken down 1 to 2 ways",
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

  test("they read what publishing would do, for what is theirs, and the groups an action names (BLD-02)", async () => {
    const check = await mona.get(`${devWs()}/changes/preview?paths=screens/stock,stock-app`);
    expect(check.status, JSON.stringify(check.body)).toBe(200);
    expect(check.body.possible).toBe(true);
    // Not for everything, and not for what is not hers.
    expect((await mona.get(`${devWs()}/changes/preview`)).status).toBe(403);
    expect((await mona.get(`${devWs()}/changes/preview?paths=limits/batch`)).status).toBe(403);
    expect((await mona.get(`${devWs()}/changes/preview?paths=screens/stock,stock`)).status).toBe(
      403,
    );
    const keys = await mona.get(`${devWs()}/group-keys`);
    expect(keys.status, JSON.stringify(keys.body)).toBe(200);
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
      // The app that served it is still named, so taking the removal back finds it.
      app: "stock-app",
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
  // The filters are a Search and filter widget's, after the others.
  const board = (widgets: object[], filters: object[] = []) => ({
    widgets:
      filters.length > 0
        ? [
            ...widgets,
            {
              id: "filters",
              type: "core/filter",
              at: { x: 0, y: 30, w: 12, h: 2 },
              config: { filters: filters },
            },
          ]
        : widgets,
  });
  const held = {
    id: "held",
    type: "core/table",
    at: { x: 0, y: 0, w: 12, h: 6 },
    data: {
      rows: {
        source: { visual: { table: "stock", columns: ["item", "held"], sort: [{ by: "item" }] } },
      },
    },
  };
  const data = (client: Client, widget: string, filters?: object, of = id) =>
    client.get(
      `/tenants/${tenant}/workspaces/${dev}/widget-data?of=dashboard&path=${of}&widget=${widget}${filters ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : ""}`,
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
      body: { widgets: [] },
    });
    expect(made.body.upgraded).toBeUndefined();
    await alice.post(`/tenants/${tenant}/workspaces/${dev}/rows/stock`, {
      item: "Bolts",
      held: 40,
    });
    await alice.post(`/tenants/${tenant}/workspaces/${dev}/rows/stock`, { item: "Nuts", held: 25 });
    // What is wrong with a widget is said when the dashboard is saved, against the tables that are there.
    const wrong = await mona.put(`${base()}/${id}`, {
      revision: 1,
      body: board([
        {
          id: "bad",
          type: "core/table",
          at: { x: 0, y: 0, w: 12, h: 6 },
          data: { rows: { source: { visual: { table: "stock", columns: ["nope"] } } } },
        },
      ]),
    });
    expect(wrong.status).toBe(400);
    expect(JSON.stringify(wrong.body)).toContain('there is no column \\"nope\\"');
    const saved = await mona.put(`${base()}/${id}`, { revision: 1, body: board([held]) });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.revision).toBe(2);
    expect(saved.body.body.widgets).toHaveLength(1);
    // Each widget is asked for what it shows: rows with their ids, and the columns in the reader's words.
    const shown = await data(mona, "held");
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    const rows = shown.body.inputs.rows;
    expect(rows.shape).toBe("rows");
    expect(rows.columns.map((column: Any) => [column.name, column.label, column.type])).toEqual([
      ["id", "Id", "uuid"],
      ["item", "Item", "text"],
      ["held", "Held", "integer"],
    ]);
    expect(rows.rows.map((row: Any) => [row.item, row.held])).toEqual([
      ["Bolts", 40],
      ["Nuts", 25],
    ]);
    expect(rows.next).toBeUndefined();
    expect((await data(mona, "nothing")).status).toBe(404);
  });

  test("a dashboard that is not one is refused, and so is a save over a newer one", async () => {
    const wrong = await mona.put(`${base()}/${id}`, { body: { widgets: [{ id: "a" }] } });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors[0].path).toContain("/body/widgets/0");
    // A body made before phase 25 is not read or upgraded.
    const old = await mona.put(`${base()}/${id}`, {
      body: {
        version: 2,
        widgets: [{ id: "a", type: "table", source: { visual: { table: "stock" } } }],
      },
    });
    expect(old.status).toBe(400);
    // A filter a widget takes must be there. A widget not yet told what to ask (the stat) is a
    // dashboard being made, and is kept: a member's dashboard is never deployed.
    const hollow = await mona.put(`${base()}/${id}`, {
      body: board([
        { id: "a", type: "core/stat", at: { x: 0, y: 0, w: 3, h: 3 } },
        {
          ...held,
          id: "b",
          data: {
            rows: { ...held.data.rows, filters: [{ filter: "when", column: "created_at" }] },
          },
        },
      ]),
    });
    expect(hollow.status).toBe(400);
    expect(hollow.body.errors.map((one: Any) => one.message)).toEqual([
      'the page has no filter "when"',
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
    expect((await data(alice, "held")).status).toBe(404);
    const shared = await mona.put(`${base()}/${id}`, { shared: true });
    expect(shared.body.shared).toBe(true);
    expect((await alice.get(base())).body.items).toMatchObject([
      { id, title: "Stock", mine: false, owner: "Mona", shared: true },
    ]);
    expect((await alice.get(`${base()}/${id}`)).body.body.widgets).toHaveLength(1);
    expect((await data(alice, "held")).status).toBe(200);
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

  test("a stat shows one total, a filter narrows what every input bound to it asks, and groups come in order", async () => {
    const saved = await mona.put(`${base()}/${id}`, {
      body: board(
        [
          {
            id: "total",
            type: "core/stat",
            at: { x: 0, y: 0, w: 3, h: 3 },
            data: {
              value: {
                source: {
                  visual: { table: "stock", measures: [{ fn: "sum", column: "held", as: "held" }] },
                },
                filters: [
                  { filter: "when", column: "created_at" },
                  { filter: "named", column: "item" },
                ],
              },
            },
          },
          {
            id: "by-item",
            type: "core/chart",
            at: { x: 0, y: 3, w: 6, h: 5 },
            data: {
              rows: {
                source: {
                  visual: {
                    table: "stock",
                    groupBy: [{ column: "item" }, { column: "created_at", bucket: "month" }],
                    measures: [{ fn: "avg", column: "held", as: "average" }],
                  },
                },
              },
            },
            config: { mark: "bar" },
          },
        ],
        [
          { name: "when", label: "Added", type: "date_range", default: "last_30_days" },
          { name: "named", type: "text" },
        ],
      ),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const total = async (filters?: object) =>
      (await data(mona, "total", filters)).body.inputs.value.rows;
    // The default range is the last 30 days: what was added today is in it.
    expect(await total()).toEqual([{ held: 65 }]);
    const today = new Date().toISOString().slice(0, 10);
    // The whole of a range's last day counts, and a range before anything was added leaves nothing.
    expect(await total({ when: { from: today, to: today } })).toEqual([{ held: 65 }]);
    expect(await total({ when: { from: "2020-01-01", to: "2020-12-31" } })).toEqual([
      { held: null },
    ]);
    // `null` takes the range off.
    expect(await total({ when: null })).toEqual([{ held: 65 }]);
    expect(await total({ named: "bol" })).toEqual([{ held: 40 }]);
    // A filter that is not set narrows nothing.
    expect(await total({ named: "" })).toEqual([{ held: 65 }]);
    // A filter the page has not got, and a value of the wrong kind, are refused.
    expect((await data(mona, "total", { other: 1 })).status).toBe(400);
    expect((await data(mona, "total", { named: 3 })).status).toBe(400);
    expect((await data(mona, "total", { when: "sometime" })).status).toBe(400);
    expect(
      (await data(mona, "total", { when: { from: "2020-02-30", to: "2020-03-01" } })).status,
    ).toBe(400);
    const grouped = (await data(mona, "by-item")).body.inputs.rows;
    expect(grouped.shape).toBe("summary");
    expect(grouped.breakdowns).toEqual(["item", "created_at_month"]);
    expect(grouped.values).toEqual(["average"]);
    expect(grouped.columns.map((column: Any) => column.name)).toEqual([
      "item",
      "created_at_month",
      "average",
    ]);
    expect(grouped.rows.map((row: Any) => [row.item, row.average])).toEqual([
      ["Bolts", 40],
      ["Nuts", 25],
    ]);
    expect(grouped.rows[0].created_at_month).toBe(`${today.slice(0, 7)}-01`);
  });

  test("SQL written into a widget needs the permission to write SQL, and is read as any query is", async () => {
    const written = (sql: string) =>
      board([
        {
          id: "q",
          type: "core/table",
          at: { x: 0, y: 0, w: 12, h: 6 },
          data: { rows: { source: { sql, values: [30] } } },
        },
      ]);
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
    const seen = await data(mona, "q", undefined, own);
    expect(seen.status, JSON.stringify(seen.body)).toBe(200);
    expect(seen.body.inputs.rows.rows).toEqual([{ item: "Bolts", held: 40 }]);
    expect((await alice.delete(`${base()}/${own}`)).status).toBe(204);
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

  test("a stat's trend is its number a period at a time, it compares with the period before, and a widget is kept where it is placed", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    const made = await mona.post(base(), { title: "Trends" });
    const trends = made.body.id;
    const at = { x: 3, y: 0, w: 4, h: 3 };
    const saved = await mona.put(`${base()}/${trends}`, {
      body: {
        refresh: 15,
        widgets: [
          {
            id: "filters",
            type: "core/filter",
            at: { x: 0, y: 30, w: 12, h: 2 },
            config: { filters: [{ name: "added", type: "date_range" }] },
          },
          {
            id: "items",
            type: "core/stat",
            subtitle: "Kinds of thing held",
            at,
            data: {
              value: {
                source: { visual: { table: "stock", measures: [{ fn: "count", as: "items" }] } },
                filters: [{ filter: "added", column: "created_at" }],
              },
            },
            config: {
              compareTo: "added",
              trendBy: "created_at",
              delta: "absolute",
              goodWhen: "down",
              caption: "{previous} the week before",
            },
          },
          { ...held, at: { x: 0, y: 3, w: 12, h: 6 } },
        ],
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // Kept as it was placed, with how often it refreshes.
    expect(saved.body.body.widgets[1].at).toEqual(at);
    expect(saved.body.body.refresh).toBe(15);
    const read = (widget: string) =>
      mona.get(
        `/tenants/${tenant}/workspaces/${dev}/widget-data?of=dashboard&path=${trends}&widget=${widget}&filters=${encodeURIComponent(
          JSON.stringify({ added: { from: weekAgo, to: today } }),
        )}`,
      );
    const stat = (await read("items")).body.inputs.value;
    expect(stat.shape).toBe("summary");
    expect(stat.values).toEqual(["items"]);
    expect(stat.rows).toHaveLength(1);
    // Everything in stock was added today, a day at a time for a range of a week, oldest first.
    expect(stat.trend).toEqual([{ at: today, value: stat.rows[0].items }]);
    // The same count for the seven days before: nothing was held then.
    expect(stat.previous).toEqual([{ items: 0 }]);
    // A widget that draws no trend has none.
    expect((await read("held")).body.inputs.rows.trend).toBeUndefined();

    // A place past the twelfth column is refused, saying where.
    const wide = await mona.put(`${base()}/${trends}`, {
      body: { widgets: [{ ...held, at: { x: 9, y: 0, w: 6, h: 4 } }] },
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
