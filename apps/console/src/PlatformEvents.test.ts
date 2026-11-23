import { expect, test } from "vitest";
import { listenChoices } from "./kit/platformEvents.ts";

test("the platform's events follow the workspace's own, each with its payload, and never twice (OPS-MP2)", () => {
  const options = listenChoices([
    { value: "orders/placed", label: "orders/placed" },
    { value: "platform/run-failed", label: "platform/run-failed" },
  ]);
  const names = options.map((one) => one.value);
  expect(names.slice(0, 2)).toEqual(["orders/placed", "platform/run-failed"]);
  expect(names.filter((one) => one === "platform/run-failed")).toHaveLength(1);
  expect(names).toContain("platform/deployment-created");
  expect(options.find((one) => one.value === "platform/flow-run-finished")?.hint).toContain(
    "Payload: flowRunId, flow, status.",
  );
});
