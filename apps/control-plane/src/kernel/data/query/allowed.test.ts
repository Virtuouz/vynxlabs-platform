import { expect, test } from "vitest";
import { ALLOWED_FUNCTIONS, ALLOWED_TYPES, FUNCTION_GROUPS } from "./allowed.js";

test("the functions a query may name are listed once, in groups the reference is drawn from", () => {
  const names = FUNCTION_GROUPS.flatMap((group) => group.functions);
  expect(new Set(names).size).toBe(names.length);
  expect([...ALLOWED_FUNCTIONS].sort()).toEqual([...names].sort());
  for (const group of FUNCTION_GROUPS) {
    expect(group.description, group.name).toMatch(/\.$/);
    expect(group.functions.length, group.name).toBeGreaterThan(0);
  }
  expect(ALLOWED_TYPES.has("text")).toBe(true);
});
