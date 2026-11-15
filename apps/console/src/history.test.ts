import { expect, test } from "vitest";
import { COALESCE_MS, HISTORY_LIMIT, History } from "./kit/history.ts";

test("a change is undone and redone, and a new change clears what could be redone", () => {
  const history = new History<number>();
  history.record(1, "Add a step", undefined, 0);
  history.record(2, "Remove a step", undefined, 5000);
  expect(history.undoLabel).toBe("Remove a step");
  expect(history.undo(3)).toBe(2);
  expect(history.redoLabel).toBe("Remove a step");
  expect(history.undo(2)).toBe(1);
  expect(history.undo(1)).toBeUndefined();
  expect(history.redo(1)).toBe(2);
  expect(history.redo(2)).toBe(3);
  expect(history.redo(3)).toBeUndefined();
  history.undo(3);
  history.record(2, "Tidy up", undefined, 9000);
  expect(history.redoLabel).toBeUndefined();
  expect(history.redo(4)).toBeUndefined();
});

test("typing in one field is one step, until it pauses or another field is typed in", () => {
  const history = new History<string>();
  history.record("", "Change start", "start:input", 0);
  history.record("a", "Change start", "start:input", 200);
  history.record("ab", "Change start", "start:input", 400);
  history.record("abc", "Change other", "other:input", 500);
  history.record("abcd", "Change other", "other:input", 500 + COALESCE_MS + 1);
  expect(history.undo("abcde")).toBe("abcd");
  expect(history.undo("abcd")).toBe("abc");
  expect(history.undo("abc")).toBe("");
  expect(history.undo("")).toBeUndefined();
});

test("nothing that did not change is a step, and only the last hundred are kept", () => {
  const history = new History<{ n: number }>();
  history.record({ n: 0 }, "Select", undefined, 0);
  history.record({ n: 0 }, "Select", undefined, 5000);
  expect(history.undo({ n: 1 })).toEqual({ n: 0 });
  expect(history.undo({ n: 0 })).toBeUndefined();

  const long = new History<number>();
  for (let n = 0; n < HISTORY_LIMIT + 20; n++) long.record(n, "Change", undefined, n * 5000);
  let undone = 0;
  let at = HISTORY_LIMIT + 20;
  for (;;) {
    const back = long.undo(at);
    if (back === undefined) break;
    at = back;
    undone++;
  }
  expect(undone).toBe(HISTORY_LIMIT);
  expect(at).toBe(20);
});
