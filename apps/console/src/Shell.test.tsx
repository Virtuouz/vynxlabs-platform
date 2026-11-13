// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { Shell } from "./Shell.tsx";
import { show } from "./testing.tsx";
import { applyThemeChoice } from "./theme.ts";

const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          items: [
            { id: "w1", name: "Main", slug: "main", type: "production" },
            { id: "w2", name: "Sandbox", slug: "sandbox", type: "dev" },
          ],
        }),
        { status: 200 },
      ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const links = () =>
  [...screen.getByRole("navigation", { name: "Main" }).querySelectorAll("a")].map(
    (link) => link.textContent,
  );

test("in a tenant the sidebar lists the tenant's screens, and marks the open one", () => {
  show(
    <Shell me={me} path="/t/t1/roles" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  expect(links()).toContain("Roles");
  expect(links()).not.toContain("Flows");
  // A member who is not an operator is not shown the instance's screens.
  expect(links()).not.toContain("Operators");
  expect(screen.getByRole("link", { name: "Roles" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("navigation", { name: "Where you are" }).textContent).toBe("Acme/Roles");
});

test("in a workspace the sidebar lists the workspace's screens, and a flow run counts as Flows", async () => {
  show(
    <Shell me={me} path="/t/t1/workspaces/w1/flow-runs/r1" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  expect(links()).toEqual(
    expect.arrayContaining(["Flows", "Scripts", "Runs", "Tables", "Secrets"]),
  );
  expect(links()).not.toContain("Roles");
  expect(screen.getByRole("link", { name: "Flows" }).getAttribute("aria-current")).toBe("page");
  // The workspace's name and type arrive with the list of workspaces.
  expect(await screen.findByText("Production")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Switch workspace" }).textContent).toBe("Main");
});

test("a chosen theme is put on the page and remembered, and the system's is the default", async () => {
  show(
    <Shell me={me} path="/" tenantId={undefined} onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  expect(document.documentElement.dataset.theme).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Colour theme" }));
  fireEvent.click(await screen.findByText("Dark"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("vx-theme")).toBe("dark");

  delete document.documentElement.dataset.theme;
  applyThemeChoice();
  expect(document.documentElement.dataset.theme).toBe("dark");
});
