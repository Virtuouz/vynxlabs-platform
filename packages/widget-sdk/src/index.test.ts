import { describe, expect, it } from "vitest";
import {
  compareVersions,
  countText,
  type DeployedWidget,
  defineWidget,
  definitionProblems,
  formatValue,
  updateNotes,
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

describe("a workspace's registry: the platform's packs and the widgets it deployed", () => {
  const mine = (version: string, config: WidgetDefinition["config"] = base.config) => ({
    ...base,
    type: "x/goal",
    version,
    config,
  });
  const deployed: DeployedWidget = {
    type: "x/goal",
    current: "1.2.0",
    versions: [
      { version: "1.0.0", definition: mine("1.0.0") },
      {
        version: "1.2.0",
        definition: mine("1.2.0", {
          ...base.config,
          properties: { ...base.config.properties, unit: { type: "string" } },
        }),
      },
    ],
  };

  it("lists a deployed widget beside the platform's, the newest version by default", () => {
    const registry = new WidgetRegistry([base]).withDeployed([deployed]);
    expect(registry.get("x/goal")?.version).toBe("1.2.0");
    expect(registry.get("x/goal", "1.0.0")?.version).toBe("1.0.0");
    expect(registry.get("x/goal", "9.9.9")).toBeUndefined();
    expect(registry.get("labs/goal", "7.7.7")).toBe(base);
    expect(registry.list("app").map((one) => one.type)).toEqual(["labs/goal", "x/goal"]);
    expect(registry.versionsOf("x/goal")).toEqual(["1.0.0", "1.2.0"]);
    expect(registry.versionsOf("labs/goal")).toEqual([]);
  });

  it("leaves the registry it was made from alone, and refuses a tenant type in a platform pack", () => {
    const platform = new WidgetRegistry([base]);
    platform.withDeployed([deployed]);
    expect(platform.get("x/goal")).toBeUndefined();
    expect(() => platform.withDeployed([{ ...deployed, type: "labs/goal" }])).toThrow(
      /declared twice|is not a tenant/,
    );
  });

  it("orders versions as numbers", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
  });

  it("says what an update changes in the configuration", () => {
    const [one, two] = deployed.versions;
    expect(updateNotes(one!.definition, two!.definition)).toEqual({
      added: ["unit"],
      removed: [],
    });
    expect(updateNotes(two!.definition, one!.definition)).toEqual({
      added: [],
      removed: ["unit"],
    });
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
