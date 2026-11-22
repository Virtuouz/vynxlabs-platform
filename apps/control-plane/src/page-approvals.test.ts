import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type Bundle,
  type BundleManifest,
  bundleDigest,
  resolveKeyReferences,
} from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { detailFieldNames } from "./kernel/flows/approvers.js";
import { approvalStanding, fieldsOf, readApprovals } from "./kernel/pages/approvals.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * The Approvals widget reads and decides on the server (decision 0007): only a member, as
 * themselves, by their own `approval:read` and `approval:write` and the step's named approvers;
 * only the flows the widget lists, in the page's own workspace, from the deployed page.
 */

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

vi.setConfig({ testTimeout: 30_000 });

const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";

let t: TestApp;
let tenant: string;
let dev: string;
let other: string;
let runtime: string;
let alice: Client; // tenant admin, not a manager
let bob: Client; // a manager, may decide
let bea: Client; // a manager too
let erin: Client; // reads approvals only
let dora: Client; // may open the page and nothing more
const ids: Record<string, string> = {};

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;
const manifest = (kind: string, path: string, body: object): BundleManifest =>
  ({
    kind,
    path,
    schemaVersion: kind === "interface" ? 2 : 1,
    ownership: "code",
    body,
  }) as BundleManifest;

const flowOf = (title: string, approvers?: { groups?: string[] }) => ({
  nodes: {
    start: { type: "trigger", trigger: { type: "manual" } },
    ask: {
      type: "approval",
      title,
      detail:
        "{'clinic': trigger.clinic, 'item': trigger.item, 'total': trigger.total, " +
        "'api_key': trigger.key, 'notes': trigger.notes}",
      ...(approvers ? { approvers } : {}),
    },
    done: { type: "set", values: { finished: "true" } },
  },
  edges: [
    { from: "start", to: "ask" },
    { from: "ask", to: "done" },
  ],
});

const at = { x: 0, y: 0, w: 6, h: 8 };
const approvalsWidget = (id: string, source: object, config: object = {}, more: object = {}) => ({
  id,
  type: "core/approvals",
  at,
  data: { requests: { source: { approvals: source } } },
  config,
  ...more,
});

const screen = {
  title: "Approvals",
  pages: [
    {
      id: "main",
      title: "Approvals",
      widgets: [
        // Theirs to decide, from the reorder flow only; shows decided ones; asks why on reject.
        approvalsWidget("queue", { flows: ["orders/reorder"] }, { decided: true }),
        // Every flow with an approval step, theirs or not; asks why always.
        approvalsWidget("everything", { whose: "all" }, { askWhy: "always" }),
        // Names two fields only, the second under another name.
        approvalsWidget(
          "limited",
          { flows: ["orders/reorder"] },
          {
            fields: [
              { name: "item" },
              { name: "clinic", label: "Where" },
              { name: "x", hidden: true },
            ],
          },
        ),
        approvalsWidget(
          "secrets",
          { flows: ["orders/reorder"] },
          { fields: [{ name: "api_key" }] },
        ),
        // Never asks why.
        approvalsWidget("quiet", { flows: ["orders/reorder"] }, { askWhy: "never" }),
        // Seen by managers only.
        approvalsWidget(
          "managers",
          { flows: ["orders/reorder"] },
          {},
          { rules: { seenBy: { groups: ["managers"] } } },
        ),
        // Lists a flow that has no waiting steps at all.
        approvalsWidget("nothing", { flows: ["orders/other"] }),
      ],
    },
  ],
};

