import { describe, expect, test } from "vitest";
import type { BundleManifest } from "./bundle.js";
import { checkBundleManifests } from "./bundle-check.js";
import { platformKinds } from "./kinds.js";

const body = () => ({
  type: "x/goal",
  version: "1.0.0",
  title: "Goal",
  description: "Progress toward a target",
  category: "understand",
  icon: "target",
  surfaces: ["app", "dashboard"],
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
  events: {
    reached: {
      gives: "nothing",
      label: "When the target is reached",
      payload: { type: "object", properties: { at: { type: "number" } } },
    },
  },
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  entry: "widgets/goal/view.tsx",
});

const widget = (change: (body: Record<string, unknown>) => void = () => {}): BundleManifest => {
  const made = body() as Record<string, unknown>;
  change(made);
  return { kind: "widget", schemaVersion: 1, path: "x/goal", ownership: "code", body: made };
};

describe("the widget kind", () => {
  test("is one of the platform's kinds", () => {
    expect(platformKinds.map((kind) => kind.kind)).toContain("widget");
  });

  test("a widget with everything it declares is accepted", () => {
    expect(checkBundleManifests([widget()])).toEqual([]);
  });

  test("a type outside the tenant's namespace is refused, for core and labs and any other", () => {
    for (const type of ["core/goal", "labs/goal", "acme/goal"]) {
      expect(checkBundleManifests([widget((b) => (b.type = type))])).toEqual(
        expect.arrayContaining([expect.stringContaining("/body/type")]),
      );
    }
  });

  test("the path is the type, so a page and a deploy find it one way", () => {
    const other = { ...widget(), path: "x/other" };
    expect(checkBundleManifests([other])).toEqual([
      'x/other (widget): the path is the widget\'s type: it is "x/goal", so its path is x/goal.',
    ]);
  });

  test("a version that is not x.y.z, and no view, are refused", () => {
    expect(checkBundleManifests([widget((b) => (b.version = "v1"))])).toEqual([
      expect.stringContaining("/body/version"),
    ]);
    expect(checkBundleManifests([widget((b) => delete b.entry)])).toEqual([
      expect.stringContaining("/body must have required property 'entry'"),
    ]);
  });

  test("a setting the inspector cannot draw is told, by the contract's own check", () => {
    const problems = checkBundleManifests([
      widget((b) => {
        (b.config as { properties: Record<string, unknown> }).properties.target = {
          type: "number",
        };
      }),
    ]);
    expect(problems).toEqual([
      expect.stringContaining(
        'config "target" has no x-volvel hint, so the inspector can\'t draw it',
      ),
    ]);
  });

  test("a config that is not a JSON Schema, and an event payload that is not, are refused", () => {
    expect(
      checkBundleManifests([
        widget((b) => {
          (b.config as { properties: Record<string, unknown> }).properties.target = {
            type: "nonsense",
            "x-volvel": { tab: "display", control: "number", label: "Target" },
          };
        }),
      ]),
    ).toEqual([expect.stringContaining("config is not a JSON Schema")]);
    expect(
      checkBundleManifests([
        widget((b) => {
          const events = b.events as Record<string, { payload: unknown }>;
          (events.reached as { payload: unknown }).payload = { type: "nonsense" };
        }),
      ]),
    ).toEqual([expect.stringContaining('event "reached": its payload is not a JSON Schema')]);
  });

  test("an entry that leaves the repository is refused", () => {
    expect(checkBundleManifests([widget((b) => (b.entry = "../outside.tsx"))])).toEqual([
      expect.stringContaining("entry"),
    ]);
    expect(checkBundleManifests([widget((b) => (b.entry = "/etc/passwd"))])).toEqual([
      expect.stringContaining("entry"),
    ]);
  });
});

describe("a page that uses a widget of the repository", () => {
  const page = (version?: string, type = "x/goal"): BundleManifest => ({
    kind: "dashboard",
    schemaVersion: 3,
    path: "dash",
    ownership: "code",
    body: {
      widgets: [
        {
          id: "g",
          type,
          ...(version ? { version } : {}),
          at: { x: 0, y: 0, w: 3, h: 3 },
          data: {
            value: { source: { visual: { table: "t", measures: [{ fn: "count", as: "n" }] } } },
          },
        },
      ],
    },
  });

  test("is checked against the widget the bundle holds, at the version it holds", () => {
    expect(
      checkBundleManifests([widget(), page("1.0.0")]).filter((p) => p.startsWith("dash")),
    ).toEqual([]);
    expect(checkBundleManifests([widget(), page("0.9.0")])).toEqual([
      expect.stringContaining('version 0.9.0 of "x/goal" is not deployed (deployed: 1.0.0)'),
    ]);
    expect(checkBundleManifests([widget(), page()])).toEqual([
      expect.stringContaining("say the version it was made with"),
    ]);
  });

  test("is refused when the bundle has no such widget", () => {
    expect(checkBundleManifests([page("1.0.0")])).toEqual([
      expect.stringContaining('there is no widget called "x/goal"'),
    ]);
  });
});
