// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Workers } from "./screens/Execution.tsx";
import { MembersAndAccess } from "./screens/Members.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { TenantOverview } from "./screens/TenantOverview.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
let routes: Record<string, (body: unknown) => unknown>;
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  routes = {};
  // A wide screen: the inspector stands beside the list.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    const answer = routes[`${method} ${path}`];
    const value = answer ? answer(body) : method === "GET" ? { items: [] } : {};
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the tenant's overview says what needs attention, and how each workspace stands", async () => {
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme" });
  routes[`GET ${base}/summary`] = () => ({
    workspaces: 2,
    approvalsWaiting: 2,
    approvalsWaitingMine: 1,
    domainsToFix: 0,
    workersOnline: 1,
    operatorAccessActive: null,
    members: 4,
  });
  routes[`GET ${base}/workspaces`] = () => ({
    items: [
      { id: "w1", slug: "main", name: "Main", type: "production", linkedWorkspaceId: null },
      { id: "w2", slug: "dev", name: "Dev", type: "dev", linkedWorkspaceId: "w1" },
    ],
  });
  routes[`GET ${base}/workspaces/w1/summary`] = () => ({
    drafts: 0,
    failedRuns: { count: 3, since: "" },
    version: 7,
  });
  routes[`GET ${base}/workspaces/w2/summary`] = () => ({
    drafts: 2,
    failedRuns: { count: 0, since: "" },
    version: null,
  });
  routes[`GET ${base}/audit`] = () => ({
    items: [
      {
        id: "a1",
        occurredAt: "2026-11-13T00:00:00Z",
        actorLabel: "ada@acme.test",
        actorType: "member",
        action: "secret.set",
      },
      {
        id: "a0",
        occurredAt: "2026-11-12T00:00:00Z",
        actorLabel: "ada@acme.test",
        actorType: "member",
        action: "member.recent_set",
      },
    ],
  });
  show(<TenantOverview base={base} tenantId="t1" />);
  expect(await screen.findByRole("heading", { name: "Acme" })).toBeTruthy();
  expect(await screen.findByText("1 approval waiting for you")).toBeTruthy();
  expect(screen.getByText(/1 more waits for someone else/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Decide" }).getAttribute("href")).toBe("/t/t1/approvals");
  expect(await screen.findByText("3 failed runs in 24 hours")).toBeTruthy();
  expect(await screen.findByText("2 drafts")).toBeTruthy();
  expect(screen.getByText(/Running v7/)).toBeTruthy();
  expect(screen.getByText(/Nothing deployed · promotes to Main/)).toBeTruthy();
  expect(await screen.findByText("Secret set")).toBeTruthy();
  // Moving between workspaces is not a change, even where an older entry says so.
  expect(screen.queryByTitle("member.recent_set")).toBeNull();
  expect(screen.getByTitle("secret.set")).toBeTruthy();
});

test("the tenant's overview says when every approval waits for someone else", async () => {
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme" });
  routes[`GET ${base}/summary`] = () => ({
    workspaces: 1,
    approvalsWaiting: 2,
    approvalsWaitingMine: 0,
    domainsToFix: 0,
    workersOnline: 1,
    operatorAccessActive: null,
    members: 4,
  });
  routes[`GET ${base}/workspaces`] = () => ({ items: [] });
  routes[`GET ${base}/audit`] = () => ({ items: [] });
  show(<TenantOverview base={base} tenantId="t1" />);
  expect(await screen.findByText("2 approvals waiting for someone else to decide")).toBeTruthy();
  expect(screen.getByRole("link", { name: "See who" }).getAttribute("href")).toBe(
    "/t/t1/approvals?show=others",
  );
  expect(screen.queryByRole("link", { name: "Decide" })).toBeNull();
});

const me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  tenants: [{ id: "t1", name: "Acme", slug: "acme" }],
  instancePermissions: [],
} as never;

test("an address with no page says so and offers the way back", async () => {
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme" });
  routes[`GET ${base}/workspaces/w1`] = () => ({
    id: "w1",
    slug: "main",
    name: "Main",
    type: "production",
    linkedWorkspaceId: null,
  });
  const { unmount } = show(<Tenant tenantId="t1" me={me} path="/t/t1/nope" />);
  expect(await screen.findByText("Nothing here")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Go to the tenant overview" }).getAttribute("href")).toBe(
    "/t/t1",
  );
  unmount();

  show(<Tenant tenantId="t1" me={me} path="/t/t1/workspaces/w1/nope" />);
  expect(await screen.findByText("Nothing here")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Go to the Main overview" }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/overview",
  );
});

