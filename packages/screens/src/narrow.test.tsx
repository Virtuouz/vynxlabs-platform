// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  allAutomatic,
  backToAutomatic,
  changedByHand,
  hiddenOnPhone,
  intoTablet,
  movedAside,
  onTablet,
  phoneMoved,
  phoneOrder,
  phoneSpan,
  phoneSpans,
} from "./narrow.ts";
import { PageView, type PageViewProps } from "./PageView.tsx";
import { type PageDataClient, viewRegistry } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const note = (id: string, at: PageWidget["at"], extra: Partial<PageWidget> = {}): PageWidget => ({
  id,
  type: "core/text",
  title: id,
  at,
  config: { text: `Words of ${id}.` },
  ...extra,
});
const client: PageDataClient = { read: vi.fn(async () => ({ inputs: {} })) };
const registry = viewRegistry(corePack);

function Draw(props: Partial<PageViewProps> & { widgets: PageWidget[] }) {
  return (
    <PageView
      filters={[]}
      registry={registry}
      client={client}
      filterValues={{}}
      onFilterValues={() => {}}
      {...props}
    />
  );
}

const editing = (extra: Partial<NonNullable<PageViewProps["editing"]>> = {}) => ({
  selected: undefined,
  onSelect: () => {},
  onChange: () => {},
  onRename: () => {},
  ...extra,
});

