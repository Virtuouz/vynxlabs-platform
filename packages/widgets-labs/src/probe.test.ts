import { definitionProblems, WidgetRegistry } from "@volvel/widgets";
import { describe, expect, test } from "vitest";
import { LABS_WIDGETS, probe } from "./index.ts";

describe("the labs pack", () => {
  test("holds a widget only to try the contract with, and offers none in Add to page", () => {
    expect(definitionProblems(probe)).toEqual([]);
    expect(LABS_WIDGETS).toEqual([]);
    expect(WidgetRegistry.packOf(probe.type)).toBe("labs");
  });
});
