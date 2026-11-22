import { fileURLToPath } from "node:url";
import {
  checkInterface,
  type InterfaceBody,
  MAX_PAGE_WIDGETS,
  MAX_PAGES,
  PAGE_KINDS,
  PAGE_SIZES,
  widgetRegistry,
} from "@volvel/manifest";
import { expect, test } from "vitest";
import { buildRepository } from "./build.js";

/**
 * Fernhill's "Clinic operations" is the example that uses the whole app builder. This keeps it so:
 * a widget, a page kind or a size added later is either used there or this test says it is not.
 */
const fernhill = fileURLToPath(new URL("../../../examples/fernhill", import.meta.url));

test("Clinic operations is a valid app that uses every widget, page kind and size", async () => {
  const built = await buildRepository({ directory: fernhill });
  const manifest = built.bundle.manifests.find(
    (one) => one.kind === "interface" && one.path === "screens/operations",
  );
  expect(manifest).toBeDefined();
  const body = manifest?.body as unknown as InterfaceBody;
  expect(checkInterface(body)).toEqual([]);

  expect(body.pages.length).toBeLessThanOrEqual(MAX_PAGES);
  for (const page of body.pages) {
    expect(page.widgets.length, page.id).toBeLessThanOrEqual(MAX_PAGE_WIDGETS);
  }

  const used = new Set(body.pages.flatMap((page) => page.widgets.map((widget) => widget.type)));
  const every = widgetRegistry()
    .list()
    .map((definition) => definition.type);
  expect(every.filter((type) => !used.has(type))).toEqual([]);

  expect(new Set(body.pages.map((page) => page.kind ?? "page"))).toEqual(new Set(PAGE_KINDS));
  expect(new Set(body.pages.flatMap((page) => (page.size ? [page.size] : [])))).toEqual(
    new Set(PAGE_SIZES),
  );
  // Each chart type is drawn somewhere.
  const marks = new Set(
    body.pages.flatMap((page) =>
      page.widgets
        .filter((widget) => widget.type === "core/chart")
        .map((widget) => widget.config?.mark),
    ),
  );
  expect(marks).toEqual(new Set(["line", "bar", "area", "pie", "scatter", "heatmap"]));
}, 120_000);
