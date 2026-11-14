// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { allows, Roles, toggle } from "./screens/Roles.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
const kind = (name: string, group: string, verbs: ("read" | "write")[] = ["read", "write"]) => ({
  kind: name,
  label: name,
  group,
  scope: "workspace" as const,
  appFacing: name === "data",
  verbs: verbs.map((verb) => ({ verb, permission: `${name}:${verb}`, description: `${verb}s it` })),
});
const kinds = [
  kind("secret", "Workspace"),
  kind("data", "Data"),
  kind("audit", "Tenant", ["read"]),
];
const role = (over: object) => ({
  id: "r1",
  name: "keeper",
  description: "Keeps secrets",
  permissions: ["secret:*", "legacy:read"],
  builtin: false,
  workspaceId: null,
  managedByResource: false,
  ...over,
});

let calls: { method: string; url: string; body: unknown }[];
let roles: ReturnType<typeof role>[];

beforeEach(() => {
  calls = [];
  roles = [role({}), role({ id: "r2", name: "viewer", permissions: ["*:read"], builtin: true })];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (address === "/api/v1/permissions") return json(200, { items: kinds });
    if (method === "GET") return json(200, { items: roles });
    return json(200, {});
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a box reads through wildcards, and taking one away writes the wildcard out", () => {
  expect(allows(["*:read"], "secret", "read")).toBe(true);
  expect(allows(["secret:*"], "secret", "write")).toBe(true);
  expect(allows(["secret:read"], "secret", "write")).toBe(false);
  expect(toggle(["secret:*"], kinds, "secret", "write", false)).toEqual(["secret:read"]);
  expect(toggle(["*:read"], kinds, "data", "read", false).sort()).toEqual([
    "audit:read",
    "secret:read",
  ]);
  expect(toggle(["secret:read"], kinds, "secret", "write", true)).toEqual([
    "secret:read",
    "secret:write",
  ]);
  // Already allowed by a wildcard: nothing is added.
  expect(toggle(["*:*"], kinds, "data", "read", true)).toEqual(["*:*"]);
});

test("a role is created by ticking boxes, with no permission typed", async () => {
  show(<Roles base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create role" }));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "reader" } });
  const create = screen.getAllByRole("button", { name: "Create role" }).at(-1) as HTMLButtonElement;
  expect(create.disabled).toBe(true);
  // A kind with nothing to change offers no box for it.
  expect(screen.queryByLabelText("audit:write")).toBeNull();
  fireEvent.click(screen.getByLabelText("data:read"));
  fireEvent.click(screen.getByLabelText("secret:read"));
  fireEvent.click(screen.getByLabelText("secret:write"));
  fireEvent.click(screen.getByLabelText("secret:write"));
  fireEvent.click(create);
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "reader",
      description: "",
      permissions: ["data:read", "secret:read"],
    }),
  );
});

test("an existing role is changed, keeps what the list does not know, and a built-in one is read-only", async () => {
  // A wide screen: the inspector stands beside the list.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  show(<Roles base={base} />);
  fireEvent.click(await screen.findByText("keeper"));
  // The inspector says what the role allows in short, before anything is opened.
  expect(await screen.findByText("In short")).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Change" }));
  expect(((await screen.findByLabelText("secret:write")) as HTMLInputElement).checked).toBe(true);
  expect(within(screen.getByRole("dialog")).getByText("legacy:read")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("data:read"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({
      description: "Keeps secrets",
      permissions: ["secret:*", "legacy:read", "data:read"],
    }),
  );
  expect(calls.find((call) => call.method === "PATCH")?.url).toBe(`/api/v1${base}/roles/r1`);

  fireEvent.click(await screen.findByText("viewer"));
  fireEvent.click(await screen.findByRole("button", { name: "View" }));
  expect(((await screen.findByLabelText("data:read")) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.getByText(/A built-in role cannot be changed/)).toBeTruthy();
});
