// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { usePath } from "./router.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 10_000 });

const base = "/tenants/t1/workspaces/w1";
const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};
let routes: Record<string, (body: unknown) => unknown>;
let calls: { method: string; url: string }[];

beforeEach(() => {
  calls = [];
  routes = {
    [`GET ${base}`]: () => ({ id: "w1", slug: "dev", name: "Dev", type: "dev" }),
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    calls.push({ method, url: path });
    const answer = routes[`${method} ${path}`];
    if (!answer && method === "GET" && path.startsWith(`${base}/drafts/`)) {
      return new Response(JSON.stringify({ title: "Not found" }), { status: 404 });
    }
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
  history.replaceState(null, "", "/");
});

/** The workspace screens at whatever the address says, as the console shows them. */
function AtAddress() {
  return <Tenant tenantId="t1" me={me} path={usePath()} />;
}

/** The extension editors: a connector and a trigger source (phase 29, lane t4-config-ext). */

const draftOf = (code: string) => ({
  path: "hello/greet",
  revision: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});

test("EXT-12: a connector that does not build lists where, each line a way to it", async () => {
  routes[`GET ${base}/drafts/billing/stripe`] = () => ({
    ...draftOf("export default {};\n"),
    path: "billing/stripe",
    kind: "connector",
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/extensions/connector/edit/billing/stripe");
  show(<AtAddress />);
  await screen.findByRole("button", { name: "Discard draft" });
  await screen.findByLabelText("Source of billing/stripe");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    calls.push({ method, url: path });
    if (method === "PUT") {
      return new Response(
        JSON.stringify({
          title: "Bad request",
          status: 400,
          detail: "The code written in the console does not build.",
          errors: [{ path: "billing/stripe.connector.ts:2", message: 'Unexpected ";"' }],
        }),
        { status: 400, headers: { "content-type": "application/problem+json" } },
      );
    }
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  // The description makes the draft unsaved without typing into the code editor.
  fireEvent.change(screen.getByLabelText(/What it does/), { target: { value: "Charges" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(calls.some((one) => one.method === "PUT")).toBe(true), {
    timeout: 9000,
  });
  const list = await screen.findByRole("list", { name: "Problems in the code" });
  expect(within(list).getByRole("button", { name: /2:1\s*Unexpected ";"/ })).toBeTruthy();
});

test("EXT-12: a production workspace names what it cannot change, a connector and not 'Code'", async () => {
  routes[`GET ${base}`] = () => ({ id: "w1", slug: "prod", name: "Prod", type: "production" });
  routes[`GET ${base}/resources/billing/stripe`] = () => ({
    ownership: "ui",
    body: draftOf("export default {};\n").body,
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/extensions/connector/edit/billing/stripe");
  show(<AtAddress />);
  expect(
    await screen.findByText(/This is a production workspace\. Connector is changed/),
  ).toBeTruthy();
});
