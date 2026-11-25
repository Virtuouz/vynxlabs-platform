import { describe, expect, test } from "vitest";
import { defineWidget, isResourceDefinition } from "./index.js";

const options = {
  type: "x/goal",
  version: "1.0.0",
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
  events: { reached: { gives: "nothing", label: "When the target is reached" } },
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  entry: "widgets/goal/view.tsx",
} as const;

describe("defineWidget in a repository", () => {
  test("is a resource the build picks up, owned by the code, at the path of its type", () => {
    const goal = defineWidget(options);
    expect(isResourceDefinition(goal)).toBe(true);
    expect(goal.kind).toBe("widget");
    expect(goal.path).toBe("x/goal");
    const manifest = goal.toManifest("goal");
    expect(manifest).toMatchObject({
      kind: "widget",
      schemaVersion: 1,
      path: "x/goal",
      ownership: "code",
    });
    expect(manifest.body).toMatchObject({ type: "x/goal", entry: "widgets/goal/view.tsx" });
    expect(manifest.body).not.toHaveProperty("key");
  });

  test("refuses another namespace, with the sentence that says what to write", () => {
    expect(() => defineWidget({ ...options, type: "core/goal" })).toThrow(
      'a widget of your own is "x/<name>"',
    );
  });

  test("refuses what the contract refuses: a setting with no hint for the inspector", () => {
    expect(() =>
      defineWidget({
        ...options,
        config: { type: "object", properties: { target: { type: "number" } } },
      }),
    ).toThrow("has no x-volvel hint");
  });

  test("refuses a view outside the repository", () => {
    expect(() => defineWidget({ ...options, entry: "../view.tsx" })).toThrow("entry");
  });
});
