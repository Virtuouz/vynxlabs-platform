// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, expect, test } from "vitest";
import { Dialog } from "./Dialog.tsx";
import { SelectField } from "./Fields.tsx";

afterEach(cleanup);

test("a dialog opens with the focus on what marks itself data-autofocus", async () => {
  render(
    <Dialog open onClose={() => undefined} title="Add to page" bare>
      <input aria-label="Find" data-autofocus="" />
      <button type="button">Other</button>
    </Dialog>,
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Find")));
});

test("a dialog that asks for something to type opens with the focus in the first field, not on Close", async () => {
  render(
    <Dialog open onClose={() => undefined} title="Make an app">
      <input type="checkbox" aria-label="Switch" />
      <input aria-label="Name" />
      <input aria-label="Address" />
    </Dialog>,
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));
});

test("a dialog with nothing to type keeps the focus on its first control", async () => {
  render(
    <Dialog open onClose={() => undefined} title="Remove it?">
      <button type="button">Remove</button>
    </Dialog>,
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" })),
  );
});

test("a bare dialog keeps its title for a screen reader and draws no bar or close button of its own", async () => {
  render(
    <Dialog open onClose={() => undefined} title="Add to page" bare>
      <p>Inside</p>
    </Dialog>,
  );
  expect(await screen.findByRole("dialog", { name: "Add to page" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
});

test("a select can carry an icon inside its box", () => {
  render(
    <SelectField
      label="Table"
      name="t"
      icon={<svg data-testid="icon" />}
      value="a"
      options={[{ value: "a", label: "A" }]}
    />,
  );
  expect(screen.getByTestId("icon")).toBeTruthy();
  expect(screen.getByLabelText("Table").className).toContain("pl-10");
});

test("a form that arrives after the dialog opened takes the focus, but not on an optional date", async () => {
  const Later = () => {
    const [ready, setReady] = useState(false);
    useEffect(() => {
      const wait = setTimeout(() => setReady(true), 50);
      return () => clearTimeout(wait);
    }, []);
    return (
      <Dialog open onClose={() => undefined} title="New invoice">
        {ready ? (
          <form>
            <input aria-label="A day" data-date-input="" />
            <select aria-label="Clinic" required>
              <option value="a">A</option>
            </select>
          </form>
        ) : null}
      </Dialog>
    );
  };
  render(<Later />);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Clinic")));
});
