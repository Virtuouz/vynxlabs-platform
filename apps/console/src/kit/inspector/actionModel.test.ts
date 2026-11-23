import { expect, test } from "vitest";
import { stepKindsFor, typedConstant } from "./actionModel.ts";

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
