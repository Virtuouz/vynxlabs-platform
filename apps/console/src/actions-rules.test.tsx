// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Page, PageWidget } from "@volvel/manifest";
import { button, chart, detail } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActionsTab } from "./kit/inspector/ActionsTab.tsx";
import { ActionEditor } from "./kit/inspector/actionControls.tsx";
import { SampleRecordProvider } from "./kit/inspector/confirmPreview.tsx";
import type { Env } from "./kit/inspector/controls.tsx";
import { type Catalog, configOf } from "./kit/inspector/model.ts";
import { ActionRules, RulesTab } from "./kit/inspector/RulesTab.tsx";
import { type GroupChoice, parseTokens, rulesSummary } from "./kit/inspector/timelineModel.ts";
import { show } from "./testing.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "total", type: "number", references: null },
        {
          name: "status",
          type: "enum",
          references: null,
          values: [{ value: "Unpaid" }, { value: "Paid" }, { value: "Void" }],
        },
        { name: "paid_on", type: "date", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
} as Catalog;

const place = { x: 0, y: 0, w: 4, h: 2 };
const sheet: Page = {
  id: "invoice",
  title: "Invoice",
  kind: "sheet",
  record: { table: "invoices" },
  widgets: [],
};
const groupChoices: GroupChoice[] = [
  { path: "groups/billing", name: "Billing", kind: "member" },
  { path: "groups/managers", name: "Managers", kind: "member" },
  { path: "end-user-groups/clinics", name: "Clinics", kind: "end_user" },
];

const pressMe: PageWidget = {
  id: "mark-paid",
  type: "core/button",
  at: place,
  config: { label: "Mark paid", tone: "primary" },
};

let written: PageWidget[];
const last = () => written.at(-1) as PageWidget;

function useEnv(start: PageWidget, definition: typeof button, surface: "app" | "dashboard") {
  const [widget, setWidget] = useState(start);
  const env: Env = {
    definition,
    widget,
    surface,
    filters: [],
    neighbours: [],
    catalog,
    config: configOf(definition, widget),
    write: (next) => {
      written.push(next);
      setWidget(next);
    },
    page: surface === "app" ? sheet : undefined,
    pages: [sheet, { id: "money", title: "Money", widgets: [] }],
    flows: [{ path: "send-receipt", manualInput: null }],
    scripts: [],
    widgets: [widget],
    writeAll: () => {},
  };
  return env;
}

function Actions({
  start = pressMe,
  definition = button,
  surface = "app" as const,
  onOpenRules,
}: {
  start?: PageWidget;
  definition?: typeof button;
  surface?: "app" | "dashboard";
  onOpenRules?: () => void;
}) {
  const env = useEnv(start, definition, surface);
  return <ActionsTab env={env} groupChoices={groupChoices} onOpenRules={onOpenRules} />;
}

function Rules({
  start = pressMe,
  definition = button,
}: {
  start?: PageWidget;
  definition?: typeof button;
}) {
  const env = useEnv(start, definition, "app");
  return <RulesTab env={env} groupChoices={groupChoices} />;
}

