// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RunCompare } from "./screens/RunCompare.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
let previous: unknown;

beforeEach(() => {
  vi.stubGlobal("fetch", async (address: string) => {
    const path = address.replace("/api/v1", "");
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path.endsWith("/previous-success")) return json(previous);
    if (path === `${root}/runs/r-ok`) return json({ input: { sku: "A-1", qty: 2 } });
    return json({});
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a failed run says when it last worked, what changed, and shows the input's difference", async () => {
  previous = {
    run: {
      id: "r-ok",
      bundleVersion: 3,
      startedAt: "2026-11-16T10:00:00Z",
      finishedAt: "2026-11-16T10:00:01Z",
      durationMs: 800,
    },
    bundleVersion: 4,
    versionChanged: true,
    inputChanged: true,
  };
  show(
    <RunCompare
      root={root}
      link="/t/t1/workspaces/w1"
      kind="run"
      id="r-bad"
      input={{ sku: "A-1", qty: 20 }}
      durationMs={1500}
    />,
  );
  expect(await screen.findByText("Since it last worked")).toBeTruthy();
  expect(screen.getByText("v3 then, v4 now")).toBeTruthy();
  expect(screen.getByText("Different from the last success")).toBeTruthy();
  expect(screen.getByText("1.5 s now, 800 ms then")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Compare the source/ }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/runs/r-bad/compare/r-ok",
  );
  fireEvent.click(screen.getByRole("button", { name: "Show the input's difference" }));
  const diff = await screen.findByTestId("input-diff");
  expect(diff.textContent).toContain('−   "qty": 2');
  expect(diff.textContent).toContain('+   "qty": 20');
});

test("a run that never succeeded says so, and offers nothing to compare", async () => {
  previous = { run: null, bundleVersion: 1, versionChanged: false, inputChanged: null };
  show(<RunCompare root={root} link="/t/t1/workspaces/w1" kind="run" id="r-bad" input={{}} />);
  expect(await screen.findByText(/has not succeeded before/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Compare/ })).toBeNull();
});

test("when only masked values differ, the difference says so instead of showing nothing (OPS-30)", async () => {
  previous = {
    run: { id: "r-ok", bundleVersion: 4, startedAt: null, finishedAt: null, durationMs: 800 },
    bundleVersion: 4,
    versionChanged: false,
    inputChanged: true,
  };
  show(
    <RunCompare
      root={root}
      link="/t/t1/workspaces/w1"
      kind="run"
      id="r-bad"
      input={{ sku: "A-1", qty: 2 }}
      durationMs={1500}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Show the input's difference" }));
  expect(await screen.findByText("Only masked values differ.")).toBeTruthy();
  expect(screen.queryByTestId("input-diff")).toBeNull();
});
