// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import { containerHeight } from "@volvel/manifest/parts";
import { corePack } from "@volvel/widgets-core/views";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fitContainers } from "./layout.ts";
import { useAddress } from "./navigation.tsx";
import { PageView, type PageViewProps } from "./PageView.tsx";
import { type FilterValues, type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const registry = viewRegistry(corePack);
const roles = { get: (type: string) => registry.get(type)?.definition };
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

const rows: WireData = {
  shape: "rows",
  columns: [
    { name: "id", type: "uuid", label: "Id" },
    { name: "number", type: "text", label: "Number" },
  ],
  rows: [
    { id: "a", number: "INV-1" },
    { id: "b", number: "INV-2" },
  ],
};

const text = (id: string, words: string, at: PageWidget["at"], into?: PageWidget["in"]) =>
  ({
    id,
    type: "core/text",
    title: id,
    at,
    config: { text: words },
    ...(into ? { in: into } : {}),
  }) as PageWidget;

const section = (extra: Record<string, unknown> = {}, at = box(0, 0, 12, 4)): PageWidget => ({
  id: "sec",
  type: "core/section",
  title: "Today",
  at,
  config: extra,
});

const tabs: PageWidget = {
  id: "t",
  type: "core/tabs",
  at: box(0, 0, 12, 6),
  config: {
    tabs: [
      { id: "a", title: "Alpha" },
      { id: "b", title: "Beta" },
    ],
  },
};

const invoices = (into?: PageWidget["in"]): PageWidget => ({
  id: "invoices",
  type: "core/table",
  title: "Invoices",
  at: box(0, 0, 12, 3),
  data: { rows: { source: { visual: { table: "invoices" } } } },
  config: { columns: [{ column: "number", label: "No." }] },
  ...(into ? { in: into } : {}),
});

function clientOf(): PageDataClient & { read: ReturnType<typeof vi.fn> } {
  return {
    read: vi.fn(async () => ({ inputs: { rows } })),
    act: vi.fn(async () => ({ client: [] })),
  } as never;
}

function Page(props: Partial<PageViewProps> & { widgets: PageWidget[]; client?: PageDataClient }) {
  const [values, setValues] = useState<FilterValues>({});
  return (
    <PageView
      filters={[]}
      registry={registry}
      client={props.client ?? clientOf()}
      filterValues={values}
      onFilterValues={setValues}
      {...props}
    />
  );
}

describe("a container draws what it holds on a grid of its own", () => {
  test("children are inside their container, and not on the page's grid", async () => {
    render(
      <Page
        widgets={[
          section(),
          text("note", "Inside words", box(0, 0, 6, 2), { widget: "sec" }),
          text("outer", "Outside words", box(0, 5, 6, 2)),
        ]}
      />,
    );
    const inside = (await screen.findByText("Inside words")).closest("[data-grid-in]");
    expect(inside?.getAttribute("data-grid-in")).toBe("sec");
    expect(screen.getByText("Outside words").closest("[data-grid-in]")).toBeNull();
  });

  test("a child reads its data, and raises its events, as a widget of the page does", async () => {
    const client = clientOf();
    const onEvent = vi.fn();
    const widget: PageWidget = {
      ...invoices({ widget: "sec" }),
      on: { rowClick: { steps: [{ do: "open", page: "invoice", record: "event" }] } },
    };
    render(<Page client={client} widgets={[section(), widget]} onEvent={onEvent} />);
    fireEvent.click(await screen.findByText("INV-2"));
    expect(client.read).toHaveBeenCalledWith("invoices", expect.anything(), expect.anything());
    await waitFor(() =>
      expect(client.act).toHaveBeenCalledWith("invoices", "on/rowClick", {
        records: { event: "b" },
      }),
    );
    expect(onEvent).toHaveBeenCalledWith("invoices", "rowClick", { record: "b" });
  });

  test("a child's showWhen holds it back as it does on the page", async () => {
    const hidden = {
      ...text("note", "Secret words", box(0, 0, 6, 2), { widget: "sec" }),
      rules: { showWhen: [{ field: "this.x", op: "eq", value: 1 }] },
    } as unknown as PageWidget;
    render(<Page widgets={[section(), hidden]} />);
    await screen.findByRole("region", { name: "Today" }).catch(() => undefined);
    expect(screen.queryByText("Secret words")).toBeNull();
  });

  test("a tab's children are drawn only when it is open, and choosing asks the host", async () => {
    const choose = vi.fn();
    const list = [
      tabs,
      text("x", "In alpha", box(0, 0, 6, 2), { widget: "t", tab: "a" }),
      text("y", "In beta", box(0, 0, 6, 2), { widget: "t", tab: "b" }),
    ];
    const { rerender } = render(<Page widgets={list} tabs={{ open: {}, choose }} />);
    expect(await screen.findByText("In alpha")).toBeTruthy();
    expect(screen.queryByText("In beta")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(choose).toHaveBeenCalledWith("t", "b");
    rerender(<Page widgets={list} tabs={{ open: { t: "b" }, choose }} />);
    expect(await screen.findByText("In beta")).toBeTruthy();
    expect(screen.queryByText("In alpha")).toBeNull();
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true");
  });

  test("while building the open tab is the page's own, and choosing a child in a hidden tab opens it", async () => {
    const list = [
      tabs,
      text("x", "In alpha", box(0, 0, 6, 2), { widget: "t", tab: "a" }),
      text("y", "In beta", box(0, 0, 6, 2), { widget: "t", tab: "b" }),
    ];
    function Builder() {
      const [selected, setSelected] = useState<string>();
      return (
        <>
          <button type="button" onClick={() => setSelected("y")}>
            pick y
          </button>
          <Page
            widgets={list}
            editing={{ selected, onSelect: setSelected, onChange: vi.fn(), onRename: vi.fn() }}
          />
        </>
      );
    }
    render(<Builder />);
    expect(screen.queryByText("In beta")).toBeNull();
    fireEvent.click(screen.getByText("pick y"));
    expect(await screen.findByText("In beta")).toBeTruthy();
  });

  test("the chosen widget moved onto a hidden tab (⋯ › Move to) opens that tab, so it stays in sight", async () => {
    const on = (into: PageWidget["in"]) => [
      tabs,
      text("x", "In alpha", box(0, 0, 6, 2), { widget: "t", tab: "a" }),
      text("y", "Moved", box(0, 4, 6, 2), into),
    ];
    const editing = { selected: "y", onSelect: vi.fn(), onChange: vi.fn(), onRename: vi.fn() };
    const { rerender } = render(<Page widgets={on({ widget: "t", tab: "a" })} editing={editing} />);
    expect(await screen.findByText("In alpha")).toBeTruthy();
    // Still chosen, now on the second tab: the second tab is opened.
    rerender(<Page widgets={on({ widget: "t", tab: "b" })} editing={editing} />);
    expect(await screen.findByText("Moved")).toBeTruthy();
    expect(screen.queryByText("In alpha")).toBeNull();
  });
});

describe("the open tab is in the address", () => {
  test("choosing a tab sets tab.<widget>, and a sheet over the page keeps it", () => {
    window.history.replaceState({}, "", "/app/visits?f.search=%22ada%22");
    const { result } = renderHook(() => useAddress("/app/"));
    act(() => result.current.choose("t", "b"));
    expect(window.location.search).toContain("tab.t=b");
    expect(window.location.search).toContain("f.search");
    expect(result.current.address.own?.["tab.t"]).toBe("b");
    act(() => result.current.go({ page: "invoice", as: "sheet", record: "a" }));
    expect(window.location.search).toContain("sheet=invoice");
    expect(window.location.search).toContain("tab.t=b");
    expect(window.location.search).toContain("f.search");
    act(() => result.current.go({ close: true }));
    expect(window.location.search).toContain("tab.t=b");
  });

  test("a shared link opens the tab", () => {
    window.history.replaceState({}, "", "/app/visits?tab.t=b");
    const { result } = renderHook(() => useAddress("/app/"));
    expect(result.current.address.own).toEqual({ "tab.t": "b" });
  });
});

describe("a Section that folds", () => {
  const folding = () => [
    section({ folds: true }),
    text("note", "Inside words", box(0, 0, 6, 2), { widget: "sec" }),
  ];

  test("hides what it holds, and stays folded after a reload", async () => {
    const first = render(<Page widgets={folding()} foldKey="app.visits" />);
    const button = await screen.findByRole("button", { name: /^(Fold|Unfold) / });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByText("Inside words")).toBeNull());
    expect(
      screen.getByRole("button", { name: /^(Fold|Unfold) / }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(window.localStorage.getItem("volvel.fold.app.visits.sec")).toBe("1");
    first.unmount();
    render(<Page widgets={folding()} foldKey="app.visits" />);
    await screen.findByRole("button", { name: /^(Fold|Unfold) / });
    expect(screen.queryByText("Inside words")).toBeNull();
    // Opened again, it is kept open.
    fireEvent.click(screen.getByRole("button", { name: /^(Fold|Unfold) / }));
    expect(await screen.findByText("Inside words")).toBeTruthy();
    expect(window.localStorage.getItem("volvel.fold.app.visits.sec")).toBe("0");
  });

  test("works where the browser will not keep anything", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Page widgets={folding()} foldKey="app.visits" />);
    expect(await screen.findByText("Inside words")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^(Fold|Unfold) / }));
    await waitFor(() => expect(screen.queryByText("Inside words")).toBeNull());
  });

  test("starts folded when the page says so, and is not folded while building", async () => {
    const list = [
      section({ folds: true, folded: true }),
      text("note", "Inside words", box(0, 0, 6, 2), { widget: "sec" }),
    ];
    const served = render(<Page widgets={list} />);
    await screen.findByRole("button", { name: /^(Fold|Unfold) / });
    expect(screen.queryByText("Inside words")).toBeNull();
    served.unmount();
    render(
      <Page
        widgets={list}
        editing={{ selected: undefined, onSelect: vi.fn(), onChange: vi.fn(), onRename: vi.fn() }}
      />,
    );
    expect(await screen.findByText("Inside words")).toBeTruthy();
  });
});

