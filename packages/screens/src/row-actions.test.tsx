// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import { Button, ToastProvider, TooltipProvider } from "@volvel/ui";
import { corePack } from "@volvel/widgets-core/views";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RowActionButtons } from "../../widgets-core/views/press.tsx";
import { PageView } from "./PageView.tsx";
import { type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(cleanup);

const actions = [
  { id: "mark", label: "Mark paid", action: {} },
  { id: "void", label: "Void", tone: "danger" as const, action: {} },
  { id: "send", label: "Send reminder", action: {} },
];

const props = (over: object = {}) =>
  ({
    act: vi.fn(async () => ({ ok: true as const })),
    can: (at: string) => !at.includes("/1/"),
    why: () => "Only Billing can do this.",
    building: false,
    ...over,
  }) as unknown as ComponentProps<typeof RowActionButtons>["props"];

describe("a row's actions", () => {
  test("on a phone, several are one menu, not a button each; each says why it is greyed", async () => {
    render(
      <TooltipProvider>
        <ul className="group/row">
          <RowActionButtons actions={actions} row={{ id: "r" }} record="r" props={props()} always />
        </ul>
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: "Mark paid" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    expect(await screen.findByText("Mark paid")).toBeTruthy();
    expect(screen.getByText("Void")).toBeTruthy();
    // The one it may not run says why, beside it.
    expect(screen.getByText("Only Billing can do this.")).toBeTruthy();
  });

  test("running one from the menu runs it with the row", async () => {
    const view = props();
    render(
      <TooltipProvider>
        <ul className="group/row">
          <RowActionButtons actions={actions} row={{ id: "r" }} record="r" props={view} always />
        </ul>
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    fireEvent.click(await screen.findByText("Mark paid"));
    await waitFor(() =>
      expect(view.act).toHaveBeenCalledWith("config/rowActions/0/action", { record: "r" }),
    );
  });

  test("one action stays its own button, even on a phone", () => {
    render(
      <TooltipProvider>
        <RowActionButtons
          actions={actions.slice(0, 1)}
          row={{ id: "r" }}
          record="r"
          props={props()}
          always
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Row actions" })).toBeNull();
  });

  test("where hover exists the buttons are there for the row's hover", () => {
    render(
      <TooltipProvider>
        <RowActionButtons
          actions={actions}
          row={{ id: "r" }}
          record="r"
          props={props()}
          always={false}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeTruthy();
  });
});

describe("a greyed button gives its reason", () => {
  test("on focus", async () => {
    render(
      <TooltipProvider>
        <Button disabled tooltip="Only Billing can do this.">
          Mark paid
        </Button>
      </TooltipProvider>,
    );
    const wrapper = screen.getByRole("button", { name: "Mark paid" }).parentElement as HTMLElement;
    expect(wrapper.tabIndex).toBe(0);
    wrapper.focus();
    expect(await screen.findByText("Only Billing can do this.")).toBeTruthy();
  });

  test("on a tap, where nothing is pointed at", async () => {
    render(
      <TooltipProvider>
        <Button disabled tooltip="Only Billing can do this.">
          Mark paid
        </Button>
      </TooltipProvider>,
    );
    expect(screen.queryByText("Only Billing can do this.")).toBeNull();
    const wrapper = screen.getByRole("button", { name: "Mark paid" }).parentElement as HTMLElement;
    fireEvent.pointerUp(wrapper, { pointerType: "touch" });
    expect(await screen.findByText("Only Billing can do this.")).toBeTruthy();
  });
});

describe("confirming an action on several rows", () => {
  const rowsWire = {
    shape: "rows",
    columns: [
      { name: "id", type: "uuid", label: "id" },
      { name: "number", type: "text", label: "Number" },
    ],
    rows: [
      { id: "1", number: "INV-1" },
      { id: "2", number: "INV-2" },
    ],
  } as unknown as WireData;

  function chooseTwo(confirm: object) {
    const client: PageDataClient = {
      read: async () => ({ inputs: { rows: rowsWire } }),
      act: vi.fn(async () => ({ client: [] })),
    };
    render(
      <ToastProvider>
        <PageView
          widgets={[
            {
              id: "invoices",
              type: "core/table",
              at: { x: 0, y: 0, w: 12, h: 8 },
              data: { rows: { source: { visual: { table: "invoices" } } } },
              config: {
                columns: [{ column: "number" }],
                select: true,
                rowActions: [
                  {
                    id: "remove",
                    label: "Remove",
                    action: { confirm, steps: [{ do: "delete", record: "event" }] },
                  },
                ],
              },
            } as PageWidget,
          ]}
          filters={[]}
          registry={viewRegistry(corePack)}
          client={client}
          filterValues={{}}
          onFilterValues={() => {}}
        />
      </ToastProvider>,
    );
    return client;
  }

  test("names how many, not the first of them", async () => {
    const client = chooseTwo({});
    fireEvent.click(await screen.findByRole("checkbox", { name: "Choose INV-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-2" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Rows chosen" })).getByRole("button", {
        name: "Remove",
      }),
    );
    expect(await screen.findByText("Remove 2 invoices?")).toBeTruthy();
    expect(screen.queryByText(/INV-1/, { selector: "[role=dialog] *" })).toBeNull();
    expect(client.act).not.toHaveBeenCalled();
  });

  test("the author's {column} is left out when several are named", async () => {
    chooseTwo({ title: "Remove {number}?", text: "Gone: {number}." });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Choose INV-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose INV-2" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Rows chosen" })).getByRole("button", {
        name: "Remove",
      }),
    );
    expect(await screen.findByText("Remove?")).toBeTruthy();
    expect(screen.queryByText(/INV-1/, { selector: "[role=dialog] *" })).toBeNull();
  });
});
