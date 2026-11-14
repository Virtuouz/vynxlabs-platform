// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { monogram } from "./kit/brand.tsx";
import { whereIs } from "./nav.ts";
import { Shell } from "./Shell.tsx";
import { show } from "./testing.tsx";
import { applyThemeChoice } from "./theme.ts";

const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};
const operator: Me = { ...me, instancePermissions: ["tenant:*"] };

const answers: Record<string, unknown> = {};

beforeEach(() => {
  answers["/api/v1/tenants/t1/workspaces"] = {
    items: [
      { id: "w1", name: "Main", slug: "main", type: "production" },
      { id: "w2", name: "Sandbox", slug: "sandbox", type: "dev", linkedWorkspaceId: "w1" },
    ],
  };
  answers["/api/v1/tenants/t1/summary"] = {
    workspaces: 2,
    approvalsWaiting: 1,
    domainsToFix: 0,
    workersOnline: 0,
    operatorAccessActive: null,
    members: 4,
  };
  answers["/api/v1/tenants/t1/workspaces/w2/summary"] = {
    drafts: 3,
    failedRuns: { count: 4, since: "2026-11-13T00:00:00.000Z" },
    unboundConnections: 1,
    approvalsWaiting: 0,
    git: null,
    version: 14,
    linked: { id: "w1", name: "Main", type: "production", version: 13, same: false },
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = answers[url];
    return body === undefined
      ? new Response(JSON.stringify({ title: "Not found" }), { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const linksIn = (name: string) =>
  [...screen.getByRole("navigation", { name }).querySelectorAll("a")].map(
    (link) => link.textContent,
  );

test("an address says which area and screen it is, and whether it is an editor", () => {
  expect(whereIs("/t/t1/workspaces/w1/flow-runs/r1", false)).toMatchObject({
    area: "operate",
    section: "runs",
    editor: false,
  });
  expect(whereIs("/t/t1/workspaces/w1/flows/edit/orders/handle", false)).toMatchObject({
    area: "build",
    section: "flows",
    editor: true,
  });
  expect(whereIs("/t/t1/roles", false)).toMatchObject({ area: "tenant", section: "roles" });
  expect(whereIs("/", true).area).toBe("instance");
  expect(whereIs("/", false).area).toBe("tenants");
  expect(whereIs("/account/api-keys", false).area).toBe("account");
});

test("in a tenant the sections are the tenant's, the open one is marked, and counts show", async () => {
  show(
    <Shell me={me} path="/t/t1/roles" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  const sections = screen.getByRole("navigation", { name: "Sections" });
  expect(linksIn("Sections")).toContain("Roles");
  expect(linksIn("Sections")).not.toContain("Flows");
  // A member who is not an operator is not shown the instance.
  expect(linksIn("Main")).not.toContain("Instance");
  expect(within(sections).getByRole("link", { name: "Roles" }).getAttribute("aria-current")).toBe(
    "page",
  );
  const where = screen.getByRole("navigation", { name: "Where you are" }).textContent ?? "";
  expect(where).toContain("Acme");
  expect(where).toContain("/Roles");
  // The tenant's counts arrive with its summary; one the person may not read is left out.
  expect(await within(sections).findByText("1")).toBeTruthy();
  expect(within(sections).queryByText(/active/)).toBeNull();
});

test("in a workspace the rail shows its areas, a flow run counts as a run, and the header says what needs attention", async () => {
  show(
    <Shell me={me} path="/t/t1/workspaces/w2/flow-runs/r1" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  expect(linksIn("Main")).toEqual(
    expect.arrayContaining(["Overview", "Build", "Operate", "Data", "Configure", "Tenant"]),
  );
  const sections = screen.getByRole("navigation", { name: "Sections" });
  expect(within(sections).getByRole("link", { name: /^Runs/ }).getAttribute("aria-current")).toBe(
    "page",
  );
  expect(await within(sections).findByText("4 failed")).toBeTruthy();
  expect(await screen.findByRole("link", { name: "4 failed runs" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /3 drafts\s*Review/ })).toBeTruthy();
  // The workspace's name and type arrive with the list of workspaces.
  expect(await screen.findByText("Dev")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Switch workspace" }).textContent).toBe("Sandbox");
  expect(await screen.findByText(/promotes to/)).toBeTruthy();
  // The release path: what is drafted, what runs here and what runs where it promotes.
  expect(await within(sections).findByText("v14")).toBeTruthy();
  expect(within(sections).getByText(/differs/)).toBeTruthy();
});

test("an operator sees the instance, and the console's own branding screens", () => {
  show(
    <Shell me={operator} path="/instance/branding" tenantId={undefined} onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  expect(linksIn("Main")).toContain("Instance");
  expect(linksIn("Sections")).toEqual(
    expect.arrayContaining(["All tenants", "Operators", "Console branding", "Component kit"]),
  );
  expect(screen.getByRole("navigation", { name: "Where you are" }).textContent).toContain(
    "Console branding",
  );
});

test("Ctrl+K opens a palette that finds a screen by part of its name and goes there", async () => {
  show(
    <Shell me={me} path="/t/t1/workspaces/w2/runs" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const search = await screen.findByRole("combobox", {
    name: "Search screens, tenants and workspaces",
  });
  fireEvent.change(search, { target: { value: "secr" } });
  const options = await screen.findAllByRole("option");
  expect(options[0]?.textContent).toContain("Secrets");
  fireEvent.keyDown(search, { key: "Enter" });
  expect(location.pathname).toBe("/t/t1/workspaces/w2/secrets");
});

test("a chosen theme is put on the page and remembered, and the system's is the default", async () => {
  show(
    <Shell me={me} path="/" tenantId={undefined} onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  expect(document.documentElement.dataset.theme).toBeUndefined();
  fireEvent.click(screen.getAllByRole("button", { name: "Colour theme" })[0] as HTMLElement);
  fireEvent.click(await screen.findByText("Dark"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("vx-theme")).toBe("dark");

  delete document.documentElement.dataset.theme;
  applyThemeChoice();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("without a logo the mark is the name's initials", () => {
  expect(monogram("Vynxlabs")).toBe("vy");
  expect(monogram("Northwind Ops")).toBe("no");
});
