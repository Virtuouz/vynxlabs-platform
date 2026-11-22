// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Action, PageWidget } from "@volvel/manifest";
import { ToastProvider } from "@volvel/ui";
import { defineWidget, type WidgetViewProps } from "@volvel/widgets";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fillText, holds } from "./actions.tsx";
import { PageView, type PageViewProps } from "./PageView.tsx";
import {
  ActionError,
  type ActResponse,
  type FilterValues,
  type PageDataClient,
  viewRegistry,
  type WireData,
} from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const col = (name: string, type = "text") => ({ name, type, label: name });
const rowsWire: WireData = {
  shape: "rows",
  columns: [col("id", "uuid"), col("number"), col("status")],
  rows: [
    { id: "a", number: "INV-1", status: "open" },
    { id: "b", number: "INV-2", status: "paid" },
  ],
};
const summaryWire: WireData = {
  shape: "summary",
  columns: [col("status"), col("n", "number")],
  breakdowns: ["status"],
  values: ["n"],
  rows: [{ status: "open", n: 1 }],
};
const behindWire: WireData = {
  shape: "rows",
  columns: [col("number")],
  rows: [{ number: "BEHIND-1" }],
};

const base = {
  version: "1.0.0",
  description: "Test",
  category: "records",
  icon: "table",
  surfaces: ["app"],
  config: { type: "object", properties: {}, additionalProperties: false },
  layout: { min: { w: 1, h: 1 }, default: { w: 6, h: 4 }, phone: "stack" },
} as const;

const tableDef = defineWidget({
  ...base,
  type: "core/table",
  title: "Table",
  data: { rows: { shape: "rows" } },
  events: { rowClick: { gives: "record", label: "When a row is clicked" } },
});
const pointsDef = defineWidget({
  ...base,
  type: "test/points",
  title: "Points",
  data: { totals: { shape: "summary", breakdowns: { min: 1, max: 2 }, values: { min: 1, max: 2 } } },
  events: { pointClick: { gives: "group", label: "When a point is clicked" } },
});
const buttonDef = defineWidget({
  ...base,
  type: "test/button",
  title: "Button",
  data: {},
  events: { click: { gives: "nothing", label: "When it is clicked" } },
});

type Extra = { close?: () => void; selectedRecord?: string };

/** Rows as buttons: a click raises `rowClick`, and a row action is pressed through `act`. */
function TableView(props: WidgetViewProps<Record<string, unknown>> & Extra) {
  const { data, emit, act: run, can, listens } = props;
  const rows = data.rows?.shape === "rows" ? data.rows.rows : [];
  const [outcome, setOutcome] = useState("");
  return (
    <div data-close={props.close ? "yes" : "no"} data-selected={props.selectedRecord ?? ""}>
      <span data-testid="listens">{String(listens?.("rowClick"))}</span>
      {rows.map((row) => (
        <div key={String(row.id)}>
          <button type="button" onClick={() => emit("rowClick", { record: String(row.id) })}>
            {String(row.number)}
          </button>
          <button
            type="button"
            aria-label={`Act on ${row.number}`}
            disabled={!can?.("config/rowActions/0/action", row)}
            onClick={async () => {
              const result = await run?.("config/rowActions/0/action", {
                record: String(row.id),
              });
              setOutcome(JSON.stringify(result));
            }}
          >
            Act
          </button>
        </div>
      ))}
      <output data-testid="outcome">{outcome}</output>
    </div>
  );
}
function PointsView({ data, emit }: WidgetViewProps) {
  return (
    <button
      type="button"
      onClick={() => emit("pointClick", { group: { status: "open" } })}
      data-has={data.totals ? "yes" : "no"}
    >
      Point
    </button>
  );
}
function ButtonView({ act: run }: WidgetViewProps) {
  const [outcome, setOutcome] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={async () => setOutcome(JSON.stringify(await run?.("config/action")))}
      >
        Go
      </button>
      <output data-testid="outcome">{outcome}</output>
    </>
  );
}

const registry = viewRegistry({
  definitions: [tableDef, pointsDef, buttonDef],
  views: {
    "core/table": TableView as never,
    "test/points": PointsView as never,
    "test/button": ButtonView as never,
  },
});

