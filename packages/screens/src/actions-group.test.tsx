// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import { corePack, fitCount } from "@volvel/widgets-core/views";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageView, type PageViewProps } from "./PageView.tsx";
import { type FilterValues, type PageDataClient, viewRegistry } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const registry = viewRegistry(corePack);
const steps = [{ do: "message" as const, text: "Done" }];

const group = (
  actions: { id: string; label: string; tone?: string; when?: unknown[] }[],
  align?: "left" | "right",
): PageWidget =>
  ({
    id: "group",
    type: "core/actions",
    at: { x: 0, y: 0, w: 12, h: 1 },
    config: {
      ...(align ? { lineUp: align } : {}),
      actions: actions.map(({ id, label, tone, when }) => ({
        id,
        label,
        ...(tone ? { tone } : {}),
        action: { steps, ...(when ? { when } : {}) },
      })),
    },
  }) as PageWidget;

function clientOf(act?: PageDataClient["act"]) {
  return {
    read: vi.fn(async () => ({ inputs: {} })),
    act: vi.fn(act ?? (async () => ({ client: [] }))),
  } satisfies PageDataClient;
}

function Page(props: Partial<PageViewProps> & { client: PageDataClient; widgets: PageWidget[] }) {
  const [values, setValues] = useState<FilterValues>({});
  return (
    <PageView
      filters={[]}
      registry={registry}
      filterValues={values}
      onFilterValues={setValues}
      {...props}
    />
  );
}

/** What the widths are, by what the element is: the row, and each button the measure holds. */
function measured(room: number, widths: Record<string, number>) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.hasAttribute("data-actions")
      ? room
      : (widths[this.getAttribute("data-measure") ?? ""] ?? 0);
    return { width, height: 36, top: 0, left: 0, right: width, bottom: 36, x: 0, y: 0 } as DOMRect;
  });
}

const THREE = [
  { id: "send", label: "Send" },
  { id: "print", label: "Print" },
  { id: "void", label: "Void", tone: "danger" },
];

describe("fitCount", () => {
  test("all when they fit or nothing is measured, else as many as fit beside More", () => {
    expect(fitCount(0, [80, 80], 70)).toBe(2);
    expect(fitCount(500, [80, 80, 80], 70)).toBe(3);
    // 80 + 8 + 80 = 168 in a row of three needs 256; room 200 fits two with More: 168 + 8 + 70 = 246 no.
    expect(fitCount(200, [80, 80, 80], 70)).toBe(1);
    expect(fitCount(250, [80, 80, 80], 70)).toBe(2);
    expect(fitCount(100, [80, 80], 70)).toBe(0);
  });
});

describe("Action group", () => {
  test("its buttons, the first in the main tone, each running its own action", async () => {
    const client = clientOf();
    render(<Page client={client} widgets={[group(THREE)]} />);
    const buttons = await screen.findAllByRole("button");
    expect(buttons.map((one) => one.textContent)).toEqual(["Send", "Print", "Void"]);
    expect(buttons[0]?.className).toContain("bg-action");
    // Normal is outlined, and Danger an outline in red, as board 17 draws them.
    expect(buttons[1]?.className).toContain("border-line-strong");
    expect(buttons[2]?.className).toContain("text-danger");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    expect(client.act.mock.calls[0]?.slice(0, 2)).toEqual(["group", "config/actions/1/action"]);
  });

  test("on a page opened on a record the action runs with that record", async () => {
    const client = clientOf();
    render(<Page client={client} widgets={[group(THREE)]} record="rec-7" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send" }));
    await waitFor(() => expect(client.act).toHaveBeenCalled());
    expect(client.act.mock.calls[0]?.[2]).toEqual({ records: { this: "rec-7" } });
  });

  test("a button that may not be pressed is disabled and says why", async () => {
    const client = clientOf();
    const only = [{ user: "in" as const, group: "Managers" }];
    render(
      <Page
        client={client}
        widgets={[
          group([
            { id: "send", label: "Send" },
            { id: "void", label: "Void", when: only },
          ]),
        ]}
        user={{ id: "u", groups: [] }}
      />,
    );
    const voided = (await screen.findByRole("button", { name: "Void" })) as HTMLButtonElement;
    expect(voided.disabled).toBe(true);
    fireEvent.click(voided);
    expect(client.act).not.toHaveBeenCalled();
    // Its reason is said when it is pointed at or focused.
    fireEvent.focus(voided.closest("span[tabindex]") as HTMLElement);
    expect(await screen.findByText("Only when the current user is in Managers.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  test("a button shows it is under way, and the others wait", async () => {
    let finish: () => void = () => undefined;
    const client = clientOf(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ client: [] });
        }),
    );
    render(<Page client={client} widgets={[group(THREE)]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" }).getAttribute("aria-busy")).toBe("true"),
    );
    expect((screen.getByRole("button", { name: "Print" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    finish();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Print" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  test("it lines up left or right", async () => {
    const { rerender } = render(<Page client={clientOf()} widgets={[group(THREE, "right")]} />);
    await screen.findByRole("button", { name: "Send" });
    expect(document.querySelector("[data-actions]")?.className).toContain("justify-end");
    rerender(<Page client={clientOf()} widgets={[group(THREE, "left")]} />);
    expect(document.querySelector("[data-actions]")?.className).toContain("justify-start");
  });

  test("what does not fit goes under More, which runs it with the record", async () => {
    // Room for Send and Print and More (80 + 8 + 80 + 8 + 70), not for Void as well.
    measured(250, { send: 80, print: 80, void: 80, more: 70 });
    const client = clientOf();
    render(<Page client={client} widgets={[group(THREE)]} record="rec-7" />);
    const more = await screen.findByRole("button", { name: /More/ });
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
    fireEvent.click(more);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Void" }));
    await waitFor(() => expect(client.act).toHaveBeenCalled());
    expect(client.act.mock.calls[0]?.slice(0, 2)).toEqual(["group", "config/actions/2/action"]);
    expect(client.act.mock.calls[0]?.[2]).toEqual({ records: { this: "rec-7" } });
  });

  test("on a phone every button can go under More", async () => {
    measured(120, { send: 80, print: 80, void: 80, more: 70 });
    render(<Page client={clientOf()} widgets={[group(THREE)]} />);
    const more = await screen.findByRole("button", { name: /More/ });
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    fireEvent.click(more);
    expect(await screen.findAllByRole("menuitem")).toHaveLength(3);
  });

  test("everything shows when it fits", async () => {
    measured(400, { send: 80, print: 80, void: 80, more: 70 });
    render(<Page client={clientOf()} widgets={[group(THREE)]} />);
    await screen.findByRole("button", { name: "Void" });
    expect(screen.queryByRole("button", { name: /More/ })).toBeNull();
  });
});
