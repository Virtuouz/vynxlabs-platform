// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import type { DeployedWidget, WidgetDefinition } from "@volvel/widgets";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test } from "vitest";
import { TenantWidgetHost, workspaceViews } from "./TenantWidgetHost.tsx";
import { viewRegistry } from "./types.ts";

afterEach(cleanup);

const gauge = (version: string, title = "Gauge"): WidgetDefinition => ({
  type: "x/gauge",
  version,
  title,
  description: "A needle",
  category: "understand",
  icon: "gauge",
  surfaces: ["app", "dashboard"],
  data: {},
  config: { type: "object", properties: {} },
  events: {},
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
});
const deployed: DeployedWidget[] = [
  {
    type: "x/gauge",
    current: "1.1.0",
    versions: [
      { version: "1.0.0", definition: gauge("1.0.0", "Gauge (old)") },
      { version: "1.1.0", definition: gauge("1.1.0") },
    ],
  },
];
const props = {
  config: {},
  data: {},
  size: { w: 3, h: 3, narrow: false },
  emit: () => {},
  building: false,
};

describe("the views of a workspace", () => {
  test("hold the platform's packs and the workspace's widgets, each drawn by the host", () => {
    const views = workspaceViews(viewRegistry(corePack), deployed);
    expect(views.get("core/table")).toBeDefined();
    const entry = views.get("x/gauge");
    expect(entry?.definition.version).toBe("1.1.0");
    expect(entry?.versions?.get("1.0.0")?.title).toBe("Gauge (old)");
    expect(entry?.View).toBeDefined();
  });

  test("the platform's registry is left as it was", () => {
    const base = viewRegistry(corePack);
    workspaceViews(base, deployed);
    expect(base.get("x/gauge")).toBeUndefined();
  });

  test("a widget with a view of the platform's is not replaced by a tenant's of its type", () => {
    const clash: DeployedWidget[] = [{ ...deployed[0], type: "core/table" } as DeployedWidget];
    expect(() => workspaceViews(viewRegistry(corePack), clash)).toThrow(/core\/table/);
  });

  test("the host says which widget and which version it stands for, in its cell", () => {
    const View = workspaceViews(viewRegistry(corePack), deployed).get("x/gauge")?.View as never as (
      p: typeof props & { version?: string },
    ) => React.ReactElement;
    render(<View {...props} version="1.0.0" />);
    const box = screen.getByRole("region", { name: "Gauge (old) v1.0.0" });
    expect(box.textContent).toContain("Widget Gauge (old) v1.0.0");
    expect(box.className).toContain("h-full");
  });

  test("a widget that names no version is drawn at the current one", () => {
    const View = workspaceViews(viewRegistry(corePack), deployed).get("x/gauge")?.View as never as (
      p: typeof props,
    ) => React.ReactElement;
    render(<View {...props} />);
    expect(screen.getByText("Widget Gauge v1.1.0")).toBeDefined();
  });

  test("TenantWidgetHost is the one place b4 fills with the sandboxed frame", () => {
    render(
      <TenantWidgetHost {...props} type="x/gauge" version="1.0.0" definition={gauge("1.0.0")} />,
    );
    expect(screen.getByText("Widget Gauge v1.0.0")).toBeDefined();
  });
});
