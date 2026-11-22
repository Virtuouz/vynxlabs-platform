// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { Page, PageWidget } from "@volvel/manifest";
import { defineWidget, type WidgetDefinition } from "@volvel/widgets";
import { form } from "@volvel/widgets-core";
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
}: {
  start: PageWidget;
  definition: WidgetDefinition;
  surface?: "app" | "dashboard";
  page?: Page | null;
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

beforeEach(() => {
  written = [];
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
