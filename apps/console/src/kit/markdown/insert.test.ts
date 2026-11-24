import { COMPONENTS, parse } from "@volvel/markup";
import { describe, expect, test } from "vitest";
import {
  insertables,
  insertInto,
  NOT_IN_MENU,
  nameOf,
  surround,
  togglePrefix,
  where,
} from "./insert.ts";

const page = [
  "Before.",
  "",
  ":::tabs",
  "::::tab{label=Card}",
  "Refund to the card.",
  "::::",
  "",
  "::::tab{label=Cash}",
  "Refund at the till.",
  "",
  "::::",
  ":::",
  "",
  "After.",
  "",
].join("\n");
const tree = parse(page);
const offset = (line: number, column = 1) =>
  page
    .split("\n")
    .slice(0, line - 1)
    .join("\n").length +
  (line > 1 ? 1 : 0) +
  column -
  1;
const item = (name: string, at: number) => {
  const found = insertables(where(tree, at)).find((one) => one.spec.name === name);
  if (!found) throw new Error(`${name} is not offered on line ${at}`);
  return found;
};

describe("what the Insert menu offers", () => {
  test("every component the registry can insert is in the menu, or says why it is not", () => {
    const names = new Set(insertables([], "docs").map((one) => one.spec.name));
    const offered = COMPONENTS.filter((spec) => spec.insert).map((spec) => spec.name);
    expect(
      offered.filter((name) => !names.has(name) && !(name in NOT_IN_MENU) && name !== "tab"),
    ).toEqual([]);
    for (const name of ["glossary", "pages", "changelog"]) expect(names.has(name)).toBe(true);
    // Nothing is excused that the menu offers.
    expect(Object.keys(NOT_IN_MENU).filter((name) => names.has(name))).toEqual([]);
  });

  test("inside tabs, only a tab; anywhere else, anything but a tab", () => {
    expect(insertables(where(tree, 1)).map((one) => one.spec.name)).not.toContain("tab");
    expect(insertables(where(tree, 9)).map((one) => one.spec.name)).toContain("alert");
    // Between two tabs: inside the tabs, and in no tab.
    expect(insertables(where(tree, 7)).map((one) => one.spec.name)).toEqual(["tab"]);
  });

  test("says where the cursor is by the containers it is in", () => {
    expect(where(tree, 9).map(nameOf)).toEqual(["tabs", "tab “Cash”"]);
    expect(where(tree, 14)).toEqual([]);
  });
});

describe("a component inserted", () => {
  test("inside a tab is written with one more colon than the tab, on a line of its own", () => {
    const at = offset(10);
    const made = insertInto(page, { start: at, end: at }, item("alert", 10), where(tree, 10));
    expect(made.text).toContain(
      "Refund at the till.\n\n:::::alert[Title]{type=info}\n\n:::::\n\n::::",
    );
    // And the page still reads with it inside the tab.
    expect(where(parse(made.text), 12).map(nameOf)).toEqual([
      "tabs",
      "tab “Cash”",
      "alert “Title”",
    ]);
    // The cursor is where the words go.
    expect(made.text.slice(made.select.start - 1, made.select.start + 1)).toBe("\n\n");
  });

  test("after words, goes under them, apart", () => {
    const at = offset(1, 8);
    const made = insertInto(page, { start: at, end: at }, item("details", 1), []);
    expect(made.text.slice(0, 45)).toBe('Before.\n\n:::details{summary=""}\n\n:::\n\n:::tabs');
  });

  test("inline, takes what is selected as its words", () => {
    const start = offset(14);
    const made = insertInto(page, { start, end: start + 5 }, item("kbd", 14), []);
    expect(made.text).toContain(":kbd[After].");
  });

  test("in a step, is indented as the step's own words are", () => {
    const steps = ":::steps\n1. Find the order.\n\n   \n2. Refund it.\n:::\n";
    const stepTree = parse(steps);
    const at = steps.indexOf("   \n") + 3;
    const found = insertables(where(stepTree, 4)).find((one) => one.spec.name === "details");
    if (!found) throw new Error("details");
    const made = insertInto(steps, { start: at, end: at }, found, where(stepTree, 4));
    expect(made.text).toContain('   ::::details{summary=""}\n\n   ::::\n');
  });
});

describe("the toolbar's marks", () => {
  test("surround what is selected, or a placeholder that is selected", () => {
    expect(surround("a b c", { start: 2, end: 3 }, "**", "**", "bold")).toEqual({
      text: "a **b** c",
      select: { start: 4, end: 5 },
    });
    expect(surround("ab", { start: 1, end: 1 }, "_", "_", "italic").text).toBe("a_italic_b");
  });

  test("a line's prefix is put on, and taken off again", () => {
    const on = togglePrefix("one\ntwo", { start: 5, end: 5 }, "## ");
    expect(on.text).toBe("one\n## two");
    expect(togglePrefix(on.text, on.select, "## ").text).toBe("one\ntwo");
  });
});
