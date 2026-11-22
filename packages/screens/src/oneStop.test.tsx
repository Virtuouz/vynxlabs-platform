// @vitest-environment happy-dom

// A widget on the builder's canvas is one stop: Enter goes in, Esc comes out.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useOneStop } from "./oneStop.ts";

afterEach(cleanup);

function Card({ active }: { active: boolean }) {
  const stop = useOneStop(active);
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: the card is the stop, as on the canvas
    <section ref={stop.ref} aria-label="card" tabIndex={0} {...stop.props}>
      <button type="button">One</button>
      <a href="#x">Two</a>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region, focusable so it can be scrolled */}
      <section tabIndex={0} aria-label="scroller" style={{ overflowX: "auto" }}>
        wide
      </section>
    </section>
  );
}

describe("one stop for a widget", () => {
  test("what is inside is out of the Tab order until Enter goes in", () => {
    render(<Card active />);
    expect(screen.getByRole("button", { name: "One" }).tabIndex).toBe(-1);
    expect(screen.getByRole("link", { name: "Two" }).tabIndex).toBe(-1);
    const card = screen.getByLabelText("card");
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(screen.getByRole("button", { name: "One" }).tabIndex).toBe(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "One" }));
  });

  test("a region that scrolls stays reachable, or it cannot be scrolled by key", () => {
    render(<Card active />);
    expect(screen.getByLabelText("scroller").tabIndex).toBe(0);
  });

  test("Esc comes back out to the card and shuts the inside again", () => {
    render(<Card active />);
    const card = screen.getByLabelText("card");
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "One" }), { key: "Escape" });
    expect(document.activeElement).toBe(card);
    expect(screen.getByRole("button", { name: "One" }).tabIndex).toBe(-1);
  });

  test("a click inside is being inside", () => {
    render(<Card active />);
    screen.getByRole("button", { name: "One" }).focus();
    expect(screen.getByRole("link", { name: "Two" }).tabIndex).toBe(0);
  });

  test("the served app is left as it is", () => {
    render(<Card active={false} />);
    expect(screen.getByRole("button", { name: "One" }).tabIndex).toBe(0);
  });
});
