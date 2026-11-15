import { expect, test } from "vitest";
import { folded, lineDiff, sortedJson } from "./kit/diff.ts";

test("a diff keeps what the sides share, and says what was removed and added", () => {
  const before = ["a", "b", "c", "d", "e"];
  const after = ["a", "b", "x", "d", "e", "f"];
  expect(lineDiff(before, after)).toEqual([
    { type: "same", text: "a" },
    { type: "same", text: "b" },
    { type: "removed", text: "c" },
    { type: "added", text: "x" },
    { type: "same", text: "d" },
    { type: "same", text: "e" },
    { type: "added", text: "f" },
  ]);
  expect(lineDiff([], ["one"])).toEqual([{ type: "added", text: "one" }]);
  expect(lineDiff(["one"], [])).toEqual([{ type: "removed", text: "one" }]);
  expect(lineDiff(["same"], ["same"])).toEqual([{ type: "same", text: "same" }]);
});

test("two bodies line up whatever the order of their keys", () => {
  expect(sortedJson({ b: 1, a: { d: 2, c: 3 } })).toEqual(sortedJson({ a: { c: 3, d: 2 }, b: 1 }));
  expect(sortedJson(null)).toEqual([]);
  const diff = lineDiff(sortedJson({ a: 1, b: 2 }), sortedJson({ b: 3, a: 1 }));
  expect(diff.filter((line) => line.type !== "same").map((line) => line.text.trim())).toEqual([
    '"b": 2',
    '"b": 3',
  ]);
});

test("lines far from any change are folded", () => {
  const before = Array.from({ length: 20 }, (_, n) => `line ${n}`);
  const after = [...before];
  after[10] = "changed";
  const shown = folded(lineDiff(before, after), 2);
  expect(shown[0]).toEqual({ type: "fold", count: 8 });
  expect(shown.filter((line) => line.type !== "fold")).toHaveLength(6);
  expect(shown.at(-1)).toEqual({ type: "fold", count: 7 });
});
