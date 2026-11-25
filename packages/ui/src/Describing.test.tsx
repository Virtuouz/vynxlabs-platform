// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Dialog } from "./Dialog.tsx";
import { SideSheet } from "./SideSheet.tsx";

afterEach(cleanup);

test("what a dialog and a side sheet say under their title sets a name between backticks as code", () => {
  render(
    <>
      <Dialog open onClose={() => {}} title="Add pool" description="Name it with `worker`.">
        <p>Body</p>
      </Dialog>
      <SideSheet open onClose={() => {}} title="Add key" description="Held in `keys`.">
        <p>Body</p>
      </SideSheet>
    </>,
  );
  expect(screen.getByText("worker", { selector: "code" })).toBeTruthy();
  expect(screen.getByText("keys", { selector: "code" })).toBeTruthy();
  expect(document.body.textContent).not.toContain("`");
});
