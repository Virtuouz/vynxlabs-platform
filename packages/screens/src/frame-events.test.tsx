// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Action, PageWidget } from "@volvel/manifest";
import { ToastProvider } from "@volvel/ui";
import { defineWidget, type WidgetViewProps } from "@volvel/widgets";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageView } from "./PageView.tsx";
import { type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const col = (name: string, type = "text") => ({ name, type, label: name });
const rowsWire: WireData = {
  shape: "rows",
  columns: [col("id", "uuid"), col("name")],
  rows: [{ id: "a", name: "Northside" }],
};
const base = {
  version: "1.0.0",
  description: "Test",
  category: "records",
  icon: "table",
  surfaces: ["app"],
  config: { type: "object", properties: {}, additionalProperties: false },
  layout: { min: { w: 1, h: 1 }, default: { w: 6, h: 4 }, phone: "stack" },
} as const;
const events = {
  chosen: { gives: "record", label: "When a clinic is chosen" },
  poked: { gives: "nothing", label: "When it is poked" },
} as const;
const tenantDef = defineWidget({
  ...base,
  type: "x/clinic-load",
  title: "Clinic load",
  data: {},
  events,
});
const coreDef = defineWidget({
  ...base,
  type: "core/table",
  title: "Table",
  data: {},
  events,
});

/** What a frame does: raises an event as it likes, with no click on the page's own controls. */
function EmitView({ emit }: WidgetViewProps) {
  return (
    <div>
      <button type="button" onClick={() => emit("chosen", { record: "a" })}>
        Choose
      </button>
      <button type="button" onClick={() => emit("poked", {})}>
        Poke
      </button>
    </div>
  );
}
/** A tenant view that runs an action by its config path, not through an event. */
function ActView({ act }: WidgetViewProps) {
  return (
    <button type="button" onClick={() => void act?.("config/action")}>
      Act
    </button>
  );
}
const actDef = defineWidget({ ...base, type: "x/actor", title: "Actor", data: {}, events });
const registry = viewRegistry({
  definitions: [tenantDef, coreDef, actDef],
  views: {
    "x/clinic-load": EmitView as never,
    "core/table": EmitView as never,
    "x/actor": ActView as never,
  },
});

const close: Action = {
  steps: [{ do: "script", path: "ops/close-open-orders" }],
};
const filter: Action = { steps: [{ do: "narrow", filter: "clinic", from: "id" }] };
const widget = (type: string, on: Record<string, Action>): PageWidget => ({
  id: "w",
  type,
  at: { x: 0, y: 0, w: 6, h: 4 },
  on,
});
const clientOf = () =>
  ({
    read: vi.fn(async () => ({ inputs: {} })),
    act: vi.fn(async () => ({ client: [] })),
    behind: vi.fn(async () => rowsWire),
  }) satisfies PageDataClient;

function show(w: PageWidget, client: PageDataClient) {
  render(
    <ToastProvider>
      <PageView
        widgets={[w]}
        filters={[]}
        registry={registry}
        client={client}
        filterValues={{}}
        onFilterValues={vi.fn()}
      />
    </ToastProvider>,
  );
}

describe("a tenant widget's event that would change something", () => {
  test("asks first, in the page's own dialog, and runs nothing until Confirm", async () => {
    const client = clientOf();
    show(widget("x/clinic-load", { chosen: close }), client);
    fireEvent.click(await screen.findByText("Choose"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Run the script 'Close open orders'/)).toBeDefined();
    expect(dialog.textContent).toContain("Clinic load");
    expect(dialog.textContent).toContain("chosen");
    expect(client.act).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    expect(client.act).toHaveBeenCalledWith("w", "on/chosen", { records: { event: "a" } });
  });

  test("is asked whatever way a tenant widget runs it, not only through an event", async () => {
    const client = clientOf();
    show({ ...widget("x/actor", {}), config: { action: close } }, client);
    fireEvent.click(await screen.findByText("Act"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("x/actor");
    expect(client.act).not.toHaveBeenCalled();
  });

  test("starts on Cancel, and Cancel runs nothing", async () => {
    const client = clientOf();
    show(widget("x/clinic-load", { chosen: close }), client);
    fireEvent.click(await screen.findByText("Choose"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" })),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(client.act).not.toHaveBeenCalled();
  });

  test("Escape cancels", async () => {
    const client = clientOf();
    show(widget("x/clinic-load", { poked: close }), client);
    fireEvent.click(await screen.findByText("Poke"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(client.act).not.toHaveBeenCalled();
  });

  test("a second write event while one is open is dropped and logged, not queued", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = clientOf();
    show(widget("x/clinic-load", { chosen: close, poked: close }), client);
    fireEvent.click(await screen.findByText("Choose"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(screen.getByText("Poke"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("poked was dropped"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(client.act).toHaveBeenCalledTimes(1);
  });

  test("an event that only filters, selects or navigates runs at once", async () => {
    const client = clientOf();
    show(widget("x/clinic-load", { chosen: filter }), client);
    fireEvent.click(await screen.findByText("Choose"));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a platform widget's event with the same action is run at once, as before", async () => {
    const client = clientOf();
    show(widget("core/table", { chosen: close }), client);
    fireEvent.click(await screen.findByText("Choose"));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