test("a workspace named by its slug in the address opens, under its ID", async () => {
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme" });
  const refused = () =>
    new Response(JSON.stringify({ status: 400, detail: "The request params is not valid." }), {
      status: 400,
    });
  routes[`GET ${base}/workspaces/main`] = refused;
  routes[`GET ${base}/workspaces`] = () => ({
    items: [{ id: "w1", slug: "main", name: "Main", type: "production", linkedWorkspaceId: null }],
  });
  history.replaceState(null, "", "/t/t1/workspaces/main/runs?status=failed");
  const { unmount } = show(<Tenant tenantId="t1" me={me} path="/t/t1/workspaces/main/runs" />);
  await waitFor(() =>
    expect(location.pathname + location.search).toBe("/t/t1/workspaces/w1/runs?status=failed"),
  );
  unmount();

  // A slug no workspace has is no page.
  routes[`GET ${base}/workspaces/gone`] = refused;
  show(<Tenant tenantId="t1" me={me} path="/t/t1/workspaces/gone/runs" />);
  expect(await screen.findByText("Nothing here")).toBeTruthy();
});

test("Members & access keeps one tab per old address, and a member opens beside the list", async () => {
  routes[`GET ${base}/members`] = () => ({
    items: [{ id: "m1", name: "Ada", email: "ada@acme.test", createdAt: "2026-11-01T00:00:00Z" }],
  });
  routes[`GET ${base}/bindings`] = () => ({
    items: [
      {
        id: "b1",
        scopeType: "tenant",
        workspaceId: null,
        principalType: "member",
        principalId: "m1",
        principalLabel: "ada@acme.test",
        roleName: "tenant_admin",
        managedByResource: false,
      },
    ],
  });
  show(<MembersAndAccess base={base} tenantId="t1" tab="members" />);
  const tabs = screen.getByRole("navigation", { name: "Members and access" });
  expect(within(tabs).getByRole("link", { name: "Roles" }).getAttribute("href")).toBe(
    "/t/t1/roles",
  );
  expect(within(tabs).getByRole("link", { name: "Members" }).getAttribute("aria-current")).toBe(
    "page",
  );
  fireEvent.click(await screen.findByText("Ada"));
  const inspector = await screen.findByRole("complementary", { name: "Member" });
  expect(within(inspector).getByText("tenant_admin")).toBeTruthy();
  expect(within(inspector).getByRole("button", { name: "Suspend" })).toBeTruthy();
});

test("the access tab narrows by who holds the role", async () => {
  routes[`GET ${base}/bindings`] = () => ({
    items: [
      {
        id: "b1",
        scopeType: "tenant",
        workspaceId: null,
        principalType: "member",
        principalId: "m1",
        principalLabel: "ada@acme.test",
        roleName: "tenant_admin",
        managedByResource: false,
      },
      {
        id: "b2",
        scopeType: "tenant",
        workspaceId: null,
        principalType: "service_account",
        principalId: "s1",
        principalLabel: "ci",
        roleName: "developer",
        managedByResource: false,
      },
    ],
  });
  show(<MembersAndAccess base={base} tenantId="t1" tab="access" />);
  expect(await screen.findByText("ci")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: /^Members/ }));
  await waitFor(() => expect(screen.queryByText("ci")).toBeNull());
  expect(screen.getByText("ada@acme.test")).toBeTruthy();
});

test("a service account says what it is for, and it is changed in place", async () => {
  routes[`GET ${base}/service-accounts`] = () => ({
    items: [{ id: "s1", name: "ci", description: "", createdAt: "2026-11-01T00:00:00Z" }],
  });
  const me = {
    principal: { id: "m1", type: "member" },
    tenants: [{ id: "t1", name: "Acme", slug: "acme" }],
    instancePermissions: [],
  } as never;
  const { unmount } = show(<Tenant tenantId="t1" me={me} path="/t/t1/service-accounts" />);
  expect(await screen.findByText("Not said")).toBeTruthy();
  // The account's name leads to its own page, where everything about it is.
  expect(screen.getByRole("link", { name: "ci" }).getAttribute("href")).toBe(
    "/t/t1/service-accounts/s1",
  );
  unmount();
  show(<Tenant tenantId="t1" me={me} path="/t/t1/service-accounts/s1" />);
  for (const tab of ["Identity", "Keys", "Access", "Agent tools"]) {
    expect(await screen.findByRole("tab", { name: tab })).toBeTruthy();
  }
  fireEvent.change(await screen.findByLabelText("What it is for"), {
    target: { value: "Deploys from CI" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")).toEqual({
      method: "PATCH",
      url: `/api/v1${base}/service-accounts/s1`,
      body: { description: "Deploys from CI" },
    }),
  );
});

