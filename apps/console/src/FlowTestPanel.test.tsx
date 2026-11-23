// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { FlowRunDetail } from "./screens/Flows.tsx";
import { FlowTestPanel, LastTest, stepsOf, took } from "./screens/FlowTestPanel.tsx";
import { show } from "./testing.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const step = (node: string, more: Record<string, unknown> = {}) => ({
  node,
  item: "",
  status: "succeeded",
  state: "succeeded",
  outputName: null,
  output: null,
  error: null,
  handled: false,
  runId: null,
  childFlowRunId: null,
  wakeAt: null,
  detail: {},
  copiedFrom: null,
  startedAt: "2026-11-15T10:00:00.000Z",
  pickedUpAt: null,
  finishedAt: "2026-11-15T10:00:00.250Z",
  ...more,
});
const run = {
  id: "fr1",
  flow: "orders/intake",
  status: "failed",
  state: "failed",
  triggerNode: "start",
  error: { message: 'The step "late" failed: no such key' },
  steps: [
    step("totals", {
      output: [
        { sku: "a", qty: 2 },
        { sku: "b", qty: 1 },
      ],
    }),
    step("start", { output: { customer: "ada" } }),
    step("late", {
      status: "failed",
      state: "failed",
      error: { message: "no such key: nope" },
      finishedAt: "2026-11-15T10:00:01.500Z",
    }),
    step("each", { item: "0", status: "failed", state: "failed", error: { message: "boom" } }),
  ],
} as unknown as FlowRunDetail;

test("the trigger comes first, and a step's time is said briefly", () => {
  expect(stepsOf(run).map((one) => one.node)).toEqual(["start", "totals", "late"]);
  expect(took(run.steps[0] as never)).toBe("250 ms");
  expect(took(run.steps[2] as never)).toBe("1.5 s");
  expect(took({ startedAt: "2026-11-15T10:00:00Z", finishedAt: null })).toBeUndefined();
});

test("input is asked for by the manual trigger's schema, and the run's steps are listed to choose", async () => {
  const ran: unknown[] = [];
  const chosen: string[] = [];
  const { rerender } = show(
    <FlowTestPanel
      link="/t/t1/workspaces/w1"
      path="orders/intake"
      schema={{ type: "object", properties: { customer: { type: "string", title: "Customer" } } }}
      blocked={undefined}
      run={undefined}
      error={undefined}
      changed={false}
      onRun={async (input) => {
        ran.push(input);
      }}
      onChoose={(node) => chosen.push(node)}
      onClose={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "ada" } });
  fireEvent.click(screen.getByRole("button", { name: "Run a test" }));
  await waitFor(() => expect(ran).toEqual([{ customer: "ada" }]));

  rerender(
    <FlowTestPanel
      link="/t/t1/workspaces/w1"
      path="orders/intake"
      schema={undefined}
      blocked={undefined}
      run={run}
      error={undefined}
      changed
      onRun={async () => {}}
      onChoose={(node) => chosen.push(node)}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole("link", { name: "Open the run" }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/runs/fr1",
  );
  expect(screen.getByText("The flow changed since this test.")).toBeTruthy();
  expect(screen.getByText('The step "late" failed: no such key')).toBeTruthy();
  const listed = screen.getByRole("list", { name: "Steps of the test" });
  expect(listed.textContent).toMatch(/start.*totals.*250 ms.*late.*1\.5 s/);
  fireEvent.click(screen.getByRole("button", { name: /^totals/ }));
  expect(chosen).toEqual(["totals"]);
  expect(screen.getByRole("button", { name: "Run again" })).toBeTruthy();
});

test("a test that cannot be run says why, and runs nothing", () => {
  show(
    <FlowTestPanel
      link="/t/t1/workspaces/w1"
      path="orders/intake"
      schema={undefined}
      blocked="A test starts at a manual trigger."
      run={undefined}
      error={undefined}
      changed={false}
      onRun={async () => {}}
      onChoose={() => {}}
      onClose={() => {}}
    />,
  );
  expect(screen.getByText("A test starts at a manual trigger.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Run a test" })).toBeNull();
});

test("a chosen step's last test shows its output by its shape, its error, or that it was not reached", () => {
  show(<LastTest run={run} node="totals" />);
  // A list of records is a table.
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByText("250 ms")).toBeTruthy();
  cleanup();
  show(<LastTest run={run} node="late" />);
  expect(screen.getByText("no such key: nope")).toBeTruthy();
  cleanup();
  show(<LastTest run={run} node="never" />);
  expect(screen.getByText("The last test did not reach this step.")).toBeTruthy();
});

test("a test builds with the flow's own drafts, and with all drafts only when chosen (D32)", () => {
  const chosen: boolean[] = [];
  show(
    <FlowTestPanel
      link="/t/t1/workspaces/w1"
      path="orders/intake"
      schema={undefined}
      blocked={undefined}
      run={undefined}
      error={undefined}
      changed={false}
      onRun={async () => {}}
      withAll={false}
      onWithAll={(all) => chosen.push(all)}
      onChoose={() => {}}
      onClose={() => {}}
    />,
  );
  const box = screen.getByLabelText("Build with all drafts") as HTMLInputElement;
  expect(box.checked).toBe(false);
  fireEvent.click(box);
  expect(chosen).toEqual([true]);
});
