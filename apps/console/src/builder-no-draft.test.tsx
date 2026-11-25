// @vitest-environment happy-dom

import { cleanup, screen } from "@testing-library/react";
import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { show } from "./testing.tsx";

// P34: an app with no draft yet is opened from what is published, without asking for the draft:
// the browser would log the answer's 404 as an error in the console of every person who opens it.

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const published: InterfaceBody = {
  title: "Sales",
  pages: [
    {
      id: "money",
      title: "Money",
      widgets: [
        {
          id: "a",
          type: "core/text",
          title: "a",
          at: { x: 0, y: 0, w: 12, h: 3 },
          config: { text: "a" },
        } as PageWidget,
      ],
    },
  ],
};
let calls: string[];

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  calls = [];
  const routes: Record<string, unknown> = {
    [`${api}/summary`]: { mayAuthor: true, authorBlockedBy: null },
    [`${api}/interfaces/screens/sales`]: { body: published },
    [`${api}/interfaces`]: {
      items: [
        { path: "screens/sales", title: "Sales", deployed: true, draft: false, app: "sales" },
      ],
    },
    [`${api}/drafts`]: { items: [] },
    [`${api}/apps`]: { items: [{ path: "sales", url: "https://sales.example" }] },
    [`${api}/group-keys`]: { items: [] },
    [`${api}/flows`]: { items: [] },
    [`${api}/scripts`]: { items: [] },
    [`${api}/queries/schema`]: { tables: [], functions: [], maySql: false },
    [`${api}/widget-data`]: { inputs: {} },
    [`${api}/resources`]: { items: [] },
  };
  vi.stubGlobal("fetch", async (address: string) => {
    calls.push(address.split("?")[0] as string);
    const reply = routes[address.split("?")[0] as string];
    return reply === undefined
      ? new Response(JSON.stringify({ detail: "No mock" }), { status: 404 })
      : new Response(JSON.stringify(reply), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("an app the list says has no draft is opened without asking for its draft", async () => {
  show(<InterfaceBuilder root={root} link="/t/t1/workspaces/w1" path="screens/sales" />);
  await screen.findByRole("heading", { name: "On this page" });
  expect(calls).not.toContain(`${api}/drafts/screens/sales`);
});
