/**
 * The one script a served page of documentation carries. The page reads and
 * works without it: tabs are sections one under another, and a term shows
 * what it means when it is pointed at or reached by the keyboard, as its
 * stylesheet arranges. With it,
 * tabs become tabs, a term opens and closes as a button does, and on a phone
 * a site's navigation starts folded.
 *
 * It is served as a file from the page's own address. It reads nothing from
 * the address or from storage, and writes nothing into the page as HTML.
 */
export const ENHANCE_SCRIPT = `(() => {
  "use strict";
  let made = 0;
  for (const tabs of document.querySelectorAll("[data-vd-tabs]")) {
    const sections = [...tabs.children].filter((one) => one.classList.contains("vd-tab"));
    if (sections.length < 2) continue;
    const list = document.createElement("div");
    list.className = "vd-tablist";
    list.setAttribute("role", "tablist");
    const buttons = sections.map((section, index) => {
      const heading = section.querySelector(".vd-tab-label");
      const body = section.querySelector(".vd-tab-body");
      const id = "vd-tab-" + ++made;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vd-tab-button";
      button.id = id;
      button.setAttribute("role", "tab");
      button.textContent = heading ? heading.textContent : String(index + 1);
      if (heading) heading.hidden = true;
      if (body) {
        body.id = id + "-panel";
        body.setAttribute("role", "tabpanel");
        body.setAttribute("aria-labelledby", id);
        button.setAttribute("aria-controls", body.id);
      }
      list.append(button);
      return button;
    });
    let first = true;
    const show = (shown, focus) => {
      sections.forEach((section, index) => {
        const on = index === shown;
        section.hidden = !on;
        buttons[index].setAttribute("aria-selected", String(on));
        buttons[index].tabIndex = on ? 0 : -1;
      });
      // A tab chosen fades in, unless the reader asked for less motion.
      const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!first && !still && typeof sections[shown].animate === "function") {
        sections[shown].animate([{ opacity: 0, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }], {
          duration: 160,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        });
      }
      first = false;
      if (focus) buttons[shown].focus();
    };
    buttons.forEach((button, index) => {
      button.addEventListener("click", () => show(index, false));
      button.addEventListener("keydown", (event) => {
        const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (move) show((index + move + buttons.length) % buttons.length, true);
        if (event.key === "Home") show(0, true);
        if (event.key === "End") show(buttons.length - 1, true);
      });
    });
    tabs.prepend(list);
    tabs.classList.add("vd-tabs-on");
    show(0, false);
  }


  const terms = [...document.querySelectorAll(".vd-term")];
  const close = (term) => {
    term.classList.remove("vd-term-open");
    const word = term.querySelector(".vd-term-word");
    if (word) word.setAttribute("aria-expanded", "false");
  };
  for (const term of terms) {
    const word = term.querySelector(".vd-term-word");
    if (!word) continue;
    term.classList.add("vd-term-on");
    word.setAttribute("aria-expanded", "false");
    const toggle = () => {
      const open = !term.classList.contains("vd-term-open");
      for (const other of terms) close(other);
      if (open) {
        term.classList.add("vd-term-open");
        word.setAttribute("aria-expanded", "true");
      }
    };
    word.addEventListener("click", toggle);
    term.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && term.classList.contains("vd-term-open")) {
        close(term);
        word.focus();
      }
    });
  }
  document.addEventListener("click", (event) => {
    for (const term of terms) if (!term.contains(event.target)) close(term);
  });

  // A picture pressed opens larger: the whole of it, fitted to the window, its words as the caption.
  // It grows from where it is and goes back there, unless the reader asked for less motion.
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(0.2, 0, 0, 1)";
  let box = null, big = null, caption = null, closer = null, opener = null, closing = false;
  const seen = (button) => {
    const pictures = [...button.querySelectorAll("img")];
    return pictures.find((one) => getComputedStyle(one).display !== "none") || pictures[0];
  };
  const play = (node, frames, options, pseudo) => {
    if (still || typeof node.animate !== "function") return null;
    try { return node.animate(frames, pseudo ? { ...options, pseudoElement: "::backdrop" } : options); } catch (_) { return null; }
  };
  const fade = [{ opacity: 0 }, { opacity: 1 }];
  const hideBox = () => {
    if (!box || !box.open || closing) return;
    closing = true;
    const back = opener ? seen(opener) : null;
    const finish = () => {
      if (!closing) return;
      closing = false;
      box.close();
      const was = opener;
      opener = null;
      if (was && was.isConnected) was.focus();
    };
    const to = back ? back.getBoundingClientRect() : null;
    const from = big.getBoundingClientRect();
    const inView = to && to.width > 0 && to.bottom > 0 && to.top < window.innerHeight && to.right > 0 && to.left < window.innerWidth;
    const frames = inView && from.width > 0
      ? [{ transform: "none" }, { transform: "translate(" + (to.left - from.left) + "px," + (to.top - from.top) + "px) scale(" + to.width / from.width + "," + to.height / from.height + ")" }]
      : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }];
    const run = play(big, frames, { duration: 200, easing: EASE, fill: "forwards" });
    play(box, [...fade].reverse(), { duration: 200, easing: EASE, fill: "forwards" }, true);
    play(closer, [...fade].reverse(), { duration: 120, easing: EASE, fill: "forwards" });
    play(caption, [...fade].reverse(), { duration: 120, easing: EASE, fill: "forwards" });
    if (run) { run.onfinish = finish; run.oncancel = finish; setTimeout(finish, 400); } else finish();
  };
  const buildBox = () => {
    big = document.createElement("img");
    big.className = "vd-lightbox-img";
    caption = document.createElement("figcaption");
    caption.className = "vd-lightbox-caption";
    caption.setAttribute("aria-hidden", "true");
    const figure = document.createElement("figure");
    figure.className = "vd-lightbox-figure";
    figure.append(big, caption);
    closer = document.createElement("button");
    closer.type = "button";
    closer.className = "vd-lightbox-close";
    closer.setAttribute("aria-label", "Close");
    closer.textContent = "\\u00d7";
    box = document.createElement("dialog");
    box.className = "vd-lightbox";
    box.append(figure, closer);
    closer.addEventListener("click", hideBox);
    // A press anywhere but on the picture, its words or the button closes it.
    box.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".vd-lightbox-img, .vd-lightbox-caption, .vd-lightbox-close")) hideBox();
    });
    // Escape closes it as the page does: moving away, back to the picture.
    box.addEventListener("cancel", (event) => { event.preventDefault(); hideBox(); });
    // Nothing else in it can take focus, so Tab stays on the one button.
    box.addEventListener("keydown", (event) => {
      if (event.key === "Tab") { event.preventDefault(); closer.focus(); }
    });
  };
  const zoomIn = (button) => {
    const picture = seen(button);
    if (!picture || closing) return;
    if (!box) buildBox();
    opener = button;
    const words = picture.getAttribute("alt") || [...button.querySelectorAll("img")].map((one) => one.getAttribute("alt")).find(Boolean) || "";
    big.setAttribute("src", picture.getAttribute("src"));
    big.alt = words;
    if (picture.naturalWidth > 0) { big.width = picture.naturalWidth; big.height = picture.naturalHeight; }
    else { big.removeAttribute("width"); big.removeAttribute("height"); }
    caption.textContent = words;
    caption.hidden = !words;
    box.setAttribute("aria-label", words || "Larger picture");
    (button.closest(".vd-doc") || document.body).append(box);
    box.showModal();
    closer.focus();
    const from = picture.getBoundingClientRect();
    const to = big.getBoundingClientRect();
    const frames = from.width > 0 && to.width > 0
      ? [{ transform: "translate(" + (from.left - to.left) + "px," + (from.top - to.top) + "px) scale(" + from.width / to.width + "," + from.height / to.height + ")" }, { transform: "none" }]
      : [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }];
    play(big, frames, { duration: 260, easing: EASE });
    play(box, fade, { duration: 200, easing: EASE }, true);
    play(closer, fade, { duration: 200, easing: EASE });
    play(caption, fade, { duration: 200, easing: EASE });
  };
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-vd-zoom]") : null;
    if (button) { event.preventDefault(); zoomIn(button); }
  });
})();
`;
