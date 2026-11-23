import { expect, test } from "vitest";
import { typedConstant } from "./actionModel.ts";

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
