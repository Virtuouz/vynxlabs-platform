import { describe, expect, test } from "vitest";
import type { BundleManifest } from "./bundle.js";
import { checkBundleAssets, checkBundleManifests } from "./bundle-check.js";
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

  test("is checked against the widgets the bundle holds, at any version: the workspace checks versions", () => {
    const only = (problems: string[]) => problems.filter((one) => one.startsWith("dash"));
    expect(only(checkBundleManifests([widget(), page("1.0.0")]))).toEqual([]);
    expect(only(checkBundleManifests([widget(), page("0.9.0")]))).toEqual([]);
    expect(only(checkBundleManifests([widget(), page()]))).toEqual([]);
  });

  test("naming a widget the bundle does not carry is left to the workspace, which may still have it", () => {
    expect(checkBundleManifests([page("1.0.0")])).toEqual([]);
  });
});

describe("the files of a widget in a bundle", () => {
  const file = (path: string) => ({
    app: "x/goal",
    path,
    sha256: "a".repeat(64),
    size: 1,
    contentType: "text/html",
  });
  const bundle = (paths: string[], owner = "x/goal") => ({
    formatVersion: 4 as const,
    manifests: [widget()],
    assets: paths.map((path) => ({ ...file(path), app: owner })),
  });

  test("are its frame page and one script", () => {
    expect(checkBundleAssets(bundle(["frame.html", "view-1a2b3c4d.js"]))).toEqual([]);
  });

  test("are refused when the page, the script or both are missing, or others come with them", () => {
    expect(checkBundleAssets(bundle(["view-1a2b3c4d.js"]))).toEqual([
      expect.stringContaining("its frame page frame.html is not among its files"),
      expect.stringContaining("a widget is its frame page and one script, and has 1 files"),
    ]);
    expect(checkBundleAssets(bundle(["frame.html"]))).toEqual([
      expect.stringContaining("its script is not among its files"),
      expect.stringContaining("has 1 files"),
    ]);
    expect(checkBundleAssets(bundle(["frame.html", "view-1a2b3c4d.js", "extra.js"]))).toEqual([
      expect.stringContaining("has 3 files"),
    ]);
  });

  test("are refused for a widget the bundle does not have", () => {
    expect(checkBundleAssets(bundle(["frame.html", "view-1a2b3c4d.js"], "x/other"))).toEqual(
      expect.arrayContaining([expect.stringContaining("not an app or a widget")]),
    );
  });
});
