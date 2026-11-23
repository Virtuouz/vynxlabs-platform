// @vitest-environment happy-dom
import { cleanup, configure, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FLOW_START_TYPES, STARTED_BY, STARTED_ON } from "./kit/starts.ts";
import { Flows, FlowView } from "./screens/Flows.tsx";
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

test("a link to a flow that is only a draft lands in the editor, not on 'not found' (FLW-12)", async () => {
  vi.stubGlobal("fetch", async (address: string) => {
    const path = address.split("?")[0] as string;
    if (path === `${api}/drafts/orders/new`)
      return new Response(JSON.stringify({ path: "orders/new", deleted: false }), { status: 200 });
    if (path.startsWith(`${api}/flows/`))
      return new Response(
        JSON.stringify({ title: "Not found", status: 404, detail: "The flow was not found." }),
        {
          status: 404,
        },
      );
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  history.replaceState(null, "", `${link}/flows/orders/new`);
  show(<FlowView root={root} path="orders/new" link={link} editable />);
  await waitFor(() => expect(location.pathname).toBe(`${link}/flows/edit/orders/new`));
  expect(screen.queryByText(/was not found/)).toBeNull();
});

test("a flow page offers Start, Edit and arranging only to who may (FLW-30)", async () => {
  let allowed: string[] = [];
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    const path = address.split("?")[0] as string;
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path === `${api}/allowed`) return json({ allowed });
    if (path === `${api}/flows/orders/sync`)
      return json({
        path: "orders/sync",
        version: 1,
        description: "",
        nodes: { start: { type: "trigger", trigger: { type: "manual" } } },
        edges: [],
        layout: {},
        triggers: [],
      });
    return json({ items: [] });
  });
  show(<FlowView root={root} path="orders/sync" link={link} editable />);
  await screen.findByRole("heading", { name: "orders/sync" });
  await waitFor(() =>
    expect(asked).toContain(
      `${api}/allowed?permissions=flow_run%3Awrite,resource%3Awrite,flow%3Awrite`,
    ),
  );
  expect(screen.queryByRole("button", { name: "Start flow" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.queryByText(/Drag a step/)).toBeNull();
  cleanup();
  allowed = ["flow_run:write", "resource:write", "flow:write"];
  show(<FlowView root={root} path="orders/sync" link={link} editable />);
  expect(await screen.findByRole("button", { name: "Start flow" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  expect(screen.getByText(/Drag a step/)).toBeTruthy();
});
