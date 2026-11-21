import { RELATIVE_RANGES } from "@volvel/manifest";
import { corePack } from "@volvel/widgets-core/views";
import { expect, test } from "vitest";
import { RANGE_LABELS } from "./filters.ts";
import { viewRegistry, type WireData } from "./types.ts";
import { isEmpty, toWidgetData } from "./wire.ts";

test("the registry holds each type with its definition and its view", () => {
  const registry = viewRegistry(corePack);
  expect([...registry.keys()]).toEqual([
    "core/table",
    "core/list",
    "core/detail",
    "core/form",
    "core/button",
    "core/stat",
    "core/chart",
    "core/pivot",
    "core/text",
  ]);
  expect(registry.get("core/chart")?.definition.title).toBe("Chart");
  expect(registry.get("labs/orbit")).toBeUndefined();
});

test("a type in two packs, or a definition with no view, is a mistake", () => {
  expect(() => viewRegistry(corePack, corePack)).toThrow("core/table is in two packs");
  expect(() => viewRegistry({ definitions: corePack.definitions, views: {} })).toThrow(
    "core/table has a definition but no view",
  );
});

test("rows with a next page are given a way to ask for it, and the cursor is kept from the view", () => {
  const more = () => {};
  const drawn = toWidgetData({ shape: "rows", columns: [], rows: [], next: "c2" }, more);
  expect(drawn).toMatchObject({ shape: "rows", more });
  expect(drawn).not.toHaveProperty("next");
  // The last page has nothing to ask for.
  expect(toWidgetData({ shape: "rows", columns: [], rows: [] }, more)).not.toHaveProperty("more");
});

test("a read is empty when every input has nothing, and a figure with no groups never is", () => {
  const summary = (breakdowns: string[], rows: Record<string, unknown>[]): WireData => ({
    shape: "summary",
    columns: [],
    breakdowns,
    values: ["n"],
    rows,
  });
  expect(isEmpty({ rows: { shape: "rows", columns: [], rows: [] } })).toBe(true);
  expect(isEmpty({ rows: summary(["a"], []) })).toBe(true);
  expect(isEmpty({ value: summary([], []) })).toBe(false);
  expect(isEmpty({ one: { shape: "record", columns: [], record: null } })).toBe(false);
  expect(isEmpty({ one: { shape: "record", columns: [], record: { id: "a" } } })).toBe(false);
  expect(isEmpty({})).toBe(false);
});

test("every range the manifest names has words, and nothing else does", () => {
  expect(Object.keys(RANGE_LABELS)).toEqual([...RELATIVE_RANGES]);
});
