// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
// Every connector each worker has, as its own source: the forms of their connections are drawn from these.
import { httpConnector } from "../../sdk/src/http.ts";
import { oauth2Connector } from "../../sdk/src/oauth2.ts";
import { smtpConfigSchema } from "../../sdk/src/smtp.ts";
import { checkValue, type JsonSchema, SchemaForm } from "./index.ts";

afterEach(cleanup);

// What `z.toJSONSchema` writes for an order with a customer, lines and a delivery.
const order: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    customer: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        email: { type: "string", format: "email" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    lines: {
      type: "array",
      items: {
        type: "object",
        title: "Line",
        properties: {
          sku: { type: "string" },
          quantity: { type: "integer", minimum: 1, default: 1 },
        },
        required: ["sku", "quantity"],
        additionalProperties: false,
      },
    },
    priority: { type: "string", enum: ["low", "normal", "high"], default: "normal" },
    channel: { type: "string", enum: ["web", "phone", "shop", "fax", "mail"] },
    tags: { type: "array", items: { type: "string" } },
    due: { type: "string", format: "date" },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
    delivery: {
      oneOf: [
        {
          type: "object",
          title: "Courier",
          properties: { kind: { type: "string", const: "courier" }, address: { type: "string" } },
          required: ["kind", "address"],
        },
        {
          type: "object",
          title: "Pick-up",
          properties: { kind: { type: "string", const: "pickup" }, store: { type: "string" } },
          required: ["kind"],
        },
      ],
    },
    extra: { type: "object", additionalProperties: { type: "number" } },
  },
  required: ["customer", "lines", "priority", "delivery"],
  additionalProperties: false,
};

const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });

describe("a form drawn from a schema", () => {
  test("nested objects, lists of objects, choices and unions become fields, and submit the right JSON", async () => {
    const sent = vi.fn();
    render(<SchemaForm schema={order} onSubmit={sent} submitLabel="Place" />);

    // A nested object is a group of its own.
    const customer = screen.getByRole("group", { name: "Customer" });
    fireEvent.input(within(customer).getByLabelText("Name"), { target: { value: "Ada" } });
    expect((within(customer).getByLabelText("Email") as HTMLInputElement).type).toBe("email");

    // A list of objects: rows are added, filled, moved and removed.
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.input(screen.getAllByLabelText("Sku")[0] as HTMLElement, {
      target: { value: "A-1" },
    });
    expect((screen.getAllByLabelText("Quantity")[0] as HTMLInputElement).value).toBe("1");
    fireEvent.input(screen.getAllByLabelText("Sku")[1] as HTMLElement, {
      target: { value: "B-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move line 2 up" }));
    expect((screen.getAllByLabelText("Sku")[0] as HTMLInputElement).value).toBe("B-2");

    // Three choices side by side; five in a select.
    fireEvent.click(screen.getByRole("radio", { name: "high" }));
    expect(screen.getByLabelText("Channel").tagName).toBe("SELECT");
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "1" } });

    // A list of text.
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    type("Item 1", "gift");

    // A union picked by a field: choosing one shows its own fields.
    expect(screen.getByLabelText("Address")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Delivery"), { target: { value: "pickup" } });
    expect(screen.queryByLabelText("Address")).toBeNull();
    type("Store", "Leeds");

    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await waitFor(() => expect(sent).toHaveBeenCalledOnce());
    expect(sent.mock.calls[0]?.[0]).toEqual({
      customer: { name: "Ada" },
      lines: [
        { sku: "B-2", quantity: 1 },
        { sku: "A-1", quantity: 1 },
      ],
      priority: "high",
      channel: "phone",
      tags: ["gift"],
      delivery: { kind: "pickup", store: "Leeds" },
    });
  });

  test("an option of a union that is nothing but its name asks for nothing more", () => {
    const auth: JsonSchema = {
      type: "object",
      properties: {
        auth: {
          title: "How it is sent",
          oneOf: [
            { type: "object", title: "Bearer", properties: { type: { const: "bearer" } } },
            {
              type: "object",
              title: "A header",
              properties: { type: { const: "header" }, name: { type: "string", title: "Header" } },
            },
          ],
        },
      },
    };
    const { container } = render(<SchemaForm schema={auth} value={{ auth: { type: "bearer" } }} />);
    expect(screen.getByLabelText("How it is sent")).toBeTruthy();
    // The only box is the Fields and JSON switch: no empty group under the choice.
    const groups = [...container.querySelectorAll("fieldset legend")].map(
      (legend) => legend.textContent,
    );
    expect(groups).toEqual(["How to give it"]);
    fireEvent.change(screen.getByLabelText("How it is sent"), { target: { value: "header" } });
    expect(screen.getByLabelText("Header")).toBeTruthy();
  });

  test("what does not pass is said on its field, nested ones too, and nothing is sent", async () => {
    const sent = vi.fn();
    render(<SchemaForm schema={order} onSubmit={sent} submitLabel="Place" />);
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.input(screen.getByLabelText("Quantity"), { target: { value: "0" } });
    type("Email", "not-an-email");
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    expect(await screen.findByText("Enter 1 or more.")).toBeTruthy();
    expect(screen.getByText("Enter an email address.")).toBeTruthy();
    // The name inside the customer, and the sku of the line, are required.
    expect(screen.getAllByText("This is required.").length).toBeGreaterThanOrEqual(2);
    expect(sent).not.toHaveBeenCalled();
  });

  test("the server's errors are shown on the fields they name", () => {
    render(
      <SchemaForm
        schema={order}
        value={{ lines: [{ sku: "X", quantity: 2 }] }}
        errors={{ "/lines/0/sku": "No such product." }}
        onSubmit={() => {}}
        submitLabel="Place"
      />,
    );
    expect(screen.getByText("No such product.")).toBeTruthy();
  });

  test("a value that may be nothing has a None box", async () => {
    const sent = vi.fn();
    render(
      <SchemaForm
        schema={order}
        value={{ customer: { name: "Ada" }, lines: [], delivery: { kind: "pickup" }, note: "hi" }}
        onSubmit={sent}
        submitLabel="Place"
      />,
    );
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("hi");
    fireEvent.click(screen.getByRole("checkbox", { name: "No note" }));
    expect(screen.queryByLabelText("Note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await waitFor(() => expect(sent).toHaveBeenCalledOnce());
    expect(sent.mock.calls[0]?.[0]).toMatchObject({ note: null });
  });

  test("a part it cannot draw is asked for as JSON, that part alone", async () => {
    const sent = vi.fn();
    render(
      <SchemaForm
        schema={order}
        value={{ customer: { name: "Ada" }, lines: [], delivery: { kind: "pickup" } }}
        onSubmit={sent}
        submitLabel="Place"
      />,
    );
    // The map of numbers is JSON; the rest of the form is still fields.
    expect(screen.getByLabelText("Extra").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Name")).toBeTruthy();
    type("Extra", "{ nope");
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    expect(await screen.findByText("This is not valid JSON.")).toBeTruthy();
    type("Extra", '{"weight": 2}');
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await waitFor(() => expect(sent).toHaveBeenCalledOnce());
    expect(sent.mock.calls[0]?.[0]).toMatchObject({ extra: { weight: 2 } });
  });

  test("switching to JSON and back keeps the values", async () => {
    const sent = vi.fn();
    render(<SchemaForm schema={order} onSubmit={sent} submitLabel="Place" />);
    type("Name", "Ada");
    fireEvent.click(screen.getByRole("radio", { name: "JSON" }));
    const json = screen.getByLabelText("As JSON") as HTMLTextAreaElement;
    expect(JSON.parse(json.value)).toMatchObject({ customer: { name: "Ada" }, priority: "normal" });
    const edited = { ...JSON.parse(json.value), customer: { name: "Grace" } };
    fireEvent.input(json, { target: { value: JSON.stringify(edited) } });
    fireEvent.click(screen.getByRole("radio", { name: "Fields" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Grace");

    // JSON that does not parse keeps you where you are, and says so.
    fireEvent.click(screen.getByRole("radio", { name: "JSON" }));
    fireEvent.input(screen.getByLabelText("As JSON"), { target: { value: "{" } });
    fireEvent.click(screen.getByRole("radio", { name: "Fields" }));
    expect(screen.getByText("That is not valid JSON.")).toBeTruthy();
    expect(screen.getByLabelText("As JSON")).toBeTruthy();
  });

  test("dates, times, addresses and patterns are checked", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        on: { type: "string", format: "date" },
        at: { type: "string", format: "date-time" },
        site: { type: "string", format: "uri" },
        code: { type: "string", pattern: "^[A-Z]{3}$" },
        count: { type: "integer", exclusiveMinimum: 0 },
      },
    };
    expect(
      checkValue(schema, { on: "9 May", at: "soon", site: "nowhere", code: "ab", count: 1.5 }),
    ).toEqual({
      "/on": "Enter a date.",
      "/at": "Enter a date and time.",
      "/site": "Enter an address, such as https://example.com.",
      "/code": "This is not in the expected form.",
      "/count": "Enter a whole number.",
    });
    expect(
      checkValue(schema, {
        on: "2026-05-09",
        at: "2026-05-09T10:00:00.000Z",
        site: "https://example.com",
        code: "ABC",
        count: 2,
      }),
    ).toEqual({});
  });

  test("a schema it cannot draw at all is asked for as JSON", async () => {
    const sent = vi.fn();
    render(
      <SchemaForm
        schema={{ type: "array", prefixItems: [{ type: "string" }] }}
        onSubmit={sent}
        submitLabel="Run"
      />,
    );
    expect(screen.queryByRole("radio", { name: "Fields" })).toBeNull();
    fireEvent.input(screen.getByLabelText("As JSON"), { target: { value: '["a"]' } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(sent).toHaveBeenCalledWith(["a"]));
  });
});

describe("a string's box", () => {
  const field = (schema: JsonSchema) => {
    render(
      <SchemaForm
        schema={{ type: "object", properties: { it: { ...schema, title: "It" } } }}
        onSubmit={() => {}}
      />,
    );
    return screen.getByLabelText("It").tagName;
  };

  test("is one line for a long maxLength, with or without a format", () => {
    expect(field({ type: "string", maxLength: 253 })).toBe("INPUT");
    cleanup();
    expect(field({ type: "string", maxLength: 1000 })).toBe("INPUT");
    cleanup();
    expect(field({ type: "string", format: "email", maxLength: 5000 })).toBe("INPUT");
  });

  test("is several lines when the schema asks: format textarea, or more than 1000 characters", () => {
    expect(field({ type: "string", format: "textarea" })).toBe("TEXTAREA");
    cleanup();
    expect(field({ type: "string", maxLength: 1001 })).toBe("TEXTAREA");
  });
});

/** Each string a schema draws as a field of its own, by the title it is labelled with. */
function strings(schema: JsonSchema): { title: string; schema: JsonSchema }[] {
  const found: { title: string; schema: JsonSchema }[] = [];
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  for (const property of Object.values(properties)) {
    if (property.type === "string" && typeof property.title === "string") {
      found.push({ title: property.title, schema: property });
    } else if (property.type === "object" && property.properties) {
      found.push(...strings(property));
    }
  }
  return found;
}

describe("every connector's configuration form", () => {
  const connectors: [string, JsonSchema][] = [
    ["http", httpConnector.configSchema as JsonSchema],
    ["smtp", smtpConfigSchema as unknown as JsonSchema],
    ["oauth2", oauth2Connector.configSchema as JsonSchema],
  ];

  test.each(connectors)("%s draws each one-line field as one line", (_name, schema) => {
    render(<SchemaForm schema={schema} onSubmit={() => {}} />);
    const drawn = strings(schema);
    expect(drawn.length).toBeGreaterThan(0);
    for (const one of drawn) {
      const multiline =
        one.schema.format === "textarea" ||
        (one.schema.format === undefined &&
          typeof one.schema.maxLength === "number" &&
          one.schema.maxLength > 1000);
      expect(
        [one.title, screen.getByLabelText(one.title).tagName],
        `${one.title} is drawn as ${multiline ? "several lines" : "one line"}`,
      ).toEqual([one.title, multiline ? "TEXTAREA" : "INPUT"]);
    }
  });

  test("the SMTP form's mail server, sender and user name are one line each (A2-10)", () => {
    render(<SchemaForm schema={smtpConfigSchema as unknown as JsonSchema} onSubmit={() => {}} />);
    for (const label of ["Mail server", "Sent from", "User name"]) {
      expect(screen.getByLabelText(label).tagName).toBe("INPUT");
    }
  });

  test("a map of text, such as headers, is rows of a name and a value, not JSON (A2-11)", () => {
    const sent = vi.fn();
    const schema: JsonSchema = {
      type: "object",
      properties: { headers: { type: "object", additionalProperties: { type: "string" } } },
    };
    render(<SchemaForm schema={schema} onSubmit={sent} submitLabel="Save" />);
    expect(screen.queryByRole("textbox", { name: "Headers" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    type("Name 1", "Authorization");
    type("Value 1", "Bearer abc");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    type("Name 2", "X-Trace");
    type("Value 2", "1");
    fireEvent.click(screen.getByRole("button", { name: "Remove X-Trace" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toHaveBeenCalledWith({ headers: { Authorization: "Bearer abc" } });
  });
});
