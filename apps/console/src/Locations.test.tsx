// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DatabaseLocations } from "./screens/Environments.tsx";
import { Tenants } from "./screens/Tenants.tsx";
import { answer, show } from "./testing.tsx";

let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown) => unknown>;

const location = {
  name: "acme-db",
  description: "for Acme",
  host: "db.internal:5432",
  database: "acme",
  tenants: 1,
  reachable: true,
  problem: null,
};
const tenant = {
  id: "t1",
  slug: "acme",
  name: "Acme Corp",
  dataLocation: "acme-db",
  workspaceCount: 1,
  createdAt: "2026-11-11T00:00:00.000Z",
};
const operator = {
  principal: { type: "member", id: "m1", name: "Op", email: "op@example.com" },
  instancePermissions: ["tenant:*"],
  tenants: [],
};

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/v1/instance/database-locations": () => ({ items: [location] }),
    "GET /api/v1/instance/database-locations/names": () => ({
      items: [{ name: "acme-db", description: "for Acme" }],
    }),
    "GET /api/v1/tenants": () => ({ items: [tenant], nextCursor: null }),
  };
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const path = address.split("?")[0] as string;
    const handler = routes[`${method} ${path}`];
    return new Response(JSON.stringify(handler ? handler(body) : {}), {
      status: handler || method === "GET" ? 200 : 404,
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a location's description is edited without its address, and its tenants are listed (INS-MP9)", async () => {
  routes["PUT /api/v1/instance/database-locations/acme-db"] = () => ({});
  show(<DatabaseLocations />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const said = await answer("Edit location", "for Acme, the big one");
  expect(said).toContain("leave it empty to keep it");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      description: "for Acme, the big one",
    }),
  );
  // The inspector says where it is and which tenants keep their tables there.
  fireEvent.click(await screen.findByText("db.internal:5432", { exact: false }));
  const here = await screen.findByRole("region", { name: "Tenants here" });
  expect(await within(here).findByRole("link", { name: "Acme Corp" })).toBeTruthy();
  expect(calls.some((call) => call.url.includes("/tenants?dataLocation=acme-db"))).toBe(true);
});

test("the tenant list is narrowed to a location, and says so when none is there (INS-MP12)", async () => {
  history.replaceState(null, "", "/?location=acme-db");
  show(<Tenants me={operator} />);
  expect(await screen.findByText("Acme Corp")).toBeTruthy();
  expect(calls.some((call) => call.url.includes("/tenants?dataLocation=acme-db"))).toBe(true);
  expect(((await screen.findByLabelText("Tables kept in")) as HTMLSelectElement).value).toBe(
    "acme-db",
  );
  cleanup();
  routes["GET /api/v1/tenants"] = () => ({ items: [], nextCursor: null });
  show(<Tenants me={operator} />);
  expect(await screen.findByText("No tenant keeps its tables there")).toBeTruthy();
  const link = await screen.findByLabelText("Tables kept in");
  fireEvent.change(link, { target: { value: "" } });
  await waitFor(() => expect(location_search()).toBe(""));
});

const location_search = () => globalThis.location.search;

test("p31 fc: the Register database dialog says Volvel, never the platform", async () => {
  show(<DatabaseLocations />);
  fireEvent.click(await screen.findByRole("button", { name: "Register database" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Volvel connects first");
  expect(dialog.textContent).not.toMatch(/platform/i);
});