describe("the rules a phone follows", () => {
  const a = note("a", box(0, 0, 12, 2));
  const b = note("b", box(0, 2, 3, 2));
  const c = note("c", box(3, 2, 3, 2));
  const d = note("d", box(0, 4, 12, 2));

  test("a widget is hidden by its own layout, whatever its definition says", () => {
    const definition = { layout: { min: { w: 1, h: 1 }, default: { w: 1, h: 1 } } };
    expect(hiddenOnPhone({ layout: { narrow: "hide" } }, definition)).toBe(true);
    expect(
      hiddenOnPhone(
        { layout: { narrow: "full" } },
        { layout: { ...definition.layout, phone: "hide" } },
      ),
    ).toBe(false);
    expect(hiddenOnPhone({}, { layout: { ...definition.layout, phone: "hide" } })).toBe(true);
    expect(hiddenOnPhone({}, definition)).toBe(false);
  });

  test("small widgets share a row, others take it, full and stack are rows of their own", () => {
    expect(phoneSpan(b)).toBe(1);
    expect(phoneSpan(d)).toBe(2);
    expect(phoneSpan({ ...b, layout: { narrow: "full" } })).toBe(2);
    expect(phoneSpan({ ...b, layout: { narrow: "stack" } })).toBe(2);
  });

  test("higher priority is read first, then the desktop's order, then a place set by hand", () => {
    expect(phoneOrder([d, c, b, a]).map((w) => w.id)).toEqual(["a", "b", "c", "d"]);
    const urgent = { ...d, layout: { priority: 2 } };
    expect(phoneOrder([a, b, urgent]).map((w) => w.id)).toEqual(["d", "a", "b"]);
    const placed = { ...c, layout: { phone: { at: box(0, 0, 3, 2) } } };
    expect(phoneOrder([a, b, placed]).map((w) => w.id)).toEqual(["c", "a", "b"]);
  });

  test("moving one on the phone writes only its own place and counts it as changed by hand", () => {
    const moved = phoneMoved([a, b, c, d], "d", "b");
    expect(phoneOrder(moved).map((w) => w.id)).toEqual(["a", "d", "b", "c"]);
    expect(changedByHand(moved, "phone")).toBe(1);
    expect(moved.find((w) => w.id === "a")?.layout).toBeUndefined();
    expect(phoneOrder(phoneMoved([a, b, c, d], "a", undefined)).map((w) => w.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    const back = backToAutomatic(moved, "d", "phone");
    expect(changedByHand(back, "phone")).toBe(0);
    expect(back.find((w) => w.id === "d")?.layout).toBeUndefined();
  });

  test("the tablet draws its own places, and a change on it is written as the tablet's", () => {
    const own = { ...b, layout: { tablet: { at: box(6, 2, 6, 2) } } };
    const drawn = onTablet([a, own]);
    expect(drawn[1]?.at).toEqual(box(6, 2, 6, 2));
    expect(drawn[0]).toBe(a);
    const after = drawn.map((w) => (w.id === "a" ? { ...w, at: box(0, 1, 12, 2) } : w));
    const written = intoTablet([a, own], drawn, after);
    // Moved on the tablet: the desktop's place is kept, the tablet's is set.
    expect(written[0]?.at).toEqual(a.at);
    expect(written[0]?.layout?.tablet?.at).toEqual(box(0, 1, 12, 2));
    // Not moved: as it was, tablet place and all.
    expect(written[1]?.at).toEqual(own.at);
    expect(written[1]?.layout?.tablet?.at).toEqual(box(6, 2, 6, 2));
  });
});

describe("one drag on the tablet", () => {
  const a = note("a", box(0, 0, 4, 2));
  const b = note("b", box(4, 0, 4, 2));
  const c = note("c", box(8, 0, 4, 2));

  test("only the widget that was moved is by hand; what lay in its way is drawn aside, not written", () => {
    const drawn = onTablet([a, b, c]);
    // `a` is dragged onto `b`'s place, and the page made room by pushing `b` down.
    const after = drawn.map((w) =>
      w.id === "a"
        ? { ...w, at: box(4, 0, 4, 2) }
        : w.id === "b"
          ? { ...w, at: box(4, 2, 4, 2) }
          : w,
    );
    const written = intoTablet([a, b, c], drawn, after, "a");
    expect(changedByHand(written, "tablet")).toBe(1);
    expect(written[0]?.layout?.tablet?.at).toEqual(box(4, 0, 4, 2));
    expect(written[1]?.layout).toBeUndefined();
    // Drawn again, `b` is pushed off `a` for lying on it, and that is said as moved aside.
    expect(onTablet(written)[1]?.at).toEqual(box(4, 2, 4, 2));
    expect(movedAside(written)).toBe(1);
    // Automatic on the dragged one puts everything back.
    const back = backToAutomatic(written, "a", "tablet");
    expect(changedByHand(back, "tablet")).toBe(0);
    expect(movedAside(back)).toBe(0);
    expect(onTablet(back).map((w) => w.at)).toEqual([a.at, b.at, c.at]);
  });

  test("All automatic takes back every place of its own on the device", () => {
    const set = [
      { ...a, layout: { tablet: { at: box(0, 4, 4, 2) } } },
      { ...b, layout: { phone: { at: box(0, 1, 12, 2) }, narrow: "hide" as const, priority: 2 } },
      c,
    ];
    expect(changedByHand(allAutomatic(set, "tablet"), "tablet")).toBe(0);
    const phone = allAutomatic(set, "phone");
    expect(changedByHand(phone, "phone")).toBe(0);
    expect(phone[1]?.layout).toBeUndefined();
    // The tablet's place is not the phone's to take back.
    expect(phone[0]?.layout?.tablet).toBeDefined();
  });
});

describe("a phone, as it is drawn", () => {
  const phone = () =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 390,
    } as DOMRect);

  test("served: narrow hide leaves it out; priority stacks it nearer the top", async () => {
    phone();
    const widgets = [
      note("a", box(0, 0, 12, 2)),
      note("b", box(0, 2, 12, 2), { layout: { narrow: "hide" } }),
      note("c", box(0, 4, 12, 2), { layout: { priority: 1 } }),
    ];
    render(<Draw widgets={widgets} />);
    expect(screen.queryByText("Words of b.")).toBeNull();
    const cells = [...document.querySelectorAll("[data-widget-cell]")].map(
      (cell) => (cell as HTMLElement).dataset.widgetCell,
    );
    expect(cells).toEqual(["c", "a"]);
  });

  test("served: full width and a small one beside a small one", async () => {
    phone();
    const widgets = [
      note("a", box(0, 0, 3, 2)),
      note("b", box(3, 0, 3, 2)),
      note("c", box(6, 0, 3, 2), { layout: { narrow: "full" } }),
    ];
    render(<Draw widgets={widgets} />);
    const span = (id: string) =>
      (document.querySelector(`[data-widget-cell="${id}"]`) as HTMLElement).className.includes(
        "col-span-2",
      );
    expect([span("a"), span("b"), span("c")]).toEqual([false, false, true]);
  });

  test("building: a hidden widget is a dashed place-holder that chooses it when clicked", () => {
    phone();
    const onSelect = vi.fn();
    render(
      <Draw
        widgets={[
          note("by_clinic", box(0, 0, 6, 2), { title: "By clinic", layout: { narrow: "hide" } }),
        ]}
        editing={editing({ onSelect })}
      />,
    );
    const holder = screen.getByRole("button", { name: "By clinic is hidden on phones" });
    expect(holder.hasAttribute("data-hidden-on-phone")).toBe(true);
    fireEvent.click(holder);
    expect(onSelect).toHaveBeenCalledWith("by_clinic");
  });

  test("a move on the phone is asked about, then written as the phone's own place", async () => {
    phone();
    const onChange = vi.fn();
    const askLayout = vi.fn(async () => true);
    const widgets = [note("a", box(0, 0, 12, 2)), note("b", box(0, 2, 12, 2))];
    render(<Draw widgets={widgets} editing={editing({ onChange, askLayout })} />);
    const cell = document.querySelector('[data-widget-cell="b"]') as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(askLayout).toHaveBeenCalledWith("phone");
    const written = onChange.mock.calls[0]?.[0] as PageWidget[];
    expect(written.find((w) => w.id === "b")?.layout?.phone?.at).toEqual(box(0, 0, 12, 2));
    expect(written.find((w) => w.id === "a")?.layout).toBeUndefined();
  });

  test("a move that is refused changes nothing", async () => {
    phone();
    const onChange = vi.fn();
    const askLayout = vi.fn(async () => false);
    const widgets = [note("a", box(0, 0, 12, 2)), note("b", box(0, 2, 12, 2))];
    render(<Draw widgets={widgets} editing={editing({ onChange, askLayout })} />);
    const cell = document.querySelector('[data-widget-cell="b"]') as HTMLElement;
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    await vi.waitFor(() => expect(askLayout).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("View as a group, while building", () => {
  test("a widget the group may not see is faded and says so; one it may see is not", () => {
    const widgets = [
      note("money", box(0, 0, 6, 2), { rules: { seenBy: { groups: ["billing"] } } }),
      note("visits", box(6, 0, 6, 2), { rules: { seenBy: { groups: ["clinic"] } } }),
      note("all", box(0, 2, 6, 2)),
    ];
    render(
      <Draw widgets={widgets} editing={editing()} viewAs={{ key: "billing", name: "Billing" }} />,
    );
    const faded = [...document.querySelectorAll("[data-hidden-for]")].map((one) => one.textContent);
    expect(faded).toEqual(["Hidden for Billing"]);
    expect(document.querySelector('[data-widget-cell="visits"] [data-hidden-for]')).not.toBeNull();
    expect(document.querySelector('[data-widget-cell="money"] [data-hidden-for]')).toBeNull();
  });

  test("without View as, nothing is faded", () => {
    render(
      <Draw
        widgets={[note("money", box(0, 0, 6, 2), { rules: { seenBy: { groups: ["billing"] } } })]}
        editing={editing()}
      />,
    );
    expect(document.querySelector("[data-hidden-for]")).toBeNull();
  });
});

describe("what narrow screens do with a widget", () => {
  const a = note("a", box(0, 0, 3, 2));
  const b = note("b", box(3, 0, 3, 2));
  const c = note("c", box(6, 0, 3, 2));
  const wide = note("w", box(0, 2, 12, 2));

  test("a small widget alone in its row takes the whole row", () => {
    const spans = phoneSpans(phoneOrder([a, b, c, wide]));
    expect([a, b, c, wide].map((one) => spans.get(one.id))).toEqual([1, 1, 2, 2]);
  });

  test("Keep keeps its half of the row even when it is alone in it", () => {
    const kept = { ...a, layout: { narrow: "keep" as const } };
    const spans = phoneSpans(phoneOrder([kept, wide]));
    expect(spans.get("a")).toBe(1);
    // Left automatic, the same widget takes the row.
    expect(phoneSpans(phoneOrder([a, wide])).get("a")).toBe(2);
  });

  test("Keep keeps half a row, Full width and Stack below take the row", () => {
    const half = note("h", box(0, 0, 6, 2));
    expect(phoneSpan(half)).toBe(2);
    expect(phoneSpan({ ...half, layout: { narrow: "keep" } })).toBe(1);
    expect(phoneSpan({ ...a, layout: { narrow: "full" } })).toBe(2);
    expect(phoneSpan({ ...a, layout: { narrow: "stack" } })).toBe(2);
  });

  test("Stack below is read after what is not stacked, Full width stays in its place", () => {
    const stacked = { ...a, layout: { narrow: "stack" as const } };
    const full = { ...a, layout: { narrow: "full" as const } };
    expect(phoneOrder([stacked, b, c]).map((one) => one.id)).toEqual(["b", "c", "a"]);
    expect(phoneOrder([full, b, c]).map((one) => one.id)).toEqual(["a", "b", "c"]);
  });

  test("a move into another priority band joins it, so it lands where it was dropped", () => {
    const high = { ...a, id: "hi", layout: { priority: 3 } };
    const moved = phoneMoved([high, b, c], "c", "hi");
    expect(phoneOrder(moved).map((one) => one.id)).toEqual(["c", "hi", "b"]);
    expect(moved.find((one) => one.id === "c")?.layout?.priority).toBe(3);
  });

  test("the phone counts what was set by hand: a place, what narrow screens do, a priority", () => {
    expect(
      changedByHand(
        [a, { ...b, layout: { narrow: "hide" } }, { ...c, layout: { priority: 1 } }],
        "phone",
      ),
    ).toBe(2);
  });
});

describe("the filters on a phone", () => {
  const bar = (filters: NonNullable<PageViewProps["filters"]>[number][]): PageWidget => ({
    id: "filters",
    type: "core/filter",
    at: box(0, 0, 12, 2),
    config: { filters },
  });
  const search = { name: "search", type: "search", label: "Search invoices" } as const;
  const clinic = { name: "clinic", type: "text", label: "Clinic" } as const;

  // The page goes by its own width, which happy-dom does not lay out.
  const phone = () =>
    vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 390, height: 800, top: 0, left: 0 } as DOMRect);

  test("wait behind one button, beside the search", async () => {
    phone();
    render(<Draw widgets={[bar([search, clinic])]} filters={[search, clinic]} device="phone" />);
    expect(await screen.findByRole("button", { name: /Filters/ })).toBeTruthy();
    expect(screen.getByLabelText("Search invoices")).toBeTruthy();
    expect(screen.queryByLabelText("Clinic")).toBeNull();
  });

  test("a search alone stays a box", async () => {
    phone();
    render(<Draw widgets={[bar([search])]} filters={[search]} />);
    expect(await screen.findByLabelText("Search invoices")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Filters/ })).toBeNull();
  });
});