test("access is given starting from the person, found by name on the server, with a role of where", async () => {
  routes[`GET ${base}/principals`] = () => ({
    items: [{ type: "member", id: "m7", label: "bob@acme.test", detail: "Bob Ray" }],
  });
  routes[`GET ${base}/workspaces`] = () => ({ items: [{ id: "w1", name: "Orders dev" }] });
  routes[`GET ${base}/roles`] = () => ({
    items: [
      { id: "r1", name: "tenant_viewer", workspaceId: null },
      { id: "r2", name: "orders_operator", workspaceId: "w1" },
    ],
  });
  const { GiveAccess } = await import("./screens/GiveAccess.tsx");
  const given = vi.fn();
  show(<GiveAccess base={base} open onClose={() => {}} onGiven={given} />);
  const who = await screen.findByLabelText("Who");
  // The people offered come from the server's search (typing is walked in a browser, in e2e).
  await waitFor(() =>
    expect(calls.some((call) => call.url.includes(`${base}/principals?limit=10`))).toBe(true),
  );
  fireEvent.click(who);
  fireEvent.keyDown(who, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /bob@acme\.test/ }));
  // A role defined in a workspace is offered only once that workspace is chosen.
  expect(screen.queryByRole("option", { name: /orders_operator/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("Where"), { target: { value: "w1" } });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "r2" } });
  fireEvent.click(screen.getByRole("button", { name: "Give access" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      principalType: "member",
      principalId: "m7",
      roleId: "r2",
      workspaceId: "w1",
    }),
  );
  await waitFor(() => expect(given).toHaveBeenCalled());
});

test("a tenant whose workers the instance starts is not told that no worker is online (SHL-10)", async () => {
  const summary = (online: number) => ({
    workspaces: 1,
    approvalsWaiting: 0,
    domainsToFix: 0,
    workersOnline: online,
    operatorAccessActive: null,
    members: 1,
  });
  routes[`GET ${base}/summary`] = () => summary(0);
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme", managedWorkers: true });
  const view = show(<TenantOverview base={base} tenantId="t1" />);
  await screen.findByText("Nothing needs you");
  expect(screen.queryByText("No worker is online")).toBeNull();
  view.unmount();
  // Without managed workers, none online is a fault, as it was.
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme", managedWorkers: false });
  show(<TenantOverview base={base} tenantId="t1" />);
  await screen.findByText("No worker is online");
});

test("Rename is offered on the overview only to someone who may rename the tenant (SHL-11)", async () => {
  routes[`GET ${base}/summary`] = () => ({ workspaces: 0, approvalsWaiting: 0, domainsToFix: 0 });
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme", mayRename: false });
  const view = show(<TenantOverview base={base} tenantId="t1" />);
  await screen.findByRole("heading", { name: "Acme" });
  expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  view.unmount();
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme", mayRename: true });
  show(<TenantOverview base={base} tenantId="t1" />);
  await screen.findByRole("button", { name: "Rename" });
});

