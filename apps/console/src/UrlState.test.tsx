// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { navigate, urlWith, useRestoredScroll, useUrlState } from "./router.tsx";

const SCHEMA = {
  q: { type: "string" },
  state: { type: "string", default: "all" },
  page: { type: "number", default: 1 },
  wide: { type: "boolean" },
  tag: { type: "list" },
  item: { type: "string", push: true },
} as const;

let seen: ReturnType<typeof useUrlState<typeof SCHEMA>>;
function View() {
  seen = useUrlState(SCHEMA);
  const [state] = seen;
  return <p>{JSON.stringify(state)}</p>;
}

beforeEach(() => history.replaceState(null, "", "/runs"));
afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

test("each kind of value is read from the address, with defaults when absent", () => {
  history.replaceState(null, "", "/runs?q=sync&page=3&wide=1&tag=a&tag=b");
  render(<View />);
  expect(seen[0]).toEqual({
    q: "sync",
    state: "all",
    page: 3,
    wide: true,
    tag: ["a", "b"],
    item: undefined,
  });
});

test("defaults and empty values are left out of the address", () => {
  expect(urlWith(SCHEMA, { state: "all", page: 1, q: "", tag: [], wide: false }, "?q=x")).toBe(
    "/runs",
  );
  expect(urlWith(SCHEMA, { state: "failed", tag: ["a", "b"] }, "")).toBe(
    "/runs?state=failed&tag=a&tag=b",
  );
});

test("a filter replaces the entry, and opening an item pushes one that Back closes", async () => {
  render(<View />);
  const before = history.length;
  act(() => seen[1]({ q: "sync" }));
  expect(location.search).toBe("?q=sync");
  expect(history.length).toBe(before);

  act(() => seen[1]({ item: "r1" }));
  expect(location.search).toBe("?q=sync&item=r1");
  expect(history.length).toBe(before + 1);
  expect(seen[0].item).toBe("r1");

  await act(async () => {
    history.back();
    await new Promise((done) => setTimeout(done, 20));
  });
  expect(location.search).toBe("?q=sync");
  expect(seen[0].item).toBeUndefined();
  expect(seen[0].q).toBe("sync");
});

test("an address changed elsewhere is seen", () => {
  render(<View />);
  act(() => navigate("/runs?state=failed", { replace: true }));
  expect(seen[0].state).toBe("failed");
});

function Scrolled() {
  const ref = useRef<HTMLDivElement>(null);
  useRestoredScroll(ref, "list");
  return <div ref={ref} data-testid="region" />;
}

test("the scroll of a region comes back when Back returns to its entry", async () => {
  render(<Scrolled />);
  const region = screen.getByTestId("region");
  region.scrollTop = 420;
  fireEvent.scroll(region);
  act(() => navigate("/runs/r1"));
  region.scrollTop = 0;

  await act(async () => {
    history.back();
    await new Promise((done) => setTimeout(done, 80));
  });
  expect(location.pathname).toBe("/runs");
  expect(region.scrollTop).toBe(420);
});
