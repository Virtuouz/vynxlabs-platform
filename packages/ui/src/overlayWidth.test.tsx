// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Dialog } from "./Dialog.tsx";
import { SideSheet } from "./SideSheet.tsx";

afterEach(cleanup);

test("a side sheet opens at the width its maker chose, and the whole window less a margin for full", async () => {
  render(
    <SideSheet open onClose={() => {}} title="Detail" width={960}>
      body
    </SideSheet>,
  );
  const sheet = (await screen.findByRole("dialog")) as HTMLElement;
  expect(sheet.style.width).toBe("960px");
  expect(sheet.style.maxWidth).toBe("100vw");
  cleanup();
  render(
    <SideSheet open onClose={() => {}} title="Detail" width="full">
      body
    </SideSheet>,
  );
  expect(((await screen.findByRole("dialog")) as HTMLElement).style.width).toBe(
    "calc(100vw - 2rem)",
  );
});

test("a dialog opens at the width its maker chose and scrolls inside", async () => {
  render(
    <Dialog open onClose={() => {}} title="New" width={1200}>
      body
    </Dialog>,
  );
  const dialog = (await screen.findByRole("dialog")) as HTMLElement;
  expect(dialog.style.width).toBe("1200px");
  expect(dialog.style.maxWidth).toBe("calc(100vw - 2rem)");
  // The box keeps its header and footer; its body scrolls.
  expect(dialog.querySelector(".overflow-y-auto")).toBeTruthy();
  expect(dialog.className).toContain("max-h-[88vh]");
});
