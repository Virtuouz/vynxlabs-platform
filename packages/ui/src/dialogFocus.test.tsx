// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
