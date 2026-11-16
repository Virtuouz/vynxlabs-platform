// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ListScreen, RemoveButton } from "./ListScreen.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a create dialog forgets what was typed when cancelled, and makes no costly choice itself", async () => {
  const submit = vi.fn(async (values: Record<string, string>) => values);
  show(
    <ListScreen<{ id: string }>
      title="Workspaces"
      path="/things"
      rowKey={(row) => row.id}
      columns={[]}
      empty={{ title: "None", text: "" }}
      create={{
        action: "Create workspace",
        fields: [
          { name: "name", label: "Name" },
          { name: "password", label: "Password", type: "password" },
          {
            name: "type",
            label: "Type",
            pick: true,
            options: [
              { value: "production", label: "Production" },
              { value: "dev", label: "Dev" },
            ],
          },
        ],
        submit,
      }}
    />,
  );
  const create = async () =>
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Create workspace" }))[0] as HTMLElement,
    );
  await create();
  let dialog = within(await screen.findByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Name"), { target: { value: "Orders" } });
  fireEvent.change(dialog.getByLabelText("Password"), { target: { value: "hunter2" } });
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));

  await create();
  dialog = within(await screen.findByRole("dialog"));
  expect((dialog.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  expect((dialog.getByLabelText("Password") as HTMLInputElement).value).toBe("");

  // The type is not chosen for the person.
  expect((dialog.getByLabelText("Type") as HTMLSelectElement).value).toBe("");
  fireEvent.change(dialog.getByLabelText("Name"), { target: { value: "Orders" } });
  fireEvent.change(dialog.getByLabelText("Password"), { target: { value: "hunter2" } });
  fireEvent.click(dialog.getByRole("button", { name: "Create workspace" }));
  expect(await dialog.findByText("Choose one.")).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(dialog.getByLabelText("Type"), { target: { value: "dev" } });
  fireEvent.click(dialog.getByRole("button", { name: "Create workspace" }));
  await vi.waitFor(() =>
    expect(submit).toHaveBeenCalledWith({ name: "Orders", password: "hunter2", type: "dev" }),
  );
});

test("a confirmation names what uses the thing it removes", async () => {
  const run = vi.fn(async () => {});
  show(
    <RemoveButton
      label="Delete"
      confirm="Delete the secret stripe_key? Anything that uses it will fail."
      affected={["billing/charge", "billing/refund", "orders/sync"]}
      run={run}
      onDone={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  const said = await answer("Cancel");
  expect(said).toContain("Used by 3: billing/charge, billing/refund and orders/sync.");
  expect(run).not.toHaveBeenCalled();
});
