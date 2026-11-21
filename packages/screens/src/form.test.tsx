// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import type { ActOutcome, Choice, WidgetViewProps } from "@volvel/widgets";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FormView } from "../../widgets-core/views/form.tsx";
import { PageView } from "./PageView.tsx";
import type { PageDataClient, ViewEntry, ViewRegistry, WireData } from "./types.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const col = (name: string, type: string, label: string, more: object = {}) => ({
  name,
  type,
  label,
  ...more,
});

const columns = [
  col("number", "text", "Number", { required: true }),
  col("client", "reference", "Client", { references: "clients", required: true }),
  col("total", "number", "Total", { format: { style: "currency", minorUnits: true } }),
  col("count", "integer", "Lines"),
  col("status", "enum", "Status", {
    values: [
      { value: "open", label: "Unpaid" },
      { value: "paid", label: "Paid" },
    ],
  }),
  col("issued", "date", "Issued"),
  col("sent", "timestamp", "Sent"),
  col("paid", "boolean", "Paid in full"),
  col("notes", "text", "Notes", { maxLength: 5000 }),
];

const wire = (record: Record<string, unknown> | null): WireData =>
  ({ shape: "record", columns, record }) as unknown as WireData;

const widget = (config: object): PageWidget => ({
  id: "form",
  type: "core/form",
  title: "New invoice",
  at: { x: 0, y: 0, w: 6, h: 8 },
  data: { record: { source: { visual: { table: "invoices" } } } },
  config: config as never,
});

const everyField = columns.map((one) => ({ column: one.name }));

const CLIENTS: Choice[] = [
  { value: "c1", label: "Ada Lovelace" },
  { value: "c2", label: "Grace Hopper" },
  { value: "c3", label: "Alan Turing" },
];

type Act = NonNullable<WidgetViewProps["act"]>;

interface Setup {
  act: ReturnType<typeof vi.fn<Act>>;
  choices: ReturnType<typeof vi.fn<NonNullable<WidgetViewProps["choices"]>>>;
  onClose: ReturnType<typeof vi.fn>;
}

/** The page with the form on it, in a registry that gives the view what the host will: `act`, `choices` and a way to close. */
function draw(
  record: Record<string, unknown> | null,
  config: object,
  outcome: ActOutcome | (() => Promise<ActOutcome>) = { ok: true },
  options: { close?: boolean; building?: boolean } = {},
): Setup {
  const setup: Setup = {
    act: vi.fn<Act>(async () => (typeof outcome === "function" ? outcome() : outcome)),
    choices: vi.fn(async (_input, _column, search) =>
      CLIENTS.filter((one) => one.label.toLowerCase().includes(search.toLowerCase())),
    ),
    onClose: vi.fn(),
  };
  const definition = corePack.definitions.find((one) => one.type === "core/form");
  if (!definition) throw new Error("core/form has no definition");
  const registry: ViewRegistry = new Map<string, ViewEntry>([
    [
      "core/form",
      {
        definition,
        // biome-ignore lint/suspicious/noExplicitAny: the registry holds views of every widget's configuration
        View: (props: WidgetViewProps<any>) => (
          <FormView
            {...props}
            {...(options.building ? {} : { act: setup.act })}
            choices={setup.choices}
            {...(options.close ? { close: setup.onClose as () => void } : {})}
          />
        ),
      },
    ],
  ]);
  const client: PageDataClient = {
    // The frame treats `record: null` as empty and does not draw the view; until it learns that
    // a create form has none, a create form is given an empty record (see the report).
    read: async () => ({ inputs: { record: wire(record ?? {}) } }),
  };
  render(
    <PageView
      widgets={[widget(config)]}
      filters={[]}
      registry={registry}
      client={client}
      filterValues={{}}
      onFilterValues={() => {}}
      {...(options.building
        ? {
            editing: {
              selected: undefined,
              onSelect: () => {},
              onChange: () => {},
              onRename: () => {},
            },
          }
        : {})}
    />,
  );
  return setup;
}

