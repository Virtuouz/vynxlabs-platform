import { describe, expect, it } from "vitest";
import {
  countText,
  defineWidget,
  definitionProblems,
  formatValue,
  type WidgetDefinition,
  WidgetRegistry,
} from "./index.js";

const base: WidgetDefinition = {
  type: "labs/goal",
  version: "0.1.0",
  title: "Goal",
  description: "Progress toward a target",
  category: "understand",
  icon: "target",
  surfaces: ["app"],
  data: { value: { shape: "summary" } },
  config: {
    type: "object",
    properties: {
      target: {
        type: "number",
        "x-volvel": { tab: "display", control: "number", label: "Target" },
      },
    },
  },
  events: { click: { gives: "nothing", label: "When it is clicked" } },
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
};

describe("the widget contract", () => {
  it("accepts a definition the inspector can draw", () => {
    expect(definitionProblems(base)).toEqual([]);
    expect(defineWidget(base)).toBe(base);
  });

  it("refuses a setting with no hint, an unknown control, and a hint for data it doesn't take", () => {
    const wrong: WidgetDefinition = {
      ...base,
      config: {
        type: "object",
        properties: {
          bare: { type: "string" },
          odd: {
            type: "string",
            "x-volvel": { tab: "display", control: "colour" as never, label: "Odd" },
          },
          stray: {
            type: "string",
            "x-volvel": { tab: "data", control: "column", of: "rows", label: "Stray" },
          },
        },
      },
    };
    expect(definitionProblems(wrong)).toEqual([
      'labs/goal: config "bare" has no x-volvel hint, so the inspector can\'t draw it',
      'labs/goal: config "odd": there is no control "colour"',
      'labs/goal: config "stray" belongs to data input "rows", which it doesn\'t declare',
    ]);
    expect(() => defineWidget(wrong)).toThrow(/no x-volvel hint/);
  });

  it("refuses a type that isn't pack/name and sizes that don't fit", () => {
    expect(
      definitionProblems({
        ...base,
        type: "Goal",
        layout: { min: { w: 4, h: 4 }, default: { w: 3, h: 3 } },
      }),
    ).toEqual([
      'Goal: a type is "pack/name" in small letters',
      "Goal: its default size is smaller than its smallest",
    ]);
  });

  it("keeps one definition per type, and lists by surface", () => {
    const registry = new WidgetRegistry([base]);
    expect(() => registry.add(base)).toThrow(/declared twice/);
    expect(registry.list("dashboard")).toEqual([]);
    expect(registry.list("app")).toEqual([base]);
    expect(WidgetRegistry.packOf("labs/goal")).toBe("labs");
  });
});

describe("numbers are written in the reader's locale (D38)", () => {
  it("a number, a count and money follow the browser's language", () => {
    const was = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const use = (language: string) =>
      Object.defineProperty(globalThis, "navigator", {
        value: { languages: [language], language },
        configurable: true,
      });
    try {
      use("de-DE");
      expect(formatValue(1234.5, undefined)).toBe("1.234,5");
      expect(countText(1204)).toBe("1.204");
      expect(formatValue(120000, { style: "currency", currency: "EUR", minorUnits: true })).toMatch(
        /1\.200,00\s*€/,
      );
      use("en-US");
      expect(formatValue(1234.5, undefined)).toBe("1,234.5");
      expect(countText(1204)).toBe("1,204");
    } finally {
      if (was) Object.defineProperty(globalThis, "navigator", was);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
  });
});
