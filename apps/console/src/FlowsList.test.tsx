// @vitest-environment happy-dom
import { cleanup, configure, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FLOW_START_TYPES, STARTED_BY, STARTED_ON } from "./kit/starts.ts";
import { Flows } from "./screens/Flows.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 15_000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const link = "/t/t1/workspaces/w1";

const row = (path: string, extra: Record<string, unknown> = {}) => ({
  path,
  description: "",
  nodeCount: 2,
  triggers: [],
  lastRun: null,
  version: 1,
  draft: null,
  starts: [],
  runs: { lastDay: 0, failedLastDay: 0, waiting: 0 },
  ...extra,
});

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string) => {
    const path = address.split("?")[0] as string;
    const items =
      path === `${api}/flows`
        ? [
            row("orders/sync", { starts: [{ type: "form", detail: null }] }),
            row("orders/new", { version: null, draft: "changed" }),
          ]
        : [];
    return new Response(JSON.stringify({ items }), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a flow that is only a draft opens in the editor, where it can be seen (FLW-12)", async () => {
  show(<Flows root={root} link={link} editable />);
  const draftOnly = await screen.findByRole("link", { name: "orders/new" });
  expect(draftOnly.getAttribute("href")).toBe(`${link}/flows/edit/orders/new`);
  expect(screen.getByRole("link", { name: "orders/sync" }).getAttribute("href")).toBe(
    `${link}/flows/orders/sync`,
  );
});

test("a form start is said in words, not as the raw word (FLW-17)", async () => {
  show(<Flows root={root} link={link} editable />);
  expect(await screen.findByText("Form")).toBeTruthy();
  expect(screen.queryByText("form")).toBeNull();
});

test("every kind of start, and a retry, has words to be shown by (FLW-17)", () => {
  for (const type of [...FLOW_START_TYPES, "retry", "rerun", "alert"]) {
    expect(STARTED_BY[type], type).toBeTruthy();
    expect(STARTED_BY[type], type).not.toBe(type);
    expect(STARTED_ON[type], type).toBeTruthy();
  }
});

test("counts of the last 24 hours are called that, not today (FLW-28)", async () => {
  show(<Flows root={root} link={link} editable />);
  expect(await screen.findByText(/Failed in 24 hours/)).toBeTruthy();
  expect(screen.queryByText(/Failed today/)).toBeNull();
});
