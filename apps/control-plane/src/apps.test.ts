import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DEFAULT_THEME } from "./kernel/apps/theme.js";
import type { Message } from "./kernel/mail.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const PASSPHRASE = "correct horse battery staple";
const MAIN = "localhost:8080";
const DOMAIN = "portal.acme.test";

let t: TestApp; // apps by path on the instance's own address
let tenant: string;
let other: string; // another tenant
let prod: string;
let alice: Client; // tenant admin
let roles: Record<string, string>;
const mail: Message[] = [];

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const object = { type: "object" };

const files: Record<string, { app: string; path: string; type: string; content: Buffer }> = {
  page: {
    app: "portal",
    path: "index.html",
    type: "text/html",
    content: Buffer.from(
      '<!doctype html><html><head><title>Orders</title></head><body><div id="app"></div><script type="module" src="./assets/app-3f9a1c7e.js"></script></body></html>',
    ),
  },
  script: {
    app: "portal",
    path: "assets/app-3f9a1c7e.js",
    type: "text/javascript",
    content: Buffer.from('console.log("orders");'),
  },
  robots: { app: "portal", path: "robots.txt", type: "text/plain", content: Buffer.from("hello") },
  status: {
    app: "status",
    path: "index.html",
    type: "text/html",
    content: Buffer.from("<html><head></head><body>Order status</body></html>"),
  },
};
const sha = (content: Buffer) => createHash("sha256").update(content).digest("hex");

