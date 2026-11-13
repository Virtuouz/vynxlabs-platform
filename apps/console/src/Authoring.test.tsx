// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Changes } from "./screens/Authoring.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];
let drafts: object[];
let preview: object;

beforeEach(() => {
  calls = [];
  drafts = [
    {
      path: "orders/sync",
      kind: "script",
      change: "update",
      deleted: false,
      revision: 3,
      updatedAt: "2026-11-13T01:00:00Z",
    },
    {
      path: "orders/size",
      kind: "variable",
      change: "create",
      deleted: false,
      revision: 1,
      updatedAt: "2026-11-13T01:00:00Z",
    },
  ];
  preview = {
    possible: true,
    refusal: null,
    summary: { created: 1, updated: 1, deleted: 0, data: [], changes: [] },
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "POST") {
      drafts = [];
      return json({ bundleVersion: 7, applied: ["orders/size", "orders/sync"] }, 201);
    }
    if (method === "DELETE") {
      drafts = drafts.slice(1);
      return new Response(null, { status: 204 });
    }
    return json(address.endsWith("/changes/preview") ? preview : { items: drafts });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("drafts are listed with what deploying each would do, and deployed with a message", async () => {
  show(<Changes root={root} link={link} editable />);
  expect((await screen.findByRole("link", { name: "orders/sync" })).getAttribute("href")).toBe(
    `${link}/scripts/edit/orders/sync`,
  );
  // A variable opens in the editor for settings.
  expect(screen.getByRole("link", { name: "orders/size" }).getAttribute("href")).toBe(
    `${link}/resources/edit/variable/orders/size`,
  );
  expect(screen.getByText("Changed")).toBeTruthy();
  expect(screen.getByText("New")).toBeTruthy();
  await screen.findByText(/Deploying creates 1, changes 1 and removes 0\./);

  fireEvent.change(screen.getByLabelText("What changed"), { target: { value: "Bigger batches" } });
  fireEvent.click(screen.getByRole("button", { name: "Deploy 2 changes" }));
  await screen.findByText("Deployed as version 7: orders/size, orders/sync.");
  expect(calls.find((call) => call.method === "POST")).toEqual({
    method: "POST",
    url: `/api/v1${root}/changes/deploy`,
    body: { message: "Bigger batches" },
  });
  await screen.findByText("Nothing waiting to be deployed");
});

test("changes that cannot be deployed say why, and offer no deploy", async () => {
  preview = {
    possible: false,
    refusal: {
      code: "validation_failed",
      detail: "The code written in the console does not build.",
      errors: [{ path: "orders/sync.script.ts:2", message: 'Unexpected ";"' }],
    },
    summary: null,
  };
  show(<Changes root={root} link={link} editable />);
  expect((await screen.findByRole("alert")).textContent).toContain("orders/sync.script.ts:2");
  expect(
    (screen.getByRole("button", { name: "Deploy 2 changes" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("a draft is discarded after asking, and a production workspace has none", async () => {
  const { unmount } = show(<Changes root={root} link={link} editable />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Discard" }))[0] as HTMLElement);
  expect(await answer("Discard")).toContain("It goes back to how it was last deployed.");
  await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
  expect(calls.find((call) => call.method === "DELETE")?.url).toBe(
    `/api/v1${root}/drafts/orders/sync`,
  );
  unmount();

  show(<Changes root={root} link={link} editable={false} />);
  expect(screen.getByText(/A production workspace has no drafts/)).toBeTruthy();
});
