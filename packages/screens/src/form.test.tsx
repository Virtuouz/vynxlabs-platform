// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageWidget } from "@volvel/manifest";
import { ToastProvider } from "@volvel/ui";
import type { ActOutcome, Choice, WidgetViewProps } from "@volvel/widgets";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FormView } from "../../widgets-core/views/form.tsx";
import { PageView } from "./PageView.tsx";
import {
  ActionError,
  type PageDataClient,
  type ViewEntry,
  type ViewRegistry,
  viewRegistry,
  type WireData,
} from "./types.ts";

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
  options: {
    close?: boolean;
    building?: boolean;
    user?: { id: string; email?: string; name?: string; groups: string[] };
  } = {},
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
      {...(options.user ? { user: options.user } : {})}
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
    expect((screen.getByLabelText(/Total/) as HTMLInputElement).type).toBe("text");
    expect((screen.getByLabelText(/Lines/) as HTMLInputElement).type).toBe("number");
    expect(screen.getAllByRole("button", { name: "Open calendar" })).toHaveLength(2);
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

  test("required fields carry an asterisk and the others nothing; labels and help come from the page", async () => {
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
    expect(screen.queryByText("optional")).toBeNull();
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
    expect((screen.getByLabelText(/Total/) as HTMLInputElement).value).toBe("120.00");
    expect((screen.getByLabelText(/Status/) as HTMLSelectElement).value).toBe("open");
    expect((screen.getByLabelText(/Issued/) as HTMLInputElement).value).toBe("Nov 20, 2026");
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
    // The button is drawn as people will see it, and does nothing: it is inert.
    const submit = screen.getByRole("button", { name: "Create invoice" });
    expect(submit.closest("[inert]")).not.toBeNull();
    fireEvent.click(submit);
    expect(act).not.toHaveBeenCalled();
    expect(choices).not.toHaveBeenCalled();
    within(document.body).getByText(/Sends with:/);
  });
});

describe("a form in a side sheet or a modal", () => {
  test("is laid on the grid as placed, as a page is (the maker sizes the sheet)", async () => {
    const definition = corePack.definitions.find((one) => one.type === "core/form");
    if (!definition) throw new Error("core/form has no definition");
    const registry: ViewRegistry = new Map<string, ViewEntry>([
      // biome-ignore lint/suspicious/noExplicitAny: the registry holds views of every widget's configuration
      ["core/form", { definition, View: (props: WidgetViewProps<any>) => <FormView {...props} /> }],
    ]);
    const client: PageDataClient = { read: async () => ({ inputs: { record: wire({}) } }) };
    const { container } = render(
      <PageView
        widgets={[widget({ mode: "create", fields: [{ column: "number" }] })]}
        filters={[]}
        registry={registry}
        client={client}
        filterValues={{}}
        onFilterValues={() => {}}
        over
      />,
    );
    const cell = await waitFor(() => {
      const found = container.querySelector('[aria-label="New invoice"]');
      if (!found) throw new Error("not drawn yet");
      return found;
    });
    expect(cell.className).toContain("grid-row");
    // The overlay is the one scroller: rows are as tall as what is in them, not a fixed height.
    expect(cell.parentElement?.className).not.toContain("auto-rows-[2.5rem]");
    expect(cell.parentElement?.className).toContain("grid-cols-12");
  });

  test("a field shown in dollars doesn't borrow the column's description of cents", async () => {
    const described = columns.map((one) =>
      one.name === "total" ? { ...one, description: "What is owed, in cents." } : one,
    );
    const definition = corePack.definitions.find((one) => one.type === "core/form");
    if (!definition) throw new Error("core/form has no definition");
    const registry: ViewRegistry = new Map<string, ViewEntry>([
      // biome-ignore lint/suspicious/noExplicitAny: the registry holds views of every widget's configuration
      ["core/form", { definition, View: (props: WidgetViewProps<any>) => <FormView {...props} /> }],
    ]);
    const client: PageDataClient = {
      read: async () =>
        ({
          inputs: { record: { shape: "record", columns: described, record: {} } },
        }) as never,
    };
    render(
      <PageView
        widgets={[
          widget({
            mode: "create",
            fields: [{ column: "total", format: { style: "currency", minorUnits: true } }],
          }),
        ]}
        filters={[]}
        registry={registry}
        client={client}
        filterValues={{}}
        onFilterValues={() => {}}
      />,
    );
    await screen.findByLabelText(/Total/);
    expect(screen.queryByText("What is owed, in cents.")).toBeNull();
  });
});