function add(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

beforeEach(() => {
  written = [];
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  for (const cell of document.querySelectorAll("[data-widget-cell]")) cell.remove();
  vi.unstubAllGlobals();
});

test("the trigger line, then steps on a rail, built as board 4 draws them", async () => {
  show(<Actions />);
  expect(screen.getByText("When clicked")).toBeTruthy();
  expect(screen.getByText("Nothing yet.")).toBeTruthy();

  add("Ask to confirm");
  // The question is words with the record's fields written in as tokens.
  const title = screen.getByRole("textbox", { name: "Confirmation title" });
  title.textContent = "Mark ";
  fireEvent.input(title);
  fireEvent.click(screen.getByRole("button", { name: "Insert a field into Confirmation title" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Number" }));
  expect(last().on?.click?.confirm?.title).toBe("Mark {number} ");
  expect(within(title).getByText("Number")).toBeTruthy();
  title.append(document.createTextNode("as paid?"));
  fireEvent.input(title);
  expect(last().on?.click?.confirm?.title).toBe("Mark {number} as paid?");

  add("Update the record");
  expect(screen.getByText("This invoice")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Set another field" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Status" }));
  fireEvent.click(screen.getByRole("button", { name: "Status becomes (empty)" }));
  fireEvent.change(await screen.findByLabelText("Status becomes: the value"), {
    target: { value: "Paid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Set another field" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Paid on" }));

  add("Run a flow");
  // A flow is one chip in the card; it opens its small editor.
  fireEvent.click(screen.getByRole("button", { name: /^Change step 3/ }));
  fireEvent.change(await screen.findByLabelText("Flow"), { target: { value: "send-receipt" } });
  fireEvent.change(screen.getByLabelText("What it is given"), { target: { value: "this" } });
  expect(screen.getByText("Gets this invoice as its input")).toBeTruthy();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  add("Show a message");
  fireEvent.change(screen.getByLabelText("The message says"), {
    target: { value: "Invoice marked paid" },
  });

  expect(last().on?.click).toEqual({
    confirm: { title: "Mark {number} as paid?" },
    steps: [
      { do: "update", record: "this", set: { status: { value: "Paid" }, paid_on: { value: "" } } },
      { do: "flow", path: "send-receipt", input: { id: { record: "id" } } },
      { do: "message", text: "Invoice marked paid", tone: "success" },
    ],
  });
  // Numbered, with the failure said as a row and what it changes said where it acts.
  expect(screen.getAllByRole("button", { name: /^Step \d+:/ })).toHaveLength(4);
  expect(screen.getByText("If it fails")).toBeTruthy();
  expect(screen.getByText("Show the error and keep the sheet open")).toBeTruthy();
  expect(screen.getByText(/Changes Status and Paid on of an invoice\./)).toBeTruthy();
  expect(parseTokens("Mark {number} as paid?")).toEqual([
    { text: "Mark " },
    { field: "number" },
    { text: " as paid?" },
  ]);
});

test("steps are put in order from the keyboard, and each card is its sentence until it is opened", () => {
  const start: PageWidget = {
    ...pressMe,
    on: {
      click: {
        steps: [
          { do: "message", text: "First", tone: "success" },
          { do: "update", record: "this", set: { status: { value: "Paid" } } },
          { do: "close" },
        ],
      },
    },
  };
  show(<Actions start={start} />);
  const order = () => (last().on?.click?.steps ?? []).map((step) => step.do).join(",");

  // Down on the handle of step 1 puts it second; Alt and Up on the card's own body moves it back.
  fireEvent.keyDown(screen.getByRole("button", { name: /Reorder step 1/ }), { key: "ArrowDown" });
  expect(order()).toBe("update,message,close");
  fireEvent.keyDown(screen.getByRole("button", { name: /Reorder step 3/ }), {
    key: "ArrowUp",
    altKey: true,
  });
  expect(order()).toBe("update,close,message");
  expect(screen.getByRole("status").textContent).toContain("position 2 of 3");

  // Each card is closed as its sentence: a record update is its chips, a message is its words,
  // and the card opens on a click for what the words do not reach (the message's tone).
  expect(screen.getByRole("button", { name: "Status becomes Paid" })).toBeTruthy();
  expect(screen.queryByLabelText("The message says")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Step 3: Show a message, open it/ }));
  expect(screen.getByLabelText("The message says")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Step 3: Show a message, close it/ }));
  expect(screen.queryByLabelText("The message says")).toBeNull();
  // Remove is in the card, shown while it is pointed at or has focus.
  expect(screen.getByRole("button", { name: "Remove step 1" })).toBeTruthy();
});

test("while Ask to confirm is open, the confirmation is previewed beside the widget", () => {
  const cell = document.createElement("div");
  cell.setAttribute("data-widget-cell", "mark-paid");
  document.body.append(cell);
  const start: PageWidget = {
    ...pressMe,
    on: {
      click: {
        confirm: {
          title: "Mark {number} as paid?",
          text: "Status becomes Paid.",
          button: "Mark paid",
        },
        steps: [{ do: "close" }],
      },
    },
  };
  show(
    <SampleRecordProvider record={{ number: "INV-9339" }}>
      <Actions start={start} />
    </SampleRecordProvider>,
  );
  // The confirmation is its words with the field as a chip; opened, its preview is drawn.
  expect(screen.queryByRole("complementary")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Step 1: Ask to confirm, open it/ }));
  const preview = screen.getByRole("complementary", { name: "What people will see, step 1" });
  expect(within(preview).getByText("Mark INV-9339 as paid?")).toBeTruthy();
  expect(within(preview).getByText("Status becomes Paid.")).toBeTruthy();
  expect(within(preview).getByText("Mark paid")).toBeTruthy();
  expect(within(preview).getByText("Cancel")).toBeTruthy();
  expect(within(preview).getByText(/Edit the wording in step 1/)).toBeTruthy();
  // Closed, the step is no longer open, and the preview goes.
  fireEvent.click(screen.getByRole("button", { name: /^Step 1: Ask to confirm, close it/ }));
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("a chart's click uses the same list; only the trigger line changes", () => {
  const bars: PageWidget = { id: "by-clinic", type: "core/chart", at: place };
  show(<Actions start={bars} definition={chart as never} surface="dashboard" />);
  expect(screen.getByText("When someone clicks a point")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add a step" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "Filter the page",
    "Show a message",
    "Show the rows behind",
  ]);
});