const create = { mode: "create", fields: everyField, submitLabel: "Create invoice" };
const ready = () => screen.findByRole("button", { name: /Create invoice|Save/ });
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("controls by column type", () => {
  test("each column gets the kit's control for its type", async () => {
    draw(null, create);
    await ready();
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).type).toBe("text");
    expect((screen.getByLabelText(/Total/) as HTMLInputElement).type).toBe("number");
    expect((screen.getByLabelText(/Lines/) as HTMLInputElement).type).toBe("number");
    expect((screen.getByLabelText(/Issued/) as HTMLInputElement).type).toBe("date");
    expect((screen.getByLabelText(/Sent/) as HTMLInputElement).type).toBe("datetime-local");
    expect((screen.getByLabelText(/Paid in full/) as HTMLInputElement).type).toBe("checkbox");
    expect(screen.getByLabelText(/Notes/).tagName).toBe("TEXTAREA");
    const status = screen.getByLabelText(/Status/) as HTMLSelectElement;
    expect(status.tagName).toBe("SELECT");
    expect([...status.options].map((one) => one.text)).toEqual(["None", "Unpaid", "Paid"]);
    expect(screen.getByPlaceholderText("Search client")).toBeTruthy();
  });

  test("money is typed as dollars and sent as cents", async () => {
    const { act } = draw(null, create);
    await ready();
    type(/Number/, "INV-1");
    type(/Total/, "12.34");
    await pickClient("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect(act.mock.calls[0]?.[1]?.inputs).toMatchObject({ total: 1234 });
  });

  test("required fields are marked, the others say optional; labels and help come from the page", async () => {
    draw(null, {
      ...create,
      fields: [
        { column: "number", label: "Invoice number", help: "As printed on the paper." },
        { column: "notes" },
      ],
    });
    await ready();
    expect(screen.getByText("Invoice number")).toBeTruthy();
    expect(screen.getByText("As printed on the paper.")).toBeTruthy();
    const frame = (label: RegExp) => screen.getByLabelText(label).closest("[data-invalid], div");
    expect(frame(/Invoice number/)?.parentElement?.textContent).toContain("*");
    expect(screen.getByText("optional")).toBeTruthy();
  });

  test("fields keep their order and sections", async () => {
    draw(null, {
      ...create,
      fields: [
        { column: "notes", section: "More" },
        { column: "number", section: "Basics" },
      ],
    });
    await ready();
    expect(screen.getAllByRole("heading", { level: 3 }).map((one) => one.textContent)).toEqual([
      "More",
      "Basics",
    ]);
  });
});

/** Types into the client picker, waits for the list, and chooses a name. */
async function pickClient(search: string, name = /Ada Lovelace/) {
  const box = screen.getByPlaceholderText("Search client");
  fireEvent.click(box);
  fireEvent.change(box, { target: { value: search } });
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name }));
}

describe("checks before sending", () => {
  test("a required field left empty is refused, with nothing sent", async () => {
    const { act } = draw(null, create);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect((await screen.findAllByText("This is required.")).length).toBe(2);
    expect(act).not.toHaveBeenCalled();
  });

  test("a value of the wrong type is refused", async () => {
    const { act } = draw(null, create);
    await ready();
    type(/Number/, "INV-1");
    await pickClient("Ada");
    type(/Lines/, "2.5");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText("Enter a whole number.")).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
  });

  test("a field's own required flag overrides the column", async () => {
    const { act } = draw(null, {
      ...create,
      fields: [{ column: "notes", required: true }],
    });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText("This is required.")).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
  });
});