function bundle(change: (manifests: BundleManifest[]) => BundleManifest[] = (m) => m): Bundle {
  const manifests = change([
    manifest("role", "roles/public-page", { name: "public_page", permissions: ["app:read"] }),
    manifest("role", "roles/order-starter", { name: "order_starter", permissions: ["run:write"] }),
    manifest("table", "orders", {
      columns: { number: { type: "text", required: true }, owner_id: { type: "uuid" } },
      policy: { type: "owner", column: "owner_id" },
    }),
    manifest("script", "place-order", {
      entry: "placeOrder",
      input: object,
      output: object,
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [], tables: ["orders"] },
    }),
    manifest("theme", "theme", { tokens: { action: "#7a1f5c" } }),
    manifest("app", "portal", { title: "Orders", description: "Your orders", entry: "index.html" }),
    manifest("app", "status", { title: "Order status", entry: "index.html" }),
    manifest("binding", "bindings/portal-app", {
      role: "portal_user",
      principal: { type: "end_users" },
      resource: "portal",
    }),
    manifest("binding", "bindings/portal-rows", {
      role: "portal_user",
      principal: { type: "end_users" },
      resource: "orders",
    }),
    manifest("binding", "bindings/portal-start", {
      role: "order_starter",
      principal: { type: "end_users" },
      resource: "place-order",
    }),
    manifest("binding", "bindings/public-status", {
      role: "public_page",
      principal: { type: "anonymous" },
      resource: "status",
    }),
  ]);
  const unsigned = {
    formatVersion: 2 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export const placeOrder = { execute: async () => ({}) };",
    assets: Object.values(files).map((file) => ({
      app: file.app,
      path: file.path,
      sha256: sha(file.content),
      size: file.content.length,
      contentType: file.type,
    })),
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

const ws = (workspace = prod, of = tenant) => `/tenants/${of}/workspaces/${workspace}`;

/** A browser at one address: it keeps the cookies it is given and sends them back there. */
function browser(app: TestApp, host: string) {
  const jar = new Map<string, string>();
  const call = async (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    options: { json?: unknown; form?: Record<string, string>; origin?: string } = {},
  ) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await app.app.inject({
      method,
      url,
      headers: {
        host,
        ...(cookie ? { cookie } : {}),
        ...(method !== "GET" ? { origin: options.origin ?? `http://${host}` } : {}),
        ...(options.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(options.json !== undefined ? { payload: options.json as object } : {}),
      ...(options.form ? { payload: new URLSearchParams(options.form).toString() } : {}),
    });
    for (const line of ([] as string[]).concat(response.headers["set-cookie"] ?? [])) {
      const [pair = ""] = line.split(";");
      const at = pair.indexOf("=");
      const value = pair.slice(at + 1);
      if (value === "" || /max-age=0/i.test(line)) jar.delete(pair.slice(0, at));
      else jar.set(pair.slice(0, at), value);
    }
    let body: Any = response.body;
    if ((response.headers["content-type"] ?? "").toString().includes("json"))
      body = response.json();
    return {
      status: response.statusCode,
      body,
      headers: response.headers,
      bytes: response.rawPayload,
      location: response.headers.location as string | undefined,
    };
  };
  return {
    jar,
    get: (url: string) => call("GET", url),
    post: (url: string, json?: unknown, origin?: string) =>
      call("POST", url, { json: json ?? {}, ...(origin ? { origin } : {}) }),
    put: (url: string, json: unknown) => call("PUT", url, { json }),
    form: (url: string, form: Record<string, string>, origin?: string) =>
      call("POST", url, { form, ...(origin ? { origin } : {}) }),
    /** Signs a member in to the console, as its sign-in screen does. */
    async signInMember(email: string, password: string) {
      const response = await call("POST", "/api/v1/auth/sign-in/email", {
        json: { email, password },
      });
      return response.status;
    },
  };
}

async function seed(app: TestApp, slug: string, email: string) {
  const id = (await app.admin.post("/tenants", { slug, name: slug === "acme" ? "Acme Ltd" : slug }))
    .body.id as string;
  const grant = await app.admin.post(`/tenants/${id}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await app.admin.post(`/tenants/${id}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  await app.admin.post(`/tenants/${id}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await app.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
  return { id, client: await app.signIn(email, PASSWORD) };
}

async function uploadFiles(as: Client, base: string) {
  for (const file of Object.values(files)) {
    const response = await as.put(`${base}/bundle-assets/${sha(file.content)}`, file.content);
    expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
  }
}

/** Makes an end user and sets their password through the invitation, as the person would. */
async function endUser(app: TestApp, as: Client, of: string, slug: string, email: string) {
  const created = await as.post(`/tenants/${of}/end-users`, { email, name: email.split("@")[0] });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const link = new URL(created.body.invitation.url);
  const visitor = browser(app, MAIN);
  const set = await visitor.form(`/portal/${slug}/set-password`, {
    token: link.searchParams.get("token") as string,
    password: PASSWORD,
  });
  expect(set.status, set.body).toBe(303);
  return { id: created.body.endUser.id as string, browser: visitor, link };
}

beforeAll(async () => {
  t = await startTestApp();
  t.kernel.mail.deliver = async (message) => {
    mail.push(message);
  };
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const acme = await seed(t, "acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  other = (await seed(t, "globex", "gina@globex.example")).id;
  const signedIn = await t.app.inject({
    method: "POST",
    url: "/api/v1/auth/sign-in/email",
    headers: { origin: "http://localhost:8080" },
    payload: { email: "alice@acme.example", password: PASSWORD },
  });
  aliceCookie = ([] as string[])
    .concat(signedIn.headers["set-cookie"] ?? [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
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
});

describe("an app in a bundle", () => {
  test("a bundle is refused until every file it lists has been uploaded", async () => {
    const refused = await alice.post(`${ws()}/bundles`, bundle());
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("assets_missing");
    expect(refused.body.errors).toHaveLength(4);

    const wrong = await alice.put(`${ws()}/bundle-assets/${"0".repeat(64)}`, files.page?.content);
    expect(wrong.status).toBe(400);
    await uploadFiles(alice, ws());
    expect(
      (await alice.get(`${ws()}/bundle-assets/${sha(files.script?.content as Buffer)}`)).body,
    ).toEqual({
      sha256: sha(files.script?.content as Buffer),
      size: files.script?.content.length,
    });
    // The same bytes again are already there.
    expect(
      (
        await alice.put(
          `${ws()}/bundle-assets/${sha(files.page?.content as Buffer)}`,
          files.page?.content,
        )
      ).status,
    ).toBe(200);
  });

  test("a format 1 bundle cannot carry an app, and an app needs its page among its files", async () => {
    const { assets: _assets, ...rest } = bundle();
    const old = { ...rest, formatVersion: 1 as const };
    const first = await alice.post(`${ws()}/bundles`, { ...old, digest: bundleDigest(old) });
    expect(first.status).toBe(400);
    expect(JSON.stringify(first.body.errors)).toContain("apps need bundle format 2");

    const noPage = bundle((manifests) =>
      manifests.map((m) =>
        m.path === "status" ? { ...m, body: { ...m.body, entry: "home.html" } } : m,
      ),
    );
    const second = await alice.post(`${ws()}/bundles`, noPage);
    expect(second.status).toBe(400);
    expect(JSON.stringify(second.body.errors)).toContain(
      "its entry home.html is not among the app's files",
    );

    const twoThemes = bundle((manifests) => [...manifests, manifest("theme", "theme-two", {})]);
    expect(JSON.stringify((await alice.post(`${ws()}/bundles`, twoThemes)).body.errors)).toContain(
      "a workspace can have one theme",
    );
  });

  test("it deploys, and the workspace lists its apps with where each is served", async () => {
    const uploaded = await alice.post(`${ws()}/bundles`, bundle());
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);

    const apps = (await alice.get(`${ws()}/apps`)).body.items;
    expect(apps).toMatchObject([
      {
        path: "portal",
        title: "Orders",
        url: "http://localhost:8080/apps/acme/main/portal/",
        files: 3,
        access: ["every end user"],
      },
      { path: "status", title: "Order status", access: ["anyone"] },
    ]);
  });
});

describe("serving by path, on the instance's own address", () => {
  test("someone who is not signed in is sent to the sign-in page, and a member sees the app", async () => {
    const visitor = browser(t, MAIN);
    const sent = await visitor.get("/apps/acme/main/portal/");
    expect(sent.status).toBe(303);
    expect(sent.location).toBe(
      `/portal/acme/sign-in?return=${encodeURIComponent("/apps/acme/main/portal/")}`,
    );
    const page = await visitor.get(sent.location as string);
    expect(page.status).toBe(200);
    expect(page.body).toContain("Acme Ltd");
    expect(page.body).toContain('name="return" value="/apps/acme/main/portal/"');
    expect(page.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(page.body).not.toContain("<script");
    // Its policy allows no inline style either, so it must carry none.
    expect(page.body).not.toContain("style=");

    const staff = browser(t, MAIN);
    expect(await staff.signInMember("alice@acme.example", PASSWORD)).toBe(200);
    const app = await staff.get("/apps/acme/main/portal/");
    expect(app.status).toBe(200);
    expect(app.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(app.headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(app.headers["cache-control"]).toBe("no-store");
    expect(app.body).toContain('<base href="/apps/acme/main/portal/">');
    expect(app.body).toContain(`/api/v1/tenants/${tenant}/workspaces/${prod}/theme.css`);
    const context = JSON.parse(
      /<script type="application\/json" id="vx-context">(.*?)<\/script>/.exec(
        app.body,
      )?.[1] as string,
    );
    expect(context).toMatchObject({
      api: "/api/v1",
      // No logo is set yet, so an app knows not to show one.
      tenant: { id: tenant, slug: "acme", logo: false },
      workspace: { id: prod, slug: "main" },
      app: { path: "portal", title: "Orders" },
      base: "/apps/acme/main/portal/",
      portal: "/portal/acme",
      principal: { type: "member", email: "alice@acme.example", groups: [], attributes: {} },
    });
  });

  test("files come with their type, hashed ones may be kept, and a screen of the app gets the page", async () => {
    const staff = browser(t, MAIN);
    await staff.signInMember("alice@acme.example", PASSWORD);
    const script = await staff.get("/apps/acme/main/portal/assets/app-3f9a1c7e.js");
    expect(script.status).toBe(200);
    expect(script.headers["content-type"]).toContain("text/javascript");
    expect(script.headers["cache-control"]).toContain("immutable");
    expect(script.headers["x-content-type-options"]).toBe("nosniff");
    expect(script.bytes.equals(files.script?.content as Buffer)).toBe(true);
    expect((await staff.get("/apps/acme/main/portal/robots.txt")).headers["cache-control"]).toBe(
      "private, no-cache",
    );

    expect((await staff.get("/apps/acme/main/portal/customers/42")).body).toContain(
      '<div id="app">',
    );
    expect((await staff.get("/apps/acme/main/portal/missing.png")).status).toBe(404);
    expect((await staff.get("/apps/acme/main/portal")).status).toBe(308);
    expect((await staff.get("/apps/acme/main/nothing/")).status).toBe(404);
    expect((await staff.get("/apps/nobody/main/orders/")).status).toBe(404);
    // The console is still where it was.
    expect((await staff.get("/api/v1/me")).status).toBe(200);
  });

  test("a public app is served to anyone, and a file of a private one is not", async () => {
    const visitor = browser(t, MAIN);
    const page = await visitor.get("/apps/acme/main/status/");
    expect(page.status).toBe(200);
    expect(page.body).toContain("Order status");
    expect(page.body).toContain('"principal":{"type":"anonymous"');
    expect((await visitor.get("/apps/acme/main/portal/assets/app-3f9a1c7e.js")).status).toBe(303);
  });
});

describe("end users", () => {
  let ed: Awaited<ReturnType<typeof endUser>>;
  let eve: Awaited<ReturnType<typeof endUser>>;

  test("an invitation link sets the password once and signs the person in", async () => {
    const created = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "Ed@Customer.example",
      name: "Ed",
    });
    expect(created.status).toBe(201);
    expect(created.body.endUser).toMatchObject({
      email: "ed@customer.example",
      hasPassword: false,
    });
    // The instance sends mail here, so the link went to the person as well.
    expect(created.body.invitation.emailed).toBe(true);
    expect(mail.at(-1)).toMatchObject({ to: "ed@customer.example" });
    expect(mail.at(-1)?.text).toContain(created.body.invitation.url);
    const link = new URL(created.body.invitation.url);
    expect(`${link.origin}${link.pathname}`).toBe("http://localhost:8080/portal/acme/set-password");
    const token = link.searchParams.get("token") as string;

    const visitor = browser(t, MAIN);
    const form = await visitor.get(`${link.pathname}${link.search}`);
    expect(form.status).toBe(200);
    expect(form.body).toContain("ed@customer.example");
    const short = await visitor.form("/portal/acme/set-password", { token, password: "short" });
    expect(short.status).toBe(400);
    const set = await visitor.form("/portal/acme/set-password", { token, password: PASSWORD });
    expect(set.status).toBe(303);
    expect([...visitor.jar.keys()]).toEqual([`vx_app_${tenant}`]);
    // Used: it works for nobody again.
    expect((await browser(t, MAIN).get(`${link.pathname}${link.search}`)).status).toBe(410);
    expect(
      (
        await browser(t, MAIN).post(`/api/v1/tenants/${tenant}/end-user-auth/passwords`, {
          token,
          password: PASSWORD,
        })
      ).status,
    ).toBe(410);

    const app = await visitor.get("/apps/acme/main/portal/");
    expect(app.status).toBe(200);
    expect(app.body).toContain('"principal":{"type":"end_user"');
    ed = { id: created.body.endUser.id, browser: visitor, link };
    eve = await endUser(t, alice, tenant, "acme", "eve@customer.example");

    expect(
      (await alice.post(`/tenants/${tenant}/end-users`, { email: "ed@customer.example" })).status,
    ).toBe(409);
    expect(
      (await alice.post(`/tenants/${tenant}/end-users`, { email: "not an email" })).status,
    ).toBe(400);
  });

  test("signing in and out, by the page and by the API", async () => {
    const visitor = browser(t, MAIN);
    const wrong = await visitor.form("/portal/acme/sign-in", {
      email: "ed@customer.example",
      password: "wrong-password-1",
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toContain("The email or the password is not right.");
    const right = await visitor.form("/portal/acme/sign-in", {
      email: "ed@customer.example",
      password: PASSWORD,
      return: "/apps/acme/main/portal/",
    });
    expect(right.status).toBe(303);
    expect(right.location).toBe("/apps/acme/main/portal/");
    // Never to another site, whatever the form says.
    const elsewhere = await browser(t, MAIN).form("/portal/acme/sign-in", {
      email: "ed@customer.example",
      password: PASSWORD,
      return: "//evil.example/",
    });
    expect(elsewhere.location).toBe("/portal/acme/");

    const home = await visitor.get("/portal/acme/");
    expect(home.body).toContain('href="/apps/acme/main/portal/"');
    expect(home.body).not.toContain("style=");
    expect(home.body).toContain("Order status");
    expect((await visitor.form("/portal/acme/sign-out", {})).status).toBe(303);
    expect((await visitor.get("/apps/acme/main/portal/")).status).toBe(303);

    const api = browser(t, MAIN);
    const base = `/api/v1/tenants/${tenant}`;
    expect(
      (
        await api.post(`${base}/end-user-auth/sign-in`, {
          email: "ed@customer.example",
          password: "nope-nope-nope",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await api.post(`${base}/end-user-auth/sign-in`, {
          email: "nobody@customer.example",
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    const signedIn = await api.post(`${base}/end-user-auth/sign-in`, {
      email: "ed@customer.example",
      password: PASSWORD,
    });
    expect(signedIn.status).toBe(200);
    expect((await api.get(`${base}/session`)).body).toEqual({
      principal: {
        type: "end_user",
        id: ed.id,
        name: "Ed",
        email: "ed@customer.example",
        groups: [],
        attributes: {},
      },
      signUp: false,
    });
    expect((await api.post(`${base}/end-user-auth/sign-out`)).status).toBe(204);
    expect((await api.get(`${base}/session`)).body.principal.type).toBe("anonymous");
  });

  test("a form or a change sent from another site is refused", async () => {
    const visitor = browser(t, MAIN);
    const form = await visitor.form(
      "/portal/acme/sign-in",
      { email: "ed@customer.example", password: PASSWORD },
      "https://evil.example",
    );
    expect(form.status).toBe(403);
    const change = await ed.browser.post(
      `/api/v1/tenants/${tenant}/workspaces/${prod}/rows/orders`,
      { number: "X-1" },
      "https://evil.example",
    );
    expect(change.status).toBe(403);
    expect(change.body.code).toBe("cross_site");
  });

  test("each end user reads and writes their own rows and nobody else's", async () => {
    const rows = `/api/v1/tenants/${tenant}/workspaces/${prod}`;
    const first = await ed.browser.post(`${rows}/rows/orders`, { number: "A-1" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const mine = first.body.items[0];
    expect(mine.owner_id).toBe(ed.id);
    expect((await eve.browser.post(`${rows}/rows/orders`, { number: "B-1" })).status).toBe(201);
    // Writing a row as someone else is refused by the table itself.
    expect(
      (await eve.browser.post(`${rows}/rows/orders`, { number: "B-2", owner_id: ed.id })).status,
    ).toBe(403);

    expect(
      (await ed.browser.get(`${rows}/rows/orders`)).body.items.map((row: Any) => row.number),
    ).toEqual(["A-1"]);
    expect(
      (await eve.browser.get(`${rows}/rows/orders`)).body.items.map((row: Any) => row.number),
    ).toEqual(["B-1"]);
    expect((await eve.browser.get(`${rows}/row/${mine.id}/orders`)).status).toBe(404);
    // Staff with a reading role see every row.
    expect((await alice.get(`${ws()}/rows/orders`)).body.items).toHaveLength(2);
  });

  test("an end user holds nothing outside what apps use, whatever role they are bound to", async () => {
    // A mistake an admin could make: the whole tenant handed to every end user.
    const mistake = await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "end_users",
      roleId: roles.tenant_admin,
    });
    expect(mistake.status).toBe(201);
    const base = `/api/v1/tenants/${tenant}`;
    for (const path of ["/members", "/end-users", "/audit", "/domains", "/portal"]) {
      expect((await ed.browser.get(`${base}${path}`)).status, path).toBe(403);
    }
    expect((await ed.browser.get(`${base}/workspaces/${prod}/secrets`)).status).toBe(403);
    expect((await ed.browser.post(`${base}/exports`, { passphrase: PASSPHRASE })).status).toBe(403);
    // What it does widen is what apps use: with data_all, every row.
    expect(
      (await ed.browser.get(`${base}/workspaces/${prod}/rows/orders`)).body.items,
    ).toHaveLength(2);
    expect((await alice.delete(`/tenants/${tenant}/bindings/${mistake.body.id}`)).status).toBe(204);
    expect(
      (await ed.browser.get(`${base}/workspaces/${prod}/rows/orders`)).body.items,
    ).toHaveLength(1);
  });

  test("a pool belongs to its tenant: the same email elsewhere is someone else", async () => {
    const gina = await t.signIn("gina@globex.example", PASSWORD);
    const twin = await endUser(t, gina, other, "globex", "ed@customer.example");
    expect(twin.id).not.toBe(ed.id);
    // Ed of Acme, at Globex, is nobody.
    expect((await ed.browser.get(`/api/v1/tenants/${other}/session`)).body.principal.type).toBe(
      "anonymous",
    );
    expect((await ed.browser.get(`/api/v1/tenants/${other}/end-users`)).status).toBe(401);
    // And Globex's Ed has no standing in Acme, though both are signed in from one browser.
    const both = browser(t, MAIN);
    await both.post(`/api/v1/tenants/${tenant}/end-user-auth/sign-in`, {
      email: "ed@customer.example",
      password: PASSWORD,
    });
    await both.post(`/api/v1/tenants/${other}/end-user-auth/sign-in`, {
      email: "ed@customer.example",
      password: PASSWORD,
    });
    expect((await both.get(`/api/v1/tenants/${tenant}/session`)).body.principal.id).toBe(ed.id);
    expect((await both.get(`/api/v1/tenants/${other}/session`)).body.principal.id).toBe(twin.id);
    // A cookie's value moved to the other tenant's name is worth nothing.
    const stolen = browser(t, MAIN);
    stolen.jar.set(`vx_app_${other}`, both.jar.get(`vx_app_${tenant}`) as string);
    expect((await stolen.get(`/api/v1/tenants/${other}/session`)).body.principal.type).toBe(
      "anonymous",
    );
  });

  test("a script started from an app knows who started it, and only a script the person may start runs", async () => {
    const runs = `/api/v1/tenants/${tenant}/workspaces/${prod}/runs`;
    const started = await ed.browser.post(runs, { script: "place-order", input: {} });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body.startedBy).toMatchObject({ type: "end_user", id: ed.id });
    expect((await ed.browser.get(`${runs}/${started.body.id}`)).status).toBe(200);
    // Not another person's run, and not the list of everyone's.
    expect((await eve.browser.get(`${runs}/${started.body.id}`)).status).toBe(403);
    expect((await ed.browser.get(runs)).status).toBe(403);
    expect((await ed.browser.post(runs, { script: "nothing", input: {} })).status).toBe(403);

    const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "apps" });
    const claim = await t.app.inject({
      method: "POST",
      url: "/api/v1/worker/claim",
      headers: { authorization: `Bearer ${credential.body.token}` },
      payload: { workerId: "018f0000-0000-7000-8000-000000000001", waitSeconds: 0 },
    });
    expect(claim.json().job.startedBy).toEqual({ type: "end_user", id: ed.id });
    // Acting for someone the tenant does not have is refused.
    const acting = await t.app.inject({
      method: "POST",
      url: `/api/v1/worker/runs/${started.body.id}/data`,
      headers: { authorization: `Bearer ${credential.body.token}` },
      payload: {
        attempt: 1,
        table: "orders",
        op: "find",
        as: "018f0000-0000-7000-8000-00000000dead",
      },
    });
    expect(acting.statusCode, acting.body).toBe(400);
    const forEd = await t.app.inject({
      method: "POST",
      url: `/api/v1/worker/runs/${started.body.id}/data`,
      headers: { authorization: `Bearer ${credential.body.token}` },
      payload: { attempt: 1, table: "orders", op: "find", as: ed.id },
    });
    expect(forEd.statusCode, forEd.body).toBe(200);
    expect(forEd.json().result.items.map((row: Any) => row.number)).toEqual(["A-1"]);
  });

  test("sign-up is off until the tenant turns it on", async () => {
    const base = `/api/v1/tenants/${tenant}`;
    const visitor = browser(t, MAIN);
    expect((await visitor.get("/portal/acme/sign-up")).status).toBe(404);
    expect(
      (
        await visitor.post(`${base}/end-user-auth/sign-up`, {
          email: "new@customer.example",
          password: PASSWORD,
        })
      ).status,
    ).toBe(403);
    expect((await visitor.get("/portal/acme/sign-in")).body).not.toContain("Create an account");

    const on = await alice.put(`/tenants/${tenant}/portal`, { signUp: true });
    expect(on.body).toMatchObject({
      signUp: true,
      mail: true,
      portalUrl: "http://localhost:8080/portal/acme/",
    });
    expect((await visitor.get("/portal/acme/sign-in")).body).toContain("Create an account");
    const made = await visitor.form("/portal/acme/sign-up", {
      email: "new@customer.example",
      name: "New",
      password: PASSWORD,
    });
    expect(made.status).toBe(303);
    expect((await visitor.get(`${base}/session`)).body.principal).toMatchObject({
      type: "end_user",
      email: "new@customer.example",
    });
    const again = await browser(t, MAIN).form("/portal/acme/sign-up", {
      email: "new@customer.example",
      password: PASSWORD,
    });
    expect(again.status).toBe(409);
    const byApi = await browser(t, MAIN).post(`${base}/end-user-auth/sign-up`, {
      email: "api@customer.example",
      password: PASSWORD,
    });
    expect(byApi.status).toBe(201);
    await alice.put(`/tenants/${tenant}/portal`, { signUp: false });
  });

  test("a forgotten password: a link by mail, saying the same for any email", async () => {
    const base = `/api/v1/tenants/${tenant}`;
    const before = mail.length;
    expect(
      (
        await browser(t, MAIN).post(`${base}/end-user-auth/password-links`, {
          email: "nobody@customer.example",
        })
      ).body,
    ).toEqual({ sent: true });
    expect(
      (
        await browser(t, MAIN).post(`${base}/end-user-auth/password-links`, {
          email: "eve@customer.example",
        })
      ).body,
    ).toEqual({ sent: true });
    await expect.poll(() => mail.length).toBe(before + 1);
    const url = new URL(/http\S+/.exec(mail.at(-1)?.text ?? "")?.[0] as string);
    const visitor = browser(t, MAIN);
    expect((await visitor.get(`${url.pathname}${url.search}`)).body).toContain(
      "Choose a new password",
    );
    const reset = await visitor.post(`${base}/end-user-auth/passwords`, {
      token: url.searchParams.get("token"),
      password: "another-good-password",
    });
    expect(reset.status).toBe(200);
    // The sign-ins from before the reset are over.
    expect((await eve.browser.get(`${base}/session`)).body.principal.type).toBe("anonymous");
    eve.browser = visitor;

    const page = await browser(t, MAIN).form("/portal/acme/forgot", {
      email: "ed@customer.example",
    });
    expect(page.body).toContain("If that email has an account, a link is on its way.");
    await expect.poll(() => mail.length).toBe(before + 2);

    // Changing it when signed in keeps this sign-in and needs the current password.
    expect(
      (
        await visitor.put(`${base}/end-user-auth/password`, {
          current: "wrong-wrong-wrong",
          password: PASSWORD,
        })
      ).status,
    ).toBe(400);
    const asEve = t.withHeaders({
      host: MAIN,
      cookie: [...visitor.jar].map(([name, value]) => `${name}=${value}`).join("; "),
    });
    expect(
      (
        await asEve.put(`/tenants/${tenant}/end-user-auth/password`, {
          current: "another-good-password",
          password: PASSWORD,
        })
      ).status,
    ).toBe(204);
    expect((await visitor.get(`${base}/session`)).body.principal.type).toBe("end_user");
    // Signing out through the API ends that sign-in and no other.
    const second = browser(t, MAIN);
    await second.post(`${base}/end-user-auth/sign-in`, {
      email: "eve@customer.example",
      password: PASSWORD,
    });
    const asSecond = t.withHeaders({
      host: MAIN,
      cookie: [...second.jar].map(([name, value]) => `${name}=${value}`).join("; "),
    });
    expect((await asSecond.post(`/tenants/${tenant}/end-user-auth/sign-out`)).status).toBe(204);
    expect((await second.get(`${base}/session`)).body.principal.type).toBe("anonymous");
    expect((await visitor.get(`${base}/session`)).body.principal.type).toBe("end_user");
    expect(
      (
        await alice.put(`/tenants/${tenant}/end-user-auth/password`, {
          current: "x",
          password: PASSWORD,
        })
      ).status,
    ).toBe(403);
  });

  test("staff list, rename, disable and delete end users, and make new links", async () => {
    const listed = (await alice.get(`/tenants/${tenant}/end-users?search=EVE`)).body.items;
    expect(listed).toMatchObject([
      { email: "eve@customer.example", hasPassword: true, disabled: false },
    ]);
    expect(listed[0].lastSignedInAt).not.toBeNull();

    const link = await alice.post(`/tenants/${tenant}/end-users/${eve.id}/links`, {
      purpose: "reset",
    });
    expect(link.status).toBe(201);
    expect(link.body.url).toContain("/portal/acme/set-password?token=");

    const disabled = await alice.patch(`/tenants/${tenant}/end-users/${eve.id}`, {
      name: "Eve A.",
      disabled: true,
    });
    expect(disabled.body).toMatchObject({ name: "Eve A.", disabled: true });
    expect((await eve.browser.get(`/api/v1/tenants/${tenant}/session`)).body.principal.type).toBe(
      "anonymous",
    );
    expect(
      (
        await browser(t, MAIN).post(`/api/v1/tenants/${tenant}/end-user-auth/sign-in`, {
          email: "eve@customer.example",
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    expect(
      (await alice.post(`/tenants/${tenant}/end-users/${eve.id}/links`, { purpose: "reset" }))
        .status,
    ).toBe(400);
    expect(
      (await alice.patch(`/tenants/${tenant}/end-users/${eve.id}`, { disabled: false })).body
        .disabled,
    ).toBe(false);

    expect((await alice.delete(`/tenants/${tenant}/end-users/${eve.id}`)).status).toBe(204);
    expect((await alice.get(`/tenants/${tenant}/end-users?search=eve`)).body.items).toEqual([]);
    // Her row stays, with the owner it had.
    expect((await alice.get(`${ws()}/rows/orders`)).body.items).toHaveLength(2);
    // Another tenant's admin sees none of it.
    const gina = await t.signIn("gina@globex.example", PASSWORD);
    expect((await gina.get(`/tenants/${tenant}/end-users`)).status).toBe(403);
  });
});

describe("groups of end users", () => {
  let gil: Awaited<ReturnType<typeof endUser>>;
  let hana: Awaited<ReturnType<typeof endUser>>;
  let finance: string;
  const groups = () => `/tenants/${tenant}/end-user-groups`;
  /** Whether someone may start flows in the workspace: 404 for a flow that is not there, 403 for no. */
  const mayStartFlows = async (who: { browser: ReturnType<typeof browser> }) =>
    (
      await who.browser.post(`/api/v1/tenants/${tenant}/workspaces/${prod}/flow-runs`, {
        flow: "no-such-flow",
      })
    ).status === 404;

  test("a group is made, named once, and people of the tenant are put in it", async () => {
    gil = await endUser(t, alice, tenant, "acme", "gil@customer.example");
    hana = await endUser(t, alice, tenant, "acme", "hana@customer.example");
    const created = await alice.post(groups(), { name: "finance", description: "Sees invoices." });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    finance = created.body.id;
    expect((await alice.post(groups(), { name: "finance" })).status).toBe(409);
    expect((await alice.post(groups(), { name: "two\nlines" })).status).toBe(400);

    expect((await alice.put(`${groups()}/${finance}/members/${gil.id}`)).status).toBe(204);
    // Twice changes nothing.
    expect((await alice.put(`${groups()}/${finance}/members/${gil.id}`)).status).toBe(204);
    expect((await alice.get(`${groups()}/${finance}`)).body.members).toEqual([
      { id: gil.id, email: "gil@customer.example", name: "gil" },
    ]);
    expect((await alice.get(groups())).body.items).toEqual([
      expect.objectContaining({ name: "finance", description: "Sees invoices.", memberCount: 1 }),
    ]);
    // Someone of another tenant cannot be put in it, and another tenant cannot see it.
    const gina = await t.signIn("gina@globex.example", PASSWORD);
    const outsider = (await gina.post(`/tenants/${other}/end-users`, { email: "o@else.example" }))
      .body.endUser.id;
    expect((await alice.put(`${groups()}/${finance}/members/${outsider}`)).status).toBe(404);
    expect((await gina.get(`/tenants/${other}/end-user-groups/${finance}`)).status).toBe(404);

    const listed = (await alice.get(`/tenants/${tenant}/end-users?search=gil`)).body.items;
    expect(listed[0].groups).toEqual(["finance"]);
  });

  test("a role given to the group reaches the people in it, and nobody else", async () => {
    const role = await alice.post(`/tenants/${tenant}/roles`, {
      name: "flow_starter",
      description: "Starts flows.",
      permissions: ["flow_run:write"],
    });
    expect(await mayStartFlows(gil)).toBe(false);
    const bound = await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: prod,
      principalType: "end_user_group",
      principalId: finance,
      roleId: role.body.id,
    });
    expect(bound.status, JSON.stringify(bound.body)).toBe(201);
    expect(await mayStartFlows(gil)).toBe(true);
    expect(await mayStartFlows(hana)).toBe(false);
    const listed = (await alice.get(`/tenants/${tenant}/bindings`)).body.items.find(
      (binding: Any) => binding.principalType === "end_user_group",
    );
    expect(listed.principalLabel).toBe("finance");
    // A group of another tenant, or a group of members, is not a group of end users here.
    expect(
      (
        await alice.post(`/tenants/${tenant}/bindings`, {
          workspaceId: prod,
          principalType: "end_user_group",
          principalId: gil.id,
          roleId: role.body.id,
        })
      ).status,
    ).toBe(400);

    // Joining and leaving take effect on the next request.
    await alice.put(`${groups()}/${finance}/members/${hana.id}`);
    expect(await mayStartFlows(hana)).toBe(true);
    expect((await alice.delete(`${groups()}/${finance}/members/${hana.id}`)).status).toBe(204);
    expect(await mayStartFlows(hana)).toBe(false);
    expect((await alice.delete(`${groups()}/${finance}/members/${hana.id}`)).status).toBe(404);
  });

  test("a group still gives an end user nothing outside what apps use", async () => {
    const wide = await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "end_user_group",
      principalId: finance,
      roleId: roles.tenant_admin,
    });
    expect(wide.status).toBe(201);
    expect(
      (await gil.browser.get(`/api/v1/tenants/${tenant}/workspaces/${prod}/secrets`)).status,
    ).toBe(403);
    expect((await gil.browser.get(`/api/v1/tenants/${tenant}/end-user-groups`)).status).toBe(403);
    await alice.delete(`/tenants/${tenant}/bindings/${wide.body.id}`);
  });

  test("attributes are facts about a person, kept as short named values", async () => {
    const set = await alice.patch(`/tenants/${tenant}/end-users/${gil.id}`, {
      attributes: { customer_id: "C-100", region: "north" },
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.attributes).toEqual({ customer_id: "C-100", region: "north" });
    expect(set.body.groups).toEqual(["finance"]);
    expect(
      (
        await alice.patch(`/tenants/${tenant}/end-users/${gil.id}`, {
          attributes: { "Bad Name": "x" },
        })
      ).status,
    ).toBe(400);
    // Renaming someone leaves their attributes alone.
    const renamed = await alice.patch(`/tenants/${tenant}/end-users/${gil.id}`, { name: "Gil" });
    expect(renamed.body.attributes).toEqual({ customer_id: "C-100", region: "north" });
    // An app may read the person's own groups and attributes, to know which team is theirs.
    expect(
      (await gil.browser.get(`/api/v1/tenants/${tenant}/session`)).body.principal,
    ).toMatchObject({
      type: "end_user",
      groups: ["finance"],
      attributes: { customer_id: "C-100", region: "north" },
    });
  });

  test("deleting a person or a group takes the memberships and what the group was given with it", async () => {
    await alice.put(`${groups()}/${finance}/members/${hana.id}`);
    expect((await alice.delete(`/tenants/${tenant}/end-users/${hana.id}`)).status).toBe(204);
    expect((await alice.get(`${groups()}/${finance}`)).body.members).toHaveLength(1);

    expect((await alice.delete(`${groups()}/${finance}`)).status).toBe(204);
    expect(await mayStartFlows(gil)).toBe(false);
    expect(
      (await alice.get(`/tenants/${tenant}/bindings`)).body.items.filter(
        (binding: Any) => binding.principalType === "end_user_group",
      ),
    ).toEqual([]);
    expect((await alice.delete(`${groups()}/${finance}`)).status).toBe(404);
  });
});

describe("rows ruled by group and by attribute", () => {
  let ivy: Awaited<ReturnType<typeof endUser>>;
  let jon: Awaited<ReturnType<typeof endUser>>;
  let kay: Awaited<ReturnType<typeof endUser>>;
  let financeGroup: string;
  const table = (body: Record<string, unknown>) =>
    alice.put(`${ws()}/resources/invoices`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body,
    });
  const columns = {
    number: { type: "text", required: true },
    team: { type: "text" },
    customer: { type: "text" },
    assignee: { type: "uuid" },
    paid: { type: "boolean" },
  };
  const rules = [
    { allow: "read", when: { column: "team", in: "groups" } },
    { allow: "all", when: { column: "customer", equals: { attribute: "customer_id" } } },
    { allow: "write", when: { column: "assignee", is: "principal" } },
  ];
  const numbers = async (who: { browser: ReturnType<typeof browser> }) =>
    ((await who.browser.get(`${rowsOf()}/rows/invoices`)).body.items as Any[])
      .map((row) => row.number)
      .sort();
  const rowsOf = () => `/api/v1/tenants/${tenant}/workspaces/${prod}`;
  const byNumber: Record<string, string> = {};

  test("a rule must name a column the table has, of a kind it can compare", async () => {
    const missing = await table({
      columns,
      policy: { type: "rules", rules: [{ allow: "read", when: { column: "nope", in: "groups" } }] },
    });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body.errors)).toContain('there is no column \\"nope\\"');
    const wrongKind = await table({
      columns,
      policy: {
        type: "rules",
        rules: [{ allow: "read", when: { column: "paid", is: "principal" } }],
      },
    });
    expect(wrongKind.status).toBe(400);
    expect(JSON.stringify(wrongKind.body.errors)).toContain(
      "a rule cannot compare the boolean column",
    );
    expect((await table({ columns, policy: { type: "rules", rules: [] } })).status).toBe(400);
  });

  test("three people, one table: each sees the rows the rules give them", async () => {
    const made = await table({ columns, policy: { type: "rules", rules } });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect((await alice.get(`${ws()}/tables/invoices`)).body.policy).toEqual({
      type: "rules",
      rules,
    });
    // Every end user may use the table. Which rows is the rules' business.
    await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: prod,
      resourceId: made.body.id,
      principalType: "end_users",
      roleId: roles.portal_user,
    });

    ivy = await endUser(t, alice, tenant, "acme", "ivy@customer.example");
    jon = await endUser(t, alice, tenant, "acme", "jon@customer.example");
    kay = await endUser(t, alice, tenant, "acme", "kay@customer.example");
    const group = async (name: string, ...people: string[]) => {
      const id = (await alice.post(`/tenants/${tenant}/end-user-groups`, { name })).body
        .id as string;
      for (const person of people)
        await alice.put(`/tenants/${tenant}/end-user-groups/${id}/members/${person}`);
      return id;
    };
    financeGroup = await group("finance", ivy.id);
    await group("sales", jon.id);
    // A group of end users is named as a group of members is: any one-line name.
    const spaced = await alice.post(`/tenants/${tenant}/end-user-groups`, { name: "Front desk" });
    expect(spaced.status, JSON.stringify(spaced.body)).toBe(201);
    expect(
      (await alice.post(`/tenants/${tenant}/end-user-groups`, { name: " padded " })).status,
    ).toBe(400);
    expect(
      (await alice.delete(`/tenants/${tenant}/end-user-groups/${spaced.body.id}`)).status,
    ).toBe(204);
    await alice.patch(`/tenants/${tenant}/end-users/${ivy.id}`, {
      attributes: { customer_id: "C-200" },
    });
    await alice.patch(`/tenants/${tenant}/end-users/${kay.id}`, {
      attributes: { customer_id: "C-100" },
    });

    // Staff, who may see every row, write the rows the rest of this is about.
    const seeded = await alice.post(`${ws()}/rows/invoices`, {
      rows: [
        { number: "INV-1", team: "finance", customer: "C-100" },
        { number: "INV-2", team: "sales", customer: "C-200" },
        { number: "INV-3", team: "ops", customer: "C-300", assignee: ivy.id },
        { number: "INV-4", team: "ops", customer: "C-300" },
      ],
    });
    expect(seeded.status, JSON.stringify(seeded.body)).toBe(201);
    for (const row of seeded.body.items as Any[]) byNumber[row.number] = row.id;

    // Ivy: her group's row, her customer's row, and the row assigned to her.
    expect(await numbers(ivy)).toEqual(["INV-1", "INV-2", "INV-3"]);
    // Jon: his group's row. Kay: her customer's row. Nobody: the row no rule gives anyone.
    expect(await numbers(jon)).toEqual(["INV-2"]);
    expect(await numbers(kay)).toEqual(["INV-1"]);
    expect((await alice.get(`${ws()}/rows/invoices`)).body.items).toHaveLength(4);
    // A row the rules hide is not there at all, by its ID either.
    expect((await jon.browser.get(`${rowsOf()}/row/${byNumber["INV-1"]}/invoices`)).status).toBe(
      404,
    );
  });

  test("totals follow the rules too: each person's are of their own rows", async () => {
    const count = async (who: { browser: ReturnType<typeof browser> }, query = "") =>
      (await who.browser.get(`${rowsOf()}/aggregate/invoices${query}`)).body.items;
    expect(await count(ivy)).toEqual([{ by: {}, values: { count: 3 } }]);
    expect(await count(jon)).toEqual([{ by: {}, values: { count: 1 } }]);
    expect(await count(kay, "?group=team")).toEqual([
      { by: { team: "finance" }, values: { count: 1 } },
    ]);
    const staff = await alice.get(`${ws()}/aggregate/invoices?group=team&sort=-count`);
    expect(staff.body.items[0]).toEqual({ by: { team: "ops" }, values: { count: 2 } });
    // Staff who may see every row can ask for a person's totals. A person held to the rules cannot.
    expect(
      (await alice.get(`${ws()}/aggregate/invoices?as=${jon.id}`)).body.items[0].values.count,
    ).toBe(1);
    expect((await ivy.browser.get(`${rowsOf()}/aggregate/invoices?as=${jon.id}`)).status).toBe(403);
  });

  test("seeing a row is not being able to change it: only a write rule lets someone write", async () => {
    const patch = (who: typeof ivy, number: string, change: object) =>
      who.browser.post === undefined
        ? Promise.reject(new Error("no browser"))
        : t.app
            .inject({
              method: "PATCH",
              url: `${rowsOf()}/row/${byNumber[number]}/invoices`,
              headers: {
                host: MAIN,
                origin: `http://${MAIN}`,
                cookie: [...who.browser.jar].map(([name, value]) => `${name}=${value}`).join("; "),
              },
              payload: change,
            })
            .then((response) => response.statusCode);
    // Read through her group only: she sees INV-1 and cannot change it.
    expect(await patch(ivy, "INV-1", { paid: true })).not.toBe(200);
    // Hers by her customer, with a rule that allows everything.
    expect(await patch(ivy, "INV-2", { paid: true })).toBe(200);
    // Assigned to her, with a rule that allows writing.
    expect(await patch(ivy, "INV-3", { paid: true })).toBe(200);
    const after = Object.fromEntries(
      ((await alice.get(`${ws()}/rows/invoices`)).body.items as Any[]).map((row) => [
        row.number,
        row.paid,
      ]),
    );
    expect(after).toMatchObject({ "INV-1": null, "INV-2": true, "INV-3": true });

    // Adding a row: only one that a write rule would give back to whoever adds it.
    expect(
      (
        await jon.browser.post(`${rowsOf()}/rows/invoices`, {
          number: "J-1",
          team: "sales",
          assignee: null,
        })
      ).status,
    ).toBe(403);
    expect(
      (await kay.browser.post(`${rowsOf()}/rows/invoices`, { number: "K-1", customer: "C-100" }))
        .status,
    ).toBe(201);
    expect(
      (
        await kay.browser.post(`${rowsOf()}/rows/invoices`, {
          number: "K-2",
          customer: "C-999",
          assignee: null,
        })
      ).status,
    ).toBe(403);
    // A row added with nobody named is assigned to whoever added it.
    const own = await jon.browser.post(`${rowsOf()}/rows/invoices`, { number: "J-2" });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    expect(own.body.items[0].assignee).toBe(jon.id);
    expect(await numbers(jon)).toEqual(["INV-2", "J-2"]);
  });

  test("staff who may see every row can read the table as one of its users would", async () => {
    const as = async (client: Client, id: string) =>
      client.get(`${ws()}/rows/invoices?sort=number&as=${id}`);
    expect((await as(alice, jon.id)).body.items.map((row: Any) => row.number)).toEqual([
      "INV-2",
      "J-2",
    ]);
    expect((await as(alice, kay.id)).body.items.map((row: Any) => row.number)).toEqual([
      "INV-1",
      "K-1",
    ]);
    // Not someone of another tenant, and not by someone who is held to the rules themselves.
    expect((await as(alice, "00000000-0000-7000-8000-00000000dead")).status).toBe(400);
    const peek = await ivy.browser.get(`${rowsOf()}/rows/invoices?as=${jon.id}`);
    expect(peek.status).toBe(403);
  });

  test("leaving a group, or losing an attribute, takes the rows away at once", async () => {
    await alice.delete(`/tenants/${tenant}/end-user-groups/${financeGroup}/members/${ivy.id}`);
    expect(await numbers(ivy)).toEqual(["INV-2", "INV-3"]);
    await alice.patch(`/tenants/${tenant}/end-users/${ivy.id}`, { attributes: {} });
    expect(await numbers(ivy)).toEqual(["INV-3"]);
    // Someone with no attribute does not match rows that have no customer either.
    expect(await numbers(jon)).not.toContain("INV-4");
  });

  test("the policy can be changed, and going back to open shows every row to all who may use the table", async () => {
    const opened = await table({ columns, policy: { type: "open" } });
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    // The four that staff wrote, and the two that the rules let people add.
    expect((await numbers(jon)).length).toBe(6);
    const owned = await table({ columns, policy: { type: "owner", column: "assignee" } });
    expect(owned.status).toBe(200);
    expect(await numbers(jon)).toEqual(["J-2"]);
    const ruled = await table({
      columns,
      policy: { type: "rules", rules: [{ allow: "read", when: { everyone: true } }] },
    });
    expect(ruled.status).toBe(200);
    expect((await numbers(kay)).length).toBe(6);
    // Everyone reads, and nobody but staff writes.
    expect((await kay.browser.post(`${rowsOf()}/rows/invoices`, { number: "K-9" })).status).toBe(
      403,
    );
  });
});

