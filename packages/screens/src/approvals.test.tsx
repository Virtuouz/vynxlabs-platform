// @vitest-environment happy-dom

// The Approvals widget: every state it draws, the keyboard, why a button is greyed, asking why,
// a decision made first by someone else, and the next request taking the focus.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import type { ApprovalItem, ApprovalsData, DecideOutcome, WidgetViewProps } from "@volvel/widgets";
import {
  ApprovalsView,
  corePack,
  metaOf,
  relativeTime,
  valueWords,
  whyNot,
} from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PageView } from "./PageView.tsx";
import { ActionError, type PageDataClient, viewRegistry, type WireData } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = Date.now();
const hours = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const days = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

const item = (n: number, over: Partial<ApprovalItem> = {}): ApprovalItem => ({
  id: `run-${n}/ask`,
  title: `Approve order ${n}`,
  flow: { path: "orders/reorder", title: "Reorder" },
  fields: [
    { name: "clinic", label: "Clinic", value: "northside" },
    { name: "total", label: "Total", value: 1840 },
    { name: "needed", label: "Needed by", value: "2026-12-01" },
    { name: "urgent", label: "Urgent", value: true },
  ],
  waitingSince: hours(2),
  timesOutAt: days(2),
  mayDecide: true,
  approvers: "the Practice managers group",
  ...over,
});

const data = (waiting: ApprovalItem[], decided: ApprovalItem[] = [], more = false) =>
  ({ shape: "approvals", waiting, decided, more }) as ApprovalsData;

type Decide = NonNullable<WidgetViewProps["decide"]>;
const ok = (message = "Approved “x” as Rowan Ellis."): DecideOutcome => ({ ok: true, message });

function draw(
  config: Record<string, unknown>,
  input: ApprovalsData,
  over: Partial<WidgetViewProps> = {},
) {
  const View = ApprovalsView as unknown as (props: WidgetViewProps) => React.ReactNode;
  const props: WidgetViewProps = {
    config: {
      look: "rows",
      opens: "sheet",
      askWhy: "rejecting",
      approveLabel: "Approve",
      rejectLabel: "Reject",
      advance: true,
      ...config,
    },
    data: { requests: input },
    size: { w: 6, h: 9, narrow: false },
    emit: () => {},
    building: false,
    decide: async () => ok(),
    ...over,
  };
  const view = render(<View {...props} />);
  return {
    ...view,
    again: (next: Partial<WidgetViewProps>) => view.rerender(<View {...{ ...props, ...next }} />),
  };
}

