// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MoveButtons } from "./MoveButtons.tsx";
import { useFlip, useKeys } from "./useFlip.ts";

afterEach(cleanup);

/** What was played, and from where: the browser's `animate`, written down. */
let played: { key: string; from: string }[] = [];
let reduced = false;
beforeEach(() => {
  played = [];
  reduced = false;
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  // Each row is 30 px tall, in the order it is in the page.
  HTMLElement.prototype.getBoundingClientRect = function () {
    const rows = [...(this.parentElement?.querySelectorAll("[data-flip-key]") ?? [])];
    const at = rows.indexOf(this);
    return { left: 0, top: at < 0 ? 0 : at * 30, width: 100, height: 30 } as DOMRect;
  };
  HTMLElement.prototype.animate = function (frames: Keyframe[]) {
    played.push({ key: this.dataset.flipKey ?? "", from: String(frames[0]?.transform) });
    return { finished: Promise.resolve() } as unknown as Animation;
  };
});

function Columns({ paused }: { paused?: boolean }) {
  const [order, setOrder] = useState(["name", "status", "fee"]);
  const list = useFlip<HTMLUListElement>(order.join(" "), paused ? { paused } : {});
  return (
    <ul ref={list}>
      {order.map((key, at) => (
        <li key={key} data-flip-key={key}>
          {key}
          <MoveButtons
            label={key}
            at={at}
            count={order.length}
            onMove={(by) => {
              const next = [...order];
              [next[at], next[at + by]] = [next[at + by] as string, next[at] as string];
              setOrder(next);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

test("a thing moved by its button is played from where it was, and so is the one it passed", () => {
  render(<Columns />);
  expect(played).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Move status up" }));
  expect([...document.querySelectorAll("li")].map((row) => row.dataset.flipKey)).toEqual([
    "status",
    "name",
    "fee",
  ]);
  // Status was one row lower and name one row higher; fee did not move and is not played.
  expect(played).toEqual([
    { key: "status", from: "translate(0px, 30px)" },
    { key: "name", from: "translate(0px, -30px)" },
  ]);
  expect(
    screen
      .getAllByRole("status")
      .map((one) => one.textContent)
      .filter(Boolean),
  ).toEqual(["status is now 1 of 3."]);
});

test("the first cannot go up and the last cannot go down", () => {
  render(<Columns />);
  expect(screen.getByRole("button", { name: "Move name up" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Move fee down" })).toHaveProperty("disabled", true);
});

test("nothing is played under reduced motion, or while a pointer is dragging", () => {
  reduced = true;
  render(<Columns />);
  fireEvent.click(screen.getByRole("button", { name: "Move status up" }));
  expect(played).toEqual([]);
  cleanup();
  reduced = false;
  render(<Columns paused />);
  fireEvent.click(screen.getByRole("button", { name: "Move status up" }));
  expect(played).toEqual([]);
});

test("things placed along a row are moved earlier and later", () => {
  render(<MoveButtons label="Loans" at={1} count={3} along="row" onMove={() => {}} />);
  expect(screen.getByRole("button", { name: "Move Loans earlier" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Move Loans later" })).toBeTruthy();
});

test("a name given to a place stays with its item when it moves or another is removed", () => {
  let held: ReturnType<typeof useKeys> | undefined;
  function Names({ count }: { count: number }) {
    held = useKeys(count);
    return null;
  }
  const { rerender } = render(<Names count={3} />);
  const [a, b, c] = [...(held?.keys ?? [])] as [string, string, string];
  held?.move(2, 0);
  rerender(<Names count={3} />);
  expect(held?.keys).toEqual([c, a, b]);
  held?.remove(1);
  rerender(<Names count={2} />);
  expect(held?.keys).toEqual([c, b]);
  rerender(<Names count={3} />);
  expect(held?.keys.slice(0, 2)).toEqual([c, b]);
  expect(new Set(held?.keys).size).toBe(3);
});
