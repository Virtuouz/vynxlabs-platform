// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FlowView } from "./screens/Flows.tsx";
import { Interfaces } from "./screens/Interfaces.tsx";
import { Queries } from "./screens/Queries.tsx";
import { show } from "./testing.tsx";

/**
 * A list that is still loading, or that failed, says so: it never says there
 * is nothing in it before it knows (POLISH-001).
 */

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
const api = `/api/v1${root}`;

/** What each list's own request does: answers, waits for ever, or fails. */
let listed: "pending" | "failed" | "empty";
let asked: string[];

const flow = {
  path: "intake/route",
  description: null,
  nodes: { start: { type: "trigger", trigger: { type: "manual" } } },
  edges: [],
  triggers: [],
};

function stub(list: RegExp) {
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    const path = address.split("?")[0] as string;
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (list.test(address)) {
      if (listed === "pending") return new Promise<Response>(() => {});
      if (listed === "failed") {
        return json(
          { status: 500, code: "internal", detail: "The database is not answering." },
          500,
        );
      }
      return json({ items: [] });
    }
    if (path === `${api}/flows/intake/route`) return json(flow);
    if (path === `${api}/query-schema` || path.endsWith("/schema")) {
      return json({ tables: [], functions: [] });
    }
    return json({ items: [] });
  });
}

beforeEach(() => {
  asked = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the flow page's recent runs", () => {
  beforeEach(() => stub(/\/flow-runs\?flow=/));
  const draw = () => show(<FlowView root={root} path="intake/route" link={link} />);

  test("while they load, it does not say the flow has not run", async () => {
    listed = "pending";
    draw();
    expect(await screen.findByRole("status", { name: "Loading recent runs" })).toBeTruthy();
    expect(screen.queryByText("This flow has not run yet")).toBeNull();
  });

  test("when they fail, it says so and can try again", async () => {
    listed = "failed";
    draw();
    expect(await screen.findByText(/Could not load recent runs/)).toBeTruthy();
    expect(screen.queryByText("This flow has not run yet")).toBeNull();
    listed = "empty";
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("This flow has not run yet")).toBeTruthy();
  });
});

describe("the saved queries", () => {
  beforeEach(() => stub(/\/queries$/));
  const draw = () => show(<Queries root={root} link={link} />);
  const none = /None yet\. A query that is saved/;

  test("while they load, it does not say there are none", async () => {
    listed = "pending";
    draw();
    expect(await screen.findByRole("status", { name: "Loading saved queries" })).toBeTruthy();
    expect(screen.queryByText(none)).toBeNull();
  });

  test("when they fail, it says so and can try again", async () => {
    listed = "failed";
    draw();
    expect(await screen.findByText(/Could not load saved queries/)).toBeTruthy();
    expect(screen.queryByText(none)).toBeNull();
    listed = "empty";
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(none)).toBeTruthy();
  });
});

describe("the App Builder's list", () => {
  beforeEach(() => stub(/\/interfaces$/));
  const draw = () => show(<Interfaces root={root} link={link} editable />);

  test("while it loads, it says so", async () => {
    listed = "pending";
    draw();
    expect(await screen.findByRole("status", { name: "Loading apps" })).toBeTruthy();
    expect(screen.queryByText("No apps made here yet")).toBeNull();
  });

  test("when it fails, it says so and can try again", async () => {
    listed = "failed";
    draw();
    expect(await screen.findByText(/Could not load apps/)).toBeTruthy();
    expect(screen.queryByText("No apps made here yet")).toBeNull();
    listed = "empty";
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("No apps made here yet")).toBeTruthy());
  });
});
