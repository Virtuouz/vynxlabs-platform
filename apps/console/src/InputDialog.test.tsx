// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "./api.ts";
import { InputDialog } from "./InputDialog.tsx";
import { show } from "./testing.tsx";

afterEach(cleanup);

const schema = {
  type: "object",
  properties: {
    sku: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { quantity: { type: "integer", minimum: 1 } },
        required: ["quantity"],
      },
    },
  },
  required: ["sku"],
};

test("input is asked for as fields from the schema, and sent typed", async () => {
  const sent = vi.fn(async () => {});
  show(
    <InputDialog
      open
      onClose={() => {}}
      title="Start inventory/reorder"
      action="Start flow"
      schema={schema}
      onSubmit={sent}
    />,
  );
  fireEvent.input(await screen.findByLabelText("Sku"), { target: { value: "A-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Add item" }));
  fireEvent.input(screen.getByLabelText("Quantity"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Start flow" }));
  await waitFor(() => expect(sent).toHaveBeenCalledWith({ sku: "A-1", lines: [{ quantity: 3 }] }));
});

test("what the server refuses in the input is said on the field", async () => {
  const sent = vi.fn(async () => {
    throw new ApiError(400, {
      title: "Bad Request",
      detail: "The input does not match the script's schema.",
      errors: [{ path: "/input/sku", message: "must match pattern" }],
    });
  });
  show(
    <InputDialog
      open
      onClose={() => {}}
      title="Run"
      action="Run"
      schema={schema}
      initial={{ sku: "x" }}
      onSubmit={sent}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Run" }));
  expect(await screen.findByText("must match pattern")).toBeTruthy();
});

test("with no schema it asks for JSON", async () => {
  const sent = vi.fn(async () => {});
  show(<InputDialog open onClose={() => {}} title="Run" action="Run" onSubmit={sent} />);
  fireEvent.input(await screen.findByLabelText("As JSON"), { target: { value: '{"a": 1}' } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => expect(sent).toHaveBeenCalledWith({ a: 1 }));
});

test("a value masked when shown is left out of a run again, named, and asked for", async () => {
  const sent = vi.fn(async () => {});
  show(
    <InputDialog
      open
      onClose={() => {}}
      title="Run it again"
      action="Run again"
      schema={{
        type: "object",
        properties: { sku: { type: "string" }, apiKey: { type: "string" } },
        required: ["sku"],
      }}
      initial={{ sku: "A-1", apiKey: "[redacted]" }}
      onSubmit={sent}
    />,
  );
  expect(screen.getByText(/One value was masked when shown \(apiKey\)/)).toBeTruthy();
  expect((screen.getByLabelText(/api ?key/i) as HTMLInputElement).value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  // It is required now: nothing is sent without it.
  await new Promise((done) => setTimeout(done, 50));
  expect(sent).not.toHaveBeenCalled();
  fireEvent.input(screen.getByLabelText(/api ?key/i), { target: { value: "k-2" } });
  fireEvent.click(screen.getByRole("button", { name: "Run again" }));
  await waitFor(() => expect(sent).toHaveBeenCalledWith({ sku: "A-1", apiKey: "k-2" }));
});

test("an input too large to be shown can only be run again as it was (FLW-24)", async () => {
  const sent = vi.fn(async () => {});
  const same = vi.fn(async () => {});
  show(
    <InputDialog
      open
      onClose={() => {}}
      title="Run again"
      action="Run again"
      initial={{ stored: "flow-runs/abc/input.json" }}
      onSame={same}
      onSubmit={sent}
    />,
  );
  expect(screen.getByText(/too large to show or change here/)).toBeTruthy();
  fireEvent.click(screen.getByText("Run again with the same input"));
  await waitFor(() => expect(same).toHaveBeenCalled());
  expect(sent).not.toHaveBeenCalled();
});

test("a run can start later and with a priority, and says what is wrong with them (OPS-MP8)", async () => {
  const sent = vi.fn(async (_input: unknown, _timing?: unknown) => {});
  show(
    <InputDialog
      open
      onClose={() => {}}
      title="Run reminders/send"
      action="Run"
      timing
      onSubmit={sent}
    />,
  );
  // Nothing chosen: it starts now, at the usual priority.
  fireEvent.click(await screen.findByRole("button", { name: "Run" }));
  await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
  expect(sent.mock.calls[0]?.[1]).toEqual({});

  fireEvent.change(screen.getByLabelText("Start"), { target: { value: "later" } });
  fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2020-01-01T08:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("Choose a time that has not passed.")).toBeTruthy();
  expect(sent).toHaveBeenCalledTimes(1);

  const at = new Date(Date.now() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const field = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: field } });
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "500" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("Priority is a whole number from -100 to 100.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
  expect(sent.mock.calls[1]?.[1]).toEqual({
    startAfter: new Date(field).toISOString(),
    priority: 10,
  });
});
