import type { InterfaceBody } from "@volvel/manifest";
import { expect, test } from "vitest";
import { canonical, draftChangeCount } from "./changes.ts";

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
