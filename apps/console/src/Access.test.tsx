// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EffectiveAccess } from "./screens/Access.tsx";
import { AccessList } from "./screens/Members.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
const report = {
  principal: {
    type: "member",
    id: "m2",
    name: "dave",
    email: "dave@acme.example",
    suspended: false,
    groups: [{ id: "g1", name: "Engineers" }],
  },
  sources: [
    {
      source: "binding",
      id: "b1",
      role: { id: "r1", name: "developer", permissions: ["*:read"] },
      scope: { type: "tenant" },
      through: { type: "direct" },
      expiresAt: null,
      counts: true,
    },
    {
      source: "binding",
      id: "b2",
      role: { id: "r2", name: "deployer", permissions: ["deployment:*"] },
      scope: { type: "workspace", workspaceId: "w1", workspaceName: "Dev" },
      through: { type: "group", id: "g1", name: "Engineers" },
      expiresAt: null,
      counts: true,
    },
  ],
  permissions: [
    {
      permission: "secret:read",
      kind: "secret",
      verb: "read",
      label: "Secrets",
      meaning: "See which secrets a workspace has.",
      group: "Workspace",
      sources: ["b1"],
    },
    {
      permission: "deployment:write",
      kind: "deployment",
      verb: "write",
      label: "Deployments",
      meaning: "Deploy and roll back.",
      group: "Code and runs",
      sources: ["b2"],
    },
  ],
};

beforeEach(() => {
  history.replaceState(null, "", "/t/t1/access");
  vi.stubGlobal("fetch", async (address: string) => {
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (address.includes("/access/member/m2")) return json(report);
    if (address.endsWith("/bindings")) {
      return json({
        items: [
          {
            id: "b1",
            scopeType: "tenant",
            workspaceId: null,
            resourceId: null,
            principalType: "member",
            principalId: "m2",
            principalLabel: "dave@acme.example",
            roleId: "r1",
            roleName: "developer",
            managedByResource: false,
            createdAt: "2026-11-01T00:00:00Z",
          },
          {
            id: "b2",
            scopeType: "workspace",
            workspaceId: "w1",
            resourceId: null,
            principalType: "group",
            principalId: "g1",
            principalLabel: "Engineers",
            roleId: "r2",
            roleName: "deployer",
            managedByResource: false,
            createdAt: "2026-11-01T00:00:00Z",
          },
        ],
      });
    }
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("each permission says where it is held and what gives it, and links to the binding", async () => {
  show(<EffectiveAccess base={base} tenantId="t1" principalType="member" id="m2" />);
  expect(await screen.findByText("Deployments: write")).toBeTruthy();
  expect(screen.getByText("Code and runs")).toBeTruthy();
  const deployer = screen.getAllByRole("link", { name: "deployer" });
  expect(deployer[0]?.getAttribute("href")).toBe("/t/t1/access?binding=b2");
  expect(screen.getAllByText(/through the group/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("· Dev workspace").length).toBeGreaterThan(0);
  // Checking one permission.
  fireEvent.change(screen.getByLabelText("Find or check a permission"), {
    target: { value: "promotion:write" },
  });
  expect(screen.getByRole("status").textContent).toMatch(/^No.*does not hold promotion:write/);
  fireEvent.change(screen.getByLabelText("Find or check a permission"), {
    target: { value: "deployment:write" },
  });
  expect(screen.getByRole("status").textContent).toMatch(/^Yes.*only in: Dev workspace\./);
  expect(screen.queryByText("Secrets: read")).toBeNull();
});

test("the access list shows the binding a link names, marked, whatever was filtered", async () => {
  history.replaceState(null, "", "/t/t1/access?binding=b2");
  show(<AccessList base={base} />);
  await screen.findByText("Engineers");
  await waitFor(() =>
    expect(document.querySelector('[data-row="b2"]')?.getAttribute("aria-selected")).toBe("true"),
  );
  expect(document.querySelector('[data-row="b1"]')?.getAttribute("aria-current")).toBeNull();
});
