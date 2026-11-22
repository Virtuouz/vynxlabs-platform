// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PageSize } from "@volvel/manifest";
import { afterEach, expect, test, vi } from "vitest";
import { snapSize } from "./screens/builder/pageKinds.ts";
import { SizeHandle } from "./screens/builder/SizeHandle.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// POLISH-008: what is dragged follows the pointer.
test("a frame drawn smaller is dragged at the scale it was taken hold of, whatever it is drawn at since", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 672,
    height: 100,
    top: 0,
    left: 0,
  } as DOMRect);
  const widths: (number | undefined)[] = [];
  const sizes: PageSize[] = [];
  const drawn = (scale: number) => (
    <SizeHandle
      size="xlarge"
      scale={scale}
      onDrag={(pixels) => widths.push(pixels)}
      onSize={(size) => sizes.push(size)}
      snap={snapSize}
    />
  );
  const { rerender } = render(drawn(0.56));
  const handle = screen.getByRole("slider", { name: "Size" });
  fireEvent.pointerDown(handle, { clientX: 1000, pointerId: 1 });
  // 672 on the screen is 1200 of its own; 67 px to the left takes 134 off the screen, 240 of its own.
  fireEvent.pointerMove(handle, { clientX: 933, pointerId: 1 });
  expect(Math.round(widths.at(-1) ?? 0)).toBe(961);
  // It is drawn at another scale now that it is smaller: the drag goes by the first.
  rerender(drawn(0.8));
  fireEvent.pointerMove(handle, { clientX: 933, pointerId: 1 });
  expect(Math.round(widths.at(-1) ?? 0)).toBe(961);
  fireEvent.pointerUp(handle, { clientX: 933, pointerId: 1 });
  expect(sizes).toEqual(["large"]);
});
