// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import type { DeployedWidget, WidgetDefinition } from "@volvel/widgets";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Inspector } from "./kit/inspector/Inspector.tsx";
import { AddToPage } from "./screens/builder/AddToPage.tsx";
import {
  definitionOf,
  offeredOn,
  resetWorkspaceWidgets,
  setWorkspaceWidgets,
  updated,
  updateOf,
} from "./screens/builder/registry.ts";

const gauge = (version: string, extra: Record<string, unknown> = {}): WidgetDefinition => ({
  type: "x/gauge",
  version,
  title: "Gauge",
  description: "Invoices on a needle",
  category: "understand",
  icon: "gauge",
  surfaces: ["app", "dashboard"],
  data: {},
  config: {
    type: "object",
    properties: {
      max: {
        type: "integer",
        "x-volvel": { tab: "display", control: "number", label: "Most", order: 1 },
      },
      ...extra,
    },
  },
  events: { reached: { gives: "nothing", label: "When the needle is full" } },
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
});
const loud = {
  loud: {
    type: "boolean",
    "x-volvel": { tab: "display", control: "switch", label: "Loud", order: 2 },
  },
};
const deployed: DeployedWidget[] = [
  {
    type: "x/gauge",
    current: "1.1.0",
    versions: [
      { version: "1.0.0", definition: gauge("1.0.0", { old: { type: "string" } }) },
      { version: "1.1.0", definition: gauge("1.1.0", loud) },
    ],
  },
];
const placed = (version?: string): PageWidget => ({
  id: "g",
  type: "x/gauge",
  ...(version ? { version } : {}),
  at: { x: 0, y: 0, w: 3, h: 3 },
  config: { max: 5, old: "kept?" },
});

beforeEach(() => setWorkspaceWidgets("/w", deployed));
afterEach(() => {
  cleanup();
  resetWorkspaceWidgets();
});

describe("the console's registry of a workspace", () => {
  test("offers a deployed widget beside the platform's, by its current version", () => {
    expect(offeredOn("app").map((one) => one.type)).toContain("x/gauge");
    expect(offeredOn("app").map((one) => one.type)).toContain("core/chart");
    expect(definitionOf("x/gauge")?.version).toBe("1.1.0");
    expect(definitionOf("x/gauge", "1.0.0")?.version).toBe("1.0.0");
    resetWorkspaceWidgets();
    expect(definitionOf("x/gauge")).toBeUndefined();
  });

  test("says what a newer version changes, and applies it only when asked", () => {
    expect(updateOf(placed("1.1.0"))).toBeUndefined();
    expect(updateOf({ ...placed(), type: "core/chart" })).toBeUndefined();
    const update = updateOf(placed("1.0.0"));
    expect(update).toMatchObject({
      version: "1.1.0",
      added: ["loud"],
      removed: ["old"],
      says: "Adds Loud. Removes old.",
    });
    expect(updated(placed("1.0.0"))).toMatchObject({ version: "1.1.0", config: { max: 5 } });
    expect(updated(placed("1.0.0")).config).not.toHaveProperty("old");
  });
});

describe("Add to page, with a tenant widget", () => {
  test("lists it in its category, with its icon and its description, and adds it at its version", () => {
    const onAdd = vi.fn();
    render(<AddToPage open onClose={() => undefined} surface="app" onAdd={onAdd} />);
    const group = screen.getByRole("region", { name: /Understand data/ });
    const tile = within(group).getByRole("button", { name: /^Gauge/ });
    expect(tile.textContent).toContain("Invoices on a needle");
    expect(tile.querySelector("svg")).not.toBeNull();
    fireEvent.click(tile);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "x/gauge", version: "1.1.0" }),
    );
  });
});

describe("the inspector of a tenant widget", () => {
  let written: PageWidget[];
  function Harness({ start }: { start: PageWidget }) {
    const [widget, setWidget] = useState(start);
    return (
      <Inspector
        widget={widget}
        definition={definitionOf(widget.type, widget.version)}
        update={updateOf(widget)}
        surface="app"
        filters={[]}
        catalog={{ tables: [], queries: [], maySql: false }}
        onChange={(next) => {
          written.push(next);
          setWidget(next);
        }}
        onUpdate={() => {
          const next = updated(widget);
          written.push(next);
          setWidget(next);
        }}
        onDuplicate={() => {}}
        onRemove={() => {}}
      />
    );
  }
  beforeEach(() => {
    written = [];
  });

  test("is drawn from the hints of the version the widget was placed at", () => {
    render(<Harness start={placed("1.0.0")} />);
    expect(screen.getByText("Gauge · Your widgets")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Most/ })).toBeTruthy();
    expect(screen.queryByLabelText("Loud")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Actions/ }));
    expect(screen.getByText("When the needle is full")).toBeTruthy();
  });

  test("offers an update when a newer version is deployed, and applies it only when pressed", () => {
    render(<Harness start={placed("1.0.0")} />);
    expect(screen.getByText(/Version 1\.1\.0 is deployed/)).toBeTruthy();
    expect(screen.getByText(/Adds Loud\. Removes old\./)).toBeTruthy();
    expect(written).toEqual([]);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Update to v1.1.0" }));
    });
    expect(written.at(-1)).toMatchObject({ version: "1.1.0" });
    expect(screen.queryByRole("button", { name: /^Update to/ })).toBeNull();
    expect(screen.getByLabelText("Loud")).toBeTruthy();
  });

  test("shows no update for the newest version", () => {
    render(<Harness start={placed("1.1.0")} />);
    expect(screen.queryByRole("button", { name: /^Update to/ })).toBeNull();
  });
});