const at = { x: 0, y: 0, w: 12, h: 4 };
const source = { source: { visual: { table: "invoices" } } };
const tableWidget = (extra: Partial<PageWidget> = {}): PageWidget => ({
  id: "invoices",
  type: "core/table",
  at,
  data: { rows: source },
  ...extra,
});

function clientOf(response: ActResponse | Error = { client: [] }) {
  return {
    read: vi.fn(async (widget: string) => ({
      inputs: {
        [widget === "points" ? "totals" : "rows"]: widget === "points" ? summaryWire : rowsWire,
      },
    })),
    act: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
    behind: vi.fn(async () => behindWire),
  } satisfies PageDataClient;
}

function show(
  widgets: PageWidget[],
  client: PageDataClient,
  props: Partial<PageViewProps> = {},
  values: FilterValues = {},
) {
  const onFilterValues = vi.fn();
  render(
    <ToastProvider>
      <PageView
        widgets={widgets}
        filters={[]}
        registry={registry}
        client={client}
        filterValues={values}
        onFilterValues={onFilterValues}
        {...props}
      />
    </ToastProvider>,
  );
  return { onFilterValues };
}

const markPaid: Action = {
  confirm: {
    title: "Mark paid?",
    text: "Mark {number} as paid. {gone} stays.",
    button: "Mark paid",
  },
  steps: [{ do: "update", record: "event", set: { status: { value: "paid" } } }],
};
const withAction = (action: Action) =>
  tableWidget({ config: { rowActions: [{ id: "paid", label: "Mark paid", action }] } });

