import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * One endpoint reads every widget's data, on the server, from the stored page, as whoever
 * asks (S9, Reading data): the rows each table's policy gives them, the draft only for those
 * who may edit it, and a bad filter or an unknown widget refused.
 */

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";

let t: TestApp;
let tenant: string;
let dev: string;
let alice: Client;
let roles: Record<string, string>;
let runtime: string;

const ws = () => `/tenants/${tenant}/workspaces/${dev}`;
const VERSIONS: Record<string, number> = { interface: 2, dashboard: 3 };
const manifest = (kind: string, path: string, body: object): BundleManifest =>
  ({
    kind,
    path,
    schemaVersion: VERSIONS[kind] ?? 1,
    ownership: "code",
    body,
  }) as BundleManifest;

const at = { x: 0, y: 0, w: 12, h: 6 };
const list = {
  id: "list",
  type: "core/table",
  at,
  data: {
    rows: {
      source: {
        visual: { table: "invoices", columns: ["number", "team"], sort: [{ by: "number" }] },
      },
    },
  },
};
const byTeam = {
  id: "by_team",
  type: "core/chart",
  at: { x: 0, y: 6, w: 6, h: 5 },
  data: {
    rows: {
      source: {
        visual: {
          table: "invoices",
          groupBy: [{ column: "team" }],
          measures: [{ fn: "sum", column: "total", as: "total" }],
        },
      },
    },
  },
  config: { mark: "bar" },
};
const filters = [
  { name: "team", type: "choice", from: { table: "invoices", column: "team" } },
  { name: "status", type: "choice", from: { table: "invoices", column: "status" } },
  { name: "fixed", type: "choice", choices: ["a", "b"] },
];
const screen = {
  title: "Invoices",
  pages: [{ id: "main", title: "Invoices", filters, widgets: [list, byTeam] }],
};
/** A dashboard of SQL, and one that narrows rows by when they were made. */
const board = {
  title: "By team",
  filters: [{ name: "when", type: "date_range" }],
  widgets: [
    {
      id: "sql",
      type: "core/table",
      at,
      data: {
        rows: {
          source: {
            sql: "select team, sum(total) as total from invoices group by team order by team",
          },
        },
      },
    },
    {
      ...list,
      id: "recent",
      data: {
        rows: {
          source: { visual: { table: "invoices", columns: ["number"], sort: [{ by: "number" }] } },
          filters: [{ filter: "when", column: "created_at" }],
        },
      },
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
        columns: {
          number: { type: "text", required: true },
          team: { type: "text" },
          total: { type: "number" },
          status: { type: "enum", values: ["open", "paid"] },
        },
        policy: {
          type: "rules",
          rules: [{ allow: "read", when: { column: "team", in: "groups" } }],
        },
      }),
      manifest("interface", "screens/invoices", screen),
      manifest("dashboard", "boards/by-team", board),
      manifest("app", "billing", { title: "Invoices", interface: "screens/invoices" }),
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

/** Makes an end user who has chosen a password, in a group of end users, and signs them in. */
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

/** The data of a widget, as someone signed in with a browser (an end user) reads it. */
const asked = (
  who: { get: (url: string) => Promise<{ status: number; body: Any }> },
  query: Record<string, string | object>,
  prefix = "",
) => {
  const params = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
  return who.get(`${prefix}${ws()}/widget-data?${params}`);
};
const onPage = (widget: string, more: Record<string, string | object> = {}) => ({
  of: "interface",
  path: "screens/invoices",
  page: "main",
  widget,
  ...more,
});

let ivy: Awaited<ReturnType<typeof endUser>>;
let jon: Awaited<ReturnType<typeof endUser>>;

beforeAll(async () => {
  runtime = mkdtempSync(join(tmpdir(), "vx-screens-"));
  mkdirSync(join(runtime, "assets"));
  writeFileSync(join(runtime, "index.html"), "<!doctype html><html><body></body></html>");
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
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  const uploaded = await alice.post(`${ws()}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
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
}, 60_000);

afterAll(async () => {
  await t?.stop();
  rmSync(runtime, { recursive: true, force: true });
});

describe("rows and totals of a widget, as whoever asks", () => {
  test("two groups of end users open one widget and are given different rows", async () => {
    const rows = async (who: typeof ivy) => {
      const read = await asked(who.browser, onPage("list"), "/api/v1");
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      return read.body.inputs.rows;
    };
    const finance = await rows(ivy);
    expect(finance.shape).toBe("rows");
    expect(finance.rows.map((row: Any) => row.number)).toEqual(["INV-1", "INV-2"]);
    expect(finance.columns.map((column: Any) => [column.name, column.label])).toEqual([
      ["id", "Id"],
      ["number", "Number"],
      ["team", "Team"],
    ]);
    expect((await rows(jon)).rows.map((row: Any) => row.number)).toEqual(["INV-3"]);
    // Totals are of the rows each is given, too.
    const total = async (who: typeof ivy) =>
      (await asked(who.browser, onPage("by_team"), "/api/v1")).body.inputs.rows;
    const summary = await total(ivy);
    expect(summary.shape).toBe("summary");
    expect(summary.breakdowns).toEqual(["team"]);
    expect(summary.values).toEqual(["total"]);
    expect(summary.rows).toEqual([{ team: "finance", total: 30 }]);
    expect((await total(jon)).rows).toEqual([{ team: "sales", total: 5 }]);
    // Staff who may read every row are given every row.
    const staff = await asked(alice, onPage("by_team"));
    expect(staff.body.inputs.rows.rows).toEqual([
      { team: "finance", total: 30 },
      { team: "sales", total: 5 },
    ]);
  });

  test("an end user can read the page's widgets only if they may open an app that serves it", async () => {
    const guest = await asked(browser(), onPage("list"), "/api/v1");
    expect(guest.status).toBe(404);
    expect(
      (await asked(ivy.browser, onPage("list", { path: "screens/never" }), "/api/v1")).status,
    ).toBe(404);
  });

  test("a widget that is not on the page, and a page that is not there, are 404", async () => {
    expect((await asked(alice, onPage("nope"))).status).toBe(404);
    expect((await asked(alice, onPage("list", { page: "other" }))).status).toBe(404);
    expect((await asked(alice, onPage("list", { input: "other" }))).status).toBe(404);
    expect(
      (await asked(alice, { of: "dashboard", path: "boards/by-team", widget: "nope" })).status,
    ).toBe(404);
    expect(
      (await asked(alice, { of: "dashboard", path: "boards/never", widget: "sql" })).status,
    ).toBe(404);
    // An interface's widget is on a page: say which.
    expect(
      (await asked(alice, { of: "interface", path: "screens/invoices", widget: "list" })).status,
    ).toBe(400);
  });

  test("a bad filter value is a 400", async () => {
    const ask = (filters: unknown) =>
      asked(alice, {
        of: "dashboard",
        path: "boards/by-team",
        widget: "recent",
        filters: filters as object,
      });
    expect((await ask({ when: "sometime" })).status).toBe(400);
    expect((await ask({ when: { from: "2026-02-30", to: "2026-03-01" } })).status).toBe(400);
    expect((await ask({ when: { from: "2026-03-02", to: "2026-03-01" } })).status).toBe(400);
    expect((await ask({ unknown: 1 })).status).toBe(400);
    expect((await ask([1])).status).toBe(400);
    const notJson = await alice.get(
      `${ws()}/widget-data?of=dashboard&path=boards/by-team&widget=recent&filters=%7Bnope`,
    );
    expect(notJson.status).toBe(400);
    // The kernel's usual error body says what is wrong, and where.
    const refused = await ask({ when: "sometime" });
    expect(refused.body.errors[0].path).toBe("/filters/when");
  });
});

describe("a date range", () => {
  test("includes its last day, and a name stands for days counted back from today", async () => {
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const read = async (when: unknown) => {
      const answer = await asked(alice, {
        of: "dashboard",
        path: "boards/by-team",
        widget: "recent",
        filters: { when } as object,
      });
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      return answer.body.inputs.rows.rows.map((row: Any) => row.number);
    };
    // Everything was made a moment ago: a range that ends today has it, a range that ended yesterday does not.
    expect(await read({ from: day(-3), to: day(0) })).toEqual(["INV-1", "INV-2", "INV-3"]);
    expect(await read({ from: day(0), to: day(0) })).toEqual(["INV-1", "INV-2", "INV-3"]);
    expect(await read({ from: day(-3), to: day(-1) })).toEqual([]);
    expect(await read({ to: day(0) })).toEqual(["INV-1", "INV-2", "INV-3"]);
    expect(await read("today")).toEqual(["INV-1", "INV-2", "INV-3"]);
    expect(await read("last_month")).toEqual([]);
    // Not set, it narrows nothing.
    expect(await read(null)).toEqual(["INV-1", "INV-2", "INV-3"]);
  });
});

describe("a dashboard's widget over SQL", () => {
  test("is read under each table's row policy, for whoever asks", async () => {
    // Members who hold the permission to read dashboards and rows, in a group a rule names.
    const role = await alice.post(`/tenants/${tenant}/roles`, {
      name: "board_reader",
      permissions: ["dashboard:read", "data:read"],
    });
    expect(role.status, JSON.stringify(role.body)).toBe(201);
    const bob = await alice.post(`/tenants/${tenant}/members`, {
      email: "bob@acme.example",
      name: "Bob",
      password: PASSWORD,
    });
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: bob.body.id,
      roleId: role.body.id,
      workspaceId: dev,
    });
    const group = await alice.post(`/tenants/${tenant}/groups`, { name: "finance" });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    await alice.put(`/tenants/${tenant}/groups/${group.body.id}/members/${bob.body.id}`);
    const bobs = await t.signIn("bob@acme.example", PASSWORD);

    const sql = { of: "dashboard", path: "boards/by-team", widget: "sql" };
    const mine = await asked(bobs, sql);
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    // Bob is in finance: the SQL sees the finance rows, and not the sales one.
    expect(mine.body.inputs.rows.rows).toEqual([{ team: "finance", total: 30 }]);
    expect(mine.body.inputs.rows.shape).toBe("rows");
    expect(mine.body.inputs.rows.columns.map((column: Any) => column.name)).toEqual([
      "team",
      "total",
    ]);
    // Alice reads every row.
    expect((await asked(alice, sql)).body.inputs.rows.rows).toEqual([
      { team: "finance", total: 30 },
      { team: "sales", total: 5 },
    ]);
    // Someone who may not read the table is told which permission is missing.
    const plain = await alice.post(`/tenants/${tenant}/members`, {
      email: "pat@acme.example",
      name: "Pat",
      password: PASSWORD,
    });
    const viewer = await alice.post(`/tenants/${tenant}/roles`, {
      name: "board_only",
      permissions: ["dashboard:read"],
    });
    await alice.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: plain.body.id,
      roleId: viewer.body.id,
      workspaceId: dev,
    });
    const pats = await t.signIn("pat@acme.example", PASSWORD);
    const refused = await asked(pats, sql);
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("data:read");
  });
});

describe("a draft", () => {
  const draft = (extra: object) => ({
    ...screen,
    pages: [{ ...screen.pages[0], widgets: [list, byTeam, extra] }],
  });
  const added = {
    id: "extra",
    type: "core/table",
    at: { x: 0, y: 11, w: 12, h: 5 },
    data: { rows: { source: { visual: { table: "invoices", columns: ["number"] } } } },
  };

  test("is read by an editor, and by nobody who may only use the app", async () => {
    const saved = await alice.put(`${ws()}/drafts/screens/invoices`, {
      kind: "interface",
      schemaVersion: 2,
      body: draft(added),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const asEditor = await asked(alice, onPage("extra", { draft: "1" }));
    expect(asEditor.status, JSON.stringify(asEditor.body)).toBe(200);
    expect(asEditor.body.inputs.rows.rows.map((row: Any) => row.number).sort()).toEqual([
      "INV-1",
      "INV-2",
      "INV-3",
    ]);
    // What is deployed has no such widget.
    expect((await asked(alice, onPage("extra"))).status).toBe(404);
    // An end user is refused the draft, though they may open the app, and the deployed page is theirs.
    const refused = await asked(ivy.browser, onPage("extra", { draft: "1" }), "/api/v1");
    expect(refused.status).toBe(403);
    expect((await asked(ivy.browser, onPage("list", { draft: "1" }), "/api/v1")).status).toBe(403);
    expect((await asked(ivy.browser, onPage("list"), "/api/v1")).status).toBe(200);
    // The interface read says the same.
    expect(
      (await ivy.browser.get(`/api/v1${ws()}/interfaces/screens/invoices?draft=1`)).status,
    ).toBe(403);
    const body = (await alice.get(`${ws()}/interfaces/screens/invoices?draft=1`)).body;
    expect(body.body.pages[0].widgets.map((widget: Any) => widget.id)).toEqual([
      "list",
      "by_team",
      "extra",
    ]);
    expect(
      (await alice.get(`${ws()}/interfaces/screens/invoices`)).body.body.pages[0].widgets,
    ).toHaveLength(2);
    // A dashboard's draft is read the same way.
    expect(
      (await asked(alice, { of: "dashboard", path: "boards/by-team", widget: "sql", draft: "1" }))
        .status,
    ).toBe(200);
    expect(
      (
        await asked(
          ivy.browser,
          { of: "dashboard", path: "boards/by-team", widget: "sql", draft: "1" },
          "/api/v1",
        )
      ).status,
    ).toBe(403);
  });
});

describe("the values a choice filter offers", () => {
  const options = (
    who: { get: (url: string) => Promise<{ status: number; body: Any }> },
    filter: string,
    prefix = "",
    more = "",
  ) =>
    who.get(
      `${prefix}${ws()}/filter-options?of=interface&path=screens/invoices&page=main&filter=${filter}${more}`,
    );

  test("are the column's distinct values, as the caller may read the table, sorted", async () => {
    expect((await options(alice, "team")).body.values).toEqual(["finance", "sales"]);
    // Two groups of end users are offered only what their rows hold.
    expect((await options(ivy.browser, "team", "/api/v1")).body.values).toEqual(["finance"]);
    expect((await options(jon.browser, "team", "/api/v1")).body.values).toEqual(["sales"]);
  });

  test("are an enum's own values, and a filter's own choices are not read from a table", async () => {
    expect((await options(alice, "status")).body.values).toEqual(["open", "paid"]);
    expect((await options(alice, "fixed")).status).toBe(400);
  });

  test("are not there for a filter the page lacks, or for someone who may not open the page", async () => {
    expect((await options(alice, "nope")).status).toBe(404);
    expect((await options(browser(), "team", "/api/v1")).status).toBe(404);
    // A draft is only for those who may edit it.
    expect((await options(ivy.browser, "team", "/api/v1", "&draft=1")).status).toBe(403);
    expect((await options(alice, "team", "", "&draft=1")).status).toBe(200);
  });
});

describe("a rows input is read a page at a time", () => {
  test("by a cursor that ends when the rows do", async () => {
    const more = Array.from({ length: 120 }, (_, index) => ({
      number: `B-${String(index).padStart(3, "0")}`,
      team: "bulk",
      total: 1,
    }));
    expect((await alice.post(`${ws()}/rows/invoices`, { rows: more })).status).toBe(201);
    const first = (await asked(alice, onPage("list"))).body.inputs.rows;
    expect(first.rows).toHaveLength(100);
    expect(typeof first.next).toBe("string");
    const second = (await asked(alice, onPage("list", { input: "rows", cursor: first.next }))).body
      .inputs.rows;
    expect(second.rows).toHaveLength(23);
    expect(second.next).toBeUndefined();
    const all = [...first.rows, ...second.rows].map((row: Any) => row.id);
    expect(new Set(all).size).toBe(123);
    // A cursor that was not given is refused, and so is a cursor with no input.
    expect((await asked(alice, onPage("list", { input: "rows", cursor: "!!" }))).status).toBe(400);
    expect((await asked(alice, onPage("list", { cursor: first.next }))).status).toBe(400);
  });
});
