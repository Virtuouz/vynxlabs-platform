// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { parse } from "@volvel/markup";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Doc } from "./index.ts";

/** The console's help panel draws pages through this `Doc`: a picture opens larger as it does on a served site. */
beforeEach(() => {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion"),
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const image = (src: string) => src;
const modal = () => document.querySelector<HTMLDialogElement>("dialog.vd-lightbox");

describe("a picture in a page opens larger", () => {
  test.each([
    ["the kit's own drawing", false],
    ["the page as it is served", true],
  ])("in %s: a button opens it, with its words as the caption", (_, asServed) => {
    render(
      <Doc
        tree={parse("![The deploy screen](./a.png)\n")}
        profile="docs"
        image={image}
        asServed={asServed}
      />,
    );
    const button = document.querySelector<HTMLElement>("button.vd-zoom");
    expect(button).not.toBeNull();
    (button as HTMLElement).focus();
    fireEvent.click(button as HTMLElement);
    const box = modal() as HTMLDialogElement;
    expect(box.open).toBe(true);
    expect(box.getAttribute("aria-label")).toBe("The deploy screen");
    expect(box.querySelector("img")?.getAttribute("src")).toBe("./a.png");
    expect(box.querySelector("figcaption")?.textContent).toBe("The deploy screen");
    expect(document.activeElement).toBe(box.querySelector(".vd-lightbox-close"));
  });

  test("closes with Escape, the button and a press outside, and focus goes back to the picture", () => {
    render(<Doc tree={parse("![A](./a.png)\n")} profile="docs" image={image} />);
    const button = document.querySelector<HTMLElement>("button.vd-zoom") as HTMLElement;
    for (const how of ["escape", "button", "outside"]) {
      button.focus();
      fireEvent.click(button);
      const box = modal() as HTMLDialogElement;
      if (how === "escape")
        fireEvent(box, new Event("cancel", { cancelable: true, bubbles: false }));
      if (how === "button") fireEvent.click(box.querySelector(".vd-lightbox-close") as HTMLElement);
      if (how === "outside") fireEvent.click(box);
      expect(modal()).toBeNull();
      expect(document.activeElement).toBe(button);
    }
  });

  test("a press on the picture inside leaves it open, and Tab stays on the close button", () => {
    render(<Doc tree={parse("![A](./a.png)\n")} profile="docs" image={image} />);
    fireEvent.click(document.querySelector("button.vd-zoom") as HTMLElement);
    const box = modal() as HTMLDialogElement;
    fireEvent.click(box.querySelector("img") as HTMLElement);
    expect(modal()).not.toBeNull();
    const kept = fireEvent.keyDown(box, { key: "Tab" });
    expect(kept).toBe(false);
    expect(document.activeElement).toBe(box.querySelector(".vd-lightbox-close"));
  });

  test("a picture inside a link stays the link's", () => {
    render(
      <Doc tree={parse("[![A](./a.png)](https://example.com)\n")} profile="docs" image={image} />,
    );
    expect(document.querySelector("button.vd-zoom")).toBeNull();
    expect(document.querySelector("a img")).not.toBeNull();
  });
});
