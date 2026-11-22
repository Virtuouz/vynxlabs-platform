// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Button, TooltipProvider } from "@volvel/ui";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RowActionButtons } from "../../widgets-core/views/press.tsx";

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
