import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type Client, putSeen, startTestApp, type TestApp } from "./testing.js";

/**
 * A page's action runs on the server, as its own grant (decision 0004, phase 26): whoever may
 * open the app may run it, it changes only the fields it names, on rows the caller may read, and
 * its conditions are checked again.
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

const at = (n: number) => ({ x: (n % 4) * 3, y: Math.floor(n / 4), w: 3, h: 1 });
const button = (id: string, n: number, click: object) => ({
  id,
  type: "core/button",
  at: at(n),
  config: { label: id },
  on: { click },
});
const open = { field: "status", test: "is", value: "open" };

const payAction = {
  when: [open],
  steps: [
    {
      do: "update",
      record: "this",
      set: {
        status: { value: "paid" },
        paid_on: { today: true },
        paid_by: { user: "email" },
      },
    },
    { do: "message", text: "Marked paid" },
  ],
};

const recordWidgets = [
  button("pay", 0, payAction),
  // Needs the invoice to be paid already: the words say so when it is not.
  button("refund", 1, {
    when: [{ field: "status", test: "is", value: "paid" }],
    steps: [{ do: "update", record: "this", set: { status: { value: "open" } } }],
  }),
  button("note", 2, {
    confirm: {
      title: "Add a note",
      ask: [
        { name: "note", label: "Note", type: "text", required: true },
        { name: "amount", label: "Amount", type: "number" },
        { name: "kind", label: "Kind", type: "choice", choices: ["a", "b"] },
      ],
    },
    steps: [
      {
        do: "update",
        record: "this",
        set: { note: { asked: "note" }, total: { asked: "amount" } },
      },
    ],
    done: "Noted",
  }),
  // The second step fails (a number is required), so the first must be undone.
  button("chain", 3, {
    steps: [
      { do: "update", record: "this", set: { status: { value: "paid" } } },
      { do: "create", table: "invoices", set: { team: { value: "finance" } } },
    ],
  }),
  button("kick", 4, {
    confirm: { title: "Start", ask: [{ name: "why", label: "Why", type: "text" }] },
    steps: [
      {
        do: "flow",
        path: "flows/ping",
        input: { number: { record: "number" }, why: { asked: "why" } },
      },
    ],
  }),
  button("again", 5, {
    steps: [
      { do: "open", page: "inv", record: "this" },
      { do: "message", text: "Back" },
    ],
  }),
  button("remove", 6, { steps: [{ do: "delete", record: "this" }] }),
  // Who can run it (phase 28): by the key of an end-user or member group.
  button("gated", 8, {
    runBy: { groups: ["finance", "managers"] },
    steps: [{ do: "update", record: "this", set: { note: { value: "gated" } } }],
  }),
  button("gone", 9, {
    runBy: { groups: ["vanished"] },
    steps: [{ do: "update", record: "this", set: { note: { value: "gone" } } }],
  }),
  button("other", 10, {
    runBy: { groups: ["sales", "managers", "admins"] },
    steps: [{ do: "update", record: "this", set: { note: { value: "other" } } }],
  }),
  button("attach", 11, {
    confirm: { title: "Attach", ask: [{ name: "file", label: "File", type: "text" }] },
    steps: [{ do: "update", record: "this", set: { doc: { asked: "file" } } }],
  }),
  button("stamp", 7, {
    steps: [{ do: "update", record: "this", set: { paid_on: { now: true } } }],
  }),
];

const screen = {
  title: "Invoices",
  pages: [
    {
      id: "main",
      title: "Invoices",
      widgets: [
        {
          id: "list",
          type: "core/table",
          at: { x: 0, y: 0, w: 12, h: 6 },
          data: {
            rows: { source: { visual: { table: "invoices", columns: ["number", "status"] } } },
          },
          config: {
            rowActions: [
              {
                id: "pay",
                label: "Mark paid",
                action: {
                  when: [{ ...open, of: "event" }],
                  steps: [
                    {
                      do: "update",
                      record: "event",
                      set: { status: { value: "paid" } },
                    },
                  ],
                },
              },
              { id: "peek", label: "Peek", action: { steps: [{ do: "rows" }] } },
            ],
          },
        },
      ],
    },
    {
      id: "inv",
      title: "Invoice",
      kind: "record",
      record: { table: "invoices" },
      widgets: recordWidgets,
    },
    {
      id: "edit",
      title: "Edit invoice",
      kind: "modal",
      record: { table: "invoices" },
      widgets: [
        {
          id: "editform",
          type: "core/form",
          at: { x: 0, y: 0, w: 6, h: 8 },
          data: { record: { source: { record: "this" } } },
          config: {
            mode: "edit",
            fields: [{ column: "number" }, { column: "total" }],
            submit: {
              steps: [
                {
                  do: "update",
                  record: "this",
                  set: { number: { asked: "number" }, total: { asked: "total" } },
                },
                { do: "close" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "add",
      title: "New invoice",
      kind: "modal",
      widgets: [
        {
          id: "newform",
          type: "core/form",
          at: { x: 0, y: 0, w: 6, h: 8 },
          data: { record: { source: { visual: { table: "invoices" } } } },
          config: {
            mode: "create",
            fields: [{ column: "number" }, { column: "team" }, { column: "total" }],
            submit: {
              // The checks of phase 26's foundation want each `asked` in a confirmation's list,
              // so the form lists its fields there too; the server holds a form to its columns as well.
              confirm: {
                title: "New invoice",
                ask: [
                  { name: "number", label: "Number", type: "text", required: true },
                  { name: "team", label: "Team", type: "text" },
                  { name: "total", label: "Total", type: "number" },
                ],
              },
              steps: [
                {
                  do: "create",
                  table: "invoices",
                  set: {
                    number: { asked: "number" },
                    team: { asked: "team" },
                    total: { asked: "total" },
                  },
                },
                { do: "close" },
              ],
            },
          },
        },
      ],
    },
  ],
};

const board = {
  title: "By team",
  widgets: [
    {
      id: "click",
      type: "core/table",
      at: { x: 0, y: 0, w: 12, h: 6 },
      data: { rows: { source: { visual: { table: "invoices", columns: ["number"] } } } },
      on: { rowClick: { steps: [{ do: "message", text: "Clicked" }] } },
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
          paid_on: { type: "timestamp" },
          paid_by: { type: "text" },
          note: { type: "text" },
          doc: { type: "file" },
        },
        // The end users only read, and only their own group's rows.
        policy: {
          type: "rules",
          rules: [{ allow: "read", when: { column: "team", in: "groups" } }],
        },
      }),
      manifest("flow", "flows/ping", {
        nodes: { start: { type: "trigger", trigger: { type: "manual" } } },
        edges: [],
      }),
      // A flow and a script that refuse an input without `why`, to start from an action.
      manifest("flow", "flows/strict", {
        nodes: {
          start: {
            type: "trigger",
            trigger: {
              type: "manual",
              input: {
                type: "object",
                required: ["why"],
                properties: { why: { type: "string" } },
              },
            },
          },
        },
        edges: [],
      }),
      manifest("script", "strict-script", {
        entry: "strict",
        input: { type: "object", required: ["why"], properties: { why: { type: "string" } } },
        output: { type: "object" },
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: [], secrets: [], variables: [] },
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
  const call = async (
    method: "GET" | "POST",
    url: string,
    send?: { form?: Record<string, string>; json?: object },
  ) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await t.app.inject({
      method,
      url,
      headers: {
        host: MAIN,
        ...(cookie ? { cookie } : {}),
        ...(send?.form
          ? { origin: `http://${MAIN}`, "content-type": "application/x-www-form-urlencoded" }
          : {}),
        ...(send?.json ? { origin: `http://${MAIN}`, "content-type": "application/json" } : {}),
      },
      ...(send?.form ? { payload: new URLSearchParams(send.form).toString() } : {}),
      ...(send?.json ? { payload: JSON.stringify(send.json) } : {}),
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
    form: (url: string, form: Record<string, string>) => call("POST", url, { form }),
    post: (url: string, json: object) => call("POST", url, { json }),
  };
}

type Who = { post: (url: string, body: object) => Promise<{ status: number; body: Any }> };

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
  return visitor;
}

const prefix = (who: Who) => (who === alice ? "" : "/api/v1");
/** Runs an action, as whoever asks. */
const act = (who: Who, body: object, base: object = {}) =>
  who.post(`${prefix(who)}${ws()}/page-actions`, {
    of: "interface",
    path: "screens/invoices",
    page: "inv",
    ...base,
    ...body,
  });
