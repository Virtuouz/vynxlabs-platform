import type { InterfaceBody } from "@volvel/manifest";
import { expect, test } from "vitest";
import { canonical, draftChangeCount, savedWords } from "./changes.ts";

const widget = (config: Record<string, unknown>) => ({
  id: "chart",
  type: "core/chart",
  title: "Chart",
  config,
});
const app = (config: Record<string, unknown>) =>
  ({
    title: "App",
    pages: [{ id: "blank", title: "Blank", widgets: [widget(config)] }],
  }) as unknown as InterfaceBody;

// What was just published is not a change, whatever order the store gives the keys back in (F4).
test("the same app with its keys in another order has no changes", () => {
  const built = app({ kind: "bar", measure: { fn: "count" }, colour: undefined });
  const stored = app({ measure: { fn: "count" }, kind: "bar" });
  expect(draftChangeCount(stored, built)).toBe(0);
  expect(canonical({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonical({ a: [{ c: 2, d: 1 }], b: 1 }));
});

test("a real difference is still counted", () => {
  expect(draftChangeCount(app({ kind: "bar" }), app({ kind: "line" }))).toBe(1);
});

test("a save is told by what it did: added, moved, resized, in a few words", () => {
  const at = (x: number, y: number, w = 3, h = 3) => ({ x, y, w, h });
  const body = (...widgets: unknown[]) =>
    ({ title: "App", pages: [{ id: "p", title: "P", widgets }] }) as unknown as InterfaceBody;
  const table = (box: ReturnType<typeof at>) => ({
    id: "t",
    type: "core/table",
    title: "Table",
    at: box,
  });
  const stat = { id: "s", type: "core/stat", title: "Stat", at: at(0, 5) };
  expect(savedWords(body(table(at(0, 0))), body(table(at(0, 0)), stat))).toBe("Added stat");
  expect(savedWords(body(table(at(0, 0))), body(table(at(4, 0))))).toBe("Moved table");
  expect(savedWords(body(table(at(0, 0))), body(table(at(0, 0, 5, 3))))).toBe(
    "Resized table",
  );
  expect(savedWords(body(table(at(0, 0))), body(table(at(0, 0))))).toBe("No change to the pages");
  expect(savedWords(body(table(at(0, 0))), body(table(at(4, 0)), stat))).toBe(
    "Moved table, added stat",
  );
});
