import type { Edge } from "@xyflow/react";
import { expect, test } from "vitest";
import {
  carryName,
  followCases,
  insertAfter,
  keepsAddress,
  problemsAt,
  problemsOf,
  rowsToValues,
  stepNameFor,
  stepOrder,
  valueRowProblem,
} from "./screens/FlowEditor.tsx";

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

test("a step added from the palette stays new when it is renamed, and one that was loaded stays loaded (FLW-03)", () => {
  expect(carryName(new Set(["every_day"]), "every_day", "daily").has("daily")).toBe(true);
  expect(carryName(new Set(), "loaded", "renamed").has("renamed")).toBe(false);
});

const at = (id: string, x = 0) => ({ id, position: { x, y: 0 } });
const edge = (source: string, target: string, sourceHandle = "next"): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
  sourceHandle,
});

test("a branch added in the middle takes the connection on its first case (FLW-07)", () => {
  const placed = insertAfter(
    [at("first"), at("second", 280)],
    [edge("first", "second")],
    "first",
    "branch",
    { type: "branch", cases: [{ name: "yes", when: "true" }] } as never,
  );
  expect(placed.edges.map((one) => [one.source, one.target, one.sourceHandle])).toEqual([
    ["branch", "second", "case:yes"],
    ["first", "branch", "next"],
  ]);
});

test("a fail step added in the middle leaves nothing connected after it (FLW-07)", () => {
  const placed = insertAfter(
    [at("first"), at("second", 280)],
    [edge("first", "second")],
    "first",
    "fail",
    { type: "fail", message: "'Stopped'" } as never,
  );
  expect(placed.edges.map((one) => [one.source, one.target])).toEqual([["first", "fail"]]);
});

test("a case removed takes its connection, and one renamed keeps it, even past another's name (FLW-08)", () => {
  const edges = [
    edge("route", "a1", "case:a"),
    edge("route", "ab1", "case:ab"),
    edge("route", "m", "case:maybe"),
  ];
  const cases = [{ name: "a" }, { name: "ab" }];
  expect(followCases(edges, "route", cases).map((one) => one.target)).toEqual(["a1", "ab1"]);
  const renamed = followCases(edges.slice(0, 2), "route", [{ name: "bc" }, { name: "ab" }], {
    from: "a",
    to: "bc",
  });
  expect(renamed.map((one) => [one.target, one.sourceHandle])).toEqual([
    ["a1", "case:bc"],
    ["ab1", "case:ab"],
  ]);
});

test("the editor sees every fault in a branch's connections that a deploy would refuse (FLW-08)", () => {
  const nodes = {
    start: { type: "trigger", trigger: { type: "manual" } },
    route: {
      type: "branch",
      cases: [
        { name: "a", when: "true" },
        { name: "a", when: "false" },
      ],
    },
    one: { type: "join" },
    two: { type: "join" },
    stop: { type: "fail", message: "'x'" },
  };
  const problems = problemsOf(nodes as never, [
    { from: "start", to: "route" },
    { from: "route", to: "one", output: "maybe" },
    { from: "route", to: "two" },
    { from: "route", to: "stop", output: "a" },
    { from: "stop", to: "one" },
  ]);
  expect(problems).toContain('route has no case "maybe", and a connection leaves by it to one.');
  expect(problems).toContain(
    "A connection leaves route to two without saying which case it follows.",
  );
  expect(problems).toContain(
    'route needs a different name for each case, and "otherwise" is taken.',
  );
  expect(problems).toContain("stop ends the flow, so nothing can follow it.");
});

test("rows with a taken or bad name are flagged and not saved over another value (FLW-06)", () => {
  const rows = [
    { name: "one", value: "1" },
    { name: "one", value: "2" },
  ];
  expect(valueRowProblem(rows, 1, false)).toMatch(/used twice/);
  expect(rowsToValues(rows, false)).toEqual({ one: "1" });
  expect(valueRowProblem([{ name: "Set-Cookie", value: "''" }], 0, true)).toMatch(/may not set/);
  expect(valueRowProblem([{ name: "value_1", value: "''" }], 0, true)).toMatch(/hyphens/);
  expect(valueRowProblem([{ name: "x-header", value: "''" }], 0, true)).toBeUndefined();
});

test("a webhook or form start with no key keeps its address by taking its old name as its key (FLW-04)", () => {
  expect(keepsAddress({ type: "trigger", trigger: { type: "webhook" } } as never)).toBe(true);
  expect(keepsAddress({ type: "trigger", trigger: { type: "form" } } as never)).toBe(true);
  expect(keepsAddress({ type: "trigger", key: "old", trigger: { type: "webhook" } } as never)).toBe(
    false,
  );
  expect(keepsAddress({ type: "trigger", trigger: { type: "manual" } } as never)).toBe(false);
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

test("WLK-15: header names that differ only in case are one name, and only the first is saved", () => {
  const rows = [
    { name: "X-One", value: "1" },
    { name: "x-one", value: "2" },
  ];
  expect(valueRowProblem(rows, 1, true)).toMatch(/used twice/);
  expect(rowsToValues(rows, true)).toEqual({ "X-One": "1" });
  // Other values are named exactly as typed.
  expect(valueRowProblem(rows, 1, false)).toBeUndefined();
});

test("an approval that asks a group the tenant no longer has is said, once the groups are known", () => {
  const nodes = {
    start: { type: "trigger", trigger: { type: "manual" } },
    ok: { type: "approval", title: "Ship it?", approvers: { groups: ["ops", "gone"] } },
  } as never;
  const edges = [{ from: "start", to: "ok" }];
  // Not read yet: nothing is said, as nothing is known.
  expect(problemsOf(nodes, edges)).toEqual([]);
  expect(problemsOf(nodes, edges, new Map(), new Set(["ops"]))).toEqual([
    "ok asks the group gone, which this tenant does not have. Choose another group, or ask a tenant admin to make it.",
  ]);
  expect(problemsOf(nodes, edges, new Map(), new Set(["ops", "gone"]))).toEqual([]);
});

test("FLW-23: a step named from a script path, a long text and too many cases are said before saving", () => {
  expect(stepNameFor("jobs/2nd")).toMatch(/^[a-z][a-z0-9_]*$/);
  expect(stepNameFor("jobs/Daily-Sync")).toMatch(/^[a-z][a-z0-9_]*$/);
  const start = { type: "trigger", trigger: { type: "manual" } } as never;
  const cases = Array.from({ length: 21 }, (_, n) => ({ name: `c${n}`, when: "true" }));
  const found = problemsAt(
    {
      start,
      ask: { type: "approval", title: "x".repeat(201) },
      pick: { type: "branch", cases },
      calc: { type: "set", values: { total: "1 + ".repeat(600) } },
    } as never,
    [
      { from: "start", to: "ask" },
      { from: "start", to: "pick", output: "c0" },
      { from: "start", to: "calc" },
    ],
  ).map((one) => one.message);
  expect(found.some((m) => /ask.*200/.test(m))).toBe(true);
  expect(found.some((m) => /pick.*20 cases/.test(m))).toBe(true);
  expect(found.some((m) => /calc.*2,000/.test(m))).toBe(true);
});
