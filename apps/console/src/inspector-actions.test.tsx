// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { Page, PageWidget } from "@volvel/manifest";
import { defineWidget, type WidgetDefinition } from "@volvel/widgets";
import { button, chart, form } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { moved } from "./kit/inspector/actionModel.ts";
import { Inspector } from "./kit/inspector/Inspector.tsx";
import type { Catalog } from "./kit/inspector/model.ts";
import { show } from "./testing.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "total", type: "number", references: null },
        { name: "status", type: "enum", references: null },
        { name: "paid_on", type: "date", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};

const place = { x: 0, y: 0, w: 4, h: 2 };
const sheetPage: Page = {
  id: "invoice",
  title: "Invoice",
  kind: "sheet",
  record: { table: "invoices" },
  widgets: [],
};
const pages: Page[] = [sheetPage, { id: "money", title: "Money", widgets: [] }];

let written: PageWidget[];
function Harness({
  start,
  definition,
  surface = "app",
  page = sheetPage as Page | null,
  groups = [],
}: {
  start: PageWidget;
  definition: WidgetDefinition;
  surface?: "app" | "dashboard";
  page?: Page | null;
  groups?: string[];
}) {
  const [widget, setWidget] = useState(start);
  return (
    <Inspector
      widget={widget}
      definition={definition}
      surface={surface}
      filters={[]}
      catalog={catalog}
      page={page ?? undefined}
      pages={pages}
      flows={[{ path: "send-receipt", manualInput: null }]}
      groups={groups}
      onChange={(next) => {
        written.push(next);
        setWidget(next);
      }}
      onDuplicate={() => {}}
      onRemove={() => {}}
    />
  );
}

/** Opens "Add a step" and picks one. */
function add(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
}
const last = () => written.at(-1) as PageWidget;
const fieldsOf = () => (last().config?.fields ?? []) as { column: string }[];
const tab = (name: string) =>
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));

const pressMe: PageWidget = {
  id: "mark-paid",
  type: "core/button",
  at: place,
  config: { label: "Mark paid", tone: "primary" },
};