describe("branding", () => {
  test("the kit's values here are the ones in its stylesheet", async () => {
    const css = await readFile(
      new URL("../../../packages/ui/src/tokens.css", import.meta.url),
      "utf8",
    );
    const [light = "", dark = ""] = css.split("@media (prefers-color-scheme: dark)");
    const read = (text: string) =>
      Object.fromEntries(
        [...text.matchAll(/--vx-([a-z-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]),
      );
    expect(read(light.split("@theme")[0] as string)).toEqual(DEFAULT_THEME.tokens);
    expect(read(dark.split("@theme")[0] as string)).toEqual(DEFAULT_THEME.dark);
  });

  test("a tenant sets tokens, a workspace overrides them, and both are stylesheets anyone may load", async () => {
    const set = await alice.put(`/tenants/${tenant}/portal`, {
      theme: { tokens: { action: "#123456", canvas: "#fafafa" }, dark: { action: "#abcdef" } },
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.theme.tokens).toEqual({ action: "#123456", canvas: "#fafafa" });

    const ofTenant = await browser(t, MAIN).get(`/api/v1/tenants/${tenant}/theme.css`);
    expect(ofTenant.headers["content-type"]).toContain("text/css");
    expect(ofTenant.body).toContain("--vx-action: #123456;");
    expect(ofTenant.body).toContain("--vx-canvas: #fafafa;");
    expect(ofTenant.body).toContain("--vx-action: #abcdef;");
    // What was not set keeps the kit's value.
    expect(ofTenant.body).toContain(`--vx-ink: ${DEFAULT_THEME.tokens.ink};`);

    const ofWorkspace = (
      await browser(t, MAIN).get(`/api/v1/tenants/${tenant}/workspaces/${prod}/theme.css`)
    ).body;
    expect(ofWorkspace).toContain("--vx-action: #7a1f5c;");
    expect(ofWorkspace).toContain("--vx-canvas: #fafafa;");
  });

  test("a value that is more than a color, a length or a font list is refused", async () => {
    for (const value of [
      "red; } body { display: none",
      "url(https://evil.example/x)",
      "var(--x)",
      "#fff</style>",
    ]) {
      const refused = await alice.put(`/tenants/${tenant}/portal`, {
        theme: { tokens: { action: value } },
      });
      expect(refused.status, value).toBe(400);
    }
    expect(
      (await alice.put(`/tenants/${tenant}/portal`, { theme: { tokens: { nonsense: "#fff" } } }))
        .status,
    ).toBe(400);
    const inBundle = bundle((manifests) =>
      manifests.map((m) =>
        m.kind === "theme" ? { ...m, body: { tokens: { font: "url(x)" } } } : m,
      ),
    );
    expect((await alice.post(`${ws()}/bundles`, inBundle)).status).toBe(400);
  });

  test("a logo is an image, shown on the sign-in page", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    expect((await alice.put(`/tenants/${tenant}/portal/logo`, Buffer.from("<svg/>"))).status).toBe(
      400,
    );
    const set = await t.app.inject({
      method: "PUT",
      url: `/api/v1/tenants/${tenant}/portal/logo`,
      headers: { ...aliceHeaders(), "content-type": "image/png" },
      payload: png,
    });
    expect(set.statusCode, set.body).toBe(204);
    const logo = await browser(t, MAIN).get(`/api/v1/tenants/${tenant}/portal/logo`);
    expect(logo.headers["content-type"]).toBe("image/png");
    expect(logo.bytes.equals(png)).toBe(true);
    expect((await browser(t, MAIN).get("/portal/acme/sign-in")).body).toContain(
      `/api/v1/tenants/${tenant}/portal/logo`,
    );
    expect((await alice.get(`/tenants/${tenant}/portal`)).body.logo).toBe(true);
    // An app is told there is one now.
    const staff = browser(t, MAIN);
    await staff.signInMember("alice@acme.example", PASSWORD);
    const page = (await staff.get("/apps/acme/main/portal/")).body;
    const context = JSON.parse(
      /<script type="application\/json" id="vx-context">(.*?)<\/script>/.exec(page)?.[1] as string,
    );
    expect(context.tenant.logo).toBe(true);
  });
});

let aliceCookie = "";
const aliceHeaders = () => ({ cookie: aliceCookie, origin: "http://localhost:8080" });

describe("a hostname of the tenant's own", () => {
  let domainId: string;

  test("it is registered for one app, and enabled once its owner is shown to agree", async () => {
    expect(
      (
        await alice.post(`/tenants/${tenant}/domains`, {
          workspaceId: prod,
          app: "portal",
          hostname: "localhost",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await alice.post(`/tenants/${tenant}/domains`, {
          workspaceId: prod,
          app: "nothing",
          hostname: DOMAIN,
        })
      ).status,
    ).toBe(400);
    const created = await alice.post(`/tenants/${tenant}/domains`, {
      workspaceId: prod,
      app: "portal",
      hostname: "Portal.Acme.Test",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      hostname: DOMAIN,
      app: "portal",
      enabled: false,
      verifiedAt: null,
      url: `http://${DOMAIN}/`,
    });
    expect(created.body.challenge.name).toBe(`_vx-challenge.${DOMAIN}`);
    expect(created.body.challenge.value).toMatch(/^vx-domain=[0-9a-f]{40}$/);
    domainId = created.body.id;

    // Another tenant cannot take the name, and gets a different record to publish.
    const gina = await t.signIn("gina@globex.example", PASSWORD);
    expect(
      (
        await gina.post(`/tenants/${other}/domains`, {
          workspaceId: prod,
          app: "portal",
          hostname: DOMAIN,
        })
      ).status,
    ).toBe(400);

    // Not yet enabled: the name is the instance by another name, and serves no app.
    expect((await browser(t, DOMAIN).get("/api/v1/domain-check")).status).toBe(200);

    const checked = await alice.post(`/tenants/${tenant}/domains/${domainId}/checks`);
    expect(checked.body.verifiedAt).toBeNull();
    expect(checked.body.checkError).toContain("No TXT record");
    const refused = await alice.patch(`/tenants/${tenant}/domains/${domainId}`, { enabled: true });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("domain_not_verified");

    // An operator may enable a name that exists only inside a network.
    const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
      reason: "Internal name",
      roleId: roles.tenant_admin,
    });
    const enabled = await t.admin.patch(`/tenants/${tenant}/domains/${domainId}`, {
      enabled: true,
    });
    expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
    await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
    expect((await alice.get(`/tenants/${tenant}/domains`)).body.items).toMatchObject([
      { hostname: DOMAIN, enabled: true },
    ]);
    expect((await alice.get(`${ws()}/apps`)).body.items[0].domains).toEqual([
      { hostname: DOMAIN, url: `http://${DOMAIN}/`, enabled: true },
    ]);
  });

  test("the app is at its root, with its own sign-in pages, and nothing else of the instance is there", async () => {
    const visitor = browser(t, DOMAIN);
    const sent = await visitor.get("/");
    expect(sent.status).toBe(303);
    expect(sent.location).toBe("/_/sign-in?return=%2F");
    expect((await visitor.get("/_/sign-in")).body).toContain('action="/_/sign-in"');
    const signedIn = await visitor.form("/_/sign-in", {
      email: "ed@customer.example",
      password: PASSWORD,
      return: "/",
    });
    expect(signedIn.status).toBe(303);
    const page = await visitor.get("/");
    expect(page.status).toBe(200);
    expect(page.body).toContain('<base href="/">');
    expect(page.body).toContain('"portal":"/_"');
    expect(
      (await visitor.get("/assets/app-3f9a1c7e.js")).bytes.equals(files.script?.content as Buffer),
    ).toBe(true);
    expect((await visitor.get("/customers/42")).body).toContain('<div id="app">');
    // The other app of the workspace is not here, and neither is the path form.
    expect((await visitor.get("/apps/acme/main/status/")).body).toContain('<div id="app">');
    expect((await visitor.get("/portal/acme/sign-in")).body).toContain('<div id="app">');

    // The API answers for this tenant only.
    expect((await visitor.get(`/api/v1/tenants/${tenant}/session`)).body.principal.type).toBe(
      "end_user",
    );
    expect((await visitor.get(`/api/v1/tenants/${other}/session`)).status).toBe(404);
    // A sign-in is good where it was made: not at the instance's address, and not the other way.
    const moved = browser(t, MAIN);
    for (const [name, value] of visitor.jar) moved.jar.set(name, value);
    expect((await moved.get(`/api/v1/tenants/${tenant}/session`)).body.principal.type).toBe(
      "anonymous",
    );
  });

  test("a member's console sign-in means nothing there, and members cannot sign in there", async () => {
    const response = await t.app.inject({
      method: "GET",
      url: `/api/v1/tenants/${tenant}/session`,
      headers: { host: DOMAIN, cookie: aliceCookie },
    });
    expect(response.json().principal.type).toBe("anonymous");
    const members = await t.app.inject({
      method: "GET",
      url: `/api/v1/tenants/${tenant}/members`,
      headers: { host: DOMAIN, cookie: aliceCookie },
    });
    expect(members.statusCode).toBe(401);
    const visitor = browser(t, DOMAIN);
    expect(await visitor.signInMember("alice@acme.example", PASSWORD)).toBe(404);
  });

  test("staff are carried over by a code that works once, to a sign-in for this tenant's apps only", async () => {
    const visitor = browser(t, DOMAIN);
    const start = await visitor.get("/_/staff?return=%2Fcustomers%2F42");
    expect(start.status).toBe(303);
    const handoff = new URL(start.location as string);
    expect(handoff.origin).toBe("http://localhost:8080");
    expect(handoff.pathname).toBe("/api/v1/app-handoffs/start");

    // Not signed in at the console: sent there first.
    const anonymous = await t.app.inject({
      method: "GET",
      url: `${handoff.pathname}${handoff.search}`,
      headers: { host: MAIN },
    });
    expect(anonymous.statusCode).toBe(302);
    expect(anonymous.headers.location).toMatch(/^\/\?return=/);

    const carried = await t.app.inject({
      method: "GET",
      url: `${handoff.pathname}${handoff.search}`,
      headers: { host: MAIN, cookie: aliceCookie },
    });
    expect(carried.statusCode, carried.body).toBe(302);
    const exchange = new URL(carried.headers.location as string);
    expect(exchange.host).toBe(DOMAIN);

    // The code is for that address. It does nothing at the instance's own.
    expect((await browser(t, MAIN).get(`${exchange.pathname}${exchange.search}`)).status).toBe(404);
    const arrived = await visitor.get(`${exchange.pathname}${exchange.search}`);
    expect(arrived.status).toBe(302);
    expect(arrived.location).toBe("/customers/42");
    expect((await browser(t, DOMAIN).get(`${exchange.pathname}${exchange.search}`)).status).toBe(
      403,
    );

    const session = (await visitor.get(`/api/v1/tenants/${tenant}/session`)).body;
    expect(session.principal).toMatchObject({ type: "member", email: "alice@acme.example" });
    expect((await visitor.get("/")).status).toBe(200);
    // Alice is a tenant admin. This sign-in still reaches only what apps use.
    expect(
      (await visitor.get(`/api/v1/tenants/${tenant}/workspaces/${prod}/rows/orders`)).body.items,
    ).toHaveLength(2);
    for (const path of ["/members", "/end-users", "/domains", `/workspaces/${prod}/secrets`]) {
      expect((await visitor.get(`/api/v1/tenants/${tenant}${path}`)).status, path).toBe(403);
    }
    // Nor the member's own account: its tenants, its API keys.
    expect((await visitor.get("/api/v1/tenants")).status).toBe(403);
    expect((await visitor.get("/api/v1/me")).status).toBe(403);
    expect((await visitor.post("/api/v1/api-keys", { name: "from an app" })).status).toBe(403);

    // A code cannot be asked for an address that is not this tenant's.
    const elsewhere = await t.app.inject({
      method: "GET",
      url: `/api/v1/app-handoffs/start?tenant=${tenant}&to=${encodeURIComponent("https://evil.example")}`,
      headers: { host: MAIN, cookie: aliceCookie },
    });
    expect(elsewhere.statusCode).toBe(400);
    const wrongTenant = await t.app.inject({
      method: "GET",
      url: `/api/v1/app-handoffs/start?tenant=${other}&to=${encodeURIComponent(`http://${DOMAIN}`)}`,
      headers: { host: MAIN, cookie: aliceCookie },
    });
    expect(wrongTenant.statusCode).toBe(400);

    // Nor by a member of the instance who is not this tenant's.
    const gina = browser(t, MAIN);
    await gina.signInMember("gina@globex.example", PASSWORD);
    const outsider = await gina.get(
      `/api/v1/app-handoffs/start?tenant=${tenant}&to=${encodeURIComponent(`http://${DOMAIN}`)}`,
    );
    expect(outsider.status).toBe(404);
    // At an app's address a change must come from that address, not even from the console's.
    const fromConsole = await visitor.post(
      `/api/v1/tenants/${tenant}/workspaces/${prod}/rows/orders`,
      { number: "X-9" },
      "http://localhost:8080",
    );
    expect(fromConsole.status).toBe(403);
    expect(fromConsole.body.code).toBe("cross_site");
  });

  test("an invitation can be made for the hostname, and removing the hostname ends what was there", async () => {
    const link = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "dora@customer.example",
      domainId,
    });
    expect(link.body.invitation.url).toContain(`http://${DOMAIN}/_/set-password?token=`);
    const moved = await alice.patch(`/tenants/${tenant}/domains/${domainId}`, { app: "status" });
    expect(moved.body.app).toBe("status");
    expect((await browser(t, DOMAIN).get("/")).body).toContain("Order status");

    expect((await alice.delete(`/tenants/${tenant}/domains/${domainId}`)).status).toBe(204);
    // The name is again the instance by another name.
    expect((await browser(t, DOMAIN).get("/apps/acme/main/status/")).body).toContain(
      "Order status",
    );
  });

  test("a hostname for the portal serves its home at the root and every app by path", async () => {
    const hostname = "everything.acme.test";
    const created = await alice.post(`/tenants/${tenant}/domains`, {
      workspaceId: prod,
      app: "",
      hostname,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ app: "", url: `http://${hostname}/` });
    const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
      reason: "Internal name",
      roleId: roles.tenant_admin,
    });
    await t.admin.patch(`/tenants/${tenant}/domains/${created.body.id}`, { enabled: true });
    await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);

    const listed = (await alice.get(`${ws()}/apps`)).body.items;
    expect(listed.find((app: { path: string }) => app.path === "status").domains).toContainEqual({
      hostname,
      url: `http://${hostname}/status/`,
      enabled: true,
    });

    const visitor = browser(t, hostname);
    expect((await visitor.get("/")).body).toContain('href="/_/sign-in"');
    await visitor.form("/_/sign-in", {
      email: "ed@customer.example",
      password: PASSWORD,
      return: "/",
    });
    const home = await visitor.get("/");
    expect(home.status).toBe(200);
    expect(home.body).toContain('href="/portal/"');
    const status = await visitor.get("/status");
    expect(status.status).toBe(308);
    expect(status.location).toBe("/status/");
    expect((await visitor.get("/status/")).body).toContain("Order status");
    const app = await visitor.get("/portal/");
    expect(app.body).toContain('<base href="/portal/">');
    expect((await visitor.get("/nothing/")).status).toBe(404);

    expect((await alice.delete(`/tenants/${tenant}/domains/${created.body.id}`)).status).toBe(204);
  });
});

