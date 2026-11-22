// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LIFTED, useSortable } from "./useSortable.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function List({ log }: { log: string[][] }) {
  const [ids, setIds] = useState(["a", "b", "c"]);
  const sort = useSortable({
    ids,
    nameOf: (id) => id.toUpperCase(),
    onReorder: (next) => {
      log.push(next);
      setIds(next);
    },
  });
  return (
    <>
      <ul ref={sort.list} aria-label="things">
        {ids.map((id) => (
          <li key={id} data-testid={id} {...sort.row(id)} className={LIFTED}>
            <button type="button" aria-label={`grip ${id}`} {...sort.handle(id)} />
          </li>
        ))}
      </ul>
      <p role="status">{sort.said}</p>
    </>
  );
}

const place = () => {
  for (const [at, id] of ["a", "b", "c"].entries()) {
    screen.getByTestId(id).getBoundingClientRect = () =>
      ({ top: 100 + at * 20, height: 20, bottom: 120 + at * 20 }) as DOMRect;
  }
};
const order = () => [...screen.getAllByRole("listitem")].map((one) => one.dataset.testid);

test("the dragged row follows the pointer, the others slide, and the order is handed over after it settles", () => {
  const log: string[][] = [];
  render(<List log={log} />);
  place();
  const grip = screen.getByLabelText("grip a");
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 110 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientY: 135 });
  expect(screen.getByTestId("a").style.transform).toBe("translateY(25px)");
  expect(screen.getByTestId("a").style.transition).toBe("none");
  expect(screen.getByTestId("a").hasAttribute("data-dragging")).toBe(true);
  // Past the middle of B: B slides up into A's place, over time and not at once.
  expect(screen.getByTestId("b").style.transform).toBe("translateY(-20px)");
  expect(screen.getByTestId("b").style.transition).toContain("180ms");
  fireEvent.pointerUp(grip, { pointerId: 1, clientY: 135 });
  // Settling: it slides to its slot (20px down), and nothing is handed over yet.
  expect(screen.getByTestId("a").style.transform).toBe("translateY(20px)");
  expect(screen.getByTestId("a").style.transition).toContain("180ms");
  expect(log).toEqual([]);
  act(() => {
    vi.advanceTimersByTime(250);
  });
  expect(log).toEqual([["b", "a", "c"]]);
  expect(order()).toEqual(["b", "a", "c"]);
  // The inline motion is gone with the drag: nothing is left to pop back.
  expect(screen.getByTestId("a").style.transform).toBe("");
  expect(screen.getByRole("status").textContent).toBe("Moved A to position 2 of 3");
});

test("Esc slides it back and changes nothing", () => {
  const log: string[][] = [];
  render(<List log={log} />);
  place();
  const grip = screen.getByLabelText("grip a");
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 110 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientY: 150 });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByTestId("a").style.transform).toBe("translateY(0px)");
  act(() => {
    vi.advanceTimersByTime(250);
  });
  expect(log).toEqual([]);
  expect(order()).toEqual(["a", "b", "c"]);
  expect(screen.getByTestId("a").style.transform).toBe("");
});

test("under reduced motion nothing is animated, and a drop is handed over at once", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const log: string[][] = [];
  render(<List log={log} />);
  place();
  const grip = screen.getByLabelText("grip a");
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 110 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientY: 160 });
  expect(screen.getByTestId("b").style.transition).toBe("none");
  fireEvent.pointerUp(grip, { pointerId: 1, clientY: 160 });
  expect(log).toEqual([["b", "c", "a"]]);
  vi.unstubAllGlobals();
});

test("Up and Down on the handle move a row one place and keep the focus on it", () => {
  const log: string[][] = [];
  render(<List log={log} />);
  const grip = screen.getByLabelText("grip a");
  grip.focus();
  fireEvent.keyDown(grip, { key: "ArrowDown" });
  expect(log).toEqual([["b", "a", "c"]]);
  expect(document.activeElement).toBe(screen.getByLabelText("grip a"));
  fireEvent.keyDown(screen.getByLabelText("grip a"), { key: "ArrowUp" });
  expect(order()).toEqual(["a", "b", "c"]);
});
