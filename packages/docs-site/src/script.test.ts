/// <reference lib="dom" />
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DOCS_SCRIPT } from "./script.js";

/**
 * The docs site's own script, run in a page of the shape the server draws: the phone navigation
 * sheet, the search dialog, the feedback form and the copy buttons.
 */

const PAGE = `
<a class="skip" href="#content">Skip</a>
<div class="layout">
<header class="topbar"><a class="iconbutton" href="#nav" data-nav-open>Menu</a></header>
<aside class="side" id="nav"><a class="iconbutton close" href="#" data-nav-close>Close</a><nav><a href="/x">X</a></nav></aside>
<div class="scrim" data-nav-close></div>
<div class="page"><main id="content">
<button type="button" data-copy="link" hidden><span>Copy link</span></button>
<button type="button" data-copy="page.md" hidden><span>Copy as Markdown</span></button>
<form class="feedback" id="feedback" method="post" action="/_feedback" data-feedback>
<div class="choices"><button type="submit" name="helpful" value="yes">Yes</button><button type="submit" name="helpful" value="no">No</button></div></form>
</main></div>
</div>
<a class="iconbutton" href="/_search" data-search>Search</a>
<script type="application/json" id="docs-data">{"base":"/","collections":[]}</script>`;

const answer = (body: unknown, ok = true) =>
  ({ ok, json: async () => body, text: async () => "# Page" }) as unknown as Response;

const run = () => {
  // The script is a module of the page's own: it is run as the browser would run it.
  new Function(DOCS_SCRIPT)();
};
const settle = () => new Promise((done) => setTimeout(done, 0));

beforeEach(() => {
  document.body.innerHTML = PAGE;
  // happy-dom has no <dialog> modal support worth relying on: a stand-in with the same surface.
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
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the phone navigation sheet", () => {
  test("takes focus, makes the page behind inert, and gives focus back on close", () => {
    run();
    const menu = document.querySelector<HTMLElement>("[data-nav-open]") as HTMLElement;
    menu.focus();
    menu.click();
    expect(document.body.classList.contains("nav-open")).toBe(true);
    expect(document.activeElement).toBe(document.querySelector(".side .close"));
    expect((document.querySelector(".page") as HTMLElement).inert).toBe(true);
    expect((document.querySelector(".topbar") as HTMLElement).inert).toBe(true);
    // The sheet itself is still reachable.
    expect((document.querySelector(".side") as HTMLElement).inert).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.body.classList.contains("nav-open")).toBe(false);
    expect((document.querySelector(".page") as HTMLElement).inert).toBe(false);
    expect(document.activeElement).toBe(menu);
  });

  test("the scrim closes it and puts focus back on the menu button", () => {
    run();
    const menu = document.querySelector<HTMLElement>("[data-nav-open]") as HTMLElement;
    menu.click();
    (document.querySelector(".scrim") as HTMLElement).click();
    expect(document.body.classList.contains("nav-open")).toBe(false);
    expect(document.activeElement).toBe(menu);
  });
});

describe("failures are said", () => {
  test("Copy as Markdown says when it could not copy, and then says what it was", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async () => answer({}));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
    run();
    const button = document.querySelector('[data-copy="page.md"]') as HTMLElement;
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.querySelector("span")?.textContent).toBe("Could not copy");
    await vi.advanceTimersByTimeAsync(1700);
    expect(button.querySelector("span")?.textContent).toBe("Copy as Markdown");
  });

  test("a vote that never reached the site keeps the form and says so", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    run();
    const form = document.querySelector("form[data-feedback]") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await settle();
    const note = form.querySelector(".feedback-note") as HTMLElement;
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toContain("could not be sent");
    expect(form.querySelector("button")?.hasAttribute("disabled")).toBe(false);
  });
});

describe("the search dialog", () => {
  const search = async (text: string) => {
    (document.querySelector("[data-search]") as HTMLElement).click();
    const input = document.querySelector(".finder input") as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event("input"));
    await new Promise((done) => setTimeout(done, 200));
    return input;
  };

  test("a search that fails says so, offers the full results and clears what was there", async () => {
    vi.stubGlobal("fetch", async () => answer({}, false));
    run();
    const input = await search("refund");
    const note = document.querySelector(".finder .none") as HTMLElement;
    expect(note.textContent).toContain("did not answer");
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/_search?q=refund");
    expect(document.querySelectorAll(".finder .list a")).toHaveLength(0);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  test("a network failure is the same, and a replaced search is not one", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    run();
    await search("refund");
    expect(document.querySelector(".finder .none")?.textContent).toContain("did not answer");
  });

  test("results are options directly in the listbox, in a group where there is a heading", async () => {
    vi.stubGlobal("fetch", async () =>
      answer({
        pages: [
          {
            url: "refunds",
            title: [{ text: "Refunds" }],
            crumb: "Support",
            places: [{ type: "heading", url: "refunds#full", words: [{ text: "Full" }] }],
          },
        ],
      }),
    );
    run();
    const input = await search("refund");
    const list = document.querySelector(".finder .list") as HTMLElement;
    expect(list.getAttribute("role")).toBe("listbox");
    for (const one of list.children) expect(one.getAttribute("role")).toBe("presentation");
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const count = document.querySelector(".finder .count") as HTMLElement;
    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.textContent).toBe("1 page");
  });

  test("recently viewed pages are a labelled group of options", async () => {
    localStorage.setItem("vd-recent:/", JSON.stringify([{ url: "a", title: "A", crumb: "" }]));
    run();
    (document.querySelector("[data-search]") as HTMLElement).click();
    const group = document.querySelector('.finder [role="group"]') as HTMLElement;
    expect(group.getAttribute("aria-label")).toBe("Recently viewed");
    expect(group.querySelectorAll('[role="option"]')).toHaveLength(1);
  });
});