test("the summary card says the rules, and opens the Rules tab", () => {
  const onOpenRules = vi.fn();
  const start: PageWidget = {
    ...pressMe,
    rules: { showWhen: [{ field: "status", test: "is", value: "Unpaid" }] },
    on: {
      click: {
        steps: [{ do: "close" }],
        runBy: { groups: ["groups/managers", "groups/billing"] },
      },
    },
  };
  show(<Actions start={start} onOpenRules={onOpenRules} />);
  expect(screen.getByTestId("rules-summary").textContent).toBe(
    "Shown when Status is Unpaid. Managers and Billing can run it.",
  );
  fireEvent.click(screen.getByRole("button", { name: /Rules/ }));
  expect(onOpenRules).toHaveBeenCalled();
  expect(rulesSummary({ noun: "app" })).toBe(
    "Always shown. Anyone who can open the app can run it.",
  );
});

test("Rules: show this widget writes showWhen, with several values as an array", async () => {
  show(<Rules />);
  fireEvent.click(screen.getByLabelText("Only when…"));
  expect(last().rules?.showWhen).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Edit rule 1" }));
  fireEvent.change(await screen.findByLabelText("Field"), { target: { value: "this:status" } });
  // A choice column offers its values as a checked list; two chosen are "any of".
  fireEvent.click(await screen.findByRole("checkbox", { name: "Unpaid" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Paid" }));
  expect(last().rules).toEqual({
    showWhen: [{ field: "status", test: "is", value: ["Unpaid", "Paid"] }],
  });
  expect(screen.getByRole("button", { name: "Edit rule 1" }).textContent).toBe(
    "Status is Unpaid or Paid",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add a rule" }));
  expect(last().rules?.showWhen).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Remove rule 2" }));
  expect(last().rules?.showWhen).toHaveLength(1);
  // Back to always takes the rules away.
  fireEvent.click(screen.getByLabelText("Always"));
  expect(last().rules).toBeUndefined();
});

test("Rules: who can see it limits to groups, and says hiding is not security", async () => {
  show(<Rules />);
  expect(screen.getByText("Everyone who can open the app")).toBeTruthy();
  expect(screen.getByText(/Hiding a widget isn’t security/)).toBeTruthy();
  // WID-22: a condition can read the user and the open record; there is no condition on the page's filters.
  expect(
    screen.getByText(/Conditions can use the current user or the record that is open\./),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Limit to a group" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /Managers/ }));
  expect(last().rules).toEqual({ seenBy: { groups: ["groups/managers"] } });
  expect(screen.queryByText("Everyone who can open the app")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove Managers" }));
  expect(last().rules).toBeUndefined();
});

test("Rules: who can edit a record in place is its own question, there only when editing in place is on (WID-19)", async () => {
  const record: PageWidget = {
    id: "info",
    type: "core/detail",
    at: place,
    data: { record: { source: { record: "this" } } },
    config: { edit: true },
  };
  show(<Rules start={record} definition={detail as never} />);
  expect(screen.getByText("Who can edit")).toBeTruthy();
  // The first "Limit to a group" is who can see it; the second is who can edit.
  fireEvent.click(screen.getAllByRole("button", { name: "Limit to a group" })[1] as HTMLElement);
  fireEvent.click(await screen.findByRole("checkbox", { name: /Billing/ }));
  expect(last().config).toEqual({ edit: true, editBy: { groups: ["groups/billing"] } });
  fireEvent.click(screen.getByRole("button", { name: "Remove Billing" }));
  expect(last().config).toEqual({ edit: true });
  cleanup();
  show(<Rules start={{ ...record, config: {} }} definition={detail as never} />);
  expect(screen.queryByText("Who can edit")).toBeNull();
});

test("Rules: a button's can be pressed when and who can run it write the action", async () => {
  const start: PageWidget = { ...pressMe, on: { click: { steps: [{ do: "close" }] } } };
  show(<Rules start={start} />);
  expect(
    screen.getByText("Shown but greyed out otherwise, with the reason as a tooltip."),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "Checked on the server too: hiding the button is not what stops other people.",
    ),
  ).toBeTruthy();
  // Can be pressed when: the second Only when… is this action's.
  fireEvent.click(screen.getAllByLabelText("Only when…")[1] as HTMLElement);
  expect(last().on?.click?.when).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Edit condition 1" }));
  fireEvent.change(await screen.findByLabelText("Field"), { target: { value: "this:total" } });
  fireEvent.click(await screen.findByLabelText("is more than"));
  fireEvent.change(screen.getByLabelText("Value"), { target: { value: "100" } });
  expect(last().on?.click?.when).toEqual([{ field: "total", test: "gt", value: 100 }]);

  // Who can run it: chips with a ×, from the tenant's groups of both kinds, by path.
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /Billing/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Clinics/ }));
  expect(last().on?.click?.runBy).toEqual({
    groups: ["groups/billing", "end-user-groups/clinics"],
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove Billing" }));
  expect(last().on?.click?.runBy).toEqual({ groups: ["end-user-groups/clinics"] });
  fireEvent.click(screen.getByRole("button", { name: "Remove Clinics" }));
  expect(last().on?.click?.runBy).toBeUndefined();
  await waitFor(() => expect(last().on?.click?.when).toHaveLength(1));
});

test("an action at a config path has its own Actions and Rules editors", () => {
  const changes: unknown[] = [];
  function Own() {
    const env = useEnv(pressMe, button, "app");
    const [action, setAction] = useState<{ steps: never[] } | undefined>(undefined);
    return (
      <>
        <ActionEditor
          env={env}
          id="group-1"
          heading="When pressed"
          action={action as never}
          onChange={(next) => {
            changes.push(next);
            setAction(next as never);
          }}
        />
        {action ? (
          <ActionRules
            env={env}
            id="group-1"
            action={action as never}
            groupChoices={groupChoices}
            onChange={(next) => {
              changes.push(next);
              setAction(next as never);
            }}
          />
        ) : null}
      </>
    );
  }
  show(<Own />);
  expect(screen.getByText("When pressed")).toBeTruthy();
  add("Close");
  expect(changes.at(-1)).toEqual({ steps: [{ do: "close" }] });
  expect(screen.getByText("Who can run it")).toBeTruthy();
});

test("an action can say something when it is done, and drops it when it is emptied (WID-M2)", () => {
  show(<Actions />);
  expect(screen.queryByLabelText("When it is done, say")).toBeNull();
  add("Show a message");
  fireEvent.change(screen.getByLabelText("When it is done, say"), {
    target: { value: "All paid" },
  });
  expect(last().on?.click?.done).toBe("All paid");
  fireEvent.change(screen.getByLabelText("When it is done, say"), { target: { value: "" } });
  expect(last().on?.click).not.toHaveProperty("done");
});
