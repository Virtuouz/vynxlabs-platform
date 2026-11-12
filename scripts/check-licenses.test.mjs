import { expect, test } from "vitest";
import { isAllowed } from "./check-licenses.mjs";

test("license expressions", () => {
  expect(isAllowed("MIT")).toBe(true);
  expect(isAllowed("MIT OR Apache-2.0")).toBe(true);
  expect(isAllowed("(MIT OR GPL-3.0-only)")).toBe(true);
  expect(isAllowed("MIT AND BSD-3-Clause")).toBe(true);
  expect(isAllowed("MIT AND GPL-3.0-only")).toBe(false);
  expect(isAllowed("AGPL-3.0-only")).toBe(false);
  expect(isAllowed("Unknown")).toBe(false);
});
