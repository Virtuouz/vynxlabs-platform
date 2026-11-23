// @vitest-environment happy-dom

// The Approvals widget's drawer writes the widget: which flows and whose, what each shows,
// and how deciding goes. And what "Add to page" offers for it.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { newWidget, type PageWidget } from "@volvel/manifest";
import { approvals } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { approvalsSuggestion } from "../../../screens/builder/selectorData.ts";
import type { Env } from "../controls.tsx";
import { drawersFor, hiddenSettings } from "../custom.ts";
import { type ApprovalFlow, ApprovalFlowsContext } from "./approvalFlows.tsx";
import {
  ApprovalsActionsSection,
  ApprovalsDataSection,
  ApprovalsFieldsSection,
  offeredNames,
} from "./approvalsDrawer.tsx";
import "./registerApprovals.ts";

afterEach(cleanup);

const flows: ApprovalFlow[] = [
  {
    path: "stock/reorder",
    title: "Stock orders",
    steps: [
      {
        node: "approve",
        title: "Approve a stock order",
        fields: ["clinic", "item", "quantity", "total", "on_hand", "supplier"],
      },
    ],
  },
  {
    path: "hr/time-off",
    title: "Time off",
    steps: [{ node: "ok", title: "Sign off", fields: ["person", "from", "total"] }],
  },
];

const fresh = (): PageWidget => newWidget(approvals, "approvals", []);

function Harness({
  start,
  Section,
  seen,
}: {
  start: PageWidget;
  Section: typeof ApprovalsDataSection;
  seen: { widget: PageWidget };
}) {
  const [widget, setWidget] = useState(start);
  seen.widget = widget;
  const env: Env = {
    definition: approvals,
    widget,
    surface: "app",
    filters: [],
    neighbours: [],
    catalog: { tables: [], queries: [], maySql: false },
    config: { ...(approvals.defaults ?? {}), ...(widget.config ?? {}) },
    write: (next) => setWidget(next),
    pages: [],
    flows: [],
    scripts: [],
    widgets: [widget],
    writeAll: () => undefined,
  };
  return (
    <ApprovalFlowsContext.Provider value={{ flows, link: "/t/acme/w/dev" }}>
      <Section env={env} />
    </ApprovalFlowsContext.Provider>
  );
}

function mount(Section: typeof ApprovalsDataSection, start: PageWidget = fresh()) {
  const seen = { widget: start };
  render(<Harness start={start} Section={Section} seen={seen} />);
  return seen;
}

type Approvals = { flows?: string[]; whose?: string };
const source = (widget: PageWidget): Approvals =>
  ((widget.data?.requests?.source ?? { approvals: {} }) as { approvals: Approvals }).approvals;
const fieldsOf = (widget: PageWidget) =>
  (widget.config?.fields ?? []) as { name: string; hidden?: boolean }[];

describe("a new Approvals widget", () => {
  test("is added reading the workspace's approvals for the viewer, with nothing to choose first", () => {
    const widget = fresh();
    expect(widget.type).toBe("core/approvals");
    expect(widget.title).toBe("Approvals");
    expect(source(widget)).toEqual({ whose: "mine" });
  });

  test("its drawer pieces are registered: which requests, what each shows, deciding, heading last", () => {
    for (const tab of ["data", "display", "actions"] as const) {
      expect(drawersFor("core/approvals", tab)).toHaveLength(1);
    }
    expect(drawersFor("core/approvals", "display")[0]?.headingLast).toBe(true);
    expect(hiddenSettings("core/approvals")).toEqual(
      new Set(["fields", "approveLabel", "rejectLabel", "askWhy", "confirm", "advance"]),
    );
  });
});

