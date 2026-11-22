import { expect, test } from "vitest";
import { mustGive } from "./index.js";

test("a person must give a column that is required and has no default, and only that", () => {
  expect(mustGive({ required: true })).toBe(true);
  expect(mustGive({ required: true, default: null })).toBe(true);
  expect(mustGive({ required: true, default: 20 })).toBe(false);
  expect(mustGive({ required: false })).toBe(false);
  expect(mustGive({})).toBe(false);
});
