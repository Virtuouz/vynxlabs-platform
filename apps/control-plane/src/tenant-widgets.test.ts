import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * A widget of the tenant's own (`x/...`) is read and checked as a platform widget is: its
 * data inputs are compiled and read on the server, for whoever looks, under each table's
 * row policy; a page naming one that is not deployed, or a version that is not, is refused.
 */

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";

let t: TestApp;
let tenant: string;
let dev: string;
let alice: Client;
let runtime: string;

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
const VERSIONS: Record<string, number> = { interface: 2, dashboard: 3 };
const manifest = (kind: string, path: string, body: object): BundleManifest =>
  ({ kind, path, schemaVersion: VERSIONS[kind] ?? 1, ownership: "code", body }) as BundleManifest;

const gauge = (version: string, extra: Record<string, unknown> = {}) => ({
  type: "x/gauge",
  version,
  title: "Gauge",
  description: "Invoices on a needle",
  category: "understand",
  icon: "gauge",
  surfaces: ["app", "dashboard"],
  data: { rows: { shape: "rows", label: "What the needle reads" } },
  config: {
    type: "object",
    properties: {
      max: { type: "number", "x-volvel": { tab: "display", control: "number", label: "Most" } },
      ...extra,
    },
    additionalProperties: false,
  },
  events: {},
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  entry: "widgets/gauge/view.tsx",
});

const at = { x: 0, y: 0, w: 4, h: 4 };
const placed = (version: string | undefined, type = "x/gauge") => ({
  id: "needle",
  type,
  ...(version ? { version } : {}),
  at,
  config: { max: 100 },
  data: {
    rows: {
      source: {
        visual: { table: "invoices", columns: ["number", "team"], sort: [{ by: "number" }] },
      },
    },
  },
});

const sha = (content: Buffer) => createHash("sha256").update(content).digest("hex");
/** The two files a build makes of the widget, as its bundle lists them. */
const view = Buffer.from('console.log("gauge");');
const scriptName = `view-${sha(view).slice(0, 8)}.js`;
const FILES = [
  { path: scriptName, type: "text/javascript; charset=utf-8", content: view },
  {
    path: "frame.html",
    type: "text/html; charset=utf-8",
    content: Buffer.from(`<!doctype html><script src="./${scriptName}"></script>`),
  },
];

function bundle(
  page: object,
  widgets: BundleManifest[] = [manifest("widget", "x/gauge", gauge("1.0.0"))],
) {
  const unsigned = {
    formatVersion: 4 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("table", "invoices", {
        columns: { number: { type: "text", required: true }, team: { type: "text" } },
        policy: {
          type: "rules",
          rules: [{ allow: "read", when: { column: "team", in: "groups" } }],
        },
      }),
      ...widgets,
      manifest("interface", "screens/gauges", {
        title: "Gauges",
        pages: [{ id: "main", title: "Gauges", widgets: [page] }],
      }),
      manifest("app", "gauges", { title: "Gauges", interface: "screens/gauges" }),
      manifest("binding", "bindings/app", {
        role: "portal_user",
        principal: { type: "end_users" },
        resource: "gauges",
      }),
      manifest("binding", "bindings/rows", {
        role: "portal_user",
        principal: { type: "end_users" },
        resource: "invoices",
      }),
    ],
    code: "export {};",
    assets: widgets.some((one) => one.kind === "widget")
      ? FILES.map((file) => ({
          app: "x/gauge",
          path: file.path,
          sha256: sha(file.content),
          size: file.content.length,
          contentType: file.type,
        }))
      : [],
  };
  return { ...unsigned, digest: bundleDigest(unsigned) } as Bundle;
}

