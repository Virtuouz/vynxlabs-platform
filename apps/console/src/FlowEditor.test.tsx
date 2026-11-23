import { expect, test } from "vitest";
import { problemsOf, stepOrder } from "./screens/FlowEditor.tsx";

test("a flow with nothing wrong has no problems", () => {
  expect(
    problemsOf(
      {
        start: { type: "trigger", trigger: { type: "manual" } },
        check: { type: "script", script: "orders/check" },
        route: { type: "branch", cases: [{ name: "large", when: "true" }] },
      },
      [
        { from: "start", to: "check" },
        { from: "check", to: "route" },
      ],
    ),
  ).toEqual([]);
});

test("what is missing is said step by step, before the server is asked", () => {
  expect(
    problemsOf(
      {
        run: { type: "script", script: "" },
        other: { type: "subflow", flow: "" },
        each: { type: "foreach", items: "trigger.items" },
        listen: { type: "trigger", trigger: { type: "event", event: "" } },
      },
      [{ from: "listen", to: "run" }],
    ),
  ).toEqual([
    "run has no script chosen.",
    "Nothing leads to other.",
    "other has no flow chosen.",
    "Nothing leads to each.",
    "each needs a script or a flow to run for each item.",
    "listen has no event chosen.",
  ]);
  expect(problemsOf({ only: { type: "join" } }, [])).toEqual([
    "Add a way for the flow to start.",
    "Nothing leads to only.",
  ]);
});

test("a flow chosen by the data needs an expression and a list to choose from", () => {
  const start = { type: "trigger", trigger: { type: "manual" } };
  const edges = [{ from: "start", to: "next" }];
  expect(
    problemsOf(
      { start, next: { type: "subflow", flowFrom: "trigger.flow", allow: ["a/b"] } },
      edges,
    ),
  ).toEqual([]);
  expect(problemsOf({ start, next: { type: "subflow", flowFrom: "", allow: [] } }, edges)).toEqual([
    "next needs an expression that gives the flow to start.",
    "next needs at least one flow it may start.",
  ]);
});

test("steps are listed in the order a run reaches them, then those nothing reaches", () => {
  const edges = [
    { source: "start", target: "check" },
    { source: "check", target: "notify" },
    { source: "check", target: "stop" },
    { source: "notify", target: "check" },
  ];
  expect(stepOrder(["stop", "notify", "orphan", "check", "start"], edges, ["start"])).toEqual([
    "start",
    "check",
    "notify",
    "stop",
    "orphan",
  ]);
});

test("a field a step needs, left empty, is said with its step (FLW-09)", () => {
  const said = problemsOf(
    {
      start: { type: "trigger", trigger: { type: "manual" } },
      ask: { type: "approval", title: "" },
      stop: { type: "fail", message: "" },
      pick: { type: "branch", cases: [{ name: "big", when: "" }] },
      put: { type: "set", values: { total: "" } },
      each: { type: "foreach", items: "", script: "a/b" },
    },
    ["ask", "stop", "pick", "put", "each"].map((to) => ({ from: "start", to })),
  );
  expect(said).toEqual([
    "ask needs a title for the approval.",
    "stop needs a message to fail with.",
    "pick has a case with no condition.",
    "put has a value with no expression.",
    "each needs an expression that gives the items to go through.",
  ]);
});
