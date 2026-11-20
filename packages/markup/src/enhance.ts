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
})();
`;
