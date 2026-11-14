// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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
    ],
  });
  show(<TenantOverview base={base} tenantId="t1" />);
  expect(await screen.findByRole("heading", { name: "Acme" })).toBeTruthy();
  expect(await screen.findByText("2 approvals waiting")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Decide" }).getAttribute("href")).toBe("/t/t1/approvals");
  expect(await screen.findByText("3 failed runs today")).toBeTruthy();
  expect(await screen.findByText("2 drafts")).toBeTruthy();
  expect(screen.getByText(/Running v7/)).toBeTruthy();
  expect(screen.getByText(/Nothing deployed · promotes to Main/)).toBeTruthy();
  expect(await screen.findByText("Secret set")).toBeTruthy();
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
  show(<Tenant tenantId="t1" me={me} path="/t/t1/service-accounts" />);
  expect(await screen.findByText("Not said")).toBeTruthy();
  fireEvent.click(screen.getByText("ci"));
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
