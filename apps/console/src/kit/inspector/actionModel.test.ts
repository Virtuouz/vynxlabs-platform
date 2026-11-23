import { expect, test } from "vitest";
import { grantWords, inputType, stepKindsFor, typedConstant } from "./actionModel.ts";

test("a value typed for a column is stored as that column's type, not as it looks", () => {
  expect(typedConstant("007", "text")).toBe("007");
  expect(typedConstant("true", "text")).toBe("true");
  expect(typedConstant("1", "enum")).toBe("1");
  expect(typedConstant("12.5", "number")).toBe(12.5);
  expect(typedConstant("abc", "integer")).toBe("abc");
  expect(typedConstant("true", "boolean")).toBe(true);
  expect(typedConstant("a, b", "enum_list")).toEqual(["a", "b"]);
});

test("with no column to go by (a flow's input) it is read as it looks", () => {
  expect(typedConstant("007")).toBe(7);
  expect(typedConstant("false")).toBe(false);
  expect(typedConstant("late")).toBe("late");
});

test("a dashboard offers narrowing and the rows behind only where the event gives them", () => {
  const ctx = (groupEvent: boolean, rowsEvent: boolean) =>
    ({ surface: "dashboard", groupEvent, rowsEvent, columnsOf: () => [] }) as never;
  expect(stepKindsFor(ctx(true, true))).toEqual(["narrow", "message", "rows"]);
  expect(stepKindsFor(ctx(false, true))).toEqual(["message", "rows"]);
  expect(stepKindsFor(ctx(false, false))).toEqual(["message"]);
});

test("who can do it is the groups the action names, not everyone who can open the app (WID-22)", () => {
  const ctx = {
    surface: "app",
    defaultRef: "this",
    thisTable: "invoices",
    columnsOf: () => [],
  } as never;
  const steps = [{ do: "update", record: "this", set: { status: { value: "paid" } } }] as never;
  expect(grantWords({ steps }, ctx)).toContain("People who can open the app can do this");
  const limited = grantWords(
    { steps, runBy: { groups: ["groups/billing", "groups/managers"] } },
    ctx,
  );
  expect(limited).not.toContain("People who can open the app");
  expect(limited).toContain("Only Billing and Managers can do this");
  const named = grantWords({ steps, runBy: { groups: ["groups/billing"] } }, ctx, {
    "groups/billing": "Practice billing",
  });
  expect(named).toContain("Only Practice billing can do this");
});

test("the rows behind a figure are offered for a table, and not for a saved query or SQL", async () => {
  const { actionContext } = await import("./actionControls.tsx");
  const env = (source: object) =>
    ({
      surface: "dashboard",
      catalog: { tables: [] },
      definition: { events: { click: { gives: "group" } } },
      widget: { type: "core/chart", data: { rows: { source } } },
    }) as never;
  expect(stepKindsFor(actionContext(env({ visual: { table: "invoices" } })))).toContain("rows");
  expect(stepKindsFor(actionContext(env({ query: "reports/open" })))).not.toContain("rows");
  expect(stepKindsFor(actionContext(env({ sql: "select 1" })))).not.toContain("rows");
});

test("a flow's or script's input is typed by its schema, not by how the text looks", () => {
  const stored = (property: unknown, text: string) => typedConstant(text, inputType(property));
  // A code that is digits, in an input the schema says is text, stays text.
  expect(stored({ type: "string" }, "007")).toBe("007");
  expect(stored({ type: "string" }, "true")).toBe("true");
  expect(stored({ type: "integer" }, "7")).toBe(7);
  expect(stored({ type: ["number", "null"] }, "2.5")).toBe(2.5);
  expect(stored({ type: "boolean" }, "false")).toBe(false);
  expect(stored({ type: "array" }, "a, b")).toEqual(["a", "b"]);
  // No type given: as it looks.
  expect(stored({}, "007")).toBe(7);
  expect(stored(undefined, "late")).toBe("late");
});