beforeEach(() => {
  written = [];
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a button's click action is built as board 4 writes it, and says what it changes", () => {
  show(<Harness start={pressMe} definition={button} />);
  tab("Actions");
  expect(screen.getByText("When clicked")).toBeTruthy();
  expect(screen.getByText("Nothing")).toBeTruthy();

  add("Ask to confirm");
  fireEvent.change(screen.getByLabelText("Confirmation title"), {
    target: { value: "Mark {number} as paid?" },
  });
  add("Update the record");
  // The page is open on an invoice, so the step works on "this invoice".
  expect(screen.getByText("This invoice")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Set another field"), { target: { value: "status" } });
  fireEvent.change(screen.getByLabelText("Status becomes"), { target: { value: "value" } });
  fireEvent.change(screen.getByLabelText("Status becomes: the value"), {
    target: { value: "Paid" },
  });
  fireEvent.change(screen.getByLabelText("Set another field"), { target: { value: "paid_on" } });
  fireEvent.change(screen.getByLabelText("Paid on becomes"), { target: { value: "today" } });
  add("Run a workflow");
  fireEvent.change(screen.getByLabelText("Workflow"), { target: { value: "send-receipt" } });
  fireEvent.change(screen.getByLabelText("What it is given"), { target: { value: "this" } });
  expect(screen.getByText("Gets this invoice as its input")).toBeTruthy();
  add("Show a message");
  fireEvent.change(screen.getByLabelText("The message says"), {
    target: { value: "Invoice marked paid" },
  });

  expect(last().on?.click).toEqual({
    confirm: { title: "Mark {number} as paid?" },
    steps: [
      {
        do: "update",
        record: "this",
        set: { status: { value: "Paid" }, paid_on: { today: true } },
      },
      { do: "flow", path: "send-receipt", input: { id: { record: "id" } } },
      { do: "message", text: "Invoice marked paid", tone: "success" },
    ],
  });
  // The steps are numbered, and what they change is said where they act.
  expect(screen.getByText("Step 1:", { exact: false })).toBeTruthy();
  expect(screen.getByText(/Changes Status and Paid on of an invoice\./)).toBeTruthy();
  expect(
    screen.getByText(/People who can open the app can do this, on invoices they can see\./),
  ).toBeTruthy();
  expect(screen.getByText(/If something fails/)).toBeTruthy();
  expect(screen.getByText(/Show the error and keep the sheet open/)).toBeTruthy();
});

test("a value can be Today, the current user, a field of this record or what was asked", () => {
  show(<Harness start={pressMe} definition={button} />);
  tab("Actions");
  add("Ask to confirm");
  fireEvent.click(screen.getByRole("button", { name: "Ask for a field" }));
  add("Update the record");
  fireEvent.change(screen.getByLabelText("Set another field"), { target: { value: "paid_on" } });
  const menu = screen.getByLabelText("Paid on becomes");
  const choices = within(menu)
    .getAllByRole("option")
    .map((one) => one.textContent);
  expect(choices).toContain("Today");
  expect(choices).toContain("Now");
  expect(choices).toContain("The current user");
  expect(choices).toContain("Status of this invoice");
  expect(choices).toContain("What was asked: Reason");
  fireEvent.change(menu, { target: { value: "today" } });
  const step = last().on?.click?.steps[0];
  expect(step).toEqual({ do: "update", record: "this", set: { paid_on: { today: true } } });
  fireEvent.change(menu, { target: { value: "asked:reason" } });
  expect(last().on?.click?.steps[0]).toEqual({
    do: "update",
    record: "this",
    set: { paid_on: { asked: "reason" } },
  });
  fireEvent.change(menu, { target: { value: "this:status" } });
  expect(last().on?.click?.steps[0]).toEqual({
    do: "update",
    record: "this",
    set: { paid_on: { record: "status" } },
  });
});

test("'Can be pressed when' is a sentence of a field, a test and a value", () => {
  show(<Harness start={pressMe} definition={button} />);
  tab("Actions");
  add("Delete the record");
  fireEvent.click(screen.getByRole("button", { name: "Add a condition" }));
  fireEvent.change(screen.getByLabelText("What condition 1 is about"), {
    target: { value: "field:this:status" },
  });
  fireEvent.change(screen.getByLabelText("Test of condition 1"), { target: { value: "is" } });
  fireEvent.change(screen.getByLabelText("Value of condition 1"), { target: { value: "Unpaid" } });
  expect(last().on?.click).toEqual({
    steps: [{ do: "delete", record: "this" }],
    when: [{ field: "status", test: "is", value: "Unpaid" }],
  });
  expect(screen.getByText(/Deletes an invoice\./)).toBeTruthy();
});

test("a dashboard offers only narrow, message and rows", () => {
  const point: PageWidget = { id: "by-status", type: "core/chart", at: place };
  show(<Harness start={point} definition={chart} surface="dashboard" page={null} />);
  tab("Actions");
  expect(screen.getByText("When someone clicks a point")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "Narrow a filter",
    "Show a message",
    "Show the rows behind",
  ]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Show the rows behind" }));
  expect(last().on?.pointClick).toEqual({ steps: [{ do: "rows" }] });
  expect(screen.getByText("Changes no data.")).toBeTruthy();
});

test("Show this widget writes rules.showWhen, as a sentence", () => {
  show(<Harness start={pressMe} definition={button} groups={["Managers", "Billing"]} />);
  tab("Rules");
  expect(screen.getByText(/Hiding a widget isn’t security/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Only when …"));
  fireEvent.change(screen.getByLabelText("What rule 1 is about"), {
    target: { value: "field:this:status" },
  });
  fireEvent.change(screen.getByLabelText("Test of rule 1"), { target: { value: "is_not" } });
  fireEvent.change(screen.getByLabelText("Value of rule 1"), { target: { value: "Paid" } });
  expect(last().rules).toEqual({ showWhen: [{ field: "status", test: "is_not", value: "Paid" }] });
  expect(screen.getByText("Shown only when Status is not Paid.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Add a rule" }));
  fireEvent.change(screen.getByLabelText("What rule 2 is about"), { target: { value: "user" } });
  fireEvent.change(screen.getByLabelText("Group of rule 2"), { target: { value: "Billing" } });
  expect(last().rules?.showWhen?.[1]).toEqual({ user: "in", group: "Billing" });
  fireEvent.change(screen.getByLabelText("What rule 2 is about"), {
    target: { value: "record:exists" },
  });
  expect(last().rules?.showWhen?.[1]).toEqual({ record: "exists" });

  // Back to always takes the rules away.
  fireEvent.click(screen.getByLabelText("Always"));
  expect(last().rules).toBeUndefined();
});

test("a form's fields are a list that is put in order, with a label and a must-be-filled toggle", () => {
  const made: PageWidget = {
    id: "new-invoice",
    type: "core/form",
    at: place,
    data: { record: { source: { visual: { table: "invoices" } } } },
    config: {
      mode: "create",
      fields: [{ column: "number" }, { column: "total" }, { column: "status" }],
    },
  };
  show(<Harness start={made} definition={form} />);
  tab("Display");
  fireEvent.click(screen.getByRole("button", { name: "Move Total up" }));
  expect(fieldsOf().map((one) => one.column)).toEqual(["total", "number", "status"]);
  fireEvent.change(screen.getByLabelText("Label of Total"), { target: { value: "Amount" } });
  fireEvent.click(screen.getAllByLabelText("Must be filled in")[0] as HTMLElement);
  expect(fieldsOf()[0]).toEqual({
    column: "total",
    label: "Amount",
    required: true,
  });
  // The columns the platform keeps are not offered to a form; the rest can be shown.
  fireEvent.change(screen.getByLabelText("Show another field"), { target: { value: "paid_on" } });
  expect(fieldsOf().at(-1)?.column).toBe("paid_on");
  expect(moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
});

test("a made-up pack's widget with an action setting gets the step editor too", () => {
  const dial = defineWidget({
    type: "labs/dial",
    version: "0.1.0",
    title: "Dial",
    description: "A dial",
    category: "action",
    icon: "gauge",
    surfaces: ["app"],
    data: {},
    config: {
      type: "object",
      properties: {
        onSet: {
          type: "object",
          "x-volvel": { tab: "actions", control: "action", label: "When it is set", order: 1 },
        },
      },
    },
    events: {},
    layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  });
  show(<Harness start={{ id: "d", type: "labs/dial", at: place }} definition={dial} page={null} />);
  tab("Actions");
  expect(screen.getByText("When it is set")).toBeTruthy();
  add("Show a message");
  fireEvent.change(screen.getByLabelText("The message says"), { target: { value: "Set" } });
  expect(last().config?.onSet).toEqual({
    steps: [{ do: "message", text: "Set", tone: "success" }],
  });
  // No record is open, so nothing here offers to change one.
  fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
  expect(screen.queryByRole("menuitem", { name: "Update the record" })).toBeNull();
});