describe("a second address for apps", () => {
  let s: TestApp;
  let id: string;
  let workspace: string;
  const APPS = "apps.localhost:8080";

  beforeAll(async () => {
    s = await startTestApp({ config: { appsUrl: "http://apps.localhost:8080" } });
    const acme = await seed(s, "acme", "alice@acme.example");
    id = acme.id;
    workspace = (
      await acme.client.post(`/tenants/${id}/workspaces`, {
        slug: "main",
        name: "Main",
        type: "production",
      })
    ).body.id;
    await uploadFiles(acme.client, ws(workspace, id));
    const uploaded = await acme.client.post(`${ws(workspace, id)}/bundles`, bundle());
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    await acme.client.post(`${ws(workspace, id)}/deployments`, { bundleId: uploaded.body.id });
    expect((await acme.client.get(`${ws(workspace, id)}/apps`)).body.items[0].url).toBe(
      "http://apps.localhost:8080/apps/acme/main/portal/",
    );
  });
  afterAll(async () => {
    await s?.stop();
  });

  test("apps are served there and not at the instance's own address", async () => {
    const main = browser(s, MAIN);
    await main.signInMember("alice@acme.example", PASSWORD);
    const sent = await main.get("/apps/acme/main/status/?x=1");
    expect(sent.status).toBe(307);
    expect(sent.location).toBe("http://apps.localhost:8080/apps/acme/main/status/?x=1");

    const there = browser(s, APPS);
    expect((await there.get("/apps/acme/main/status/")).body).toContain("Order status");
    // No console, and no member sign-in.
    expect((await there.get("/")).status).toBe(404);
    expect((await there.get("/tenants")).status).toBe(404);
    expect(await there.signInMember("alice@acme.example", PASSWORD)).toBe(404);
    // The console's cookie, were it ever sent there, is not looked at.
    for (const [name, value] of main.jar) there.jar.set(name, value);
    expect((await there.get(`/api/v1/tenants/${id}/session`)).body.principal.type).toBe(
      "anonymous",
    );
    expect((await there.get("/apps/acme/main/portal/")).status).toBe(303);
  });

  test("staff are carried over to it the same way", async () => {
    const main = browser(s, MAIN);
    await main.signInMember("alice@acme.example", PASSWORD);
    const there = browser(s, APPS);
    const start = await there.get(
      `/portal/acme/staff?return=${encodeURIComponent("/apps/acme/main/portal/")}`,
    );
    const handoff = new URL(start.location as string);
    const carried = await main.get(`${handoff.pathname}${handoff.search}`);
    expect(carried.status, JSON.stringify(carried.body)).toBe(302);
    const exchange = new URL(carried.location as string);
    expect(exchange.host).toBe(APPS);
    const arrived = await there.get(`${exchange.pathname}${exchange.search}`);
    expect(arrived.location).toBe("/apps/acme/main/portal/");
    expect((await there.get("/apps/acme/main/portal/")).status).toBe(200);
    expect((await there.get(`/api/v1/tenants/${id}/members`)).status).toBe(403);
  });
});