describe("sending", () => {
  test("create calls the submit action with the filled fields only", async () => {
    const { act } = draw(null, create);
    await ready();
    type(/Number/, "INV-7");
    await pickClient("Ada");
    type(/Status/, "paid");
    fireEvent.click(screen.getByLabelText(/Paid in full/));
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act).toHaveBeenCalledWith("config/submit", {
      inputs: { number: "INV-7", client: "c1", status: "paid", paid: true },
    });
  });

  test("the button shows it is working, and cannot be pressed twice", async () => {
    let finish: (outcome: ActOutcome) => void = () => {};
    const { act } = draw(
      null,
      create,
      () =>
        new Promise<ActOutcome>((resolve) => {
          finish = resolve;
        }),
    );
    await ready();
    type(/Number/, "INV-7");
    await pickClient("Ada");
    const send = screen.getByRole("button", { name: "Create invoice" }) as HTMLButtonElement;
    fireEvent.click(send);
    await waitFor(() => expect(send.disabled).toBe(true));
    fireEvent.click(send);
    expect(act).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(send.disabled).toBe(false));
  });

  test("the server's answer for a field is drawn at that field, and a failure says why", async () => {
    draw(null, create, {
      ok: false,
      message: "The invoice could not be saved.",
      fields: { number: "That number is already used." },
    });
    await ready();
    type(/Number/, "INV-1");
    await pickClient("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText("That number is already used.")).toBeTruthy();
    expect(screen.getByText("The invoice could not be saved.")).toBeTruthy();
    // What was typed is still there.
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe("INV-1");
    // Typing in the field takes its message away.
    type(/Number/, "INV-2");
    expect(screen.queryByText("That number is already used.")).toBeNull();
  });

  test("a failure with no fields still shows its words", async () => {
    draw(null, create, async () => {
      throw new Error("The server did not answer.");
    });
    await ready();
    type(/Number/, "INV-1");
    await pickClient("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText("The server did not answer.")).toBeTruthy();
  });

  test("Cancel is drawn only when the host can close", async () => {
    draw(null, create);
    await ready();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    cleanup();
    const { onClose } = draw(null, create, { ok: true }, { close: true });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("the create form starts again after it was saved", async () => {
    draw(null, create);
    await ready();
    type(/Number/, "INV-7");
    await pickClient("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(() =>
      expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe(""),
    );
    expect((screen.getByPlaceholderText("Search client") as HTMLInputElement).value).toBe("");
    // Nothing is marked wrong on the fresh form.
    expect(screen.queryByText("This is required.")).toBeNull();
    // And it can be sent again only when filled again.
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect((await screen.findAllByText("This is required.")).length).toBe(2);
  });
});

describe("edit", () => {
  const record = {
    id: "r1",
    number: "INV-1",
    client: "c2",
    total: 12000,
    count: 3,
    status: "open",
    issued: "2026-11-20",
    paid: false,
    notes: "First",
  };
  const edit = { mode: "edit", fields: everyField, submitLabel: "Save" };

  test("the fields are filled from the record", async () => {
    draw(record, edit);
    await ready();
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe("INV-1");
    expect((screen.getByLabelText(/Total/) as HTMLInputElement).value).toBe("120");
    expect((screen.getByLabelText(/Status/) as HTMLSelectElement).value).toBe("open");
    expect((screen.getByLabelText(/Issued/) as HTMLInputElement).value).toBe("2026-11-20");
    expect((screen.getByLabelText(/Notes/) as HTMLTextAreaElement).value).toBe("First");
    expect(screen.getByPlaceholderText("Search client")).toBeTruthy();
  });

  test("only what changed is sent, with the record", async () => {
    const { act } = draw(record, edit);
    await ready();
    type(/Number/, "INV-1B");
    type(/Total/, "99");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act).toHaveBeenCalledWith("config/submit", {
      record: "r1",
      inputs: { number: "INV-1B", total: 9900 },
    });
  });

  test("an emptied optional field is sent as nothing", async () => {
    const { act } = draw(record, edit);
    await ready();
    type(/Notes/, "");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act.mock.calls[0]?.[1]).toEqual({ record: "r1", inputs: { notes: null } });
  });

  test("with nothing changed nothing is sent, and it says so", async () => {
    const { act } = draw(record, edit);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nothing has changed yet.")).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
  });

  test("the edit form keeps its values after saving", async () => {
    draw(record, edit);
    await ready();
    type(/Number/, "INV-1B");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe("INV-1B");
  });
});

describe("the reference picker", () => {
  test("lists what the server offers, and searches as the person types", async () => {
    const { choices } = draw(null, create);
    await ready();
    await waitFor(() => expect(choices).toHaveBeenCalledWith("record", "client", ""));
    const box = screen.getByPlaceholderText("Search client");
    fireEvent.click(box);
    fireEvent.change(box, { target: { value: "gra" } });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await waitFor(() => expect(choices).toHaveBeenCalledWith("record", "client", "gra"));
    const list = await screen.findByRole("option", { name: /Grace Hopper/ });
    expect(screen.queryByRole("option", { name: /Ada Lovelace/ })).toBeNull();
    expect(list).toBeTruthy();
  });

  test("a chosen row sends its id, not its name", async () => {
    const { act } = draw(null, create);
    await ready();
    type(/Number/, "INV-9");
    await pickClient("alan", /Alan Turing/);
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect(act.mock.calls[0]?.[1]?.inputs).toEqual({ number: "INV-9", client: "c3" });
  });

  test("the chosen row shows its name while editing", async () => {
    draw(
      { id: "r1", number: "INV-1", client: "c2" },
      {
        mode: "edit",
        fields: [{ column: "number" }, { column: "client" }],
      },
    );
    await ready();
    const box = screen.getByPlaceholderText("Search client") as HTMLInputElement;
    await waitFor(() => expect(box.value).toBe("Grace Hopper"));
  });
});

describe("while building", () => {
  test("the fields are drawn inert, with what they send", async () => {
    const { act, choices } = draw(null, create, { ok: true }, { building: true });
    await screen.findByText(/Sends with:/);
    expect(screen.getByText(/Sends with: Number, Client, Total/)).toBeTruthy();
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Create invoice" })).toBeNull();
    expect(act).not.toHaveBeenCalled();
    expect(choices).not.toHaveBeenCalled();
    within(document.body).getByText(/Sends with:/);
  });
});
