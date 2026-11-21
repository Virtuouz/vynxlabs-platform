// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { monogram } from "./kit/brand.tsx";
import { whereIs } from "./nav.ts";
import { navigate } from "./router.tsx";
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
  // A table's own screen fills the window; the list of tables is a page.
  expect(whereIs("/t/t1/workspaces/w1/tables/orders", false).workbench).toBe(true);
  expect(whereIs("/t/t1/workspaces/w1/tables", false).workbench).toBe(false);
  expect(whereIs("/t/t1/roles", false)).toMatchObject({ area: "tenant", section: "members" });
  expect(whereIs("/t/t1", false)).toMatchObject({ area: "tenant", section: "overview" });
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
  // Roles is a tab of Members & access, which is marked as the open section.
  expect(linksIn("Sections").some((name) => name.startsWith("Members & access"))).toBe(true);
  expect(linksIn("Sections")).not.toContain("Roles");
  expect(linksIn("Sections")).not.toContain("Flows");
  // A member who is not an operator is not shown the instance.
  expect(linksIn("Main")).not.toContain("Instance");
  expect(
    within(sections)
      .getByRole("link", { name: /^Members & access/ })
      .getAttribute("aria-current"),
  ).toBe("page");
  const where = screen.getByRole("navigation", { name: "Where you are" }).textContent ?? "";
  expect(where).toContain("Acme");
  // The section is shown, and marked as the page the person is on.
  const crumb = within(screen.getByRole("navigation", { name: "Where you are" })).getByText(
    "Members & access",
  );
  expect(crumb.getAttribute("aria-current")).toBe("page");
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
  // Overview is one screen and Tenant is another place: links. An area with several
  // sections is a button that shows them.
  expect(linksIn("Main")).toEqual(expect.arrayContaining(["Overview", "Tenant"]));
  const main = screen.getByRole("navigation", { name: "Main" });
  for (const area of ["Build", "Operate", "Data", "Configure"]) {
    expect(within(main).getByRole("button", { name: area })).toBeTruthy();
  }
  expect(within(main).getByRole("button", { name: "Operate" }).getAttribute("aria-current")).toBe(
    "true",
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
  // The workspace's name is the whole of the button that changes which one: no small target.
  const crumbs = screen.getByRole("navigation", { name: "Where you are" });
  expect(within(crumbs).queryByRole("link", { name: "Sandbox" })).toBeNull();
  expect(within(crumbs).getByRole("button", { name: "Switch workspace" }).textContent).toContain(
    "Sandbox",
  );
  expect(within(crumbs).getByRole("link", { name: "Acme" }).getAttribute("href")).toBe("/t/t1");
  expect(screen.getByRole("button", { name: "Switch workspace" })).toBeTruthy();
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
    name: /Find anything/,
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
  fireEvent.click(screen.getAllByRole("button", { name: "Color theme" })[0] as HTMLElement);
  fireEvent.click(await screen.findByText("Dark"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  // Kept with the member's settings: here at once, and on the server after a moment.
  expect(localStorage.getItem("vx-pref:theme")).toBe('"dark"');

  delete document.documentElement.dataset.theme;
  applyThemeChoice();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("without a logo the mark is the name's initials", () => {
  expect(monogram("Volvel")).toBe("vo");
  expect(monogram("Northwind Ops")).toBe("no");
});

test("each page's tab title says what is open, the section, the workspace and the product", async () => {
  const at = (path: string) => (
    <Shell me={me} path={path} tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>
  );
  const { rerender } = show(at("/t/t1/workspaces/w2/runs"));
  await waitFor(() => expect(document.title).toBe("Runs · Sandbox · Volvel"));
  rerender(at("/t/t1/workspaces/w2/scripts/edit/orders/sync"));
  await waitFor(() => expect(document.title).toBe("orders/sync · Scripts · Sandbox · Volvel"));
  rerender(at("/t/t1/workspaces/w2/scripts/new"));
  await waitFor(() => expect(document.title).toBe("New script · Scripts · Sandbox · Volvel"));
  rerender(at("/t/t1/roles"));
  await waitFor(() => expect(document.title).toBe("Members & access · Acme · Volvel"));
  rerender(
    <Shell me={operator} path="/instance/branding" tenantId={undefined} onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  await waitFor(() => expect(document.title).toBe("Console branding · Volvel"));
});

test("the first tab stop skips to the content, and a new page takes focus to its heading", async () => {
  const at = (path: string, heading: string) => (
    <Shell me={me} path={path} tenantId="t1" onSignOut={() => {}}>
      <h1>{heading}</h1>
      <input aria-label="Filter" />
    </Shell>
  );
  history.replaceState(null, "", "/t/t1/workspaces/w2/runs");
  const { rerender } = show(at("/t/t1/workspaces/w2/runs", "Runs page"));
  const skip = screen.getByRole("link", { name: "Skip to content" });
  // Nothing that can take focus comes before it.
  const focusable = document.querySelectorAll("a[href], button, input, [tabindex='0']");
  expect(focusable[0]).toBe(skip);
  expect(skip.getAttribute("href")).toBe("#main");
  expect(document.getElementById("main")?.tagName).toBe("MAIN");
  // The first page leaves focus where the browser put it.
  expect(document.activeElement).toBe(document.body);

  navigate("/t/t1/workspaces/w2/flows");
  rerender(at("/t/t1/workspaces/w2/flows", "Flows page"));
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Flows page"));

  // The same page refining its address keeps focus where it is.
  screen.getByLabelText("Filter").focus();
  navigate("/t/t1/workspaces/w2/flows/new", { replace: true });
  rerender(at("/t/t1/workspaces/w2/flows/new", "Flows page"));
  await new Promise((done) => requestAnimationFrame(() => done(undefined)));
  expect(document.activeElement).toBe(screen.getByLabelText("Filter"));
});

test("pressing an area of the rail shows its sections and goes nowhere", () => {
  history.replaceState(null, "", "/t/t1/workspaces/w2/runs");
  show(
    <Shell me={me} path="/t/t1/workspaces/w2/runs" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  const main = screen.getByRole("navigation", { name: "Main" });
  const data = within(main).getByRole("button", { name: "Data" });
  expect(data.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(data);
  // Data's sections, and the page is still the runs.
  expect(data.getAttribute("aria-expanded")).toBe("true");
  expect(location.pathname).toBe("/t/t1/workspaces/w2/runs");
  expect(linksIn("Sections")).toEqual(expect.arrayContaining(["Tables", "Dashboards"]));
  expect(linksIn("Sections").some((name) => name.startsWith("Runs"))).toBe(false);
  // Operate is still where the person is.
  expect(within(main).getByRole("button", { name: "Operate" }).getAttribute("aria-current")).toBe(
    "true",
  );
  const dashboards = within(screen.getByRole("navigation", { name: "Sections" })).getByRole(
    "link",
    { name: "Dashboards" },
  );
  expect(dashboards.getAttribute("href")).toBe("/t/t1/workspaces/w2/dashboards");
  // Pressed again it puts them away, and the sections are where the person is again.
  fireEvent.click(data);
  expect(linksIn("Sections").some((name) => name.startsWith("Runs"))).toBe(true);
});

test("inside anything an editor has open, the section before it is a link back to its list", () => {
  // One address for each kind of editor the console has (`EDITORS` in nav.ts).
  const open: [path: string, section: string, list: string][] = [
    ["flows/edit/orders/handle", "Flows", "flows"],
    ["flows/new", "Flows", "flows"],
    ["scripts/edit/orders/check", "Scripts", "scripts"],
    ["screens/home", "App Builder", "screens"],
    ["extensions/mailer/new", "Extensions", "extensions"],
    ["resources/edit/table/loans", "All resources", "resources"],
    ["dashboards/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee", "Dashboards", "dashboards"],
  ];
  for (const [path, section, list] of open) {
    const at = `/t/t1/workspaces/w2/${path}`;
    expect(whereIs(at, false).editor, at).toBe(true);
    show(
      <Shell me={me} path={at} tenantId="t1" onSignOut={() => {}}>
        <p>Screen</p>
      </Shell>,
    );
    const crumbs = screen.getByRole("navigation", { name: "Where you are" });
    const back = within(crumbs).getByRole("link", { name: section });
    expect(back.getAttribute("href"), at).toBe(`/t/t1/workspaces/w2/${list}`);
    // And on a phone, where there is no room for the section, a way back in its place.
    expect(
      within(crumbs)
        .getByRole("link", { name: `Back to ${section}` })
        .getAttribute("href"),
    ).toBe(`/t/t1/workspaces/w2/${list}`);
    cleanup();
  }
});
