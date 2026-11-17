import { expect, test } from "vitest";
import { type Clip, copySteps, pasteSteps, readClip } from "./flowClipboard.ts";

const steps = [
  { id: "start", position: { x: 0, y: 0 }, node: { type: "trigger", trigger: { type: "manual" } } },
  {
    id: "check",
    position: { x: 200, y: 0 },
    node: { type: "script", script: "stock/check", inputs: { sku: "trigger.sku" } },
  },
  {
    id: "price",
    position: { x: 400, y: 0 },
    node: { type: "set", values: { total: "steps.check.output.count * 2", sku: "trigger.sku" } },
  },
];
const edges = [
  { from: "start", to: "check" },
  { from: "check", to: "price" },
];

test("what is copied keeps only the connections between the steps copied", () => {
  const clip = copySteps(steps, edges, new Set(["check", "price"]));
  expect(clip.steps.map((step) => step.id)).toEqual(["check", "price"]);
  expect(clip.edges).toEqual([{ from: "check", to: "price" }]);
  expect(readClip(JSON.stringify(clip))).toEqual(clip);
  // Anything else on the clipboard is not steps.
  expect(readClip("check")).toBeUndefined();
  expect(readClip(JSON.stringify({ steps: [] }))).toBeUndefined();
});

test("pasted into a flow that has those names, they are suffixed and their references follow", () => {
  const clip = copySteps(steps, edges, new Set(["check", "price"]));
  const pasted = pasteSteps(clip, ["start", "check", "price"], { x: 40, y: 40 });
  expect(pasted.renamed).toEqual({ check: "check_2", price: "price_2" });
  expect(pasted.steps.map((step) => step.id)).toEqual(["check_2", "price_2"]);
  expect(pasted.steps[1]?.node.values).toEqual({
    total: "steps.check_2.output.count * 2",
    sku: "trigger.sku",
  });
  expect(pasted.steps[0]?.position).toEqual({ x: 240, y: 40 });
  expect(pasted.edges).toEqual([{ from: "check_2", to: "price_2" }]);
});

test("pasted into another flow without those names, they keep them", () => {
  const clip = copySteps(steps, edges, new Set(["check", "price"]));
  const pasted = pasteSteps(clip, ["start"], { x: 0, y: 0 });
  expect(pasted.renamed).toEqual({ check: "check", price: "price" });
  expect(pasted.steps[1]?.node.values).toEqual({
    total: "steps.check.output.count * 2",
    sku: "trigger.sku",
  });
});

test("names that chain (a becomes b while b becomes b_2) are not renamed twice", () => {
  const clip: Clip = {
    vynxlabsFlowSteps: 1,
    steps: [
      { id: "a", position: { x: 0, y: 0 }, node: { type: "set", values: { v: "steps.b.output" } } },
      { id: "b", position: { x: 0, y: 0 }, node: { type: "set", values: { v: "steps.a.output" } } },
    ],
    edges: [],
  };
  // "a" is taken, so a → a_2; "b" is taken, so b → b_2: neither reads the other's old name.
  const pasted = pasteSteps(clip, ["a", "b"], { x: 0, y: 0 });
  expect(pasted.steps.map((step) => [step.id, step.node.values])).toEqual([
    ["a_2", { v: "steps.b_2.output" }],
    ["b_2", { v: "steps.a_2.output" }],
  ]);
});
