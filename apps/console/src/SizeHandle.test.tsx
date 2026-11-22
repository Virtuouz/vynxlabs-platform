// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Page, PageSize } from "@volvel/manifest";
import { afterEach, expect, test, vi } from "vitest";
import { snapSize, withSize } from "./screens/builder/pageKinds.ts";
import { SizeHandle } from "./screens/builder/SizeHandle.tsx";

afterEach(cleanup);

function draw(size: PageSize, width = 720) {
  const onSize = vi.fn();
  const onDrag = vi.fn();
  render(
    <div data-testid="frame">
      <SizeHandle size={size} onSize={onSize} onDrag={onDrag} snap={snapSize} />
    </div>,
  );
  const frame = screen.getByTestId("frame");
  frame.getBoundingClientRect = () => ({ width }) as DOMRect;
  return { onSize, onDrag, handle: screen.getByRole("slider", { name: "Size" }) };
}

test("the sizes snap to the nearest of the five", () => {
  expect(snapSize(300)).toBe("small");
  expect(snapSize(700)).toBe("medium");
  expect(snapSize(900)).toBe("large");
  expect(snapSize(1250)).toBe("xlarge");
  expect(snapSize(2000)).toBe("full");
});

test("a size is written on the page; medium, the default, is left out", () => {
  const page: Page = { id: "a", title: "A", kind: "sheet", widgets: [] };
  expect(withSize(page, "large").size).toBe("large");
  expect("size" in withSize({ ...page, size: "large" }, "medium")).toBe(false);
});

test("dragging the handle shows the size's name, and letting go writes the nearest size once", () => {
  const { handle, onSize, onDrag } = draw("medium");
  fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
  // The frame is centred: its edge goes half as far as the pointer.
  fireEvent.pointerMove(handle, { clientX: 620, pointerId: 1 });
  expect(screen.getByText("Large")).toBeTruthy();
  expect(onDrag).toHaveBeenLastCalledWith(960);
  expect(onSize).not.toHaveBeenCalled();
  fireEvent.pointerUp(handle, { clientX: 620, pointerId: 1 });
  expect(onSize).toHaveBeenCalledTimes(1);
  expect(onSize).toHaveBeenCalledWith("large");
  expect(onDrag).toHaveBeenLastCalledWith(undefined);
});

test("the arrow keys step through the sizes and stop at the ends", () => {
  const { handle, onSize } = draw("medium");
  expect(handle.getAttribute("aria-valuetext")).toBe("Medium");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(onSize).toHaveBeenLastCalledWith("large", "page-size");
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(onSize).toHaveBeenLastCalledWith("small", "page-size");
  cleanup();
  const first = draw("small");
  fireEvent.keyDown(first.handle, { key: "ArrowLeft" });
  expect(first.onSize).not.toHaveBeenCalled();
});