describe("confirming an action", () => {
  test("asks first, fills the record's words into the text, then runs it and reads everything again", async () => {
    const client = clientOf({ client: [{ do: "message", text: "Marked paid." }] });
    show([withAction(markPaid)], client);
    await screen.findByText("INV-1");
    const reads = client.read.mock.calls.length;
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    expect(await screen.findByText("Mark paid?")).toBeTruthy();
    expect(screen.getByText(/Mark INV-1 as paid\./)).toBeTruthy();
    expect(client.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    expect(client.act).toHaveBeenCalledWith("invoices", "config/rowActions/0/action", {
      records: { event: "a" },
    });
    expect(await screen.findByText("Marked paid.")).toBeTruthy();
    await waitFor(() => expect(client.read.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.getByTestId("outcome").textContent).toBe('{"ok":true}'));
  });

  test("Cancel runs nothing and says so to the view", async () => {
    const client = clientOf();
    show([withAction(markPaid)], client);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    await screen.findByText("Mark paid?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByTestId("outcome").textContent).toBe('{"ok":false,"cancelled":true}'),
    );
    expect(client.act).not.toHaveBeenCalled();
  });

  test("a refusal is drawn in the dialog in the server's words, and the dialog stays", async () => {
    const client = clientOf(new ActionError("It can't be done now: Status is paid", 403));
    show([withAction(markPaid)], client);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    await screen.findByText("Mark paid?");
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    expect(await screen.findByText("It can't be done now: Status is paid")).toBeTruthy();
    expect(screen.getByText("Mark paid?")).toBeTruthy();
    expect(screen.getByTestId("outcome").textContent).toBe("");
  });

  test("while it runs the button is busy and cannot be pressed again", async () => {
    let finish: (value: ActResponse) => void = () => undefined;
    const client = clientOf();
    client.act.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    show([withAction(markPaid)], client);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    await screen.findByText("Mark paid?");
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mark paid" }).hasAttribute("disabled")).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    expect(client.act).toHaveBeenCalledTimes(1);
    await act(async () => finish({ client: [] }));
  });

  test("asked fields are drawn with the kit's form, must be given, and are sent as inputs", async () => {
    const client = clientOf();
    const asks: Action = {
      confirm: {
        title: "Void it?",
        button: "Void",
        ask: [{ name: "reason", label: "Reason", type: "text", required: true }],
      },
      steps: [{ do: "update", record: "event", set: { reason: { asked: "reason" } } }],
    };
    show([withAction(asks)], client);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    await screen.findByText("Void it?");
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(client.act).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Duplicate" } });
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    expect(client.act).toHaveBeenCalledWith("invoices", "config/rowActions/0/action", {
      records: { event: "a" },
      inputs: { reason: "Duplicate" },
    });
  });

  test("what the server says is wrong with a field is drawn beside it", async () => {
    const client = clientOf(
      new ActionError("Check what you typed.", 400, { reason: "Too short." }),
    );
    const asks: Action = {
      confirm: {
        title: "Void it?",
        button: "Void",
        ask: [{ name: "reason", label: "Reason", type: "text" }],
      },
      steps: [{ do: "update", record: "event", set: { reason: { asked: "reason" } } }],
    };
    show([withAction(asks)], client);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    await screen.findByText("Void it?");
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(await screen.findByText("Too short.")).toBeTruthy();
  });

  test("an action with no confirmation runs at once, and a failure is returned to the view", async () => {
    const client = clientOf(new ActionError("Nothing changed.", 409));
    show([withAction({ steps: [{ do: "delete", record: "event" }] })], client);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    await waitFor(() =>
      expect(screen.getByTestId("outcome").textContent).toBe(
        '{"ok":false,"message":"Nothing changed."}',
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the browser's steps", () => {
  const press = async (response: ActResponse, props: Partial<PageViewProps> = {}) => {
    const client = clientOf(response);
    const shown = show([withAction({ steps: [{ do: "close" }] })], client, props);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Act on INV-1"));
    await waitFor(() => expect(client.act).toHaveBeenCalled());
    return { client, ...shown };
  };

  test("open goes to onNavigate as a page, sheet or modal by the target's kind, with the list it came from", async () => {
    const onNavigate = vi.fn();
    const pages = [
      { id: "invoice", title: "Invoice", kind: "sheet" as const, widgets: [] },
      { id: "client", title: "Client", kind: "record" as const, widgets: [] },
      { id: "ask", title: "Ask", kind: "modal" as const, widgets: [] },
    ];
    await press(
      {
        client: [
          { do: "open", page: "invoice", record: "a" as never },
          { do: "open", page: "client", record: "c1" as never },
          { do: "open", page: "ask" },
        ],
      },
      { onNavigate, pages },
    );
    expect(onNavigate.mock.calls.map((call) => call[0])).toEqual([
      { page: "invoice", record: "a", as: "sheet", among: ["a", "b"] },
      { page: "client", record: "c1", as: "page", among: ["a", "b"] },
      { page: "ask", as: "modal", among: ["a", "b"] },
    ]);
  });

  test("close goes to onNavigate", async () => {
    const onNavigate = vi.fn();
    await press({ client: [{ do: "close" }] }, { onNavigate });
    expect(onNavigate).toHaveBeenCalledWith({ close: true });
  });

  test("message is a toast, with the action's own words when the steps say nothing", async () => {
    await press({ client: [{ do: "message", text: "Saved it." }] });
    expect(await screen.findByText("Saved it.")).toBeTruthy();
    cleanup();
    await press({ client: [], message: "Done and dusted." });
    expect(await screen.findByText("Done and dusted.")).toBeTruthy();
  });

  test("narrow sets the page filter from the group the event gave", async () => {
    const client = clientOf({ client: [{ do: "narrow", filter: "status", from: "status" }] });
    const points: PageWidget = {
      id: "points",
      type: "test/points",
      at,
      data: {
        totals: {
          source: {
            visual: {
              table: "invoices",
              measures: [{ fn: "count" }],
              groupBy: [{ column: "status" }],
            },
          },
        } as never,
      },
      on: { pointClick: { steps: [{ do: "narrow", filter: "status", from: "status" }] } },
    };
    const { onFilterValues } = show([points], client, {}, { month: "2026-11" });
    fireEvent.click(await screen.findByText("Point"));
    await waitFor(() =>
      expect(onFilterValues).toHaveBeenCalledWith({ month: "2026-11", status: "open" }),
    );
    expect(client.act).toHaveBeenCalledWith("points", "on/pointClick", { records: {} });
  });

  test("rows opens a side sheet of the rows behind the group, drawn by the table", async () => {
    const client = clientOf({ client: [{ do: "rows" }] });
    const points: PageWidget = {
      id: "points",
      type: "test/points",
      at,
      data: {
        totals: {
          source: {
            visual: {
              table: "invoices",
              measures: [{ fn: "count" }],
              groupBy: [{ column: "status" }],
            },
          },
        } as never,
      },
      on: { pointClick: { steps: [{ do: "rows" }] } },
    };
    show([points], client, {}, { month: "2026-11" });
    fireEvent.click(await screen.findByText("Point"));
    expect(await screen.findByText("BEHIND-1")).toBeTruthy();
    expect(client.behind).toHaveBeenCalledWith(
      "points",
      "totals",
      { status: "open" },
      { month: "2026-11" },
    );
    expect(screen.getByText("The rows behind it")).toBeTruthy();
  });
});

describe("events, can and listens", () => {
  test("an event with an action on it runs the action with the event's record", async () => {
    const client = clientOf({ client: [] });
    const widget = tableWidget({
      on: { rowClick: { steps: [{ do: "open", page: "invoice", record: "event" }] } },
    });
    const onEvent = vi.fn();
    show([widget], client, { onEvent });
    fireEvent.click(await screen.findByText("INV-2"));
    await waitFor(() => expect(client.act).toHaveBeenCalledTimes(1));
    expect(client.act).toHaveBeenCalledWith("invoices", "on/rowClick", { records: { event: "b" } });
    expect(onEvent).toHaveBeenCalledWith("invoices", "rowClick", { record: "b" });
  });

  test("listens is true only for an event the widget has an action on, and not while building", async () => {
    const client = clientOf();
    show([tableWidget()], client);
    expect((await screen.findByTestId("listens")).textContent).toBe("false");
    cleanup();
    show([tableWidget({ on: { rowClick: { steps: [{ do: "close" }] } } })], client);
    await waitFor(() => expect(screen.getByTestId("listens").textContent).toBe("true"));
  });

  test("can reads the action's conditions against the row, and the page's user", async () => {
    const action: Action = {
      steps: [{ do: "close" }],
      when: [{ field: "status", of: "event", test: "is", value: "open" }],
    };
    show([withAction(action)], clientOf());
    await screen.findByText("INV-1");
    expect(screen.getByLabelText("Act on INV-1").hasAttribute("disabled")).toBe(false);
    expect(screen.getByLabelText("Act on INV-2").hasAttribute("disabled")).toBe(true);
  });

  test("conditions about a record that has not been read are left to the server", () => {
    const when = [{ field: "status", of: "this" as const, test: "is" as const, value: "open" }];
    expect(holds(when, {}, undefined)).toBe(true);
    expect(holds(when, { this: { status: "paid" } }, undefined)).toBe(false);
    expect(holds([{ user: "in", group: "Managers" }], {}, { id: "u", groups: [] })).toBe(false);
    expect(holds([{ user: "in", group: "Managers" }], {}, { id: "u", groups: ["Managers"] })).toBe(
      true,
    );
  });

  test("the confirmation's text is filled from the record", () => {
    expect(fillText("Mark {number}", { number: "INV-1" }, (value) => value)).toBe("Mark INV-1");
    expect(fillText("Mark {number}", undefined, (value) => value)).toBe("Mark this record");
  });

  test("a view is given close inside a sheet, and which of its rows is open", async () => {
    const onNavigate = vi.fn();
    show([tableWidget()], clientOf(), { over: true, overRecord: "b", onNavigate });
    const view = (await screen.findByText("INV-1")).closest("[data-close]") as HTMLElement;
    expect(view.dataset.close).toBe("yes");
    expect(view.dataset.selected).toBe("b");
  });
});

describe("showWhen", () => {
  const hidden = tableWidget({
    rules: { showWhen: [{ user: "in", group: "Managers" }] },
  });

  test("served, a widget whose conditions do not hold is not drawn, and one whose do is", async () => {
    show([hidden], clientOf(), { user: { id: "u", groups: ["Staff"] } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("INV-1")).toBeNull();
    cleanup();
    show([hidden], clientOf(), { user: { id: "u", groups: ["Managers"] } });
    expect(await screen.findByText("INV-1")).toBeTruthy();
  });

  test("while building, it is drawn faded and says when it is shown", async () => {
    show([hidden], clientOf(), {
      editing: {
        selected: undefined,
        onSelect: () => undefined,
        onChange: () => undefined,
        onRename: () => undefined,
      },
    });
    expect(await screen.findByText(/Shown only when the current user is in Managers/)).toBeTruthy();
    expect(screen.getByText("INV-1")).toBeTruthy();
  });
});