describe("Data: which requests", () => {
  test("the flows are chips with their real titles, all on when none is chosen", () => {
    mount(ApprovalsDataSection);
    const group = within(screen.getByRole("group", { name: "Flows" }));
    expect(group.getByRole("button", { name: /^Stock orders/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(group.getByRole("button", { name: /^Time off/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByText(/including those made later/)).toBeTruthy();
  });

  test("switching one off chooses the others; all back on is every flow again; never none", () => {
    const seen = mount(ApprovalsDataSection);
    fireEvent.click(screen.getByRole("button", { name: /^Time off/ }));
    expect(source(seen.widget).flows).toEqual(["stock/reorder"]);
    // The last one stays on.
    fireEvent.click(screen.getByRole("button", { name: /^Stock orders/ }));
    expect(source(seen.widget).flows).toEqual(["stock/reorder"]);
    fireEvent.click(screen.getByRole("button", { name: /^Time off/ }));
    expect(source(seen.widget).flows).toBeUndefined();
  });

  test("whose: theirs to decide, or every one", () => {
    const seen = mount(ApprovalsDataSection);
    fireEvent.click(screen.getByRole("radio", { name: /Every one, theirs or not/ }));
    expect(source(seen.widget).whose).toBe("all");
    fireEvent.click(screen.getByRole("radio", { name: /Theirs to decide/ }));
    expect(source(seen.widget).whose).toBe("mine");
  });

  test("a flow the widget names that has gone is shown, to be taken off", () => {
    const start = fresh();
    start.data = { requests: { source: { approvals: { flows: ["stock/reorder", "gone/flow"] } } } };
    mount(ApprovalsDataSection, start);
    expect(screen.getByRole("button", { name: /^Flow \(not found\)/ })).toBeTruthy();
  });

  test("says who may decide is set on the flow's step, with a way to it", () => {
    const start = fresh();
    start.data = { requests: { source: { approvals: { flows: ["stock/reorder"] } } } };
    mount(ApprovalsDataSection, start);
    expect(screen.getByText(/Who may decide is set on the flow's step/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open the flow/ });
    expect(link.getAttribute("href")).toBe("/t/acme/w/dev/flows/edit/stock/reorder");
  });
});

describe("Display: what each shows", () => {
  test("the names the flows' steps give are the list: the first four on, the rest off", () => {
    expect(offeredNames(flows, undefined)).toEqual([
      "clinic",
      "item",
      "quantity",
      "total",
      "on_hand",
      "supplier",
      "person",
      "from",
    ]);
    // Only the flows asked of.
    expect(offeredNames(flows, ["hr/time-off"])).toEqual(["person", "from", "total"]);
    mount(ApprovalsFieldsSection);
    expect(screen.getByText("4 of 8 shown")).toBeTruthy();
    expect(screen.getByText("On hand")).toBeTruthy();
  });

  test("the eye hides one, and the whole list is then the widget's own", () => {
    const seen = mount(ApprovalsFieldsSection);
    const eyes = screen.getAllByRole("button", { name: /hide|show/i });
    expect(eyes.length).toBeGreaterThan(0);
    fireEvent.click(eyes[0] as HTMLElement);
    const fields = fieldsOf(seen.widget);
    expect(fields).toHaveLength(8);
    expect(fields[0]).toMatchObject({ name: "clinic", hidden: true });
    expect(fields.filter((one) => !one.hidden)).toHaveLength(3);
  });

  test("another of the step's names is added with a click, or any name by typing", () => {
    const start = fresh();
    start.config = { fields: [{ name: "clinic" }] };
    const seen = mount(ApprovalsFieldsSection, start);
    fireEvent.click(
      within(screen.getByRole("group", { name: "More details these flows give" })).getByRole(
        "button",
        { name: "On hand" },
      ),
    );
    expect(fieldsOf(seen.widget).some((one) => one.name === "on_hand")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Detail" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Add a detail by its name" }), {
      target: { value: "notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(fieldsOf(seen.widget).at(-1)).toEqual({ name: "notes" });
  });
});

describe("Actions: deciding", () => {
  test("the button words, ask why, confirm and the next one are written, and the defaults are not stored", () => {
    const seen = mount(ApprovalsActionsSection);
    fireEvent.change(screen.getByLabelText("Approve says"), { target: { value: "Sign off" } });
    expect(seen.widget.config?.approveLabel).toBe("Sign off");
    fireEvent.change(screen.getByLabelText("Approve says"), { target: { value: "Approve" } });
    expect(seen.widget.config?.approveLabel).toBeUndefined();
    fireEvent.click(screen.getByRole("radio", { name: "Always" }));
    expect(seen.widget.config?.askWhy).toBe("always");
    fireEvent.click(screen.getByRole("radio", { name: "Rejecting" }));
    expect(seen.widget.config?.askWhy).toBeUndefined();
    fireEvent.click(screen.getByRole("switch", { name: /Ask before approving/ }));
    expect(seen.widget.config?.confirm).toBe(true);
    fireEvent.click(screen.getByRole("switch", { name: /Go to the next one/ }));
    expect(seen.widget.config?.advance).toBe(false);
    expect(screen.getByText("Who may decide is set on the flow's step.")).toBeTruthy();
  });
});

describe("Add to page", () => {
  test("offers Approvals when a flow has an approval step and the page has none", () => {
    const offer = approvalsSuggestion(
      [{ path: "stock/reorder", title: "Stock orders" }],
      [{ type: "core/table" }],
    );
    expect(offer).toEqual({
      key: "approvals",
      label: "Approvals",
      hint: "Stock orders asks for a decision",
    });
    expect(
      approvalsSuggestion(
        [
          { path: "a", title: null },
          { path: "b", title: null },
        ],
        [],
      )?.hint,
    ).toBe("2 flows ask for a decision");
  });

  test("does not, when no flow asks, or the page already has one", () => {
    expect(approvalsSuggestion([], [])).toBeUndefined();
    expect(
      approvalsSuggestion([{ path: "a", title: null }], [{ type: "core/approvals" }]),
    ).toBeUndefined();
  });
});