describe("moving a tenant", () => {
  test("end users, app files and branding arrive, and people sign in with the password they had", async () => {
    const b = await startTestApp();
    try {
      const exported = await alice.post(`/tenants/${tenant}/exports`, { passphrase: PASSPHRASE });
      expect(exported.status).toBe(200);
      const imported = await b.admin.upload(
        "/instance/tenant-imports",
        exported.bytes,
        "application/x-tar",
        {
          "x-export-passphrase": PASSPHRASE,
        },
      );
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);

      const visitor = browser(b, MAIN);
      const signedIn = await visitor.form("/portal/acme/sign-in", {
        email: "ed@customer.example",
        password: PASSWORD,
      });
      expect(signedIn.status, signedIn.body).toBe(303);
      const page = await visitor.get("/apps/acme/main/portal/");
      expect(page.status).toBe(200);
      expect(
        (await visitor.get("/apps/acme/main/portal/assets/app-3f9a1c7e.js")).bytes.equals(
          files.script?.content as Buffer,
        ),
      ).toBe(true);
      expect(
        (
          await visitor.get(`/api/v1/tenants/${tenant}/workspaces/${prod}/rows/orders`)
        ).body.items.map((row: Any) => row.number),
      ).toEqual(["A-1"]);
      expect((await visitor.get(`/api/v1/tenants/${tenant}/theme.css`)).body).toContain(
        "--vx-action: #123456;",
      );
      expect((await visitor.get(`/api/v1/tenants/${tenant}/portal/logo`)).status).toBe(200);
      // Sign-ins and hostnames belong to the instance the tenant left.
      expect(
        await b.db.selectFrom("app_session").select("id").where("host", "!=", MAIN).execute(),
      ).toEqual([]);
      expect(await b.db.selectFrom("app_domain").select("id").execute()).toEqual([]);
    } finally {
      await b.stop();
    }
  });
});