describe("what a field starts with", () => {
  const todayText = () => {
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  };
  /** Today as the date box shows it: "Nov 21, 2026". */
  const shownToday = () =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date());
  const starts = (fields: object[], mode = "create") => ({
    mode,
    fields,
    submitLabel: "Create invoice",
  });

  test("a date starts today and the person may change it", async () => {
    draw(null, starts([{ column: "issued", initial: { kind: "today" } }, { column: "sent" }]));
    await ready();
    const issued = screen.getByLabelText(/Issued/) as HTMLInputElement;
    expect(issued.value).toBe(shownToday());
    type(/Issued/, "2026-01-02");
    expect((screen.getByLabelText(/Issued/) as HTMLInputElement).value).toBe("2026-01-02");
    expect((screen.getByLabelText(/Sent/) as HTMLInputElement).value).toBe("");
  });

  test("a timestamp starts now", async () => {
    draw(null, starts([{ column: "sent", initial: { kind: "today" } }]));
    await ready();
    expect((screen.getByLabelText(/Sent/) as HTMLInputElement).value).not.toBe("");
  });

  test("it is sent with the record when left as it started", async () => {
    const { act } = draw(null, starts([{ column: "issued", initial: { kind: "today" } }]));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect(act.mock.calls[0]?.[1]?.inputs).toEqual({ issued: todayText() });
  });

  test("a fixed value starts the field", async () => {
    draw(null, starts([{ column: "number", initial: { kind: "value", value: "INV-0" } }]));
    await ready();
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe("INV-0");
  });

  test("the person filling it in starts a text field, when the host knows them", async () => {
    draw(null, starts([{ column: "number", initial: { kind: "me", as: "email" } }]), undefined, {
      user: { id: "u1", email: "maya@fernhill.example", groups: [] },
    });
    await ready();
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe(
      "maya@fernhill.example",
    );
  });

  test("with nobody known, the field starts empty", async () => {
    draw(null, starts([{ column: "number", initial: { kind: "me" } }]));
    await ready();
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe("");
  });

  test("in edit mode the record's own value wins, and an empty one stays empty", async () => {
    draw(
      { id: "i1", issued: "2020-05-05", number: "INV-7" },
      starts(
        [
          { column: "issued", initial: { kind: "today" } },
          { column: "sent", initial: { kind: "today" } },
        ],
        "edit",
      ),
    );
    await ready();
    expect((screen.getByLabelText(/Issued/) as HTMLInputElement).value).toBe("May 5, 2020");
    expect((screen.getByLabelText(/Sent/) as HTMLInputElement).value).toBe("");
  });

  test("after saving a new record the fields start again", async () => {
    draw(null, starts([{ column: "issued", initial: { kind: "today" } }, { column: "number" }]));
    await ready();
    type(/Issued/, "2026-01-02");
    type(/Number/, "INV-9");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    await waitFor(() =>
      expect((screen.getByLabelText(/Issued/) as HTMLInputElement).value).toBe(shownToday()),
    );
  });
});

describe("what a form asks for, by the server's rule", () => {
  test("a required column with a default starts with it and has no asterisk; a required reference has one", async () => {
    columns.push(
      col("minutes", "integer", "Minutes", { required: true, default: 20 }),
      col("pet", "reference", "Pet", { references: "pets", required: true }),
    );
    draw(null, { mode: "create", fields: [{ column: "minutes" }, { column: "pet" }] });
    const minutes = (await screen.findByLabelText(/Minutes/)) as HTMLInputElement;
    expect(minutes.value).toBe("20");
    const label = (name: string) => screen.getByText(name, { selector: "label" }).parentElement;
    expect(label("Minutes")?.textContent).not.toContain("*");
    expect(label("Pet")?.textContent).toContain("*");
  });
});

describe("a form whose submit asks to confirm", () => {
  /** The page with the real host: the dialog, and the server's call, are the host's. */
  function drawConfirming(refusal?: Error) {
    const call = vi.fn(async () => {
      if (refusal) throw refusal;
      return { client: [] };
    });
    const client: PageDataClient = {
      read: async () => ({ inputs: { record: wire({}) } }),
      act: call,
    };
    render(
      <ToastProvider>
        <PageView
          widgets={[
            widget({
              mode: "create",
              fields: [{ column: "number" }, { column: "notes" }],
              submitLabel: "Create invoice",
              submit: {
                confirm: { title: "Create it?", button: "Yes, create" },
                steps: [{ do: "create", table: "invoices", set: {} }],
              },
            }),
          ]}
          filters={[]}
          registry={viewRegistry(corePack)}
          client={client}
          filterValues={{}}
          onFilterValues={() => {}}
        />
      </ToastProvider>,
    );
    return call;
  }

  test("sends what was typed once confirmed", async () => {
    const call = drawConfirming();
    await ready();
    type(/Number/, "INV-9");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, create" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    expect(call).toHaveBeenCalledWith("form", "config/submit", {
      records: {},
      inputs: { number: "INV-9" },
    });
  });

  test("a refusal of a field is handed back to the form, which keeps what was typed", async () => {
    const call = drawConfirming(
      new ActionError("Check what you typed.", 400, { number: "is taken" }),
    );
    await ready();
    type(/Number/, "INV-9");
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, create" }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("is taken")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText(/Number/) as HTMLInputElement).value).toBe("INV-9");
  });
});