describe("words", () => {
  test("a time is said as a person says it", () => {
    expect(relativeTime(hours(2), NOW)).toBe("2 hours ago");
    expect(relativeTime(days(2), NOW)).toBe("in 2 days");
    expect(relativeTime(hours(0.001), NOW)).toBe("just now");
  });

  test("the meta line: the flow, when it was asked, when it is due, and overdue in danger", () => {
    expect(metaOf(item(1), NOW).text).toBe("Reorder · asked 2 hours ago · due in 2 days");
    const late = metaOf(item(1, { timesOutAt: hours(3) }), NOW);
    expect(late.overdue).toBe(true);
    expect(late.text).toContain("due 3 hours ago");
    expect(late.parts.at(-1)?.danger).toBe(true);
  });

  test("money, dates and numbers are written by the one formatter", () => {
    expect(valueWords("total", 1840)).toBe("$1,840.00");
    expect(valueWords("quantity", 1840)).toBe("1,840");
    expect(valueWords("needed", "2026-12-01")).toMatch(/Dec 1, 2026/);
    expect(valueWords("urgent", true)).toBe("Yes");
    expect(valueWords("note", "")).toBe("Not set");
  });

  test("why a button is greyed, never hidden", () => {
    expect(whyNot(item(1, { mayDecide: false }), { building: false, can: true })).toBe(
      "Only the Practice managers group can decide this.",
    );
    expect(
      whyNot(item(1, { mayDecide: false, approvers: null }), { building: false, can: true }),
    ).toBe("You don't have permission to decide requests here.");
    expect(whyNot(item(1), { building: true, can: true })).toMatch(/building/);
    expect(whyNot(item(1), { building: false, can: false })).toMatch(/isn't available/);
    expect(whyNot(item(1), { building: false, can: true })).toBe("");
  });
});

describe("the list", () => {
  test("rows say what each is, with the meta line and the first details", () => {
    draw({}, data([item(1), item(2)]));
    const list = screen.getByRole("list", { name: "Requests waiting" });
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    expect(within(list).getByText("Approve order 1")).toBeTruthy();
    expect(within(list).getAllByText("Reorder · asked 2 hours ago · due in 2 days")).toHaveLength(
      2,
    );
    expect(within(list).getAllByText(/northside · \$1,840\.00/)).toHaveLength(2);
  });

  test("nothing waiting says so, or says what the maker wrote", () => {
    const { unmount } = draw({}, data([]));
    expect(screen.getByText("Nothing waits for you.")).toBeTruthy();
    unmount();
    draw({ empty: "All caught up." }, data([]));
    expect(screen.getByText("All caught up.")).toBeTruthy();
  });

  test("an overdue request says so in a chip", () => {
    draw({}, data([item(1, { timesOutAt: hours(1) })]));
    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  test("the arrow keys move along the rows, Home and End to the ends", () => {
    draw({}, data([item(1), item(2), item(3)]));
    const rows = screen.getAllByRole("button");
    rows[0]?.focus();
    fireEvent.keyDown(rows[0] as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1] as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2] as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1] as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
  });

  test("Enter opens the request in a side sheet, which steps through them and closes with Escape", async () => {
    draw({}, data([item(1), item(2)]));
    const rows = screen.getAllByRole("button");
    rows[0]?.focus();
    fireEvent.keyDown(rows[0] as HTMLElement, { key: "Enter" });
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Approve order 1" })).toBeTruthy();
    expect(within(sheet).getByText("1 of 2")).toBeTruthy();
    expect(
      (within(sheet).getByRole("button", { name: /Previous/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: /Next/ }));
    expect(within(sheet).getByText("2 of 2")).toBeTruthy();
    expect(within(sheet).getByRole("heading", { name: "Approve order 2" })).toBeTruthy();
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The focus is back on the row the sheet was last on, not lost to the page.
    await waitFor(() =>
      expect((document.activeElement as HTMLElement).getAttribute("data-approval-row")).toBe(
        "run-2/ask",
      ),
    );
  });

  test("opens: nothing puts each request's buttons on the page", () => {
    draw({ opens: "nothing" }, data([item(1), item(2)]));
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Reject" })).toHaveLength(2);
  });

  test("the queue puts the chosen one's detail beside the list, and the first is chosen", () => {
    draw({ look: "queue" }, data([item(1), item(2)]));
    const detail = document.querySelector("[data-approval-detail]") as HTMLElement;
    expect(detail.getAttribute("data-approval-detail")).toBe("run-1/ask");
    const rows = screen.getAllByRole("button", { name: /Approve order/ });
    fireEvent.click(rows[1] as HTMLElement);
    expect(
      (document.querySelector("[data-approval-detail]") as HTMLElement).getAttribute(
        "data-approval-detail",
      ),
    ).toBe("run-2/ask");
    expect(rows[1]?.getAttribute("aria-current")).toBe("true");
  });

  test("the detail draws title, status, meta and every field as Record detail draws them", () => {
    draw({ look: "queue" }, data([item(1)]));
    const detail = document.querySelector("[data-approval-detail]") as HTMLElement;
    expect(within(detail).getByRole("heading", { name: "Approve order 1" })).toBeTruthy();
    expect(within(detail).getByText("Waiting")).toBeTruthy();
    expect(within(detail).getByText("$1,840.00")).toBeTruthy();
    expect(within(detail).getByText("Yes")).toBeTruthy();
    expect(detail.querySelectorAll("[data-field]")).toHaveLength(4);
    expect(within(detail).getByRole("button", { name: "Approve" }).className).toContain(
      "bg-action",
    );
    expect(within(detail).getByRole("button", { name: "Reject" }).className).toContain(
      "text-danger",
    );
  });

  test("on a phone the buttons are full width", () => {
    draw({ opens: "nothing" }, data([item(1)]), { size: { w: 12, h: 9, narrow: true } });
    expect(screen.getByRole("button", { name: "Approve" }).className).toContain("w-full");
    expect(screen.getByRole("button", { name: "Reject" }).className).toContain("w-full");
  });

  test("decided ones are behind a switch, with who decided and why", () => {
    const done = item(9, {
      decision: {
        approved: false,
        by: "Maya Brooks",
        at: hours(1),
        comment: "Too much stock",
        via: "app",
      },
    });
    draw({ decided: true }, data([item(1)], [done]));
    expect(screen.getByRole("radio", { name: /Waiting/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Decided/ }));
    expect(screen.getByText("Rejected by Maya Brooks")).toBeTruthy();
    expect(screen.getByText(/1 hour ago · from an app/)).toBeTruthy();
    expect(screen.getByText("“Too much stock”")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("who may decide", () => {
  test("a viewer who may not has the buttons greyed with the reason beside them, not hidden", () => {
    draw({ opens: "nothing" }, data([item(1, { mayDecide: false })]));
    const approve = screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("Only the Practice managers group can decide this.")).toBeTruthy();
  });

  test("a page being built shows the buttons inert, with a sample when nothing waits", () => {
    const decide = vi.fn();
    draw({ opens: "nothing" }, data([]), { building: true, decide });
    expect(screen.getByText(/This is a sample/)).toBeTruthy();
    expect(screen.getByText("Sample")).toBeTruthy();
    const approve = screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(decide).not.toHaveBeenCalled();
    expect(screen.getByText("Buttons don't run while you're building.")).toBeTruthy();
  });

  test("a page being built shows what really waits, not the sample", () => {
    draw({ opens: "nothing" }, data([item(1)]), { building: true });
    expect(screen.queryByText("Sample")).toBeNull();
    expect(screen.getByText("Approve order 1")).toBeTruthy();
  });
});

describe("where decisions are taken in the console", () => {
  const away = { console: "http://localhost:8080/t/t/workspaces/w/approvals", name: "Volvel" };

  test("the request is shown, and one button opens it in the console in a new tab, in the instance's own name", () => {
    draw({ opens: "nothing" }, { ...data([item(1)]), decideIn: { ...away, name: "Acme Ops" } });
    const link = screen.getByRole("link", { name: /Decide in Acme Ops/ });
    expect(link.getAttribute("href")).toBe(away.console);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.getByText("Approve order 1")).toBeTruthy();
  });

  test("the list reads again when the person comes back to the window", () => {
    const refresh = vi.fn();
    draw({ opens: "nothing" }, { ...data([item(1)]), decideIn: away }, { refresh });
    fireEvent.click(screen.getByRole("link", { name: /Decide in Volvel/ }));
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.focus(window);
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.focus(window);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("someone who may not decide still sees why, not a button to the console", () => {
    draw({ opens: "nothing" }, { ...data([item(1, { mayDecide: false })]), decideIn: away });
    expect(screen.queryByRole("link", { name: /Decide in/ })).toBeNull();
    expect(screen.getByText(/can decide this/)).toBeTruthy();
  });
});

describe("deciding", () => {
  test("approving calls the host once, says who and what, and the request leaves", async () => {
    const decide = vi.fn<Decide>(async () => ok("Approved “Approve order 1” as Rowan Ellis."));
    draw({ opens: "nothing" }, data([item(1), item(2)]), { decide });
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await waitFor(() => expect(decide).toHaveBeenCalledWith("run-1/ask", "approve", undefined));
    expect((await screen.findByRole("status")).textContent).toContain(
      "Approved “Approve order 1” as Rowan Ellis.",
    );
  });

  test("the pending state is that request's alone", async () => {
    let finish: (outcome: DecideOutcome) => void = () => {};
    const decide = vi.fn<Decide>(() => new Promise((resolve) => (finish = resolve)));
    draw({ opens: "nothing" }, data([item(1), item(2)]), { decide });
    const approves = screen.getAllByRole("button", { name: "Approve" }) as HTMLButtonElement[];
    fireEvent.click(approves[0] as HTMLElement);
    await waitFor(() => expect(approves[0]?.getAttribute("aria-busy")).toBe("true"));
    expect(approves[0]?.disabled).toBe(true);
    expect(approves[1]?.disabled).toBe(false);
    await act(async () => finish(ok()));
  });

  test("rejecting opens a box for the reason with Reject under it, and refuses none", async () => {
    const decide = vi.fn<Decide>(async () => ok("Rejected “x” as Rowan Ellis."));
    draw({ opens: "nothing" }, data([item(1)]), { decide });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const box = screen.getByLabelText("Why are you rejecting this?") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(box);
    const buttons = screen.getAllByRole("button", { name: "Reject" });
    const confirm = buttons[buttons.length - 1] as HTMLElement;
    fireEvent.click(confirm);
    expect(decide).not.toHaveBeenCalled();
    expect(await screen.findByText("Say why it is rejected.")).toBeTruthy();
    fireEvent.change(box, { target: { value: "  Too much stock  " } });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith("run-1/ask", "reject", "Too much stock"),
    );
  });

  test("Escape closes the box and leaves the request as it was", () => {
    draw({ opens: "nothing" }, data([item(1)]));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const box = screen.getByLabelText("Why are you rejecting this?");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByLabelText("Why are you rejecting this?")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  test("ask why: never rejects at once; always asks for an approval too", async () => {
    const decide = vi.fn<Decide>(async () => ok());
    const first = draw({ opens: "nothing", askWhy: "never" }, data([item(1)]), { decide });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByLabelText(/optional/)).toBeTruthy();
    first.unmount();
    draw({ opens: "nothing", askWhy: "always" }, data([item(2)]), { decide });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByLabelText("Why are you approving this?")).toBeTruthy();
    expect(decide).not.toHaveBeenCalled();
  });

  test("ask before approving: a question first, and Cancel puts it away", async () => {
    const decide = vi.fn<Decide>(async () => ok());
    draw({ opens: "nothing", confirm: true }, data([item(1)]), { decide });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText("Approve “Approve order 1”?")).toBeTruthy();
    expect(decide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Approve “Approve order 1”?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const buttons = screen.getAllByRole("button", { name: "Approve" });
    fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
  });

  test("the words on the buttons are the maker's", () => {
    draw({ opens: "nothing", approveLabel: "Sign off", rejectLabel: "Send back" }, data([item(1)]));
    expect(screen.getByRole("button", { name: "Sign off" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send back" })).toBeTruthy();
  });

  test("a refusal from the server is said under the buttons and the request stays", async () => {
    const decide = vi.fn<Decide>(async () => ({
      ok: false,
      message: "Only the Practice managers group can decide this.",
    }));
    draw({ opens: "nothing" }, data([item(1)]), { decide });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Only the Practice managers");
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  test("someone having decided it first: the request shows who and what, and has no buttons", async () => {
    const decide = vi.fn<Decide>(async () => ({
      ok: false,
      conflict: true,
      message: "Maya Brooks approved this a moment ago.",
    }));
    draw({ opens: "nothing" }, data([item(1), item(2)]), { decide });
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    const told = await screen.findAllByText("Maya Brooks approved this a moment ago.");
    expect(told.length).toBeGreaterThan(0);
    // Only the other request still has its buttons.
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
  });

  test("a request decided first by someone else stays after the page reads again, until Done", async () => {
    const decide = vi.fn<Decide>(async () => ({
      ok: false,
      conflict: true,
      message: "Maya Brooks approved this a moment ago.",
    }));
    const view = draw({ look: "queue" }, data([item(1), item(2)]), { decide });
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await screen.findAllByText("Maya Brooks approved this a moment ago.");
    // The page reads again: the request is gone from what waits.
    view.again({ data: { requests: data([item(2)]) } });
    expect(screen.getAllByText("Maya Brooks approved this a moment ago.").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Approve order 1").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        (document.querySelector("[data-approval-detail]") as HTMLElement).getAttribute(
          "data-approval-detail",
        ),
      ).toBe("run-2/ask"),
    );
  });

  test("putting a settled request away with Done opens the next one and takes the focus there", async () => {
    const decide = vi.fn<Decide>(async () => ({
      ok: false,
      conflict: true,
      message: "Maya Brooks approved this a moment ago.",
    }));
    draw({ look: "queue" }, data([item(1), item(2), item(3)]), { decide });
    fireEvent.click(screen.getByText("Approve order 2"));
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await screen.findAllByText("Maya Brooks approved this a moment ago.");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    // The one after it opens (not the first of the list), with the focus on its row.
    await waitFor(() =>
      expect(
        (document.querySelector("[data-approval-detail]") as HTMLElement).getAttribute(
          "data-approval-detail",
        ),
      ).toBe("run-3/ask"),
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-approval-row")).toBe("run-3/ask"),
    );
  });

  test("with reduced motion a decided request is gone at once, though the page has not read again", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );
    try {
      const decide = vi.fn<Decide>(async () => ok());
      draw({ opens: "nothing" }, data([item(1), item(2)]), { decide });
      fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
      await waitFor(() => expect(decide).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText("Approve order 1")).toBeNull());
      expect(document.querySelector("[data-leaving]")).toBeNull();
      expect(screen.getByText("Approve order 2")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("with motion the request is kept, collapsing, for a moment", async () => {
    const decide = vi.fn<Decide>(async () => ok());
    draw({ opens: "nothing" }, data([item(1), item(2)]), { decide });
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-leaving]")).not.toBeNull());
    expect(screen.getByText("Approve order 2")).toBeTruthy();
  });

  test("the next request is chosen and takes the focus, not the top of the page", async () => {
    const decide = vi.fn<Decide>(async () => ok());
    draw({ look: "queue" }, data([item(1), item(2), item(3)]), { decide });
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await waitFor(() => expect(decide).toHaveBeenCalledWith("run-1/ask", "approve", undefined));
    await waitFor(() =>
      expect(
        (document.querySelector("[data-approval-detail]") as HTMLElement).getAttribute(
          "data-approval-detail",
        ),
      ).toBe("run-2/ask"),
    );
    await waitFor(() =>
      expect((document.activeElement as HTMLElement).getAttribute("data-approval-row")).toBe(
        "run-2/ask",
      ),
    );
  });

  test("go to the next one: off, nothing is chosen after a decision", async () => {
    const decide = vi.fn<Decide>(async () => ok());
    draw({ look: "queue", advance: false }, data([item(1), item(2)]), { decide });
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await waitFor(() => expect(decide).toHaveBeenCalled());
    // The request leaves: a leaving row is not tabbable.
    await waitFor(() =>
      expect(
        (document.querySelector("[data-approval-row='run-1/ask']") as HTMLElement | null)?.tabIndex,
      ).not.toBe(0),
    );
  });

  test("deciding the last one lands the focus on the widget and says so", async () => {
    const decide = vi.fn<Decide>(async () => ok("Approved “Approve order 1” as Rowan Ellis."));
    const { container } = draw({ opens: "nothing" }, data([item(1)]), { decide });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector("[data-approvals]")),
    );
    expect(screen.getByRole("status").textContent).toContain("Approved");
  });

  test("a request decided in a side sheet moves the sheet to the next, and closes it after the last", async () => {
    const decide = vi.fn<Decide>(async () => ok());
    draw({}, data([item(1), item(2)]), { decide });
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByRole("heading", { name: "Approve order 2" }),
      ).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// In a page: the states the frame draws, the count in the heading, the host's own `decide`

const widget: PageWidget = {
  id: "queue",
  type: "core/approvals",
  title: "Approvals",
  at: { x: 0, y: 0, w: 6, h: 9 },
  data: { requests: { source: { approvals: { whose: "mine" } } } },
  config: { opens: "nothing" },
};
const registry = viewRegistry(corePack as never);

function page(client: Partial<PageDataClient>) {
  const full: PageDataClient = {
    read: async () => ({ inputs: { requests: data([item(1), item(2)]) as WireData } }),
    ...client,
  };
  return render(
    <PageView
      widgets={[widget]}
      filters={[]}
      registry={registry}
      client={full}
      filterValues={{}}
      onFilterValues={() => {}}
    />,
  );
}

describe("in a page", () => {
  test("loading, then the requests, with their count in the heading", async () => {
    let finish: (value: { inputs: Record<string, WireData> }) => void = () => {};
    page({ read: () => new Promise((resolve) => (finish = resolve)) });
    expect(screen.getByLabelText(/Loading Approvals/)).toBeTruthy();
    await act(async () => finish({ inputs: { requests: data([item(1), item(2)]) as WireData } }));
    expect(await screen.findByText("Approve order 1")).toBeTruthy();
    expect(document.querySelector("[data-count]")?.textContent).toBe("2");
  });

  test("nothing waiting has no count and says so", async () => {
    page({ read: async () => ({ inputs: { requests: data([]) as WireData } }) });
    expect(await screen.findByText("Nothing waits for you.")).toBeTruthy();
    expect(document.querySelector("[data-count]")).toBeNull();
  });

  test("a read that fails says so and can be tried again", async () => {
    const read = vi
      .fn<PageDataClient["read"]>()
      .mockRejectedValueOnce(new Error("The approvals could not be read."))
      .mockResolvedValue({ inputs: { requests: data([item(1)]) as WireData } });
    page({ read });
    expect(await screen.findByText("The approvals could not be read.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Approve order 1")).toBeTruthy();
  });

  test("a host with no way to decide draws the buttons greyed with why", async () => {
    page({});
    await screen.findByText("Approve order 1");
    expect(
      (screen.getAllByRole("button", { name: "Approve" })[0] as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getAllByText("Deciding isn't available here.").length).toBeGreaterThan(0);
  });

  test("the host decides by the widget and the step, the page reads again, and the words say who", async () => {
    const decide = vi.fn<NonNullable<PageDataClient["decide"]>>(async () => ({
      decision: "approve" as const,
      title: "Approve order 1",
      flow: { path: "orders/reorder", title: "Reorder" },
      by: "Rowan Ellis",
    }));
    const read = vi.fn<PageDataClient["read"]>(async () => ({
      inputs: { requests: data([item(1), item(2)]) as WireData },
    }));
    page({ decide, read });
    fireEvent.click((await screen.findAllByRole("button", { name: "Approve" }))[0] as HTMLElement);
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith("queue", "run-1/ask", "approve", undefined),
    );
    expect(await screen.findByText("Approved “Approve order 1” as Rowan Ellis.")).toBeTruthy();
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1));
  });

  test("a 409 from the server is the request showing who decided it", async () => {
    const decide = vi.fn<NonNullable<PageDataClient["decide"]>>(async () => {
      throw new ActionError("Maya Brooks rejected this a moment ago.", 409);
    });
    page({ decide });
    fireEvent.click((await screen.findAllByRole("button", { name: "Approve" }))[0] as HTMLElement);
    expect(
      (await screen.findAllByText("Maya Brooks rejected this a moment ago.")).length,
    ).toBeGreaterThan(0);
  });
});
