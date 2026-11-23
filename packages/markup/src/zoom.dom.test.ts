// @vitest-environment happy-dom
/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ENHANCE_SCRIPT } from "./enhance.js";

/** The page's script, run on a page of the shape the renderer draws: a picture pressed opens it larger. */
const PAGE = `<div class="vd-doc">
<p><button type="button" class="vd-zoom" data-vd-zoom="" id="one"><img src="/a.png" alt="The deploy screen"></button></p>
<figure class="vd-screenshot"><button type="button" class="vd-zoom" data-vd-zoom="" id="pair"><img class="vd-shot-light" src="/l.png" alt="Pair" style="display:none"><img class="vd-shot-dark" src="/d.png" alt="" aria-hidden="true"></button></figure>
<a href="/x" id="after">after</a></div>`;

const run = (still = true) => {
  const media = (query: string) => ({
    matches: still && query.includes("reduced-motion"),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("matchMedia", media);
  window.matchMedia = media as never;
  new Function(ENHANCE_SCRIPT)();
};
// The script listens on the document, which outlives each test: its listeners are taken off after.
const added: [string, EventListenerOrEventListenerObject][] = [];
const modal = () => document.querySelector<HTMLDialogElement>("dialog.vd-lightbox");

beforeEach(() => {
  const original = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation(
    (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      added.push([type, listener]);
      original(type, listener, options);
    },
  );
  document.body.innerHTML = PAGE;
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  for (const [type, listener] of added.splice(0)) document.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the larger view of a picture", () => {
  test("opens on a press, shows the whole picture with its words as the caption, and is named", () => {
    run();
    const opener = document.getElementById("one") as HTMLElement;
    opener.focus();
    opener.click();
    const box = modal() as HTMLDialogElement;
    expect(box.open).toBe(true);
    expect(box.getAttribute("aria-label")).toBe("The deploy screen");
    expect(box.querySelector("img")?.getAttribute("src")).toBe("/a.png");
    expect(box.querySelector("figcaption")?.textContent).toBe("The deploy screen");
    expect(document.activeElement).toBe(box.querySelector(".vd-lightbox-close"));
  });

  test("closes with Escape, with the button and by a press outside, and gives focus back", () => {
    run();
    const opener = document.getElementById("one") as HTMLElement;
    for (const how of ["escape", "button", "outside"]) {
      opener.focus();
      opener.click();
      const box = modal() as HTMLDialogElement;
      expect(box.open).toBe(true);
      if (how === "escape") box.dispatchEvent(new Event("cancel", { cancelable: true }));
      if (how === "button") (box.querySelector(".vd-lightbox-close") as HTMLElement).click();
      if (how === "outside") box.click();
      expect(box.open).toBe(false);
      expect(document.activeElement).toBe(opener);
    }
  });

  test("a press on the picture inside does not close it", () => {
    run();
    (document.getElementById("one") as HTMLElement).click();
    (modal() as HTMLDialogElement).querySelector<HTMLElement>("img")?.click();
    expect(modal()?.open).toBe(true);
  });

  test("keeps focus inside: Tab stays on the close button", () => {
    run();
    (document.getElementById("one") as HTMLElement).click();
    const box = modal() as HTMLDialogElement;
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(box.querySelector(".vd-lightbox-close"));
  });

  test("a screenshot pair shows the look in view", () => {
    run();
    (document.getElementById("pair") as HTMLElement).click();
    const box = modal() as HTMLDialogElement;
    expect(box.querySelector("img")?.getAttribute("src")).toBe("/d.png");
    expect(box.querySelector("figcaption")?.textContent).toBe("Pair");
  });

  test("moves when it opens and closes, unless the reader asked for less", () => {
    const animate = vi.fn(() => ({ onfinish: null, oncancel: null, cancel() {} }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    run(false);
    (document.getElementById("one") as HTMLElement).click();
    expect(animate).toHaveBeenCalled();
    expect(modal()?.open).toBe(true);
  });

  test("does not move for a reader who asked for less", () => {
    const animate = vi.fn();
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    run(true);
    (document.getElementById("one") as HTMLElement).click();
    expect(animate).not.toHaveBeenCalled();
  });
});
