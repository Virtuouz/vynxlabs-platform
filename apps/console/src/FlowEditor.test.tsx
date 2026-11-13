import { expect, test } from "vitest";
import { problemsOf } from "./screens/FlowEditor.tsx";

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
