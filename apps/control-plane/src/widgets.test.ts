import { createHash } from "node:crypto";
import { sql } from "@volvel/db";
import { type Bundle, type BundleManifest, bundleDigest, WIDGET_POLICY } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sweepAppFiles } from "./kernel/apps/assets.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const APPS = "apps.localhost:8080";
const MAIN = "localhost:8080";

let t: TestApp;
let tenant: string;
let prod: string;
let alice: Client;

const sha = (content: Buffer) => createHash("sha256").update(content).digest("hex");
const ws = () => `/tenants/${tenant}/workspaces/${prod}`;

const definition = (version: string) => ({
  type: "x/goal",
  version,
  title: "Goal",
  description: "Progress toward a target",
  category: "understand",
  icon: "target",
  surfaces: ["app", "dashboard"],
  data: {},
  config: { type: "object", properties: {} },
  events: {},
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  entry: "widgets/goal/view.tsx",
});

/** The two files a build makes of a widget: its script, named by what is in it, and its frame page. */
function filesOf(script: string) {
  const code = Buffer.from(script);
  const name = `view-${sha(code).slice(0, 8)}.js`;
  const page = Buffer.from(
    `<!doctype html><body><div id="root"></div><script src="./${name}"></script></body>`,
  );
  return [
    { path: name, type: "text/javascript; charset=utf-8", content: code },
    { path: "frame.html", type: "text/html; charset=utf-8", content: page },
  ];
}

const page = (widgets: Record<string, unknown>[]) => ({
  title: "Targets",
  pages: [{ id: "main", title: "Sales", widgets }],
});
const placed = (version?: string) => ({
  id: "goal",
  type: "x/goal",
  ...(version ? { version } : {}),
  at: { x: 0, y: 0, w: 3, h: 3 },
});

/** A bundle with the widget at `version` (not at all with `version` null), and an interface placing some version of it. */
function bundle(options: {
  version: string | null;
  script?: string;
  places?: string | null;
  /** The interface places the widget twice on its page. */
  twice?: boolean;
  /** What the bundle claims the files are, by path: a hostile one claims what it likes. */
  claims?: (path: string) => string;
}) {
  const manifests: BundleManifest[] = [];
  const files = options.version === null ? [] : filesOf(options.script ?? 'console.log("goal");');
  if (options.version !== null) {
    manifests.push({
      kind: "widget",
      schemaVersion: 1,
      path: "x/goal",
      ownership: "code",
      body: definition(options.version),
    });
  }
  if (options.places !== undefined) {
    manifests.push({
      kind: "interface",
      schemaVersion: 2,
      path: "targets",
      ownership: "code",
      body: page([
        placed(options.places ?? undefined),
        ...(options.twice ? [{ ...placed(options.places ?? undefined), id: "goal-again" }] : []),
      ]),
    });
  }
  const unsigned = {
    formatVersion: 4 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export {};",
    assets: files.map((file) => ({
      app: "x/goal",
      path: file.path,
      sha256: sha(file.content),
      size: file.content.length,
      contentType: options.claims ? options.claims(file.path) : file.type,
    })),
  };
  return { bundle: { ...unsigned, digest: bundleDigest(unsigned) } as Bundle, files };
}

async function deploy(options: Parameters<typeof bundle>[0], workspace = prod) {
  const at = `/tenants/${tenant}/workspaces/${workspace}`;
  const made = bundle(options);
  for (const file of made.files) {
    await alice.put(`${at}/bundle-assets/${sha(file.content)}`, file.content);
  }
  const uploaded = await alice.post(`${at}/bundles`, made.bundle);
  if (uploaded.status !== 201 && uploaded.status !== 200) return uploaded;
  return alice.post(`${at}/deployments`, { bundleId: uploaded.body.id });
}

const widgets = async () => (await alice.get(`${ws()}/widgets`)).body.items as Any[];

const get = (host: string, url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: "GET", url, headers: { host, ...headers } });

async function start(config: Parameters<typeof startTestApp>[0] = {}) {
  t = await startTestApp(config);
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
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
}

beforeAll(() => start({ config: { appsUrl: `http://${APPS}` } }));

afterAll(async () => {
  await t?.stop();
});