describe("a container's height", () => {
  test("is drawn at least as tall as what it holds, and a folded one short", async () => {
    const list = [
      section({ folds: true }, box(0, 0, 12, 2)),
      text("note", "Inside words", box(0, 0, 6, 5), { widget: "sec" }),
      text("below", "Below words", box(0, 2, 6, 2)),
    ];
    render(<Page widgets={list} />);
    const cell = (await screen.findByText("Inside words")).closest("[data-widget-cell='sec']");
    expect((cell as HTMLElement).style.getPropertyValue("--row")).toBe(
      `1 / span ${containerHeight(list[0] as PageWidget, list)}`,
    );
    // What was under it is made room for.
    expect(
      (
        screen.getByText("Below words").closest("[data-widget-cell]") as HTMLElement
      ).style.getPropertyValue("--row"),
    ).toBe("7 / span 2");
  });

  test("fitContainers makes it exact and settles what is below", () => {
    const list = [
      section({}, box(0, 0, 12, 9)),
      text("note", "n", box(0, 0, 6, 3), { widget: "sec" }),
      text("below", "b", box(0, 9, 6, 2)),
    ];
    const fitted = fitContainers(list, roles);
    expect(fitted.find((one) => one.id === "sec")?.at.h).toBe(4);
    expect(fitted.find((one) => one.id === "below")?.at.y).toBe(4);
    // Nothing to do: the same list.
    expect(fitContainers(fitted, roles)).toBe(fitted);
  });
});

