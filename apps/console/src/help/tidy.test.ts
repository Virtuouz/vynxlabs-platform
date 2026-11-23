import { expect, test } from "vitest";
import { tidyWords } from "./HelpPanel.tsx";

test("NARROW-4: a passage from a table reads as its cells, with no pipes or rule", () => {
  const words = tidyWords([
    { text: "| tenant access:read | See how", hit: false },
    { text: " access", hit: true },
    { text: " works | --- | --- |", hit: false },
  ] as never);
  const text = words.map((word) => word.text).join("");
  expect(text).not.toContain("|");
  expect(text).not.toContain("---");
  expect(text.startsWith("tenant access:read · See how")).toBe(true);
});
