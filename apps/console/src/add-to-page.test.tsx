// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AddToPage } from "./screens/builder/AddToPage.tsx";

afterEach(cleanup);

const open = (onAdd = vi.fn(), onCarry = vi.fn()) => {
  render(
    <AddToPage open onClose={() => undefined} surface="app" onAdd={onAdd} onCarry={onCarry} />,
  );
  return { onAdd, onCarry, chart: screen.getByRole("button", { name: /^Chart/ }) };
};

describe("Add to page", () => {
  test("a click adds at the end, and doesn't carry (WCAG 2.5.7: dragging has a click)", () => {
    const { onAdd, onCarry, chart } = open();
    fireEvent.pointerDown(chart, { button: 0, pointerType: "mouse", clientX: 10, clientY: 10 });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 11, clientY: 10 }));
    });
    fireEvent.click(chart);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ type: "core/chart" }));
    expect(onCarry).not.toHaveBeenCalled();
  });

  test("dragged out of the list, a widget is carried from where the pointer is", () => {
    const { onAdd, onCarry, chart } = open();
    fireEvent.pointerDown(chart, { button: 0, pointerType: "mouse", clientX: 10, clientY: 10 });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 12, clientY: 11 }));
    });
    expect(onCarry).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 60, clientY: 40 }));
    });
    expect(onCarry).toHaveBeenCalledWith(expect.objectContaining({ type: "core/chart" }), {
      x: 60,
      y: 40,
    });
    // The rest of the press is the carry's: moving on doesn't carry it twice.
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 90, clientY: 90 }));
    });
    expect(onCarry).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText(/or drag onto the grid/)).toBeTruthy();
  });

  test("a finger scrolls the list and is not a carry", () => {
    const { onCarry, chart } = open();
    fireEvent.pointerDown(chart, { button: 0, pointerType: "touch", clientX: 10, clientY: 10 });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 200 }));
    });
    expect(onCarry).not.toHaveBeenCalled();
  });
});
