// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { autoLayout, FlowGraph } from "./FlowGraph.tsx";

afterEach(cleanup);

const nodes = {
  start: { type: "trigger", trigger: { type: "webhook" } },
  check: { type: "script", script: "orders/check" },
  route: { type: "branch", cases: [{ name: "large", when: "trigger.total > 1000.0" }] },
  approve: { type: "approval", title: "Approve a large order" },
  send: { type: "script", script: "orders/send-to-erp" },
  report: { type: "set", values: {} },
};
const edges = [
  { from: "start", to: "check" },
  { from: "check", to: "route" },
  { from: "route", to: "approve", output: "large" },
  { from: "route", to: "send", output: "otherwise" },
  { from: "approve", to: "send" },
  { from: "send", to: "report", error: true },
];

test("every node gets a place, laid out left to right in the order the flow runs", () => {
  const positions = autoLayout(nodes, edges);
  expect(Object.keys(positions).sort()).toEqual(Object.keys(nodes).sort());
  const x = (id: string) => positions[id]?.x as number;
  expect(x("start")).toBeLessThan(x("check"));
  expect(x("check")).toBeLessThan(x("route"));
  expect(x("route")).toBeLessThan(x("approve"));
  expect(x("approve")).toBeLessThan(x("send"));
  expect(x("send")).toBeLessThan(x("report"));
  // No two nodes share a place.
  expect(new Set(Object.values(positions).map((p) => `${p.x},${p.y}`)).size).toBe(6);
});

test("nodes are buttons that say what they are and how they went, and saved positions win", () => {
  const onSelect = vi.fn();
  const { container } = render(
    <FlowGraph
      nodes={nodes}
      edges={edges}
      layout={{ check: { x: 400, y: 300 } }}
      statuses={{
        start: "succeeded",
        check: "succeeded",
        route: "succeeded",
        approve: "waiting",
        send: "skipped",
      }}
      selected="approve"
      onSelect={onSelect}
    />,
  );
  const approve = screen.getByRole("button", { name: "Approval approve, Waiting" });
  expect(approve.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Script send, Skipped" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Set values report" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Script check, Succeeded" }).getAttribute("transform"),
  ).toBe("translate(400 300)");

  fireEvent.click(screen.getByRole("button", { name: "Trigger start, Succeeded" }));
  expect(onSelect).toHaveBeenCalledWith("start");
  fireEvent.keyDown(approve, { key: "Enter" });
  expect(onSelect).toHaveBeenLastCalledWith("approve");

  // Branch cases and the error path are labeled on their edges.
  const labels = [...container.querySelectorAll("svg > g > text")]
    .filter((text) => text.parentElement?.querySelector("path"))
    .map((text) => text.textContent);
  expect(labels.sort()).toEqual(["large", "on error", "otherwise"]);
});