function browser() {
  const jar = new Map<string, string>();
  const call = async (method: "GET" | "POST", url: string, form?: Record<string, string>) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await t.app.inject({
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
    return { status: response.statusCode, body };
  };
  return {
    get: (url: string) => call("GET", url),
    form: (url: string, form: Record<string, string>) => call("POST", url, form),
  };
}

async function endUser(email: string, group: string) {
  const created = await alice.post(`/tenants/${tenant}/end-users`, { email, name: email });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const visitor = browser();
  const token = new URL(created.body.invitation.url).searchParams.get("token") as string;
  expect(
    (await visitor.form("/portal/acme/set-password", { token, password: PASSWORD })).status,
  ).toBe(303);
  const made = await alice.post(`/tenants/${tenant}/end-user-groups`, { name: group });
  await alice.put(
    `/tenants/${tenant}/end-user-groups/${made.body.id}/members/${created.body.endUser.id}`,
  );
  return { browser: visitor };
}

const read = (
  who: { get: (url: string) => Promise<{ status: number; body: Any }> },
  widget: string,
  prefix = "",
) =>
  who.get(
    `${prefix}${ws()}/widget-data?${new URLSearchParams({ of: "interface", path: "screens/gauges", page: "main", widget })}`,
  );

let ivy: Awaited<ReturnType<typeof endUser>>;
let jon: Awaited<ReturnType<typeof endUser>>;

const deploy = async (made: Bundle) => {
  for (const file of FILES) {
    await alice.put(`${ws()}/bundle-assets/${sha(file.content)}`, file.content);
  }
  const uploaded = await alice.post(`${ws()}/bundles`, made);
  if (uploaded.status !== 201) return uploaded;
  return alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
};

beforeAll(async () => {
  runtime = mkdtempSync(join(tmpdir(), "vx-screens-"));
  mkdirSync(join(runtime, "assets"));
  writeFileSync(join(runtime, "index.html"), "<!doctype html><html><body></body></html>");
  t = await startTestApp({ config: { screensDir: runtime } });
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
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  const deployed = await deploy(bundle(placed("1.0.0")));
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  const seeded = await alice.post(`${ws()}/rows/invoices`, {
    rows: [
      { number: "INV-1", team: "finance" },
      { number: "INV-2", team: "finance" },
      { number: "INV-3", team: "sales" },
    ],
  });
  expect(seeded.status, JSON.stringify(seeded.body)).toBe(201);
  ivy = await endUser("ivy@customer.example", "finance");
  jon = await endUser("jon@customer.example", "sales");
}, 60_000);

afterAll(async () => {
  await t?.stop();
  rmSync(runtime, { recursive: true, force: true });
});

describe("a tenant widget's data goes through the same route as a core widget's", () => {
  test("two groups of end users are given the rows their policy gives them", async () => {
    const rows = async (who: typeof ivy) => {
      const answer = await read(who.browser, "needle", "/api/v1");
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      return answer.body.inputs.rows.rows.map((row: Any) => row.number);
    };
    expect(await rows(ivy)).toEqual(["INV-1", "INV-2"]);
    expect(await rows(jon)).toEqual(["INV-3"]);
    const staff = await read(alice, "needle");
    expect(staff.body.inputs.rows.rows.map((row: Any) => row.number)).toEqual([
      "INV-1",
      "INV-2",
      "INV-3",
    ]);
  });

  test("a widget of the page that no input of the definition names is not read", async () => {
    const stray = {
      ...placed("1.0.0"),
      data: { rows: placed("1.0.0").data.rows, other: placed("1.0.0").data.rows },
    };
    const refused = await deploy(bundle(stray));
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain('Gauge takes no data called \\"other\\"');
  });
});

describe("the workspace's widgets", () => {
  test("are listed with their versions, newest as current", async () => {
    const listed = await alice.get(`${ws()}/widgets`);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({ type: "x/gauge", current: "1.0.0" });
    expect(listed.body.items[0].versions.map((one: Any) => one.version)).toEqual(["1.0.0"]);
    expect(listed.body.items[0].versions[0].definition.title).toBe("Gauge");
  });

  test("a page that names one the workspace has not deployed, or a version it has not, is refused", async () => {
    const none = await deploy(bundle(placed("1.0.0", "x/missing")));
    expect(none.status).toBe(409);
    const other = await deploy(bundle(placed("2.0.0")));
    expect(other.status).toBe(409);
    expect(JSON.stringify(other.body)).toContain("version 2.0.0");
  });

  test("a stored page whose widget is no longer deployed is not read, and says why", async () => {
    await t.db.deleteFrom("widget_version").where("workspace_id", "=", dev).execute();
    const answer = await read(alice, "needle");
    expect(answer.status).toBe(400);
    expect(answer.body.detail).toContain('There is no widget called "x/gauge"');
  });
});
