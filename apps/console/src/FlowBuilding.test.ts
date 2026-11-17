import type { Edge } from "@xyflow/react";
import { expect, test } from "vitest";
import { renameInExpression, renameInNode } from "./flowRename.ts";
import { insertAfter, problemsAt } from "./screens/FlowEditor.tsx";

test("renaming a step rewrites what reads it, by parsing, and leaves text that only looks like it", () => {
  expect(
    renameInExpression(
      "steps.fetch.output.n + steps['fetch'].output.m + size(steps.fetch2)",
      "fetch",
      "load",
    ),
  ).toEqual({
    expression: "steps.load.output.n + steps['load'].output.m + size(steps.fetch2)",
    count: 2,
  });
  // A string that says steps.fetch is a string.
  expect(renameInExpression("'see steps.fetch' + steps.other.x", "fetch", "load")).toEqual({
    expression: "'see steps.fetch' + steps.other.x",
    count: 0,
  });
  // One that does not parse is left for its own problem to say so.
  expect(renameInExpression("steps.fetch.(", "fetch", "load").count).toBe(0);
});

test("every expression of a step is renamed: inputs, values, cases", () => {
  const { node, count } = renameInNode(
    {
      type: "branch",
      cases: [
        { name: "big", when: "steps.fetch.output.total > 100.0" },
        { name: "vip", when: "steps.fetch.output.vip" },
      ],
    },
    "fetch",
    "load",
  );
  expect(count).toBe(2);
  expect(node.cases).toEqual([
    { name: "big", when: "steps.load.output.total > 100.0" },
    { name: "vip", when: "steps.load.output.vip" },
  ]);
  expect(
    renameInNode(
      { type: "script", script: "x", inputs: { n: "steps.fetch.output.n", m: "1" } },
      "fetch",
      "load",
    ),
  ).toEqual({
    node: { type: "script", script: "x", inputs: { n: "steps.load.output.n", m: "1" } },
    count: 1,
  });
});

test("a step added after the chosen one is joined to it and takes over where it went", () => {
  const nodes = [
    { id: "start", position: { x: 0, y: 0 } },
    { id: "a", position: { x: 280, y: 0 } },
    { id: "b", position: { x: 560, y: 0 } },
  ];
  const edges: Edge[] = [
    { id: "e1", source: "start", target: "a", sourceHandle: "next" },
    { id: "e2", source: "a", target: "b", sourceHandle: "next" },
    { id: "e3", source: "a", target: "oops", sourceHandle: "error" },
  ];
  const placed = insertAfter(nodes, edges, "a", "new");
  // To the right of a, moved down clear of b.
  expect(placed.position).toEqual({ x: 560, y: 120 });
  const pairs = placed.edges.map((edge) => [edge.source, edge.target, edge.sourceHandle]);
  expect(pairs).toContainEqual(["a", "new", "next"]);
  expect(pairs).toContainEqual(["new", "b", "next"]);
  // An error path stays where it was.
  expect(pairs).toContainEqual(["a", "oops", "error"]);
  expect(pairs).not.toContainEqual(["a", "b", "next"]);
  // With nothing chosen, it goes to the right of everything, unjoined.
  expect(insertAfter(nodes, edges, undefined, "new")).toEqual({
    position: { x: 840, y: 0 },
    edges,
  });
});

test("each problem names the step and the field it is in", () => {
  const found = problemsAt(
    {
      start: { type: "trigger", trigger: { type: "manual" } },
      run: { type: "script", script: "" },
    },
    [{ from: "start", to: "run" }],
  );
  expect(found).toContainEqual({
    message: "run has no script chosen.",
    node: "run",
    field: "script",
  });
});
