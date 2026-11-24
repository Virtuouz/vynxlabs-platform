// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import { keepPlace } from "./focus.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a place kept after the page has gone is let go, not looked for in a document that is not there", () => {
  // The action ends after its page was torn down (a test that has finished, a tab being closed):
  // the look that comes a moment later finds no document, and stops without an error.
  vi.useFakeTimers();
  const button = document.createElement("button");
  document.body.append(button);
  const done = keepPlace(button);
  button.remove();
  done();
  vi.stubGlobal("document", undefined);
  expect(() => vi.runAllTimers()).not.toThrow();
});