const press = (who: Who, widget: string, id: string, more: object = {}) =>
  act(who, { widget, at: "on/click", records: { this: id }, ...more });

/** A new invoice, made by staff. */
async function invoice(fields: Record<string, unknown> = {}): Promise<string> {
  const made = await alice.post(`${ws()}/rows/invoices`, {
    number: `INV-${Math.random().toString(36).slice(2, 8)}`,
    team: "finance",
    total: 10,
    status: "open",
    ...fields,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.items[0].id;
}
const rowOf = async (id: string): Promise<Any> =>
  (await alice.get(`${ws()}/row/${id}/invoices`)).body;

let ivy: ReturnType<typeof browser>;
let jon: ReturnType<typeof browser>;

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
  ivy = await endUser("ivy@customer.example", "finance");
  jon = await endUser("jon@customer.example", "sales");
}, 60_000);

afterAll(async () => {
  await t?.stop();
  rmSync(runtime, { recursive: true, force: true });
});

describe("a button's action, run for someone who may only open the app", () => {
  test("marks an invoice paid with no data:write, naming only the fields it sets", async () => {
    const id = await invoice();
    // The end user cannot change the row by the rows API: the action is the grant.
    const direct = await ivy.post(`/api/v1${ws()}/row/${id}/invoices`, { status: "paid" });
    expect([403, 404, 405]).toContain(direct.status);
    expect((await rowOf(id)).status).toBe("open");

    const done = await press(ivy, "pay", id);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.client).toEqual([{ do: "message", text: "Marked paid" }]);
    const row = await rowOf(id);
    expect(row.status).toBe("paid");
    expect(row.paid_by).toBe("ivy@customer.example");
    expect(String(row.paid_on).slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    // Nothing else changed.
    expect(row.total).toBe(10);
    expect(row.team).toBe("finance");
    expect(row.note ?? null).toBeNull();

    // Each change is audited, with the app, page, widget and action named.
    const audit = await alice.get(`/tenants/${tenant}/audit?action=page_action.update`);
    expect(audit.body.items[0]).toMatchObject({
      targetId: id,
      actorType: "end_user",
      details: {
        table: "invoices",
        fields: expect.arrayContaining(["status", "paid_on", "paid_by"]),
        app: "billing",
        page: "inv",
        widget: "pay",
        action: "on/click",
      },
    });
  });

  test("a row action works on the row the event gave", async () => {
    const id = await invoice();
    const done = await act(ivy, {
      page: "main",
      widget: "list",
      at: "config/rowActions/0/action",
      records: { event: id },
    });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await rowOf(id)).status).toBe("paid");
  });

  test("it cannot set a field it does not name: an input it does not ask for is refused", async () => {
    const id = await invoice();
    const refused = await press(ivy, "pay", id, { inputs: { status: "void", total: 99 } });
    expect(refused.status).toBe(400);
    expect(refused.body.errors.map((one: Any) => one.path).sort()).toEqual([
      "/inputs/status",
      "/inputs/total",
    ]);
    expect(await rowOf(id)).toMatchObject({ status: "open", total: 10 });
    // Nor is a question's answer put anywhere but where the action puts it.
    const noted = await press(ivy, "note", id, {
      inputs: { note: "Hi", team: "sales" },
    });
    expect(noted.status).toBe(400);
    expect(noted.body.errors).toEqual([expect.objectContaining({ path: "/inputs/team" })]);
    expect((await rowOf(id)).team).toBe("finance");
  });

  test("it cannot act on a row the caller's row policy hides", async () => {
    const id = await invoice({ team: "sales" });
    expect((await press(ivy, "pay", id)).status).toBe(404);
    expect((await rowOf(id)).status).toBe("open");
    // The one whose row it is may.
    expect((await press(jon, "pay", id)).status).toBe(200);
    // Nor can a made-up row, or one that is not an ID.
    expect((await press(ivy, "pay", "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await press(ivy, "pay", "nope")).status).toBe(404);
  });

  test("a condition that no longer holds is refused with 403 and the words", async () => {
    const id = await invoice({ status: "paid" });
    const refused = await press(ivy, "pay", id);
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toContain("It can't be done now: Status is open");
    const early = await press(ivy, "refund", await invoice());
    expect(early.status).toBe(403);
    expect(JSON.stringify(early.body)).toContain("Status is paid");
  });

  test("a guest who may not open the app is told it is not there", async () => {
    const id = await invoice();
    const guest = await press(browser(), "pay", id);
    expect(guest.status).toBe(404);
    expect((await press(ivy, "pay", id, { widget: undefined, at: "on/click" })).status).toBe(400);
    expect((await rowOf(id)).status).toBe("open");
  });

  test("the browser's steps come back in order, with each record named by its ID", async () => {
    const id = await invoice();
    const done = await press(ivy, "again", id);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.client).toEqual([
      { do: "open", page: "inv", record: id },
      { do: "message", text: "Back" },
    ]);
    // Said by the action when its steps say nothing: `done`.
    const noted = await press(ivy, "note", id, { inputs: { note: "x" } });
    expect(noted.body).toEqual({ client: [], message: "Noted" });
  });

  test("only what the action's `at` names is run: forged places are 404", async () => {
    const id = await invoice();
    for (const place of [
      "config/label",
      "config/",
      "config",
      "on/other",
      "on/",
      "on/click/extra",
      "../on/click",
      "on/../click",
      "config/rowActions/0/action",
      "config/rowActions/5/action",
      "",
    ]) {
      const refused = await act(ivy, { widget: "pay", at: place, records: { this: id } });
      expect([404, 400], place).toContain(refused.status);
      expect(refused.status, place).not.toBe(200);
    }
    // A property that holds an action, but not at an index, or an index of one that does not.
    expect(
      (
        await act(ivy, {
          page: "main",
          widget: "list",
          at: "config/rowActions",
          records: { event: id },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await act(ivy, {
          page: "main",
          widget: "list",
          at: "config/rowActions/0/label",
          records: { event: id },
        })
      ).status,
    ).toBe(404);
    expect((await press(ivy, "nope", id)).status).toBe(404);
    expect((await act(ivy, { widget: "pay", at: "on/click", page: "gone" })).status).toBe(404);
    expect((await rowOf(id)).status).toBe("open");
  });
});

describe("a file an action names (D22)", () => {
  const upload = async (name: string) =>
    (await alice.upload(`${ws()}/files?name=${name}`, name, "text/plain")).body.id as string;

  test("is refused unless the caller could already read it, with the answer of a file that is not there", async () => {
    const hidden = await upload("hidden.txt");
    await invoice({ team: "sales", doc: hidden });
    const shown = await upload("shown.txt");
    await invoice({ team: "finance", doc: shown });
    const mine = await invoice();

    const refused = await press(ivy, "attach", mine, { inputs: { file: hidden } });
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    const unknown = await press(ivy, "attach", mine, {
      inputs: { file: "01a205e4-4930-7604-8ec5-330c38946545" },
    });
    expect(unknown.status).toBe(400);
    expect(refused.body.detail).toBe(unknown.body.detail);
    expect((await rowOf(mine)).doc ?? null).toBeNull();

    // A file a row she may read names is hers to name.
    const allowed = await press(ivy, "attach", mine, { inputs: { file: shown } });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect((await rowOf(mine)).doc).toBe(shown);
  });
});

describe("what is asked", () => {
  test("is checked against its kind and whether it is required: 400 at /inputs/<name>", async () => {
    const id = await invoice();
    const missing = await press(ivy, "note", id, { inputs: {} });
    expect(missing.status).toBe(400);
    expect(missing.body.errors).toEqual([{ path: "/inputs/note", message: "is required" }]);

    const wrong = await press(ivy, "note", id, {
      inputs: { note: 5, amount: "lots", kind: "c" },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors.map((one: Any) => one.path).sort()).toEqual([
      "/inputs/amount",
      "/inputs/kind",
      "/inputs/note",
    ]);
    expect(await rowOf(id)).toMatchObject({ total: 10 });

    const fine = await press(ivy, "note", id, { inputs: { note: "Paid by cheque", amount: 12.5 } });
    expect(fine.status, JSON.stringify(fine.body)).toBe(200);
    expect(await rowOf(id)).toMatchObject({ note: "Paid by cheque", total: 12.5 });
  });

  test("an answer left out leaves its field alone", async () => {
    const id = await invoice({ total: 7 });
    expect((await press(ivy, "note", id, { inputs: { note: "x" } })).status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ note: "x", total: 7 });
  });
});

describe("a form changes a row", () => {
  test("an edit sends only what changed: a required field left out stays, and one emptied is refused", async () => {
    const id = await invoice({ total: 7 });
    const before = await rowOf(id);
    const edit = (inputs: object) =>
      act(ivy, {
        page: "edit",
        widget: "editform",
        at: "config/submit",
        records: { this: id },
        inputs,
      });
    const changed = await edit({ total: 9 });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(await rowOf(id)).toMatchObject({ number: before.number, total: 9 });
    const emptied = await edit({ number: "" });
    expect(emptied.status).toBe(400);
    expect(emptied.body.errors).toEqual([{ path: "/inputs/number", message: "is required" }]);
    expect(await rowOf(id)).toMatchObject({ number: before.number, total: 9 });
  });
});

describe("a form makes a row", () => {
  const submit = (who: Who, inputs: object) =>
    act(who, {
      page: "add",
      widget: "newform",
      at: "config/submit",
      inputs,
    });

  test("create validates the types and the required columns of the table", async () => {
    const fine = await submit(ivy, { number: "INV-F1", team: "finance", total: 12 });
    expect(fine.status, JSON.stringify(fine.body)).toBe(200);
    expect(fine.body.client).toEqual([{ do: "close" }]);
    expect(fine.body.made).toMatchObject({ table: "invoices" });
    expect(await rowOf(fine.body.made.id)).toMatchObject({
      number: "INV-F1",
      team: "finance",
      total: 12,
    });

    const missing = await submit(ivy, { team: "finance" });
    expect(missing.status).toBe(400);
    expect(missing.body.errors).toEqual([{ path: "/inputs/number", message: "is required" }]);

    const wrong = await submit(ivy, { number: "INV-F2", total: "twelve" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors).toEqual([
      { path: "/inputs/total", message: expect.stringContaining("number") },
    ]);
    // A column the form does not have is not set by it.
    const stray = await submit(ivy, { number: "INV-F3", status: "paid" });
    expect(stray.status).toBe(400);
    expect(stray.body.errors).toEqual([{ path: "/inputs/status", message: "is not asked for" }]);
    const rows = await alice.get(
      `${ws()}/rows/invoices?filter=${encodeURIComponent(JSON.stringify([{ column: "number", op: "eq", value: "INV-F2" }]))}`,
    );
    expect(rows.body.items ?? []).toEqual([]);
  });
});

describe("several data steps", () => {
  test("are one transaction: a failing second step leaves the first undone", async () => {
    const id = await invoice();
    const refused = await press(ivy, "chain", id);
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect((await rowOf(id)).status).toBe("open");
    // Nothing was audited for it either.
    const audit = await alice.get(`/tenants/${tenant}/audit?action=page_action.update`);
    expect(audit.body.items.filter((item: Any) => item.targetId === id)).toEqual([]);
  });

  test("a delete removes the row, and is audited", async () => {
    const id = await invoice();
    expect((await press(ivy, "remove", id)).status).toBe(200);
    expect((await alice.get(`${ws()}/row/${id}/invoices`)).status).toBe(404);
    const audit = await alice.get(`/tenants/${tenant}/audit?action=page_action.delete`);
    expect(audit.body.items[0]).toMatchObject({ targetId: id });
  });

  test("a moment is written as the moment it ran", async () => {
    const id = await invoice();
    const before = Date.now();
    expect((await press(ivy, "stamp", id)).status).toBe(200);
    const stamped = new Date((await rowOf(id)).paid_on).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("a flow", () => {
  test("starts with the resolved input, as the caller, marked with where it came from", async () => {
    const id = await invoice({ number: "INV-FLOW" });
    const row = await rowOf(id);
    const started = await press(ivy, "kick", id, { inputs: { why: "late" } });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const runs = await alice.get(`${ws()}/flow-runs?flow=flows/ping`);
    const run = runs.body.items[0];
    expect(run).toBeDefined();
    const stored = await t.db
      .selectFrom("flow_run")
      .select(["input", "trigger_detail"])
      .where("id", "=", run.id)
      .executeTakeFirstOrThrow();
    expect(stored.input).toEqual({ number: row.number, why: "late" });
    expect(run.startedBy).toMatchObject({ type: "end_user" });
    expect((stored.trigger_detail as Any).origin).toMatchObject({
      app: "billing",
      page: "inv",
      widget: "kick",
      action: "on/click",
    });
    const audit = await alice.get(`/tenants/${tenant}/audit?action=flow_run.started`);
    expect(audit.body.items[0]).toMatchObject({
      targetId: run.id,
      details: { flow: "flows/ping", via: "page_action", widget: "kick" },
    });
  });

  test("a flow that is not there stops the action before anything changes", async () => {
    const id = await invoice();
    // `kick` starts flows/ping, so with the flow there this must have worked; the draft removes it.
    const saved = await putSeen(alice, `${ws()}/drafts/screens/invoices`, {
      kind: "interface",
      schemaVersion: 2,
      body: {
        ...screen,
        pages: screen.pages.map((page) =>
          page.id === "inv"
            ? {
                ...page,
                widgets: [
                  button("lost", 0, {
                    steps: [
                      { do: "update", record: "this", set: { status: { value: "paid" } } },
                      { do: "flow", path: "flows/missing" },
                    ],
                  }),
                ],
              }
            : page,
        ),
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const refused = await press(alice, "lost", id, { draft: true });
    expect(refused.status).toBe(404);
    expect((await rowOf(id)).status).toBe("open");
  });
});

describe("a flow or script that refuses its input", () => {
  const rows = async () =>
    (await alice.get(`${ws()}/rows/invoices?limit=500`)).body.items.length as number;
  /** A button that makes a row, then starts what `start` says, with nothing to give it. */
  const trying = async (start: object) => {
    const saved = await putSeen(alice, `${ws()}/drafts/screens/invoices`, {
      kind: "interface",
      schemaVersion: 2,
      body: {
        ...screen,
        pages: screen.pages.map((page) =>
          page.id === "inv"
            ? {
                ...page,
                widgets: [
                  button("makeandstart", 0, {
                    steps: [
                      { do: "update", record: "this", set: { note: { value: "started" } } },
                      { do: "create", table: "invoices", set: { number: { value: "INV-X" } } },
                      start,
                    ],
                  }),
                ],
              }
            : page,
        ),
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  };

  test("a flow whose input is refused saves nothing, pressed once or twice", async () => {
    await trying({ do: "flow", path: "flows/strict" });
    const id = await invoice();
    const before = await rows();
    for (const _ of [1, 2]) {
      const refused = await press(alice, "makeandstart", id, { draft: true });
      expect(refused.status).toBe(400);
      // Said once, in words: what is missing, not a path and a schema's phrase.
      expect(refused.body.detail).toBe("The flow flows/strict refused its input. It needs why.");
    }
    expect(await rows()).toBe(before);
    expect((await rowOf(id)).note ?? null).toBeNull();
    expect((await alice.get(`${ws()}/flow-runs?flow=flows/strict`)).body.items).toHaveLength(0);
  });

  test("a script whose input is refused saves nothing", async () => {
    await trying({ do: "script", path: "strict-script" });
    const id = await invoice();
    const before = await rows();
    const refused = await press(alice, "makeandstart", id, { draft: true });
    expect(refused.status).toBe(400);
    expect(await rows()).toBe(before);
    expect((await rowOf(id)).note ?? null).toBeNull();
  });

  test("what is given is checked as it will be sent", async () => {
    await trying({ do: "flow", path: "flows/strict", input: { why: { value: "late" } } });
    const id = await invoice();
    const before = await rows();
    const done = await press(alice, "makeandstart", id, { draft: true });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.started).toBe(1);
    expect(await rows()).toBe(before + 1);
  });
});

describe("a draft", () => {
  const draftOf = (extra: object[]) => ({
    ...screen,
    pages: screen.pages.map((page) =>
      page.id === "inv" ? { ...page, widgets: [...page.widgets, ...extra] } : page,
    ),
  });

  test("holds a button with no steps yet, says so as a problem, and is not deployed with it", async () => {
    const saved = await putSeen(alice, `${ws()}/drafts/screens/invoices`, {
      kind: "interface",
      schemaVersion: 2,
      body: draftOf([button("unfinished", 8, { steps: [] })]),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(JSON.stringify(saved.body.problems)).toContain("must NOT have fewer than 1 items");
  });

  test("is refused to an end user and run by an editor", async () => {
    const saved = await putSeen(alice, `${ws()}/drafts/screens/invoices`, {
      kind: "interface",
      schemaVersion: 2,
      body: draftOf([
        button("draftpay", 8, {
          steps: [{ do: "update", record: "this", set: { note: { value: "from the draft" } } }],
        }),
      ]),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const id = await invoice();
    // What is deployed has no such button.
    expect((await press(alice, "draftpay", id)).status).toBe(404);
    const refused = await press(ivy, "draftpay", id, { draft: true });
    expect(refused.status).toBe(403);
    expect((await press(ivy, "pay", id, { draft: true })).status).toBe(403);
    expect((await rowOf(id)).note ?? null).toBeNull();
    // An editor's own run of the draft is allowed, and the draft's action is the one that runs.
    const ok = await press(alice, "draftpay", id, { draft: true });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await rowOf(id)).note).toBe("from the draft");
  });
});

describe("a dashboard", () => {
  const dash = (body: object, extra: object = {}) =>
    act(alice, {
      of: "dashboard",
      path: "boards/by-team",
      page: undefined,
      ...extra,
      ...body,
    });

  test("runs the steps that read and says nothing of data", async () => {
    const id = await invoice();
    const done = await dash({ widget: "click", at: "on/rowClick", records: { event: id } });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.client).toEqual([{ do: "message", text: "Clicked" }]);
  });

  test("runs no data step: an action that holds one is refused and changes nothing", async () => {
    const id = await invoice();
    const sneaky = {
      ...board,
      widgets: [
        {
          ...board.widgets[0],
          on: {
            rowClick: {
              steps: [{ do: "update", record: "event", set: { status: { value: "paid" } } }],
            },
          },
        },
      ],
    };
    const saved = await putSeen(alice, `${ws()}/drafts/boards/by-team`, {
      kind: "dashboard",
      schemaVersion: 3,
      body: sneaky,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const refused = await dash(
      { widget: "click", at: "on/rowClick", records: { event: id } },
      { draft: true },
    );
    expect(refused.status).toBe(400);
    expect((await rowOf(id)).status).toBe("open");
  });
});

describe("who can run it", () => {
  test("a member of a named group may, and so may an end user of one; the API too", async () => {
    // Ivy is in the end-user group "finance"; Jon is in "sales".
    const id = await invoice();
    const done = await press(ivy, "gated", id);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await rowOf(id)).note).toBe("gated");
    // Jon is in "sales", which the action does not name.
    const other = await invoice({ team: "sales" });
    const refused = await press(jon, "gated", other);
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toContain("Only finance and managers can do this.");
    expect((await rowOf(other)).note ?? null).toBeNull();
  });

  test("a member of a member group runs it, and one outside every group is refused", async () => {
    const managers = await alice.post(`/tenants/${tenant}/groups`, { name: "managers" });
    expect(managers.status, JSON.stringify(managers.body)).toBe(201);
    const id = await invoice();
    // Alice is not in "managers" yet.
    const before = await press(alice, "gated", id);
    expect(before.status).toBe(403);
    const me = (
      await t.db
        .selectFrom("member")
        .select("id")
        .where("email", "=", "alice@acme.example")
        .execute()
    )[0]?.id;
    const put = await alice.put(`/tenants/${tenant}/groups/${managers.body.id}/members/${me}`);
    expect(put.status, JSON.stringify(put.body)).toBeLessThan(300);
    const after = await press(alice, "gated", id);
    expect(after.status, JSON.stringify(after.body)).toBe(200);
    expect((await rowOf(id)).note).toBe("gated");
  });

  test("a group that no longer exists matches nobody, and is named by its key", async () => {
    const id = await invoice();
    for (const who of [ivy, alice]) {
      const refused = await press(who, "gone", id);
      expect(refused.status).toBe(403);
      expect(JSON.stringify(refused.body)).toContain("Only vanished can do this.");
    }
    expect((await rowOf(id)).note ?? null).toBeNull();
    // Three groups are joined "A, B and C", by their titles.
    const three = await press(ivy, "other", id);
    expect(three.status).toBe(403);
    expect(JSON.stringify(three.body)).toContain("Only sales, managers and admins can do this.");
  });

  test("the interface is served with the names of the groups its rules name, so that a page need not list them", async () => {
    const served = await alice.get(`${ws()}/interfaces/screens/invoices`);
    expect(served.status, JSON.stringify(served.body)).toBe(200);
    // A group that is gone is named by its key; every group the page names has an entry.
    expect(served.body.groupNames).toMatchObject({ vanished: "vanished" });
    expect(Object.keys(served.body.groupNames)).toEqual(
      expect.arrayContaining(["finance", "managers", "vanished"]),
    );
  });

  test("it only narrows: a member of the group still meets the row policy", async () => {
    const hidden = await invoice({ team: "sales" });
    expect((await press(ivy, "gated", hidden)).status).toBe(404);
    // An action with no groups is as before.
    expect((await press(ivy, "pay", await invoice())).status).toBe(200);
  });
});

describe("one action on several rows", () => {
  const many = (who: Who, events: string[], more: object = {}) =>
    act(who, {
      page: "main",
      widget: "list",
      at: "config/rowActions/0/action",
      records: { events },
      ...more,
    });

  test("runs once per row in one transaction, and says how many", async () => {
    const ids = [await invoice(), await invoice(), await invoice()];
    const done = await many(ivy, ids);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.changed).toBe(3);
    for (const id of ids) expect((await rowOf(id)).status).toBe("paid");
    const audit = await alice.get(`/tenants/${tenant}/audit?action=page_action.update&limit=3`);
    expect(audit.body.items.map((one: Any) => one.targetId).sort()).toEqual([...ids].sort());
  });

  test("one row that can't refuses all and changes none", async () => {
    const ok = await invoice();
    const paid = await invoice({ status: "paid" });
    const refused = await many(ivy, [ok, paid]);
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toContain("It can't be done now");
    expect((await rowOf(ok)).status).toBe("open");
    // A row the caller's policy hides is not there, and the rest stay as they were.
    const hidden = await invoice({ team: "sales" });
    const none = await many(ivy, [ok, hidden]);
    expect(none.status).toBe(404);
    expect((await rowOf(ok)).status).toBe("open");
    expect((await rowOf(hidden)).status).toBe("open");
  });

  test("the numbers are held: 1 to 200, never with `event`, no `rows` or `narrow` step", async () => {
    const id = await invoice();
    expect((await many(ivy, [])).status).toBe(400);
    expect(
      (
        await many(
          ivy,
          Array.from({ length: 201 }, (_, n) => `${n}`),
        )
      ).status,
    ).toBe(400);
    expect((await many(ivy, [id, id])).status).toBe(400);
    const both = await act(ivy, {
      page: "main",
      widget: "list",
      at: "config/rowActions/0/action",
      records: { event: id, events: [id] },
    });
    expect(both.status).toBe(400);
    // A step that shows rows can't be done for several at once, but can for one.
    const peek = (events: string[]) =>
      act(ivy, {
        page: "main",
        widget: "list",
        at: "config/rowActions/1/action",
        records: { events },
      });
    expect((await peek([id, await invoice()])).status).toBe(400);
    expect((await peek([id])).status).toBe(200);
    expect((await rowOf(id)).status).toBe("open");
  });

  test("who can run it is checked before any row is read", async () => {
    const id = await invoice();
    // Jon's row policy hides this row, yet he is told about his group first.
    const none = await act(jon, {
      page: "inv",
      widget: "gated",
      at: "on/click",
      records: { this: id },
    });
    // Jon is refused for his group before his row policy is asked: 403, not 404.
    expect(none.status).toBe(403);
  });
});

describe("today is the reader's day (D21)", () => {
  /** The wall clock of a moment in Los Angeles, as `YYYY-MM-DD HH:MM`. */
  const inLosAngeles = (at: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Los_Angeles",
      dateStyle: "short",
      timeStyle: "short",
    }).format(at);

  test("in the evening in Los Angeles, a step's today into a time column is that day's midnight there", async () => {
    const id = await invoice();
    const other = await invoice();
    const third = await invoice();
    // The next 03:30 UTC, which is the evening of the day before in Los Angeles; ahead of now, so
    // that sessions are still valid.
    const evening = new Date();
    evening.setUTCHours(3, 30, 0, 0);
    if (evening.getTime() <= Date.now()) evening.setUTCDate(evening.getUTCDate() + 1);
    vi.useFakeTimers({ toFake: ["Date"], now: evening });
    try {
      const done = await press(ivy, "pay", id, { zone: "America/Los_Angeles" });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      const stored = new Date((await rowOf(id)).paid_on);
      // Midnight in Los Angeles of the day it is there (the day before UTC's), not midnight UTC.
      const day = inLosAngeles(evening).slice(0, 10);
      expect(inLosAngeles(stored)).toBe(`${day} 00:00`);
      expect(day).not.toBe(evening.toISOString().slice(0, 10));
      // Without a zone it is UTC's day, as before.
      expect((await press(ivy, "pay", other)).status).toBe(200);
      expect(new Date((await rowOf(other)).paid_on).toISOString()).toBe(
        `${evening.toISOString().slice(0, 10)}T00:00:00.000Z`,
      );
      // A zone that is no zone is refused.
      expect((await press(ivy, "pay", third, { zone: "Mars/Base" })).status).toBe(400);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("edit in place of a record detail", () => {
  /** A detail that lets people edit what it shows, put in the stored page. */
  beforeAll(async () => {
    const row = await t.db
      .selectFrom("resource")
      .select(["id", "body"])
      .where("kind", "=", "interface")
      .where("path", "=", "screens/invoices")
      .executeTakeFirstOrThrow();
    const body = row.body as unknown as { pages: { id: string; widgets: object[] }[] };
    body.pages
      .find((page) => page.id === "inv")
      ?.widgets.push({
        id: "info",
        type: "core/detail",
        at: { x: 0, y: 8, w: 6, h: 6 },
        data: { record: { source: { record: "this" } } },
        config: {
          edit: true,
          fields: [{ column: "number" }, { column: "total" }, { column: "status", hidden: true }],
        },
      });
    // The same, limited to a group: the groups of the end users are keyed (ivy is in "finance").
    for (const [id, groups] of [
      ["info_sales", ["sales"]],
      ["info_finance", ["finance"]],
    ] as const) {
      body.pages
        .find((page) => page.id === "inv")
        ?.widgets.push({
          id,
          type: "core/detail",
          at: { x: 0, y: 14, w: 6, h: 6 },
          data: { record: { source: { record: "this" } } },
          config: { edit: true, editBy: { groups }, fields: [{ column: "total" }] },
        });
    }
    await t.db
      .updateTable("resource")
      .set({ body: JSON.stringify(body) })
      .where("id", "=", row.id)
      .execute();
  });
  const edit = (who: Who, id: string, inputs: object) =>
    act(who, { widget: "info", at: "config/edit", records: { this: id }, inputs });

  test("updates the columns the detail shows, on its record, audited", async () => {
    const id = await invoice();
    const done = await edit(ivy, id, { total: 55, number: "INV-EDIT" });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(await rowOf(id)).toMatchObject({ total: 55, number: "INV-EDIT", status: "open" });
    const audit = await alice.get(`/tenants/${tenant}/audit?action=page_action.update`);
    expect(audit.body.items[0]).toMatchObject({
      targetId: id,
      details: { fields: expect.arrayContaining(["total", "number"]), action: "config/edit" },
    });
  });

  test("is limited to the groups the detail names, and refused to everyone else (WID-19)", async () => {
    const id = await invoice();
    const as = (widget: string) =>
      act(ivy, { widget, at: "config/edit", records: { this: id }, inputs: { total: 77 } });
    const refused = await as("info_sales");
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect((await rowOf(id)).total).toBe(10);
    expect((await as("info_finance")).status).toBe(200);
    expect((await rowOf(id)).total).toBe(77);
  });

  test("refuses a column it does not show, or hides, and a value of the wrong type", async () => {
    const id = await invoice();
    const hidden = await edit(ivy, id, { status: "paid" });
    expect(hidden.status).toBe(400);
    expect(hidden.body.errors).toEqual([expect.objectContaining({ path: "/inputs/status" })]);
    expect((await edit(ivy, id, { team: "sales" })).status).toBe(400);
    expect((await edit(ivy, id, { total: "lots" })).status).toBe(400);
    expect(await rowOf(id)).toMatchObject({ status: "open", team: "finance", total: 10 });
  });

  test("works on the caller's own rows only, and on a detail that allows it", async () => {
    const id = await invoice({ team: "sales" });
    expect((await edit(ivy, id, { total: 1 })).status).toBe(404);
    expect((await edit(ivy, "nope", { total: 1 })).status).toBe(404);
    const noEdit = await act(ivy, {
      widget: "pay",
      at: "config/edit",
      records: { this: id },
      inputs: { total: 1 },
    });
    expect(noEdit.status).toBe(404);
    expect((await edit(ivy, await invoice(), {})).status).toBe(400);
    expect((await rowOf(id)).total).toBe(10);
  });
});

describe("a detail of the user's own record", () => {
  beforeAll(async () => {
    const row = await t.db
      .selectFrom("resource")
      .select(["id", "body"])
      .where("kind", "=", "interface")
      .where("path", "=", "screens/invoices")
      .executeTakeFirstOrThrow();
    const body = row.body as unknown as { pages: { id: string; widgets: object[] }[] };
    body.pages
      .find((page) => page.id === "inv")
      ?.widgets.push({
        id: "mine",
        type: "core/detail",
        at: { x: 0, y: 14, w: 6, h: 6 },
        data: { record: { source: { own: { table: "invoices", by: "paid_by" } } } },
        config: {
          fields: [{ column: "number" }],
          actions: [
            {
              id: "note",
              label: "Note it",
              action: {
                steps: [{ do: "update", record: "event", set: { note: { value: "noted" } } }],
              },
            },
          ],
        },
      });
    await t.db
      .updateTable("resource")
      .set({ body: JSON.stringify(body) })
      .where("id", "=", row.id)
      .execute();
  });
  const note = (id: string) =>
    act(ivy, { widget: "mine", at: "config/actions/0/action", records: { event: id } });

  test("a button runs on the user's own record, and on no one else's, even one they may read", async () => {
    const theirs = await invoice({ paid_by: "someone@else.example" });
    const mine = await invoice({ paid_by: "IVY@customer.example" });
    expect((await note(theirs)).status).toBe(404);
    expect((await rowOf(theirs)).note ?? null).toBeNull();
    const done = await note(mine);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await rowOf(mine)).note).toBe("noted");
  });
});
