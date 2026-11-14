// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { checkForm, Form, type FormSchema } from "./index.ts";

afterEach(cleanup);

const schema = {
  type: "object",
  title: "New order",
  description: "Goes to the warehouse at once.",
  required: ["customer", "quantity", "priority"],
  properties: {
    customer: { type: "string", title: "Customer", minLength: 2, maxLength: 40 },
    email: { type: "string", format: "email", description: "For the receipt" },
    quantity: { type: "integer", minimum: 1, maximum: 100, default: 1 },
    discount: { type: "number" },
    priority: { type: "string", enum: ["low", "normal", "high"], default: "normal" },
    due_date: { type: "string", format: "date" },
    gift: { type: "boolean", title: "Gift wrap" },
    notes: { type: "string", maxLength: 2000 },
  },
} as const satisfies FormSchema;

function type(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

describe("form", () => {
  test("draws a control for each property, with its label, hint and default", () => {
    render(<Form schema={schema} onSubmit={() => {}} submitLabel="Place order" />);
    expect(screen.getByRole("heading", { name: "New order" })).toBeTruthy();
    expect(screen.getByText("Goes to the warehouse at once.")).toBeTruthy();
    expect((screen.getByLabelText("Customer") as HTMLInputElement).type).toBe("text");
    expect((screen.getByLabelText("Email") as HTMLInputElement).type).toBe("email");
    expect(screen.getByText("For the receipt")).toBeTruthy();
    const quantity = screen.getByLabelText("Quantity") as HTMLInputElement;
    expect(quantity.type).toBe("number");
    expect(quantity.value).toBe("1");
    const priority = screen.getByLabelText("Priority") as HTMLSelectElement;
    expect(priority.tagName).toBe("SELECT");
    expect(priority.value).toBe("normal");
    // A required choice that has a value offers no empty option.
    expect([...priority.options].map((option) => option.value)).toEqual(["low", "normal", "high"]);
    expect((screen.getByLabelText("Due date") as HTMLInputElement).type).toBe("date");
    expect(screen.getByRole("checkbox", { name: "Gift wrap" })).toBeTruthy();
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: "Place order" })).toBeTruthy();
  });

  test("starts from the given value", () => {
    render(
      <Form
        schema={schema}
        value={{ customer: "Acme", quantity: 5, gift: true, priority: "high" }}
        onSubmit={() => {}}
        submitLabel="Save"
      />,
    );
    expect((screen.getByLabelText("Customer") as HTMLInputElement).value).toBe("Acme");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("high");
    expect((screen.getByRole("checkbox", { name: "Gift wrap" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  test("submits values of the schema's types, and leaves out what was left empty", async () => {
    const onSubmit = vi.fn();
    render(<Form schema={schema} onSubmit={onSubmit} submitLabel="Place order" />);
    type("Customer", "Acme");
    type("Quantity", "3");
    type("Discount", "2.5");
    type("Due date", "2026-03-09");
    fireEvent.click(screen.getByRole("checkbox", { name: "Gift wrap" }));
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      customer: "Acme",
      quantity: 3,
      discount: 2.5,
      priority: "normal",
      due_date: "2026-03-09",
      gift: true,
    });
  });

  test("says what is wrong under each field, and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<Form schema={schema} onSubmit={onSubmit} submitLabel="Place order" />);
    type("Email", "not an address");
    type("Quantity", "500");
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "This is required.",
      "Enter an email address.",
      "Enter 100 or less.",
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
    // The first field in error takes the focus.
    expect(document.activeElement).toBe(screen.getByLabelText("Customer"));

    // Changing a field clears its message. The others stay until the next try.
    type("Customer", "Acme");
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  });

  test("shows the server's messages, and its own first", async () => {
    const { rerender } = render(
      <Form schema={schema} onSubmit={() => {}} submitLabel="Place order" />,
    );
    rerender(
      <Form
        schema={schema}
        onSubmit={() => {}}
        submitLabel="Place order"
        errors={{ customer: "This customer is on hold." }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("This customer is on hold.");
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This is required."));
  });

  test("the button is disabled while the submission is pending, and a refusal is shown", async () => {
    let finish: (failure?: Error) => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = (failure) => (failure ? reject(failure) : resolve());
        }),
    );
    render(
      <Form
        schema={schema}
        value={{ customer: "Acme" }}
        onSubmit={onSubmit}
        submitLabel="Place order"
      />,
    );
    const button = screen.getByRole("button", { name: "Place order" }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect((screen.getByLabelText("Customer") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledOnce();

    finish(new Error("The warehouse is closed."));
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(screen.getByRole("alert").textContent).toBe("The warehouse is closed.");

    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(screen.queryByRole("alert")).toBeNull();
    finish();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  test("a disabled form cannot be changed or submitted", () => {
    const onSubmit = vi.fn();
    render(<Form schema={schema} onSubmit={onSubmit} submitLabel="Place order" disabled />);
    expect((screen.getByLabelText("Customer") as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Place order" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.submit(
      screen.getByRole("button", { name: "Place order" }).closest("form") as Element,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("an optional choice can be left open, and a choice of numbers stays a number", async () => {
    const onSubmit = vi.fn();
    render(
      <Form
        schema={{
          type: "object",
          properties: {
            size: { type: "integer", enum: [1, 2, 3] },
            color: { type: "string", enum: ["red", "blue"] },
          },
        }}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    );
    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ size: 2 }));
  });

  test("values are checked against the limits and converted", () => {
    expect(
      checkForm(schema, { customer: "A", quantity: 1.5, priority: "", gift: false, notes: "" }),
    ).toEqual({
      values: { gift: false },
      errors: {
        customer: "Use at least 2 characters.",
        quantity: "Enter a whole number.",
        priority: "This is required.",
      },
    });
    expect(
      checkForm(schema, { customer: "x".repeat(41), quantity: 0, priority: "urgent" }),
    ).toEqual({
      values: { gift: false },
      errors: {
        customer: "Use at most 40 characters.",
        quantity: "Enter 1 or more.",
        priority: "Choose one of the options.",
      },
    });
    const when: FormSchema = {
      type: "object",
      properties: { at: { type: "string", format: "date-time" } },
    };
    const local = "2026-03-09T14:30";
    expect(checkForm(when, { at: local }).values).toEqual({ at: new Date(local).toISOString() });
    expect(checkForm(when, { at: "" })).toEqual({ values: {}, errors: {} });
  });

  test("a date and time is edited in local time", () => {
    const at = new Date(2026, 2, 9, 14, 30);
    render(
      <Form
        schema={{ type: "object", properties: { at: { type: "string", format: "date-time" } } }}
        value={{ at: at.toISOString() }}
        onSubmit={() => {}}
        submitLabel="Save"
      />,
    );
    const input = screen.getByLabelText("At") as HTMLInputElement;
    expect(input.type).toBe("datetime-local");
    expect(input.value).toBe("2026-03-09T14:30");
  });
});