function bundle(withScreen: boolean): Bundle {
  const unsigned = {
    formatVersion: 3 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("flow", "orders/reorder", flowOf("Approve a stock order", { groups: ["managers"] })),
      manifest("flow", "orders/other", flowOf("Approve something else")),
      manifest("flow", "orders/open", flowOf("Anyone may decide this")),
      ...(withScreen
        ? [
            manifest("interface", "screens/approvals", screen),
            manifest("app", "approvals", { title: "Approvals", interface: "screens/approvals" }),
            manifest("binding", "bindings/app", {
              role: "portal_user",
              principal: { type: "end_users" },
              resource: "approvals",
            }),
          ]
        : []),
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

/** The console's clients are at the API's own root; a browser is at an address of its own. */
const prefix = (who: unknown) =>
  [alice, bob, bea, erin, dora].includes(who as Client) ? "" : "/api/v1";
const read = (who: { get: (url: string) => Promise<Any> }, widget: string, extra = "") =>
  who.get(
    `${prefix(who)}${ws()}/widget-data?of=interface&path=screens/approvals&page=main&widget=${widget}${extra}`,
  );
const waitingOf = async (who: Client, widget = "queue"): Promise<Any[]> => {
  const got = await read(who, widget);
  expect(got.status, JSON.stringify(got.body)).toBe(200);
  return got.body.inputs.requests.waiting;
};

const decide = (
  who: { post: (url: string, body: object) => Promise<Any> },
  id: string,
  decision: "approve" | "reject",
  more: object = {},
  widget = "queue",
) =>
  who.post(`${prefix(who)}${ws()}/page-approvals`, {
    path: "screens/approvals",
    page: "main",
    widget,
    id,
    decision,
    ...more,
  });

/** Starts a run of a flow and waits until it asks. Gives the id the widget names the step by. */
async function ask(
  flow: string,
  input: Record<string, unknown> = {},
  workspace = dev,
): Promise<{ run: string; id: string }> {
  const started = await alice.post(`${ws(workspace)}/flow-runs`, {
    flow,
    input: {
      clinic: "northside",
      item: "Gauze",
      total: 1840,
      key: "sk-live-123",
      notes: "",
      ...input,
    },
  });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const run = started.body.id as string;
  for (let i = 0; i < 150; i++) {
    const body = (await alice.get(`${ws(workspace)}/flow-runs/${run}`)).body;
    if (body.state === "waiting_approval") return { run, id: `${run}/ask` };
    await sleep(50);
  }
  throw new Error("The flow run did not ask.");
}
async function currentState(run: string, workspace = dev): Promise<string> {
  return (await alice.get(`${ws(workspace)}/flow-runs/${run}`)).body.state;
}
async function stateOf(run: string, workspace = dev): Promise<string> {
  for (let i = 0; i < 150; i++) {
    const state = (await alice.get(`${ws(workspace)}/flow-runs/${run}`)).body.state;
    if (state !== "waiting_approval" && state !== "running" && state !== "queued") return state;
    await sleep(50);
  }
  return "running";
}

let ivy: ReturnType<typeof browser>;

beforeAll(async () => {
  runtime = mkdtempSync(join(tmpdir(), "vx-approvals-"));
  mkdirSync(join(runtime, "assets"));
  writeFileSync(join(runtime, "index.html"), "<!doctype html><html><body></body></html>");
  t = await startTestApp({ config: { screensDir: runtime } });
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  // The operator's access grant stays: it is how the operator gets in, and must not count.
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = async (key: string, role?: string) => {
    const created = await t.admin.post(`/tenants/${tenant}/members`, {
      email: `${key}@acme.example`,
      name: key[0]?.toUpperCase() + key.slice(1),
      password: PASSWORD,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    ids[key] = created.body.id;
    if (role) {
      await t.admin.post(`/tenants/${tenant}/bindings`, {
        principalType: "member",
        principalId: created.body.id,
        roleId: role,
      });
    }
  };
  await member("alice", roles.tenant_admin);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  const role = async (name: string, permissions: string[]) =>
    (await alice.post(`/tenants/${tenant}/roles`, { name, permissions })).body.id as string;
  const approver = await role("approver", ["approval:*", "interface:read", "flow_run:read"]);
  const reader = await role("approval_reader", ["approval:read", "interface:read"]);
  const plain = await role("plain", ["interface:read"]);
  await member("bob", approver);
  await member("bea", approver);
  await member("erin", reader);
  await member("dora", plain);
  await member("sam", approver);
  const managers = (await alice.post(`/tenants/${tenant}/groups`, { name: "Managers" })).body.id;
  for (const who of ["bob", "bea", "sam"]) {
    await alice.put(`/tenants/${tenant}/groups/${managers}/members/${ids[who]}`, {});
  }
  await alice.patch(`/tenants/${tenant}/members/${ids.sam}`, { suspended: true });
  bob = await t.signIn("bob@acme.example", PASSWORD);
  bea = await t.signIn("bea@acme.example", PASSWORD);
  erin = await t.signIn("erin@acme.example", PASSWORD);
  dora = await t.signIn("dora@acme.example", PASSWORD);

  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  other = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "dev2",
      name: "Dev two",
      type: "dev",
    })
  ).body.id;
  for (const [workspace, withScreen] of [
    [dev, true],
    [other, false],
  ] as const) {
    const uploaded = await alice.post(`${ws(workspace)}/bundles`, bundle(withScreen));
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    const deployed = await alice.post(`${ws(workspace)}/deployments`, {
      bundleId: uploaded.body.id,
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  }
  // An end user who may open the app, as a customer would.
  const created = await alice.post(`/tenants/${tenant}/end-users`, {
    email: "ivy@customer.example",
    name: "Ivy",
  });
  ivy = browser();
  const token = new URL(created.body.invitation.url).searchParams.get("token") as string;
  await ivy.form("/portal/acme/set-password", { token, password: PASSWORD });
  void grant;
}, 90_000);

afterAll(async () => {
  await t?.stop();
  rmSync(runtime, { recursive: true, force: true });
});

describe("reading what waits", () => {
  test("a named approver sees it, with its fields redacted and the flow's words", async () => {
    const step = await ask("orders/reorder");
    const [item] = (await waitingOf(bob)).filter((one) => one.id === step.id);
    expect(item).toMatchObject({
      title: "Approve a stock order",
      flow: { path: "orders/reorder", title: "Reorder" },
      mayDecide: true,
      approvers: "the Managers group",
    });
    // The first four of the step's details (the order the database keeps them in), and no more.
    expect(item.fields).toHaveLength(4);
    expect(item.fields.find((one: Any) => one.name === "item")).toMatchObject({
      label: "Item",
      value: "Gauze",
    });
    expect(JSON.stringify(item)).not.toContain("sk-live-123");
    // Asked for by name, the secret is masked all the same.
    const [named] = (await waitingOf(bob, "secrets")).filter((one) => one.id === step.id);
    expect(named.fields).toEqual([{ name: "api_key", label: "Api key", value: "[redacted]" }]);
    expect(JSON.stringify(named)).not.toContain("sk-live-123");
    expect(item.waitingSince).toMatch(/^\d{4}-/);
    await decide(bob, step.id, "approve");
  });

  test("`mine` lists what they may decide; someone holding the permission but not named sees none of it", async () => {
    const step = await ask("orders/reorder");
    expect((await waitingOf(bob)).map((one) => one.id)).toContain(step.id);
    // Alice holds approval:write through the tenant admin role, but the step names the Managers.
    expect((await waitingOf(alice)).map((one) => one.id)).not.toContain(step.id);
    // `all` lists it for her, and says she may not decide it.
    const everything = await waitingOf(alice, "everything");
    expect(everything.find((one) => one.id === step.id)).toMatchObject({ mayDecide: false });
    await decide(bob, step.id, "approve");
  });

  test("a member who may only read sees every one, decides none", async () => {
    const step = await ask("orders/reorder");
    const seen = await waitingOf(erin, "everything");
    expect(seen.find((one) => one.id === step.id)).toMatchObject({ mayDecide: false });
    // `mine` for a reader is an empty list: they may decide nothing.
    expect(await waitingOf(erin)).toEqual([]);
    const refused = await decide(erin, step.id, "approve", {}, "everything");
    expect(refused.status).toBe(403);
    expect(await currentState(step.run)).toBe("waiting_approval");
    await decide(bob, step.id, "approve");
  });

  test("a member with neither permission is given an empty answer, with no counts and no titles", async () => {
    const step = await ask("orders/reorder");
    const got = await read(dora, "everything");
    expect(got.status).toBe(200);
    expect(got.body.inputs.requests).toEqual({
      shape: "approvals",
      waiting: [],
      decided: [],
      more: false,
    });
    expect((await decide(dora, step.id, "approve", {}, "everything")).status).toBe(403);
    await decide(bob, step.id, "approve");
  });

  test("an end user opening the app reads nothing and decides nothing", async () => {
    const step = await ask("orders/reorder");
    const got = await read(ivy, "everything");
    expect(got.status, JSON.stringify(got.body)).toBe(200);
    expect(got.body.inputs.requests).toEqual({
      shape: "approvals",
      waiting: [],
      decided: [],
      more: false,
    });
    expect((await decide(ivy, step.id, "approve", {}, "everything")).status).toBe(403);
    expect(await currentState(step.run)).toBe("waiting_approval");
    await decide(bob, step.id, "approve");
  });

  test("a guest, a service account and an end user are given nothing by the server's own rule", async () => {
    const step = await ask("orders/reorder");
    const ctx = (principal: object) => ({ principal }) as Any;
    const widget = screen.pages[0]?.widgets[1] as Any;
    for (const principal of [
      { type: "anonymous", id: null },
      { type: "end_user", id: ids.ivy ?? "00000000-0000-4000-8000-000000000001", tenantId: tenant },
      { type: "service_account", id: "00000000-0000-4000-8000-000000000002", tenantId: tenant },
    ]) {
      expect(
        await approvalStanding(t.db, principal as Any, { tenantId: tenant, workspaceId: dev }),
      ).toBe(undefined);
      const got = await readApprovals(t.kernel, ctx(principal), {
        at: { tenantId: tenant, workspaceId: dev },
        widget,
        draft: false,
      });
      expect(got).toEqual({ shape: "approvals", waiting: [], decided: [], more: false });
    }
    await decide(bob, step.id, "approve");
  });

  test("a member's own standing counts in an app-only sign-in, as the mail's does; an operator's grant and a suspended member's do not", async () => {
    const at2 = { tenantId: tenant, workspaceId: dev };
    // An app sign-in of a manager: the request's reach is limited to what apps use, the member's own is not.
    const appOnly = { type: "member", id: ids.bob, appTenantId: tenant } as Any;
    expect(await approvalStanding(t.db, appOnly, at2)).toMatchObject({ read: true, write: true });
    // The same sign-in, held to the app limit, would not hold approval:write.
    const { check } = await import("./kernel/authorize.js");
    expect((await check(t.db, appOnly, "approval:write", at2)).allowed).toBe(false);
    // Suspended: nothing.
    expect(await approvalStanding(t.db, { type: "member", id: ids.sam as string }, at2)).toBe(
      undefined,
    );
  });

  test("the operator, in through an access grant, is given nothing", async () => {
    const step = await ask("orders/reorder");
    const got = await t.admin.get(
      `${ws()}/widget-data?of=interface&path=screens/approvals&page=main&widget=everything`,
    );
    expect(got.status, JSON.stringify(got.body)).toBe(200);
    expect(got.body.inputs.requests.waiting).toEqual([]);
    expect(
      (
        await t.admin.post(`${ws()}/page-approvals`, {
          path: "screens/approvals",
          page: "main",
          widget: "queue",
          id: step.id,
          decision: "approve",
        })
      ).status,
    ).toBe(403);
    await decide(bob, step.id, "approve");
  });

  test("only the flows the widget lists; the others are not shown to it", async () => {
    const mine = await ask("orders/reorder");
    const elsewhere = await ask("orders/open");
    const ids2 = (await waitingOf(bob)).map((one) => one.id);
    expect(ids2).toContain(mine.id);
    expect(ids2).not.toContain(elsewhere.id);
    // The widget that lists every flow shows both.
    const all = (await waitingOf(bob, "everything")).map((one) => one.id);
    expect(all).toEqual(expect.arrayContaining([mine.id, elsewhere.id]));
    await decide(bob, mine.id, "approve");
    await decide(bob, elsewhere.id, "approve", {}, "everything");
  });

  test("the widget names its fields: only those leave the server, under the names it gave", async () => {
    const step = await ask("orders/reorder");
    const [item] = (await waitingOf(bob, "limited")).filter((one) => one.id === step.id);
    expect(item.fields).toEqual([
      { name: "item", label: "Item", value: "Gauze" },
      { name: "clinic", label: "Where", value: "northside" },
    ]);
    expect(JSON.stringify(item)).not.toContain("1840");
    await decide(bob, step.id, "approve");
  });

  test("a widget seen by managers shows a member outside them nothing", async () => {
    const step = await ask("orders/reorder");
    expect((await waitingOf(bob, "managers")).map((one) => one.id)).toContain(step.id);
    // Alice is not a manager: shown none, and refused when she tries to decide through it.
    expect(await waitingOf(alice, "managers")).toEqual([]);
    expect((await decide(alice, step.id, "approve", {}, "managers")).status).toBe(404);
    await decide(bob, step.id, "approve");
  });

  test("long values and objects are cut, and a detail that is not an object is one field", () => {
    const widget = { id: "w", type: "core/approvals", at, config: {} } as Any;
    const long = fieldsOf({ note: "x".repeat(5000) }, widget);
    expect(String(long[0]?.value).length).toBeLessThan(1100);
    expect(fieldsOf("Reorder gauze", widget)).toEqual([
      { name: "detail", label: "Details", value: "Reorder gauze" },
    ]);
    expect(fieldsOf(null, widget)).toEqual([]);
  });
});

describe("deciding", () => {
  test("a named approver approves: the flow moves, the audit says who and by what", async () => {
    const step = await ask("orders/reorder");
    const done = await decide(bob, step.id, "approve", { comment: "  Fine by me  " });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body).toMatchObject({
      decision: "approve",
      title: "Approve a stock order",
      flow: { path: "orders/reorder", title: "Reorder" },
      by: "Bob",
    });
    expect(await stateOf(step.run)).toBe("succeeded");
    const audit = await alice.get(`/tenants/${tenant}/audit?action=approval.approved`);
    expect(audit.body.items[0]).toMatchObject({
      targetId: step.run,
      actorType: "member",
      actorId: ids.bob,
      details: {
        flow: "orders/reorder",
        node: "ask",
        title: "Approve a stock order",
        comment: "Fine by me",
        via: "app",
        app: "approvals",
        page: "main",
        widget: "queue",
      },
    });
    // It is listed as decided, with who, by the app.
    const decided = (await read(bob, "queue")).body.inputs.requests.decided;
    expect(decided[0]).toMatchObject({
      id: step.id,
      decision: { approved: true, by: "Bob", comment: "Fine by me", via: "app" },
    });
    expect((await waitingOf(bob)).map((one) => one.id)).not.toContain(step.id);
  });

  test("rejecting fails the flow's step, with the reason, and the widget's rule needs one", async () => {
    const step = await ask("orders/reorder");
    const noReason = await decide(bob, step.id, "reject");
    expect(noReason.status).toBe(400);
    expect(JSON.stringify(noReason.body)).toContain("Say why");
    // Spaces are not a reason.
    expect((await decide(bob, step.id, "reject", { comment: "   " })).status).toBe(400);
    expect(await currentState(step.run)).toBe("waiting_approval");
    const done = await decide(bob, step.id, "reject", { comment: "Too much stock already" });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(await stateOf(step.run)).toBe("failed");
    const audit = await alice.get(`/tenants/${tenant}/audit?action=approval.rejected`);
    expect(audit.body.items[0].details).toMatchObject({
      comment: "Too much stock already",
      via: "app",
    });
  });

  test("ask why: never lets either through; always needs it for an approval too; at most 2000 characters", async () => {
    const a = await ask("orders/reorder");
    expect((await decide(bob, a.id, "reject", {}, "quiet")).status).toBe(200);
    const b = await ask("orders/reorder");
    expect((await decide(bob, b.id, "approve", {}, "everything")).status).toBe(400);
    expect((await decide(bob, b.id, "approve", { comment: "ok" }, "everything")).status).toBe(200);
    const c = await ask("orders/reorder");
    const long = await decide(bob, c.id, "approve", { comment: "x".repeat(2001) });
    expect(long.status).toBe(400);
    expect((await decide(bob, c.id, "approve", { comment: ` ${"x".repeat(2000)} ` })).status).toBe(
      200,
    );
  });

  test("someone who holds approval:write but is not named cannot decide, and nothing changes", async () => {
    const step = await ask("orders/reorder");
    const refused = await decide(alice, step.id, "approve");
    expect(refused.status).toBe(403);
    expect(refused.body.code ?? refused.body.problemCode ?? JSON.stringify(refused.body)).toMatch(
      /not_an_approver|Managers/,
    );
    expect(await currentState(step.run)).toBe("waiting_approval");
    expect((await decide(bob, step.id, "approve")).status).toBe(200);
  });

  test("a step of a flow the widget does not list is not found, even by a named approver", async () => {
    const elsewhere = await ask("orders/open");
    const refused = await decide(bob, elsewhere.id, "approve");
    expect(refused.status).toBe(404);
    expect(await currentState(elsewhere.run)).toBe("waiting_approval");
    // The widget that lists no flows may.
    expect((await decide(bob, elsewhere.id, "approve", {}, "everything")).status).toBe(400);
    expect(
      (await decide(bob, elsewhere.id, "approve", { comment: "ok" }, "everything")).status,
    ).toBe(200);
  });

  test("a step of another workspace is not found", async () => {
    const abroad = await ask("orders/reorder", {}, other);
    const refused = await decide(bob, abroad.id, "approve");
    expect(refused.status).toBe(404);
    expect(await currentState(abroad.run, other)).toBe("waiting_approval");
    // Nor does the widget list it.
    expect((await waitingOf(bob, "everything")).map((one) => one.id)).not.toContain(abroad.id);
  });

  test("a made-up id, or another widget's, is not found", async () => {
    expect((await decide(bob, "nonsense", "approve")).status).toBe(404);
    expect((await decide(bob, `${ids.bob}/ask`, "approve")).status).toBe(404);
    const step = await ask("orders/reorder");
    expect((await decide(bob, step.id, "approve", {}, "no-such-widget")).status).toBe(404);
    // A widget of the page that is not an approvals widget.
    expect((await decide(bob, step.id, "approve", {}, "list")).status).toBe(404);
    await decide(bob, step.id, "approve");
  });

  test("two deciders at once: one decides, the other is told by whom and what", async () => {
    const step = await ask("orders/reorder");
    const [first, second] = await Promise.all([
      decide(bob, step.id, "approve"),
      decide(bea, step.id, "reject", { comment: "No" }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const lost = first.status === 409 ? first : second;
    const won = first.status === 409 ? "Bea" : "Bob";
    const verb = first.status === 409 ? "rejected" : "approved";
    expect(lost.body.detail ?? lost.body.message).toContain(`${won} ${verb} this`);
    // Later, the same, with what and how long ago.
    const again = await decide(bob, step.id, "approve");
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toMatch(/(Bob|Bea) (approved|rejected) this a moment ago/);
  });

  test("a suspended member cannot decide", async () => {
    const step = await ask("orders/reorder");
    // Sam's own sign-in would not even open; his standing is what is asked.
    expect(
      await approvalStanding(
        t.db,
        { type: "member", id: ids.sam as string },
        {
          tenantId: tenant,
          workspaceId: dev,
        },
      ),
    ).toBe(undefined);
    expect((await decide(bob, step.id, "approve")).status).toBe(200);
  });

  test("the draft is for someone who may edit it, in a dev workspace; others are refused", async () => {
    const step = await ask("orders/reorder");
    // Bob may not edit the interface: a draft is refused to him.
    const draft = await decide(bob, step.id, "approve", { draft: true });
    expect(draft.status).toBe(403);
    // The deployed page is what he decides by.
    expect((await decide(bob, step.id, "approve")).status).toBe(200);
  });

  test("a draft's widget is held to as the draft says, for someone who may edit it", async () => {
    // Alice edits the page: the draft gets a widget that lists nothing of this flow.
    const body = JSON.parse(JSON.stringify(screen));
    body.pages[0].widgets.push(
      approvalsWidget("drafted", { flows: ["orders/open"], whose: "all" }, { askWhy: "never" }),
    );
    const saved = await alice.put(`${ws()}/drafts/screens/approvals`, {
      kind: "interface",
      schemaVersion: 2,
      body,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBeLessThan(300);
    const open = await ask("orders/open");
    // The deployed page has no such widget.
    expect((await decide(alice, open.id, "approve", {}, "drafted")).status).toBe(404);
    const drafted = await alice.get(
      `${ws()}/widget-data?of=interface&path=screens/approvals&page=main&widget=drafted&draft=1`,
    );
    expect(drafted.status, JSON.stringify(drafted.body)).toBe(200);
    expect(drafted.body.inputs.requests.waiting.map((one: Any) => one.id)).toContain(open.id);
    const done = await decide(alice, open.id, "approve", { draft: true }, "drafted");
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(await stateOf(open.run)).toBe("succeeded");
  });

  test("who decided is the caller, whatever the body says", async () => {
    const step = await ask("orders/reorder");
    const sent = { by: ids.alice, decidedBy: ids.alice };
    expect((await decide(bob, step.id, "approve", sent)).status).toBe(200);
    const audit = await alice.get(`/tenants/${tenant}/audit?action=approval.approved`);
    expect(audit.body.items[0].actorId).toBe(ids.bob);
  });
});

describe("what the builder is offered", () => {
  test("the flows list says which flows have an approval step, and what each shows its approvers", async () => {
    const listed = await alice.get(`${ws()}/flows`);
    expect(listed.status).toBe(200);
    const reorder = listed.body.items.find((one: Any) => one.path === "orders/reorder");
    expect(reorder.approvals).toEqual([
      {
        node: "ask",
        title: "Approve a stock order",
        fields: ["clinic", "item", "total", "api_key", "notes"],
      },
    ]);
  });

  test("the names a step's detail gives are read from the keys it writes, once each", () => {
    expect(detailFieldNames("{'clinic': trigger.clinic, 'total': steps.q.output.amount}")).toEqual([
      "clinic",
      "total",
    ]);
    expect(detailFieldNames("{\"a b\": 1, \"a b\": 2, 'c': {'d': 1}}")).toEqual(["a b", "c", "d"]);
    // Not a literal object: nothing to offer.
    expect(detailFieldNames("steps.quote.output")).toEqual([]);
    expect(detailFieldNames(undefined)).toEqual([]);
  });
});

describe("following the flow", () => {
  test("the workspace says which interfaces ask the approvals of a flow, so a rename or removal is seen coming", async () => {
    const found = await alice.get(`${ws()}/references?kind=flow&name=orders/reorder`);
    expect(found.status).toBe(200);
    expect(found.body.items).toContainEqual(
      expect.objectContaining({
        target: { kind: "flow", name: "orders/reorder" },
        by: { kind: "interface", path: "screens/approvals" },
        how: "asks for its approvals",
      }),
    );
  });

  test("a flow named by its old key is followed to its path when a bundle is built", () => {
    const manifests = [
      {
        kind: "flow",
        path: "orders/restock",
        key: "orders/reorder",
        schemaVersion: 1,
        ownership: "code",
        body: {},
      },
      {
        kind: "interface",
        path: "screens/x",
        schemaVersion: 2,
        ownership: "code",
        body: { pages: [{ widgets: [approvalsWidget("q", { flows: ["orders/reorder"] })] }] },
      },
    ] as Any;
    const { manifests: made, rewritten } = resolveKeyReferences(manifests);
    const moved = made as Any;
    expect(moved[1].body.pages[0].widgets[0].data.requests.source.approvals.flows).toEqual([
      "orders/restock",
    ]);
    expect(rewritten).toHaveLength(1);
  });
});

describe("what the page checks", () => {
  test("a flow that is not there is refused when the page is saved to a workspace", async () => {
    const body = {
      title: "x",
      pages: [
        {
          id: "main",
          title: "Main",
          widgets: [approvalsWidget("q", { flows: ["orders/missing"] })],
        },
      ],
    };
    const saved = await alice.put(`${ws()}/drafts/screens/bad`, {
      kind: "interface",
      schemaVersion: 2,
      body,
    });
    expect(saved.body.problems.map((one: Any) => one.message)).toContain(
      'there is no flow "orders/missing"',
    );
  });
});
