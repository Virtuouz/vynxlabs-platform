// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import { corePack } from "@volvel/widgets-core/views";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { groupTitle, mayRun, seenByTag, seenByUser, whyNotRun } from "./actions.tsx";
import { PageView, type PageViewProps } from "./PageView.tsx";
import { type FilterValues, type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    // none
  }
});

const registry = viewRegistry(corePack);
const steps = [{ do: "message" as const, text: "Done" }];
const box = { x: 0, y: 0, w: 12, h: 4 };

function clientOf(inputs: Record<string, WireData> = {}) {
  return {
    read: vi.fn(async () => ({ inputs })),
    act: vi.fn(async () => ({ client: [] })),
  } satisfies PageDataClient;
}

function Page(props: Partial<PageViewProps> & { widgets: PageWidget[]; client?: PageDataClient }) {
  const [values, setValues] = useState<FilterValues>({});
  return (
    <PageView
      filters={[]}
      registry={registry}
      client={clientOf()}
      filterValues={values}
      onFilterValues={setValues}
      {...props}
    />
  );
}

const widget = (type: string, config: Record<string, unknown>, extra = {}): PageWidget =>
  ({ id: "w", type, at: box, config, ...extra }) as PageWidget;

describe("who can run it, and who is shown it", () => {
  test("group titles come from the last path segment", () => {
    expect(groupTitle("practice-managers")).toBe("Practice managers");
    expect(groupTitle("end-user-groups/billing")).toBe("Billing");
  });

  test("mayRun and whyNotRun read runBy against the user's groups, by path or key", () => {
    const action = { steps, runBy: { groups: ["practice-managers", "billing"] } };
    expect(mayRun(action, { id: "u", groups: ["billing"] })).toBe(true);
    expect(mayRun(action, { id: "u", groups: ["billing-x"] })).toBe(false);
    expect(mayRun(action, { id: "u", groups: ["practice-managers"] })).toBe(true);
    expect(whyNotRun(action, { id: "u", groups: [] })).toBe(
      "Only Practice managers and Billing can do this.",
    );
    expect(mayRun({ steps }, undefined)).toBe(true);
    expect(mayRun({ steps, runBy: { groups: [] } }, undefined)).toBe(true);
  });

  test("seenBy draws only for those groups, and builds a tag", () => {
    const rules = { seenBy: { groups: ["practice-managers"] } };
    expect(seenByUser(rules, { id: "u", groups: ["practice-managers"] })).toBe(true);
    expect(seenByUser(rules, { id: "u", groups: ["billing"] })).toBe(false);
    expect(seenByUser(undefined, undefined)).toBe(true);
    expect(seenByTag(rules)).toBe("Only for Practice managers");
  });

  const guarded = widget(
    "core/button",
    { label: "Mark paid" },
    { on: { click: { steps, runBy: { groups: ["practice-managers", "billing"] } } } },
  );

  test("a button is greyed, with the reason, for someone outside the groups", async () => {
    render(<Page widgets={[guarded]} user={{ id: "u", groups: ["front-desk"] }} />);
    const button = (await screen.findByRole("button", { name: "Mark paid" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  test("it is pressable for a member", async () => {
    render(<Page widgets={[guarded]} user={{ id: "u", groups: ["billing"] }} />);
    const button = (await screen.findByRole("button", { name: "Mark paid" })) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  test("an action group's button is greyed the same way", async () => {
    const group = widget("core/actions", {
      actions: [
        { id: "a", label: "Open", action: { steps } },
        { id: "b", label: "Void", action: { steps, runBy: { groups: ["billing"] } } },
      ],
    });
    render(<Page widgets={[group]} user={{ id: "u", groups: [] }} />);
    expect(
      ((await screen.findByRole("button", { name: "Void" })) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  const seen = widget(
    "core/text",
    { text: "For managers" },
    { rules: { seenBy: { groups: ["practice-managers"] } } },
  );

  test("served, a widget with seenBy is drawn only for those groups", async () => {
    const { rerender } = render(
      <Page widgets={[seen]} user={{ id: "u", groups: ["practice-managers"] }} />,
    );
    expect(await screen.findByText("For managers")).toBeTruthy();
    rerender(<Page widgets={[seen]} user={{ id: "u", groups: ["billing"] }} />);
    expect(screen.queryByText("For managers")).toBeNull();
  });

  test("while building it is drawn, with a small tag", async () => {
    render(
      <Page
        widgets={[seen]}
        user={{ id: "u", groups: [] }}
        editing={{
          selected: undefined,
          onSelect: () => {},
          onChange: () => {},
          onRename: () => {},
        }}
      />,
    );
    expect(await screen.findByText("Only for Practice managers")).toBeTruthy();
    expect(screen.getByText("For managers")).toBeTruthy();
  });
});

describe("button options", () => {
  test("quiet tone, an icon, full width and its place", async () => {
    render(
      <Page
        widgets={[
          widget("core/button", {
            label: "Send",
            tone: "quiet",
            icon: "send",
            full: true,
            place: "bottom-right",
          }),
        ]}
      />,
    );
    const button = await screen.findByRole("button", { name: "Send" });
    expect(button.className).toContain("text-action");
    expect(button.className).toContain("w-full");
    expect(button.querySelector("svg")).toBeTruthy();
    const holder = button.parentElement as HTMLElement;
    expect(holder.className).toContain("items-end");
    expect(holder.className).toContain("justify-end");
  });

  test("it stands middle-left when no place is given", async () => {
    render(<Page widgets={[widget("core/button", { label: "Go" })]} />);
    const holder = (await screen.findByRole("button", { name: "Go" })).parentElement;
    expect(holder?.className).toContain("items-center");
    expect(holder?.className).toContain("justify-start");
  });
});

describe("action group options", () => {
  const actions = ["One", "Two", "Three", "Four"].map((label, at) => ({
    id: `a${at}`,
    label,
    ...(at === 0 ? { icon: "plus" } : {}),
    action: { steps },
  }));

  test("it lines up left, right or spread", async () => {
    const { rerender } = render(<Page widgets={[widget("core/actions", { actions })]} />);
    await screen.findByRole("button", { name: "One" });
    const row = () => document.querySelector("[data-actions]") as HTMLElement;
    expect(row().className).toContain("justify-start");
    rerender(<Page widgets={[widget("core/actions", { actions, lineUp: "right" })]} />);
    expect(row().className).toContain("justify-end");
    rerender(<Page widgets={[widget("core/actions", { actions, lineUp: "spread" })]} />);
    expect(row().className).toContain("justify-between");
  });

  test("the first showUpTo buttons show and the rest are in the menu", async () => {
    render(<Page widgets={[widget("core/actions", { actions, showUpTo: 2 })]} />);
    await screen.findByRole("button", { name: "One" });
    expect(screen.getByRole("button", { name: "Two" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Three" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findAllByRole("menuitem")).toHaveLength(2);
  });

  test("a button carries its icon, and place sets the row's vertical place", async () => {
    render(<Page widgets={[widget("core/actions", { actions, place: "bottom-left" })]} />);
    const one = await screen.findByRole("button", { name: "One" });
    expect(one.querySelector("svg")).toBeTruthy();
    expect(document.querySelector("[data-actions]")?.className).toContain("items-end");
  });
});

describe("section, text and filter looks", () => {
  test("a card section has a panel", async () => {
    const { container } = render(
      <Page widgets={[widget("core/section", { look: "card" }, { title: "Numbers" })]} />,
    );
    await waitFor(() => expect(container.querySelector("[data-look=card]")).toBeTruthy());
    expect(container.querySelector("[data-look=card]")?.className).toContain("border");
  });

  test.each(["note", "warning", "tip"])("a %s text has a coloured left edge", async (look) => {
    const { container } = render(<Page widgets={[widget("core/text", { text: "Words", look })]} />);
    await screen.findByText("Words");
    expect(container.querySelector(`[data-look=${look}]`)?.className).toContain("border-l-4");
  });

  test("a plain text has no callout", async () => {
    const { container } = render(
      <Page widgets={[widget("core/text", { text: "Words", look: "plain" })]} />,
    );
    await screen.findByText("Words");
    expect(container.querySelector("[data-look]")).toBeNull();
  });

  test("filters behind a button: the search stays, the rest wait under Filters · n", async () => {
    const filters = [
      { name: "search", type: "search", label: "Search" },
      {
        name: "status",
        type: "choice",
        label: "Status",
        choices: ["open", "paid"],
        default: "open",
      },
    ];
    render(<Page widgets={[widget("core/filter", { filters, sit: "button" })]} />);
    expect(await screen.findByRole("button", { name: /Filters · 1/ })).toBeTruthy();
    expect(screen.getByLabelText("Search")).toBeTruthy();
    expect(screen.queryByLabelText("Status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Filters · 1/ }));
    expect(await screen.findByLabelText("Status")).toBeTruthy();
  });

  test("filters in a row have no button", async () => {
    const filters = [{ name: "search", type: "search", label: "Search" }];
    render(<Page widgets={[widget("core/filter", { filters, sit: "row" })]} />);
    await screen.findByLabelText("Search");
    expect(screen.queryByRole("button", { name: /Filters/ })).toBeNull();
  });
});

describe("tabs options", () => {
  const tabsWidget = (extra: Record<string, unknown>) =>
    widget("core/tabs", {
      tabs: [
        { id: "a", title: "Alpha" },
        { id: "b", title: "Beta" },
      ],
      ...extra,
    });

  const selected = (name: string) =>
    screen.getByRole("tab", { name }).getAttribute("aria-selected") === "true";

  test("pills look", async () => {
    const { container } = render(<Page widgets={[tabsWidget({ look: "pills" })]} />);
    await screen.findByRole("tab", { name: "Alpha" });
    expect(container.querySelector("[data-look=pills]")).toBeTruthy();
  });

  test("opensFirst opens that tab when nothing else says", async () => {
    render(<Page widgets={[tabsWidget({ opensFirst: "b" })]} />);
    await screen.findByRole("tab", { name: "Beta" });
    expect(selected("Beta")).toBe(true);
  });

  test("remember: the last tab is kept per person, and the address wins", async () => {
    const { unmount } = render(
      <Page widgets={[tabsWidget({ remember: true })]} user={{ id: "u1", groups: [] }} />,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Beta" }));
    expect(localStorage.getItem("volvel.tab.u1.w")).toBe("b");
    unmount();
    render(<Page widgets={[tabsWidget({ remember: true })]} user={{ id: "u1", groups: [] }} />);
    await screen.findByRole("tab", { name: "Alpha" });
    expect(selected("Beta")).toBe(true);
    cleanup();
    // Another person on the device has their own memory.
    render(<Page widgets={[tabsWidget({ remember: true })]} user={{ id: "u2", groups: [] }} />);
    await screen.findByRole("tab", { name: "Alpha" });
    expect(selected("Alpha")).toBe(true);
    cleanup();
    // The address wins over memory.
    render(
      <Page
        widgets={[tabsWidget({ remember: true })]}
        user={{ id: "u1", groups: [] }}
        tabs={{ open: { w: "a" }, choose: () => {} }}
      />,
    );
    await screen.findByRole("tab", { name: "Alpha" });
    expect(selected("Alpha")).toBe(true);
  });
});

describe("record detail options", () => {
  const columns = [
    { name: "id", type: "uuid", label: "Id" },
    { name: "number", type: "text", label: "Number" },
    { name: "total", type: "number", label: "Total" },
    { name: "note", type: "text", label: "Note" },
  ];
  const record = {
    shape: "record",
    columns,
    record: { id: "a", number: "INV-1", total: 12, note: "hi" },
  } as unknown as WireData;
  const detail = (config: Record<string, unknown>) =>
    widget(
      "core/detail",
      { heading: "number", ...config },
      {
        data: { record: { source: { visual: { table: "invoices" } } } },
      },
    );

  test("the heading is in the code face and fields are tiles across", async () => {
    const { container } = render(
      <Page client={clientOf({ record })} widgets={[detail({ across: 3 })]} />,
    );
    const heading = await screen.findByRole("heading", { name: /INV-1/ });
    expect(heading.className).toContain("font-mono");
    const grid = container.querySelector("dl") as HTMLElement;
    expect(grid.className).toContain("grid-cols-3".replace("grid-cols-3", "grid-cols-1"));
    expect(grid.className).toContain("/cell:grid-cols-3");
    expect(container.querySelector("[data-field=total]")?.className).toContain("border");
  });

  test("edit: a click opens an editor, Enter saves through config/edit, Escape cancels", async () => {
    const client = clientOf({ record });
    render(<Page client={client} widgets={[detail({ edit: true })]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Total" }));
    const field = (await screen.findByLabelText("Total")) as HTMLInputElement;
    expect(field.type).toBe("number");
    fireEvent.change(field, { target: { value: "20" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(client.act).toHaveBeenCalled());
    const call = client.act.mock.calls[0] as unknown[];
    expect(call[1]).toBe("config/edit");
    expect(JSON.stringify(call)).toContain('"total":20');
    // Escape leaves without saving.
    fireEvent.click(await screen.findByRole("button", { name: "Edit Note" }));
    const note = await screen.findByLabelText("Note");
    fireEvent.keyDown(note, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Note")).toBeNull());
    expect(client.act).toHaveBeenCalledTimes(1);
  });

  test("without edit a field is not pressable", async () => {
    render(<Page client={clientOf({ record })} widgets={[detail({})]} />);
    await screen.findByRole("heading", { name: /INV-1/ });
    expect(screen.queryByRole("button", { name: "Edit Total" })).toBeNull();
  });
});