describe("moving widgets into, within and out of containers", () => {
  const press = (element: HTMLElement, x: number, y: number) =>
    fireEvent.pointerDown(element, { button: 0, clientX: x, clientY: y, pointerId: 1 });
  const move = (x: number, y: number) =>
    fireEvent.pointerMove(window, { clientX: x, clientY: y, pointerId: 1 });
  const drop = () => fireEvent.pointerUp(window, { pointerId: 1 });
  const group = (name: string) => screen.getByRole("group", { name });

  beforeEach(() => {
    // A page 1,200 wide: a column is 101 pixels with its gap, a row 52. The Section is its top 300 pixels,
    // its grid starts 50 pixels down.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const rect = (left: number, top: number, width: number, height: number) =>
        ({
          left,
          top,
          width,
          height,
          right: left + width,
          bottom: top + height,
          x: left,
          y: top,
        }) as DOMRect;
      if (this.hasAttribute("data-grid-in")) return rect(0, 50, 1200, 250);
      if (this.getAttribute("data-widget-cell") === "sec") return rect(0, 0, 1200, 300);
      return rect(0, 0, 1200, 800);
    });
  });

  function Builder({
    start,
    onChange,
  }: {
    start: PageWidget[];
    onChange: (w: PageWidget[], l: string) => void;
  }) {
    const [list, setList] = useState(start);
    const [selected, setSelected] = useState<string>();
    return (
      <Page
        widgets={list}
        editing={{
          selected,
          onSelect: setSelected,
          onChange: (next, label) => {
            onChange(next, label);
            setList(next);
          },
          onRename: vi.fn(),
        }}
      />
    );
  }
  const lastOf = (spy: ReturnType<typeof vi.fn>) => spy.mock.lastCall?.[0] as PageWidget[];
  const byId = (list: PageWidget[], id: string) => list.find((one) => one.id === id) as PageWidget;

  test("dropping on a Section sets `in` and the place on its grid, and the Section grows", async () => {
    const onChange = vi.fn();
    render(
      <Builder
        onChange={onChange}
        start={[section({}, box(0, 0, 12, 2)), text("stat", "Stat words", box(0, 8, 4, 2))]}
      />,
    );
    await screen.findByText("Stat words");
    press(group("stat"), 100, 8 * 52 + 10);
    move(400, 100);
    drop();
    const list = lastOf(onChange);
    expect(byId(list, "stat").in).toEqual({ widget: "sec" });
    expect(byId(list, "stat").at).toEqual(box(3, 1, 4, 2));
    expect(byId(list, "sec").at.h).toBe(containerHeight(byId(list, "sec"), list));
    expect(onChange.mock.lastCall?.[1]).toBe("Moved stat into Today");
  });

  test("dragging a child out onto the page removes `in`", async () => {
    const onChange = vi.fn();
    render(
      <Builder
        onChange={onChange}
        start={[
          section({}, box(0, 0, 12, 3)),
          text("note", "Note words", box(0, 0, 4, 2), { widget: "sec" }),
        ]}
      />,
    );
    await screen.findByText("Note words");
    press(group("note"), 50, 60);
    move(500, 600);
    drop();
    const list = lastOf(onChange);
    expect(byId(list, "note").in).toBeUndefined();
    expect(onChange.mock.lastCall?.[1]).toBe("Moved note out of Today");
  });

  test("a container is never dropped into a container", async () => {
    const onChange = vi.fn();
    const other: PageWidget = { ...tabs, id: "t2", at: box(0, 8, 6, 3) };
    render(<Builder onChange={onChange} start={[section({}, box(0, 0, 12, 2)), other]} />);
    await screen.findByRole("group", { name: "Tabs" });
    press(screen.getByRole("group", { name: "Tabs" }), 100, 8 * 52 + 10);
    move(400, 100);
    drop();
    expect(byId(lastOf(onChange), "t2").in).toBeUndefined();
  });

  test("moving a container moves what it holds with it", async () => {
    const onChange = vi.fn();
    render(
      <Builder
        onChange={onChange}
        start={[
          section({}, box(0, 0, 12, 3)),
          text("note", "Note words", box(1, 0, 4, 2), { widget: "sec" }),
        ]}
      />,
    );
    await screen.findByText("Note words");
    fireEvent.click(group("Today"));
    fireEvent.keyDown(group("Today"), { key: "ArrowDown" });
    const list = lastOf(onChange);
    expect(byId(list, "sec").at.y).toBe(1);
    expect(byId(list, "note").at).toEqual(box(1, 0, 4, 2));
    expect(byId(list, "note").in).toEqual({ widget: "sec" });
  });

  test("the arrow keys move a child within its container, and Shift resizes it", async () => {
    const onChange = vi.fn();
    render(
      <Builder
        onChange={onChange}
        start={[
          section({}, box(0, 0, 12, 3)),
          text("note", "Note words", box(0, 0, 4, 2), { widget: "sec" }),
        ]}
      />,
    );
    await screen.findByText("Note words");
    fireEvent.click(group("note"));
    fireEvent.keyDown(group("note"), { key: "ArrowRight" });
    let list = lastOf(onChange);
    expect(byId(list, "note").at).toEqual(box(1, 0, 4, 2));
    expect(byId(list, "note").in).toEqual({ widget: "sec" });
    // The Section did not move with it.
    expect(byId(list, "sec").at.x).toBe(0);
    fireEvent.keyDown(group("note"), { key: "ArrowDown" });
    list = lastOf(onChange);
    expect(byId(list, "note").at.y).toBe(1);
    // It grew to hold it.
    expect(byId(list, "sec").at.h).toBe(containerHeight(byId(list, "sec"), list));
    fireEvent.keyDown(group("note"), { key: "ArrowRight", shiftKey: true });
    expect(byId(lastOf(onChange), "note").at.w).toBe(5);
    fireEvent.keyDown(group("note"), { key: "Escape" });
    expect(group("note").hasAttribute("data-selected")).toBe(false);
  });

  test("copying a container copies what it holds", async () => {
    const onChange = vi.fn();
    render(
      <Builder
        onChange={onChange}
        start={[
          section({}, box(0, 0, 12, 3)),
          text("note", "Note words", box(0, 0, 4, 2), { widget: "sec" }),
        ]}
      />,
    );
    await screen.findByText("Note words");
    fireEvent.click(group("Today"));
    fireEvent.keyDown(group("Today"), { key: "d", ctrlKey: true });
    const list = lastOf(onChange);
    const copy = list.find((one) => one.id === "sec_copy") as PageWidget;
    expect(copy).toBeTruthy();
    expect(copy.at.y).toBeGreaterThanOrEqual(3);
    const held = list.filter((one) => one.in?.widget === "sec_copy");
    expect(held).toHaveLength(1);
    expect(list.filter((one) => one.in?.widget === "sec")).toHaveLength(1);
  });
});