describe("guards", () => {
  test("the logo can be removed again", async () => {
    expect((await alice.delete(`/tenants/${tenant}/portal/logo`)).status).toBe(204);
    expect((await browser(t, MAIN).get(`/api/v1/tenants/${tenant}/portal/logo`)).status).toBe(404);
  });

  test("someone not signed in is limited in how fast they may ask", async () => {
    const visitor = browser(t, "localhost:8080");
    const statuses = new Set<number>();
    for (let n = 0; n < 125; n++) {
      statuses.add((await visitor.get(`/api/v1/tenants/${tenant}/session`)).status);
    }
    expect([...statuses].sort()).toEqual([200, 429]);
    // Someone signed in is not counted with them.
    const staff = await alice.get(`/tenants/${tenant}/session`);
    expect(staff.status).toBe(200);
  });

  test("every change left an audit entry, and every new route was exercised", () => {
    expect(
      t.unaudited.filter((route) => !/\/rows?\//.test(route)),
      JSON.stringify(t.unaudited),
    ).toEqual([]);
    const apps = /\/(end-users|end-user-groups|end-user-auth|bundle-assets|portal|domains)(\/|$)/;
    // Signing in, signing up and using a link are public routes, which record what they do
    // themselves. The logo is sent as an image, which this client cannot do: its entry is read here.
    const own = /end-user-auth\/(sign-in|sign-up|password-links|passwords)$|portal\/logo$/;
    expect(
      t.unexercised(
        (route) =>
          apps.test(route) &&
          // A provider's email domains are exercised in sso.test.ts.
          !route.includes("/identity-providers/") &&
          !(own.test(route) && !route.startsWith("DELETE")),
      ),
    ).toEqual([]);
  });

  test("what the public routes did is in the audit log", async () => {
    const actions = (
      await t.db
        .selectFrom("audit_entry")
        .select("action")
        .distinct()
        .where("tenant_id", "=", tenant)
        .execute()
    ).map((row) => row.action);
    for (const action of [
      "end_user.signed_in",
      "end_user.signed_up",
      "end_user.invitation_accepted",
      "end_user.reset_requested",
      "end_user.password_reset",
      "portal.logo_set",
      "app_session.handed_off",
      "app_session.started",
    ]) {
      expect(actions, action).toContain(action);
    }
  });
});
