import { expect, test } from "vitest";
import { isAllowed, isAllowedByName } from "./check-licenses.mjs";

test("license expressions", () => {
  expect(isAllowed("MIT")).toBe(true);
  expect(isAllowed("MIT OR Apache-2.0")).toBe(true);
  expect(isAllowed("(MIT OR GPL-3.0-only)")).toBe(true);
  expect(isAllowed("MIT AND BSD-3-Clause")).toBe(true);
  expect(isAllowed("MIT AND GPL-3.0-only")).toBe(false);
  expect(isAllowed("AGPL-3.0-only")).toBe(false);
  expect(isAllowed("Unknown")).toBe(false);
});

test("a package accepted by name is accepted only for its own term, and no other package is", () => {
  expect(isAllowed("PSF-2.0")).toBe(true);
  expect(isAllowed("EPL-2.0")).toBe(false);
  expect(isAllowedByName("elkjs", "EPL-2.0 OR GPL-3.0-or-later")).toBe(true);
  expect(isAllowedByName("elkjs", "(EPL-2.0 OR GPL-3.0-or-later)")).toBe(true);
  expect(isAllowedByName("elkjs", "GPL-3.0-or-later")).toBe(false);
  expect(isAllowedByName("another", "EPL-2.0")).toBe(false);
});