describe("deploying a widget of your own", () => {
  test("stores it by type and version, and lists every version deployed", async () => {
    const first = await deploy({ version: "1.0.0" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(await widgets()).toMatchObject([
      {
        type: "x/goal",
        current: "1.0.0",
        versions: [{ version: "1.0.0", current: true, files: 2, placements: 0 }],
      },
    ]);
  });

  test("deploying the same version with the same files again changes nothing", async () => {
    expect((await deploy({ version: "1.0.0" })).status).toBe(201);
    expect((await widgets())[0].versions).toHaveLength(1);
  });

  test("a version's files never change: other files for the same version are refused, naming it", async () => {
    const refused = await deploy({ version: "1.0.0", script: 'console.log("changed");' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("widget_version_changed");
    expect(refused.body.detail).toContain("raise the widget's version");
    expect((await widgets())[0].versions).toHaveLength(1);
  });

  test("a new version is added beside the old, which stays", async () => {
    const second = await deploy({ version: "2.0.0", script: 'console.log("two");' });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(await widgets()).toMatchObject([
      {
        current: "2.0.0",
        versions: [
          { version: "1.0.0", current: false },
          { version: "2.0.0", current: true },
        ],
      },
    ]);
  });

  test("another workspace of the tenant may not deploy a version with other files either", async () => {
    const dev = (
      await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
    ).body.id;
    const made = bundle({ version: "1.0.0", script: 'console.log("dev");' });
    for (const file of made.files) {
      await alice.put(
        `/tenants/${tenant}/workspaces/${dev}/bundle-assets/${sha(file.content)}`,
        file.content,
      );
    }
    const uploaded = await alice.post(`/tenants/${tenant}/workspaces/${dev}/bundles`, made.bundle);
    const refused = await alice.post(`/tenants/${tenant}/workspaces/${dev}/deployments`, {
      bundleId: uploaded.body.id,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("widget_version_changed");
    expect(refused.body.detail).toContain("another workspace");
  });
});

describe("a page records the version it was placed with (EXT-20)", () => {
  test("a page that places a version that is not deployed is refused at deploy, naming it", async () => {
    const refused = await deploy({
      version: "2.0.0",
      script: 'console.log("two");',
      places: "9.9.9",
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("widget_version_missing");
    expect(JSON.stringify(refused.body.errors)).toContain("has no version 9.9.9 deployed here");
    expect(JSON.stringify(refused.body.errors)).toContain("deployed: 1.0.0, 2.0.0");
  });

  test("so is one that records no version", async () => {
    const refused = await deploy({ version: "2.0.0", script: 'console.log("two");', places: null });
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.body.errors)).toContain("says which version of x/goal");
  });

  test("a draft with a version that is not deployed is kept, with the problem said", async () => {
    const dev = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "dev2",
        name: "Dev 2",
        type: "dev",
      })
    ).body.id;
    expect((await deploy({ version: "2.0.0", script: 'console.log("two");' }, dev)).status).toBe(
      201,
    );
    const url = `/tenants/${tenant}/workspaces/${dev}/drafts/targets`;
    const saved = await alice.put(url, {
      kind: "interface",
      schemaVersion: 2,
      body: page([placed("9.9.9")]),
      create: true,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBeLessThan(300);
    expect(JSON.stringify(saved.body.problems)).toContain("has no version 9.9.9 deployed here");
    const fine = await alice.put(url, {
      kind: "interface",
      schemaVersion: 2,
      body: page([placed("2.0.0")]),
      revision: saved.body.revision,
    });
    expect(fine.status, JSON.stringify(fine.body)).toBeLessThan(300);
    expect(JSON.stringify(fine.body.problems ?? [])).not.toContain("version");
  });

  test("a page placed with the older version keeps it while the newer is current", async () => {
    const deployed = await deploy({
      version: "2.0.0",
      script: 'console.log("two");',
      places: "1.0.0",
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const [goal] = await widgets();
    expect(goal.versions.map((v: Any) => [v.version, v.placements])).toEqual([
      ["1.0.0", 1],
      ["2.0.0", 0],
    ]);
  });
});

describe("removing a widget or a version that pages use", () => {
  test("a version a page places is not removed, and the page is named", async () => {
    const refused = await alice.delete(`${ws()}/widgets/goal/versions/1.0.0`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("widget_in_use");
    expect(refused.body.errors).toEqual([
      {
        path: "/interfaces/targets",
        message: 'the page "Sales" of the interface targets places x/goal 1.0.0',
      },
    ]);
  });

  test("the version the repository defines now is not removed", async () => {
    const refused = await alice.delete(`${ws()}/widgets/goal/versions/2.0.0`);
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toContain("Deploy a newer version first");
  });

  test("a deploy that drops the widget is refused while a page places it, and keeps every version", async () => {
    const refused = await deploy({ version: null, places: "1.0.0" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("widget_in_use");
    expect(refused.body.errors[0].message).toContain('the page "Sales" of the interface targets');
    expect((await widgets())[0].versions).toHaveLength(2);
  });

  test("a page that places the version twice is named once", async () => {
    const twice = await deploy({
      version: "2.0.0",
      script: 'console.log("two");',
      places: "1.0.0",
      twice: true,
    });
    expect(twice.status, JSON.stringify(twice.body)).toBe(201);
    const refused = await alice.delete(`${ws()}/widgets/goal/versions/1.0.0`);
    expect(refused.status).toBe(409);
    expect(refused.body.errors).toEqual([
      {
        path: "/interfaces/targets",
        message: 'the page "Sales" of the interface targets places x/goal 1.0.0',
      },
    ]);
  });

  test("moved to the newer version, the older is removed, and nothing serves it any more", async () => {
    expect((await get(APPS, "/_widgets/acme/x/goal@1.0.0/frame.html")).statusCode).toBe(200);
    const moved = await deploy({
      version: "2.0.0",
      script: 'console.log("two");',
      places: "2.0.0",
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(201);
    const removed = await alice.delete(`${ws()}/widgets/goal/versions/1.0.0`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(204);
    expect((await widgets())[0].versions.map((v: Any) => v.version)).toEqual(["2.0.0"]);
    expect((await get(APPS, "/_widgets/acme/x/goal@1.0.0/frame.html")).statusCode).toBe(404);
    expect((await alice.delete(`${ws()}/widgets/goal/versions/1.0.0`)).status).toBe(404);
  });

  test("a widget no page places is removed by a deploy without it, with its versions", async () => {
    const free = await deploy({ version: "2.0.0", script: 'console.log("two");' });
    expect(free.status, JSON.stringify(free.body)).toBe(201);
    const gone = await deploy({ version: null });
    expect(gone.status, JSON.stringify(gone.body)).toBe(201);
    expect(await widgets()).toEqual([]);
    // The dev workspace deployed the same version with the same files: the address names the
    // tenant, the type and the version, so the files are served while any workspace holds them.
    expect((await get(APPS, "/_widgets/acme/x/goal@2.0.0/frame.html")).statusCode).toBe(200);
    await sql`delete from widget_version where type = 'x/goal' and version = '2.0.0'`.execute(t.db);
    expect((await get(APPS, "/_widgets/acme/x/goal@2.0.0/frame.html")).statusCode).toBe(404);
  });
});

describe("the files of a widget, served for its frame", () => {
  let script: Buffer;
  let framePage: Buffer;
  beforeAll(async () => {
    const made = bundle({ version: "3.0.0", script: 'console.log("three");' });
    script = made.files[0]?.content as Buffer;
    framePage = made.files[1]?.content as Buffer;
    const deployed = await deploy({ version: "3.0.0", script: 'console.log("three");' });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  });

  test("the frame page and the script come with the content policy and nothing that sets a cookie", async () => {
    const name = made(script);
    for (const [file, content, type] of [
      ["frame.html", framePage, "text/html"],
      [name, script, "text/javascript"],
    ] as const) {
      const response = await get(APPS, `/_widgets/acme/x/goal@3.0.0/${file}`);
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.equals(content)).toBe(true);
      expect(String(response.headers["content-type"])).toContain(type);
      expect(response.headers["content-security-policy"]).toBe(
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; sandbox allow-scripts",
      );
      expect(response.headers["content-security-policy"]).toBe(WIDGET_POLICY);
      expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
  });

  test("a cookie sent with the request is not read: the answer is the same, and none is set", async () => {
    const signedIn = await get(APPS, "/_widgets/acme/x/goal@3.0.0/frame.html", {
      cookie: `${Object.entries(alice.headers)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")}; vd_session=abc; session=abc`,
    });
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.rawPayload.equals(framePage)).toBe(true);
    expect(signedIn.headers["set-cookie"]).toBeUndefined();
  });

  test("only a file of that version is served, for that tenant, by a read", async () => {
    for (const url of [
      "/_widgets/acme/x/goal@3.0.0/other.js",
      "/_widgets/acme/x/goal@3.0.1/frame.html",
      "/_widgets/acme/x/other@3.0.0/frame.html",
      "/_widgets/globex/x/goal@3.0.0/frame.html",
      "/_widgets/acme/core/goal@3.0.0/frame.html",
      "/_widgets/acme/x/goal/frame.html",
      "/_widgets/acme/x/goal@3.0.0/../frame.html",
      "/_widgets/acme/x/goal@3.0.0/",
    ]) {
      expect((await get(APPS, url)).statusCode, url).toBe(404);
    }
    const post = await t.app.inject({
      method: "POST",
      url: "/_widgets/acme/x/goal@3.0.0/frame.html",
      headers: { host: APPS, origin: `http://${APPS}` },
    });
    expect(post.statusCode).toBe(405);
  });

  test("p34-b4r no address under /_widgets is answered without the policy, and none by a way around the files", async () => {
    const name = made(script);
    for (const url of [
      "/_widgets/acme/x/goal@3.0.0/%2e%2e/frame.html",
      "/_widgets/acme/x/goal@3.0.0/%2E%2E%2Fframe.html",
      "/_widgets/acme/x/goal@3.0.0/..%2Fgoal@3.0.0%2Fframe.html",
      "/_widgets/acme/x/goal@3.0.0/%252e%252e/frame.html",
      "/_widgets/acme/x/goal@3.0.0/frame.html%00",
      "/_widgets/acme/x/goal@3.0.0/frame.html/",
      "/_widgets/acme/x/goal@3.0.0//frame.html",
      "/_widgets/acme/x/goal%403.0.0/frame.html/x",
      "/_widgets/globex/x/goal@3.0.0/frame.html",
      "/_widgets/acme/x/goal@3.0.0/%FF",
      `/_widgets/acme/x/goal@3.0.0/${name}x`,
      "/_widgets/acme/x/goal@3.0.0/FRAME.HTML",
      "/_widgets/acme/x/goal@3.0.0/frame.html?x=1#y",
    ]) {
      const response = await get(APPS, url);
      const served = url.includes("?x=1");
      // A malformed escape is refused by the server before any route: text, never a page.
      if (url.endsWith("%FF")) {
        expect(response.statusCode, url).toBe(400);
        expect(String(response.headers["content-type"]), url).not.toContain("html");
        continue;
      }
      expect(response.statusCode, url).toBe(served ? 200 : 404);
      expect(response.headers["content-security-policy"], url).toBe(WIDGET_POLICY);
      expect(response.headers["set-cookie"], url).toBeUndefined();
      expect(response.headers["x-content-type-options"], url).toBe("nosniff");
    }
    // A refusal of the method, and the redirect from the console's address, carry it too.
    const post = await t.app.inject({
      method: "POST",
      url: "/_widgets/acme/x/goal@3.0.0/frame.html",
      headers: { host: APPS, origin: `http://${APPS}` },
    });
    expect(post.headers["content-security-policy"]).toBe(WIDGET_POLICY);
    const sent = await get(MAIN, "/_widgets/acme/x/goal@3.0.0/frame.html");
    expect(sent.headers["content-security-policy"]).toBe(WIDGET_POLICY);
  });

  test("p34-b4r what a file is served as is said by its name, whatever the bundle that listed it claims", async () => {
    const hostile = bundle({
      version: "4.0.0",
      script: 'console.log("four");',
      claims: (path) => (path === "frame.html" ? "image/svg+xml" : "text/html"),
    });
    const at = `/tenants/${tenant}/workspaces/${prod}`;
    for (const file of hostile.files)
      await alice.put(`${at}/bundle-assets/${sha(file.content)}`, file.content);
    const uploaded = await alice.post(`${at}/bundles`, hostile.bundle);
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    const deployed = await alice.post(`${at}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const frame = await get(APPS, "/_widgets/acme/x/goal@4.0.0/frame.html");
    expect(String(frame.headers["content-type"])).toMatch(/^text\/html/);
    const code = await get(
      APPS,
      `/_widgets/acme/x/goal@4.0.0/${made(Buffer.from('console.log("four");'))}`,
    );
    expect(String(code.headers["content-type"])).toMatch(/^text\/javascript/);
  });

  test("the instance's own address sends it to the apps address, as an app is", async () => {
    const sent = await get(MAIN, "/_widgets/acme/x/goal@3.0.0/frame.html");
    expect(sent.statusCode).toBe(307);
    expect(sent.headers.location).toBe(`http://${APPS}/_widgets/acme/x/goal@3.0.0/frame.html`);
  });

  test("the files of a version are kept by the sweep while a version names them", async () => {
    await sql`update bundle set created_at = now() - interval '30 days'`.execute(t.db);
    await sql`update bundle_asset set created_at = now() - interval '30 days'`.execute(t.db);
    await sweepAppFiles(t.kernel, tenant);
    const response = await get(APPS, "/_widgets/acme/x/goal@3.0.0/frame.html");
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(framePage)).toBe(true);
  });
});

describe("an instance with no address for apps", () => {
  beforeAll(async () => {
    await t.stop();
    await start({ config: { appsOnConsoleAddress: false } });
  });

  test("serves a widget's frame at the console's own, which runs it with no origin", async () => {
    expect((await deploy({ version: "1.0.0" })).status).toBe(201);
    const response = await get(MAIN, "/_widgets/acme/x/goal@1.0.0/frame.html");
    expect(response.statusCode).toBe(200);
    // Opened on its own, the page is still sandboxed: it never has this address's cookies.
    expect(response.headers["content-security-policy"]).toBe(WIDGET_POLICY);
    expect(String(response.headers["content-security-policy"])).toContain("sandbox allow-scripts");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});

/** The script's file name, as a build gives it. */
const made = (script: Buffer) => `view-${sha(script).slice(0, 8)}.js`;
