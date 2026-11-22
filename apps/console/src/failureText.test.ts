import { describe, expect, test } from "vitest";
import { failureText } from "./ask.tsx";

// A red toast always says something: whatever was thrown, a person reads words (phase 28, F5).
describe("what an error says to a person", () => {
  test("a sentence given as the error is the sentence", () => {
    expect(failureText("You can change this app but not publish it here.")).toBe(
      "You can change this app but not publish it here.",
    );
  });

  test("an Error says its message", () => {
    expect(failureText(new Error("The clipboard could not be reached."))).toBe(
      "The clipboard could not be reached.",
    );
  });

  test("nothing, an empty string, an empty object and an Error with no message still say something", () => {
    for (const nothing of [undefined, null, "", "  ", {}, new Error("")]) {
      expect(failureText(nothing).trim().length).toBeGreaterThan(10);
    }
  });
});
