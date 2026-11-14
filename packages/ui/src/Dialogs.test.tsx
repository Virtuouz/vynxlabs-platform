// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { type Dialogs, DialogsProvider, useDialogs } from "./Dialogs.tsx";

afterEach(cleanup);

let dialogs: Dialogs;
function Grab() {
  dialogs = useDialogs();
  return null;
}
const mount = () =>
  render(
    <DialogsProvider>
      <Grab />
    </DialogsProvider>,
  );
const press = async (name: string) => fireEvent.click(await screen.findByRole("button", { name }));

/**
 * Asks from outside an event, as only a test does, and lets the dialog draw.
 * The answer is wrapped so that awaiting this does not wait for the answer.
 */
async function asking<T>(
  question: (dialogs: Dialogs) => Promise<T>,
): Promise<{ answer: Promise<T> }> {
  let answer: Promise<T> | undefined;
  await act(async () => {
    answer = question(dialogs);
  });
  return { answer: answer as Promise<T> };
}

test("a confirmation resolves to what the person chose, and names its action", async () => {
  mount();
  const refused = await asking((d) =>
    d.confirm({ title: "Delete the key?", text: "It stops working.", action: "Delete" }),
  );
  expect((await screen.findByRole("dialog")).textContent).toContain("It stops working.");
  await press("Cancel");
  expect(await refused.answer).toBe(false);

  const agreed = await asking((d) => d.confirm({ title: "Delete the key?", action: "Delete" }));
  await press("Delete");
  expect(await agreed.answer).toBe(true);
});

test("a prompt returns what was typed, refuses an empty answer, and returns null when canceled", async () => {
  mount();
  const named = await asking((d) =>
    d.prompt({ title: "Rename", label: "New name", initial: "total", action: "Rename" }),
  );
  const box = (await screen.findByLabelText("New name")) as HTMLInputElement;
  expect(box.value).toBe("total");
  fireEvent.change(box, { target: { value: "  " } });
  expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(box, { target: { value: "amount" } });
  await press("Rename");
  expect(await named.answer).toBe("amount");

  const optional = await asking((d) =>
    d.prompt({ title: "Approve", label: "Note", required: false, multiline: true }),
  );
  await press("Continue");
  expect(await optional.answer).toBe("");

  const left = await asking((d) => d.prompt({ title: "Rename", label: "New name" }));
  await press("Cancel");
  expect(await left.answer).toBeNull();
});

test("typing the name unlocks a destructive action", async () => {
  mount();
  const gone = await asking((d) =>
    d.typeToConfirm({ title: "Delete acme?", expected: "acme", action: "Delete tenant" }),
  );
  const button = (await screen.findByRole("button", {
    name: "Delete tenant",
  })) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Type acme to confirm"), { target: { value: "acme" } });
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(await gone.answer).toBe(true);
});

test("a second question cancels the one before it", async () => {
  mount();
  const first = await asking((d) => d.confirm({ title: "First?" }));
  const second = await asking((d) => d.confirm({ title: "Second?" }));
  expect(await first.answer).toBe(false);
  await press("Continue");
  expect(await second.answer).toBe(true);
});
