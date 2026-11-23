// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { type CreateConfig, CreateDialog } from "./ListScreen.tsx";
import { show } from "./testing.tsx";

afterEach(cleanup);

/** A screen that opens a form over what exists, as Change on a data source does. */
function Screen({ config, held }: { config: CreateConfig; held: { host: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <p>Held: {held.host}</p>
      <CreateDialog
        open={open}
        onClose={() => setOpen(false)}
        initial={{ host: held.host }}
        config={config}
        onCreated={() => setOpen(false)}
      />
    </>
  );
}

const config = (submit: CreateConfig["submit"]): CreateConfig => ({
  action: "Add column",
  fields: [{ name: "host", label: "Host" }],
  submit,
});

test("WLK-06: a refusal that is a plain error is said on the form, and the page stays", async () => {
  show(
    <Screen
      held={{ host: "a" }}
      config={config(async () => {
        throw new Error('There is already a column called "a". Choose another name.');
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open it" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add column" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/already a column called "a"/);
});

test("WLK-08: opened again after a save, the form shows what exists now", async () => {
  const view = show(<Screen held={{ host: "old.example" }} config={config(async () => ({}))} />);
  fireEvent.click(screen.getByRole("button", { name: "Open it" }));
  const field = (await screen.findByLabelText("Host")) as HTMLInputElement;
  expect(field.value).toBe("old.example");
  fireEvent.click(screen.getByRole("button", { name: "Add column" }));
  await waitFor(() => expect(screen.queryByLabelText("Host")).toBeNull());
  // The save changed what exists; the screen draws again with it.
  view.rerender(<Screen held={{ host: "new.example" }} config={config(async () => ({}))} />);
  fireEvent.click(screen.getByRole("button", { name: "Open it" }));
  expect(((await screen.findByLabelText("Host")) as HTMLInputElement).value).toBe("new.example");
});