test("WLK-03: when the counts are refused, the attention panel says so and does not shimmer for ever", async () => {
  routes[`GET ${base}/summary`] = () =>
    new Response(JSON.stringify({ status: 403, code: "forbidden", detail: "Not yours to read." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme" });
  routes[`GET ${base}/workspaces`] = () => ({ items: [] });
  routes[`GET ${base}/audit`] = () => ({ items: [] });
  show(<TenantOverview base={base} tenantId="t1" />);
  await screen.findByText(/Not yours to read/);
  await screen.findByText("No workspaces yet.");
  const section = screen.getByText("Needs attention").closest("section") as HTMLElement;
  expect(section.querySelector("[aria-busy='true'], [role='status']")).toBeNull();
  expect(within(section).queryByText(/Loading/i)).toBeNull();
});

test("the workspaces list names where a clone promotes to, and Create offers every workspace (REL-13)", async () => {
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme" });
  routes[`GET ${base}/workspaces`] = () => ({
    items: [
      { id: "w1", slug: "main", name: "Main", type: "production", linkedWorkspaceId: null },
      { id: "w2", slug: "dev", name: "Dev", type: "dev", linkedWorkspaceId: "w1" },
      { id: "w3", slug: "copy", name: "Dev copy", type: "dev", linkedWorkspaceId: "w2" },
    ],
  });
  show(<Tenant tenantId="t1" me={me} path="/t/t1/workspaces" />);
  const row = (await screen.findByRole("link", { name: "Dev copy" })).closest("tr") as HTMLElement;
  const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent);
  expect(cells.at(-1)).toBe("Dev");
  fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
  const promotes = (await screen.findByLabelText("Promotes to")) as HTMLSelectElement;
  expect([...promotes.options].map((option) => option.textContent)).toEqual([
    "Nothing",
    "Main (production)",
    "Dev (dev)",
    "Dev copy (dev)",
  ]);
});

const operatorMe = {
  principal: { type: "member", id: "m9", name: "Olga", email: "olga@ops.example" },
  instancePermissions: ["tenant:*"],
  tenants: [],
};
const grantFor = (expiresAt: string) => ({
  id: "g1",
  memberId: "m9",
  memberEmail: "olga@ops.example",
  roleName: "tenant_admin",
  reason: "Ticket 1042",
  createdAt: "2026-11-22T10:00:00.000Z",
  expiresAt,
  active: true,
});

test("operator access that ends while the screen is open is read again, and the screen says so (INS-26)", async () => {
  let reads = 0;
  routes[`GET ${base}/access-grants`] = () => {
    reads += 1;
    // The second read is after the grant ended: the server no longer lists it as active.
    return {
      items: reads === 1 ? [grantFor(new Date(Date.now() + 1200).toISOString())] : [],
    };
  };
  routes[`GET ${base}/summary`] = () => ({ workspaces: 0, members: 0 });
  show(<Tenant tenantId="t1" me={operatorMe} path="/t/t1" />);
  await waitFor(() => expect(reads).toBe(1));
  await screen.findByRole(
    "heading",
    { name: "You have no access to this tenant" },
    { timeout: 4000 },
  );
  expect(reads).toBe(2);
});

test("a failed read of the access grants is said as that, not as having no access (INS-26)", async () => {
  routes[`GET ${base}/access-grants`] = () =>
    new Response(JSON.stringify({ status: 500, detail: "The database is not answering." }), {
      status: 500,
    });
  show(<Tenant tenantId="t1" me={operatorMe} path="/t/t1" />);
  await screen.findByText(/The database is not answering/);
  expect(screen.queryByText("You have no access to this tenant")).toBeNull();
});

test("Workers does not offer a tenant admin the switch an operator turned off (D16)", async () => {
  routes[`GET ${base}`] = () => ({ managedWorkers: false, managedWorkersLocked: true });
  routes[`GET ${base}/managed-workers`] = () => ({ state: "off" });
  routes[`GET ${base}/worker-pools`] = () => ({ items: [] });
  show(<Workers base={base} />);
  await screen.findByText("An operator turned this off. Only an operator can turn it on again.");
  expect(screen.queryByRole("button", { name: "Let the instance run workers" })).toBeNull();
});

test("an operator turns workers off for a tenant and reads its retention from the list, with no grant (INS-MP7)", async () => {
  const row = {
    id: "t1",
    slug: "acme",
    name: "Acme",
    dataLocation: null,
    workspaceCount: 2,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  let on = true;
  routes["GET /tenants"] = () => ({ items: [row], nextCursor: null });
  routes[`GET ${base}`] = () => ({ ...row, managedWorkers: on, managedWorkersLocked: !on });
  routes[`PATCH ${base}`] = (body) => {
    on = (body as { managedWorkers: boolean }).managedWorkers;
    return {};
  };
  routes[`GET ${base}/retention`] = () => ({
    effective: { runsDays: 30, eventsDays: 14, refusalsDays: 7, auditDays: 400 },
  });
  const { Tenants } = await import("./screens/Tenants.tsx");
  show(<Tenants me={operatorMe} />);
  const inspector = async () =>
    screen.findByRole("region", { name: "Workers the instance starts" });
  fireEvent.click((await screen.findAllByText("acme")).at(-1) as HTMLElement);
  const workers = await inspector();
  await within(workers).findByText(/starts workers for this tenant when it has work/);
  fireEvent.click(within(workers).getByRole("button", { name: "Start no workers for it" }));
  await waitFor(() =>
    expect(calls.some((c) => c.method === "PATCH" && c.url.endsWith(base))).toBe(true),
  );
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ managedWorkers: false });
  await within(await inspector()).findByText(/An operator turned this off/);
  const history = screen.getByRole("region", { name: "History kept" });
  await within(history).findByText(/Runs 30 days, events 14, refused requests 7, audit log 400/);
  expect(await within(history).findByRole("button", { name: "Change how long" })).toBeTruthy();
});
