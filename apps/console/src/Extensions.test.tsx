// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Extensions } from "./screens/Authoring.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (address.endsWith("/resources")) {
      return json({
        items: [
          { path: "orders/sync", kind: "script", ownership: "ui", body: {} },
          {
            path: "connectors/shop",
            kind: "connector",
            ownership: "code",
            body: { description: "Talks to the shop." },
          },
          {
            path: "sources/inbox",
            kind: "trigger_source",
            ownership: "ui",
            body: { mode: "poll", description: "Looks for new mail." },
          },
        ],
      });
    }
    if (address.endsWith("/drafts/sources/payments")) {
      return json({
        path: "sources/payments",
        kind: "trigger_source",
        body: { mode: "poll", description: "Looks for new payments." },
      });
    }
    if (address.endsWith("/drafts/sources/inbox")) {
      return json({
        path: "sources/inbox",
        kind: "trigger_source",
        body: { mode: "webhook", description: "Takes mail pushed to us." },
      });
    }
    if (address.endsWith("/drafts")) {
      return json({
        items: [
          { path: "sources/payments", kind: "trigger_source", deleted: false, change: "create" },
          { path: "sources/inbox", kind: "trigger_source", deleted: false, change: "update" },
          { path: "sources/gone", kind: "trigger_source", deleted: true, change: "delete" },
          { path: "orders/sync", kind: "script", deleted: false, change: "update" },
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

test("a workspace's connectors and trigger sources are listed, deployed or still drafts", async () => {
  show(<Extensions root={root} link={link} editable />);
  const shop = await screen.findByRole("link", { name: "connectors/shop" });
  expect(shop.getAttribute("href")).toBe(`${link}/extensions/connector/edit/connectors/shop`);
  expect(screen.getByRole("link", { name: "sources/inbox" }).getAttribute("href")).toBe(
    `${link}/extensions/trigger_source/edit/sources/inbox`,
  );
  expect(screen.getByText("From the repository")).toBeTruthy();
  // A draft that was never deployed is listed too. One that removes, and a script, are not.
  expect(screen.getByRole("link", { name: "sources/payments" })).toBeTruthy();
  expect(screen.getAllByText("Draft")).toHaveLength(2);
  // A draft says what it is now (EXT-13): its mode, and its own description, not the deployed one.
  expect(await screen.findByText("Looks for new payments.")).toBeTruthy();
  expect(await screen.findByText("Takes mail pushed to us.")).toBeTruthy();
  expect(screen.queryByText("Looks for new mail.")).toBeNull();
  expect(screen.getAllByText("Trigger source for a webhook")).toHaveLength(1);
  expect(screen.getAllByText("Trigger source for a schedule")).toHaveLength(1);
  expect(screen.queryByText("sources/gone")).toBeNull();
  expect(screen.queryByText("orders/sync")).toBeNull();
  expect(screen.getByRole("button", { name: "New connector" })).toBeTruthy();
});

test("a production workspace offers nothing to write", async () => {
  show(<Extensions root={root} link={link} editable={false} />);
  await screen.findByRole("link", { name: "connectors/shop" });
  expect(screen.queryByRole("button", { name: "New connector" })).toBeNull();
});
