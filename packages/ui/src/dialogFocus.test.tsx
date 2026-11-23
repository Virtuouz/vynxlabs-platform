// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, expect, test } from "vitest";
import { Dialog } from "./Dialog.tsx";
import { DialogsProvider, useDialogs } from "./Dialogs.tsx";
import { SelectField } from "./Fields.tsx";
import { SideSheet } from "./SideSheet.tsx";

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

function Asker({ danger }: { danger: boolean }) {
  const dialogs = useDialogs();
  return (
    <button
      type="button"
      onClick={() => void dialogs.confirm({ title: "Go on?", action: "Go on", danger })}
    >
      Ask
    </button>
  );
}

test("WLK-10: a confirmation starts on its main button, and on Cancel when the answer destroys", async () => {
  const view = render(
    <DialogsProvider>
      <Asker danger={false} />
    </DialogsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Go on" })),
  );
  view.unmount();
  render(
    <DialogsProvider>
      <Asker danger />
    </DialogsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
  );
});

test("WLK-10: a side sheet that asks for something to type opens in the first field, not on Close", async () => {
  render(
    <SideSheet open onClose={() => undefined} title="Change source">
      <input aria-label="Host" />
      <input aria-label="Port" />
    </SideSheet>,
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Host")));
});

test("WLK-17i: closing a question puts the focus back where it was, even when the button that asked is gone", async () => {
  function Page() {
    const dialogs = useDialogs();
    const [gone, setGone] = useState(false);
    return (
      <section aria-label="Draft">
        {gone ? (
          <p>Discarded.</p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              if (await dialogs.confirm({ title: "Discard it?", action: "Discard" })) setGone(true);
            }}
          >
            Discard
          </button>
        )}
      </section>
    );
  }
  render(
    <DialogsProvider>
      <Page />
    </DialogsProvider>,
  );
  const opener = screen.getByRole("button", { name: "Discard" });
  opener.focus();
  fireEvent.click(opener);
  await screen.findByRole("dialog");
  // The question has two Discard buttons for a moment: the dialog's is the last.
  const all = screen.getAllByRole("button", { name: "Discard" });
  fireEvent.click(all[all.length - 1] as HTMLElement);
  await screen.findByText("Discarded.");
  await waitFor(() =>
    expect(document.activeElement).toBe(document.querySelector("section[aria-label=Draft]")),
  );
});

test("WLK-17i: a question that is canceled returns the focus to the button that asked", async () => {
  function Page() {
    const dialogs = useDialogs();
    return (
      <button type="button" onClick={() => void dialogs.confirm({ title: "Sure?", action: "Go" })}>
        Ask
      </button>
    );
  }
  render(
    <DialogsProvider>
      <Page />
    </DialogsProvider>,
  );
  const opener = screen.getByRole("button", { name: "Ask" });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(document.activeElement).toBe(opener));
});

test("Tab in a side sheet goes from its last control to its first, and Shift+Tab back, never to the page", async () => {
  render(
    <>
      <button type="button">Behind</button>
      <SideSheet
        open
        onClose={() => undefined}
        title="Create group"
        footer={<button type="button">Create</button>}
      >
        <input aria-label="Name" />
      </SideSheet>
    </>,
  );
  const name = await screen.findByLabelText("Name");
  const create = screen.getByRole("button", { name: "Create" });
  const close = screen.getByRole("button", { name: "Close" });
  create.focus();
  const forward = fireEvent.keyDown(create, { key: "Tab" });
  expect(forward).toBe(false);
  expect(document.activeElement).toBe(close);
  close.focus();
  expect(fireEvent.keyDown(close, { key: "Tab", shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(create);
  name.focus();
  expect(fireEvent.keyDown(name, { key: "Tab" })).toBe(true);
});
