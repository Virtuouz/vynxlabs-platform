import { ENHANCE_SCRIPT } from "@volvel/markup";

/**
 * The script of a docs app: the page's own (tabs and terms), then the site's.
 * It reads what the page says of itself from `#docs-data`, a block of JSON
 * that is never run, writes nothing as HTML, and keeps only what a reader
 * opened last, in their own browser.
 */
export const DOCS_SCRIPT = `${ENHANCE_SCRIPT}
(() => {
  "use strict";
  const dataNode = document.getElementById("docs-data");
  let data = {};
  try { data = JSON.parse(dataNode ? dataNode.textContent : "{}"); } catch (_) { data = {}; }
  const base = data.base || "/";
  const make = (tag, attrs, children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === false || value === undefined || value === null) continue;
      if (key === "text") node.textContent = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children || []) if (child) node.append(child);
    return node;
  };
  const marked = (parts) => {
    const out = document.createDocumentFragment();
    for (const part of parts || []) out.append(part.hit ? make("mark", { text: part.text }) : document.createTextNode(part.text));
    return out;
  };

  // What a reader opened last, kept in their own browser, for an empty search.
  const RECENT = "vd-recent:" + base;
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || "[]"); } catch (_) { return []; } };
  if (data.page) {
    try {
      const kept = recent().filter((one) => one.url !== data.page.url);
      localStorage.setItem(RECENT, JSON.stringify([data.page, ...kept].slice(0, 5)));
    } catch (_) {}
  }

  // What opens and closes moves: a fold grows and shrinks, a menu fades. Less, when the reader asks for less.
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(0.2, 0, 0, 1)";
  const moving = new WeakMap();
  const settle = (node) => { const was = moving.get(node); if (was) was.cancel(); };
  const menuOf = (details) => details.classList.contains("switcher") ? details.querySelector(":scope > ul") : null;
  const heightOf = (details, open) => {
    const was = details.open;
    details.open = open;
    const height = details.getBoundingClientRect().height;
    details.open = was;
    return height;
  };
  const fold = (details, open) => {
    if (details.open === open && !moving.get(details)) return;
    settle(details);
    const menu = menuOf(details);
    if (still || typeof details.animate !== "function") { details.open = open; return; }
    if (menu) {
      if (open) details.open = true;
      const frames = [{ opacity: 0, transform: "translateY(-6px) scale(0.98)" }, { opacity: 1, transform: "none" }];
      const run = menu.animate(open ? frames : [...frames].reverse(), { duration: open ? 160 : 120, easing: EASE });
      moving.set(details, run);
      run.onfinish = () => { moving.delete(details); if (!open) details.open = false; };
      run.oncancel = () => moving.delete(details);
      return;
    }
    const from = details.getBoundingClientRect().height;
    const to = heightOf(details, open);
    details.open = true;
    details.style.overflow = "hidden";
    const run = details.animate({ height: [from + "px", to + "px"] }, { duration: 200, easing: EASE });
    moving.set(details, run);
    const done = () => { moving.delete(details); details.style.overflow = ""; details.open = open; };
    run.onfinish = done;
    run.oncancel = () => { moving.delete(details); details.style.overflow = ""; };
  };
  for (const details of document.querySelectorAll("details")) {
    const summary = details.querySelector(":scope > summary");
    if (!summary) continue;
    summary.addEventListener("click", (event) => {
      // A link in a folder's row leads to its page; the chevron beside it opens and closes.
      if (event.target instanceof Element && event.target.closest("a")) return;
      event.preventDefault();
      fold(details, !details.open);
    });
  }
  // A menu closes when the reader clicks anywhere else, or presses Escape.
  document.addEventListener("pointerdown", (event) => {
    for (const open of document.querySelectorAll("details.switcher[open]")) {
      if (!open.contains(event.target)) fold(open, false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const open of document.querySelectorAll("details.switcher[open]")) {
      fold(open, false);
      const summary = open.querySelector(":scope > summary");
      if (summary) summary.focus();
    }
  });

  // The navigation, on a narrow screen.
  // It is a sheet over the page: focus goes into it, the page behind cannot be reached while it
  // is open, and focus goes back to the button that opened it.
  const body = document.body;
  const behind = () => [...document.querySelectorAll(".topbar, .page")];
  const openNav = () => {
    body.classList.add("nav-open");
    for (const part of behind()) part.inert = true;
    const first = document.querySelector(".side .close");
    if (first) first.focus();
  };
  const closeNav = (giveBack) => {
    if (!body.classList.contains("nav-open")) return;
    body.classList.remove("nav-open");
    for (const part of behind()) part.inert = false;
    if (!giveBack) return;
    const opener = document.querySelector("[data-nav-open]");
    if (opener) opener.focus();
  };
  for (const opener of document.querySelectorAll("[data-nav-open]")) {
    opener.addEventListener("click", (event) => { event.preventDefault(); openNav(); });
  }
  for (const closer of document.querySelectorAll("[data-nav-close]")) {
    closer.addEventListener("click", (event) => { event.preventDefault(); closeNav(true); });
  }
  // A window made wide enough for the navigation to sit beside the page is not a sheet any more.
  if (window.matchMedia) {
    const wide = window.matchMedia("(min-width: 1024px)");
    wide.addEventListener("change", () => { if (wide.matches) closeNav(false); });
  }
  if (location.hash === "#nav") history.replaceState(null, "", location.pathname + location.search);

  // A short word that says what happened, said for everyone: a note on the screen that a reader of it hears too.
  let toast = null;
  let toastTimer = 0;
  const announce = (text) => {
    if (!toast) { toast = make("p", { class: "toast", role: "status" }); document.body.append(toast); }
    toast.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.textContent = ""; }, 1800);
  };

  // Copy as Markdown, the page's address, and a heading's own address.
  for (const button of document.querySelectorAll("[data-copy]")) {
    const what = button.getAttribute("data-copy");
    const anchor = what.charAt(0) === "#";
    if (!anchor) button.hidden = false;
    const label = button.querySelector("span");
    const said = label ? label.textContent : "";
    const tell = (words) => {
      if (anchor) { announce(words); return; }
      if (label) { label.textContent = words; setTimeout(() => { label.textContent = said; }, 1600); }
    };
    button.addEventListener("click", async () => {
      try {
        // The link itself goes to the heading; what is copied is the address it goes to.
        const text = anchor
          ? new URL(what, location.href).href
          : what === "link"
            ? location.href.split("#")[0]
            : await (await fetch(what, { credentials: "same-origin" })).text();
        await navigator.clipboard.writeText(text);
        tell(anchor ? "Link copied" : "Copied");
      } catch (_) {
        // The clipboard was refused, or the page could not be fetched: say so, for as long as "Copied" would show.
        tell("Could not copy");
      }
    });
  }

  // Light, dark or the system's: the choice is kept in this browser, where the page's first script reads it.
  const themeKey = data.themeKey || "vd-theme";
  const readChoice = () => {
    try {
      const raw = localStorage.getItem(themeKey);
      const value = themeKey === "vd-theme" ? raw : JSON.parse(raw);
      return value === "light" || value === "dark" ? value : "system";
    } catch (_) { return "system"; }
  };
  const showChoice = () => {
    const choice = readChoice();
    if (choice === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    for (const button of document.querySelectorAll("[data-theme-choice]")) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-theme-choice") === choice));
    }
  };
  for (const group of document.querySelectorAll("[data-themes]")) {
    group.hidden = false;
    for (const button of group.querySelectorAll("[data-theme-choice]")) {
      button.addEventListener("click", () => {
        const choice = button.getAttribute("data-theme-choice");
        try {
          if (choice === "system") localStorage.removeItem(themeKey);
          else localStorage.setItem(themeKey, themeKey === "vd-theme" ? choice : JSON.stringify(choice));
        } catch (_) {
          // Storage is refused: the choice holds for this page only.
        }
        if (choice === "system") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = choice;
        for (const other of document.querySelectorAll("[data-theme-choice]")) {
          other.setAttribute("aria-pressed", String(other.getAttribute("data-theme-choice") === choice));
        }
      });
    }
  }
  showChoice();
  // Another tab of the site (or the console) changed it.
  addEventListener("storage", (event) => { if (event.key === themeKey) showChoice(); });

  // What is on the page: the heading being read is marked, beside the page and over it.
  const tocLinks = [...document.querySelectorAll(".toc li a[href^='#'], .tocbar li a[href^='#']")];
  const now = document.querySelector(".tocbar .now");
  const ring = document.querySelector(".tocbar .ring");
  const headings = [...new Set(tocLinks.map((link) => decodeURIComponent(link.getAttribute("href").slice(1))))]
    .map((id) => document.getElementById(id)).filter(Boolean);
  const mark = () => {
    let current = headings[0];
    for (const heading of headings) if (heading.getBoundingClientRect().top < 120) current = heading;
    for (const link of tocLinks) {
      const on = current && link.getAttribute("href") === "#" + current.id;
      if (on) link.setAttribute("aria-current", "true"); else link.removeAttribute("aria-current");
    }
    if (now && current) now.textContent = [...current.childNodes].filter((node) => !(node.classList && node.classList.contains("anchor"))).map((node) => node.textContent).join("");
    if (ring) {
      const max = document.documentElement.scrollHeight - innerHeight;
      ring.style.setProperty("--read", (max > 0 ? Math.min(100, Math.round((scrollY / max) * 100)) : 100) + "%");
    }
  };
  if (headings.length > 0) {
    addEventListener("scroll", mark, { passive: true });
    mark();
  }
  for (const link of document.querySelectorAll(".tocbar a")) {
    link.addEventListener("click", () => { const bar = link.closest("details"); if (bar) fold(bar, false); });
  }

  // A diagram is drawn by the instance's own drawing script, fetched only for a page that has one.
  if (document.querySelector("[data-vd-mermaid]")) {
    (data.search && data.search.kind === "static" ? import(data.platform + "diagrams.js") : import("/_platform/diagrams.js")).then((drawing) => drawing.drawAll(document)).catch(() => {});
  }

  // Whether a page helped: said without leaving the page. Without script, the form is sent as it is.
  for (const form of document.querySelectorAll("form[data-feedback]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pressed = event.submitter;
      const body = new URLSearchParams(new FormData(form));
      if (pressed && pressed.name) body.set(pressed.name, pressed.value);
      for (const button of form.querySelectorAll("button")) button.disabled = true;
      try {
        const answer = await fetch(form.action, {
          method: "POST",
          body,
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        const thanks = make("p", { class: "feedback", id: "feedback", role: "status" });
        thanks.textContent = answer.ok ? "Thank you for saying." : "Your answer could not be kept. Try again later.";
        form.replaceWith(thanks);
      } catch (_) {
        for (const button of form.querySelectorAll("button")) button.disabled = false;
        // Nothing reached the site: the form stays, so it can be sent again, and says why.
        let note = form.querySelector(".feedback-note");
        if (!note) { note = make("p", { class: "feedback-note", role: "status" }); form.append(note); }
        note.textContent = "Your answer could not be sent. Check your connection and try again.";
      }
    });
  }

  // What a search finds: from the server, or, on a site served as files, from the indexes it carries.
  const fixed = data.search && data.search.kind === "static" ? data.search : null;
  // A page's address: on a site served as files it ends in a slash, before any part of the page.
  const to = (url) => {
    if (!fixed) return base + url;
    const [path, part] = url.split("#");
    return base + (path && !path.endsWith("/") ? path + "/" : path) + (part === undefined ? "" : "#" + part);
  };
  const answerOf = async (asked, inside, type, signal) => {
    if (fixed) {
      const searching = await import(fixed.module);
      return await searching.search(fixed.index, asked, { collection: inside, type });
    }
    const address = base + "_search.json?q=" + encodeURIComponent(asked) + (inside ? "&in=" + encodeURIComponent(inside) : "") + (type ? "&type=" + encodeURIComponent(type) : "");
    const answer = await fetch(address, { signal, credentials: "same-origin" });
    return answer.ok ? await answer.json() : null;
  };

  // The search page of a site served as files: the question is in the address, and answered here.
  const results = document.querySelector("[data-static-results]");
  if (fixed && results) {
    const params = new URLSearchParams(location.search);
    const asked = (params.get("q") || "").trim();
    const field = document.querySelector("form.search-form input[name=q]");
    if (field) field.value = asked;
    const all = document.getElementById("vd-all-pages");
    if (asked) {
      if (all) all.hidden = true;
      results.replaceChildren(make("p", { class: "muted", text: "Searching\u2026" }));
      answerOf(asked, params.get("in") || "", params.get("type") || "").then((found) => {
        const pages = found ? found.pages || [] : null;
        if (pages === null) {
          results.replaceChildren(make("p", { class: "muted", text: "The search did not answer. Try again later." }));
          if (all) all.hidden = false;
        } else if (pages.length === 0) {
          results.replaceChildren(make("p", { class: "muted", text: "Nothing here matches \u201c" + asked + "\u201d." }));
        } else {
          results.replaceChildren(make("ul", { class: "results" }, pages.map((page) => make("li", {}, [
            make("a", { href: to(page.url) }, [marked(page.title)]),
            page.crumb ? make("small", { text: page.crumb }) : null,
            ...page.places.slice(0, 2).map((place) => make("p", {}, [marked(place.words)])),
          ]))));
        }
      }).catch(() => {
        results.replaceChildren(make("p", { class: "muted", text: "The search did not answer. Try again later." }));
        if (all) all.hidden = false;
      });
    }
  }

  // Search, as it is typed, in a dialog.
  const triggers = [...document.querySelectorAll("[data-search]")];
  if (triggers.length === 0 || typeof HTMLDialogElement === "undefined") return;
  let dialog, input, list, note, count, chips, active = -1, scope = data.collection || "", kind = "", timer, asking;
  const items = () => [...list.querySelectorAll("a")];
  const activate = (index) => {
    const all = items();
    if (all.length === 0) { active = -1; return; }
    active = (index + all.length) % all.length;
    all.forEach((one, at) => one.classList.toggle("active", at === active));
    all[active].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", all[active].id);
  };
  // Said under the list, for what is not a result: nothing found, or no answer.
  const say = (words, link) => {
    note.replaceChildren(document.createTextNode(words));
    if (link) note.append(document.createTextNode(" "), link);
  };
  const show = (pages, asked) => {
    list.replaceChildren();
    note.replaceChildren();
    let made = 0;
    const id = () => "vd-hit-" + ++made;
    if (!asked) {
      const kept = recent();
      const group = make("ul", { role: "group", "aria-label": "Recently viewed" });
      if (kept.length > 0) {
        list.append(make("li", { class: "heading", role: "presentation", "aria-hidden": "true", text: "Recently viewed" }));
        list.append(make("li", { role: "presentation" }, [group]));
      }
      for (const one of kept) {
        group.append(make("li", { role: "presentation" }, [make("a", { class: "hit", href: to(one.url), id: id(), role: "option" }, [
          make("span", { class: "badge", "aria-hidden": "true", text: "\\u21ba" }),
          make("span", { class: "words" }, [make("span", { text: one.title }), one.crumb ? make("small", { text: one.crumb }) : null]),
        ])]));
      }
      count.textContent = "";
    } else if (pages.length === 0) {
      say("Nothing here matches \\u201c" + asked + "\\u201d.");
      count.textContent = "";
    } else {
      for (const page of pages) {
        const words = make("span", { class: "words" }, [make("span", {}, [marked(page.title)]), page.crumb ? make("small", { text: page.crumb }) : null]);
        list.append(make("li", { role: "presentation" }, [make("a", { class: "hit", href: to(page.url), id: id(), role: "option" }, [
          make("span", { class: "badge", "aria-hidden": "true", text: "\\u2630" }), words,
        ])]));
        for (const place of page.places) {
          list.append(make("li", { role: "presentation" }, [make("a", { class: "place", href: to(place.url), id: id(), role: "option" }, [
            make("b", { "aria-hidden": "true", text: place.type === "heading" ? "#" : "\\u2261" }),
            make("span", {}, [marked(place.words)]),
          ])]));
        }
      }
      count.textContent = pages.length + (pages.length === 1 ? " page" : " pages");
    }
    active = -1;
    if (input) input.setAttribute("aria-expanded", String(items().length > 0));
    if (asked) activate(0);
  };
  // A search that got no answer says so, clears what the last one found, and offers the full results page.
  const failed = (asked) => {
    list.replaceChildren();
    count.textContent = "";
    active = -1;
    input.removeAttribute("aria-activedescendant");
    input.setAttribute("aria-expanded", "false");
    say("The search did not answer.", make("a", { href: base + (data.search && data.search.kind === "static" ? "_search/" : "_search") + "?q=" + encodeURIComponent(asked) + (scope ? "&in=" + encodeURIComponent(scope) : "") + (kind ? "&type=" + encodeURIComponent(kind) : ""), text: "Open the full results" }));
  };
  const ask = () => {
    const asked = input.value.trim();
    clearTimeout(timer);
    if (!asked) { show([], ""); return; }
    timer = setTimeout(async () => {
      if (asking) asking.abort();
      asking = new AbortController();
      try {
        const found = await answerOf(asked, scope, kind, asking.signal);
        if (!found) { if (input.value.trim() === asked) failed(asked); return; }
        if (input.value.trim() === asked) show(found.pages || [], asked);
      } catch (error) {
        // A search that was replaced by the next key is not a failure.
        if (error && error.name === "AbortError") return;
        if (input.value.trim() === asked) failed(asked);
      }
    }, 120);
  };
  const build = () => {
    input = make("input", { type: "search", placeholder: "Search", "aria-label": "Search", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": "vd-results", "aria-autocomplete": "list" });
    list = make("ul", { class: "list", id: "vd-results", role: "listbox" });
    count = make("span", { class: "count", role: "status", "aria-live": "polite" });
    note = make("div", { class: "none", role: "status" });
    const close = make("button", { type: "button", class: "key", text: "Esc", "aria-label": "Close" });
    chips = make("div", { class: "chips", role: "group", "aria-label": "Where to search" });
    // A collection with no id is the pages that are in none: search cannot be narrowed to them, and "All" covers them.
    const collections = [{ id: "", title: "All" }, ...(data.collections || []).filter((one) => one.id)];
    if (collections.length > 2) {
      for (const one of collections) {
        const chip = make("button", { type: "button", text: one.title, "aria-pressed": String(one.id === scope) });
        chip.addEventListener("click", () => {
          scope = one.id;
          for (const other of chips.children) other.setAttribute("aria-pressed", String(other === chip));
          ask();
          input.focus();
        });
        chips.append(chip);
      }
    }
    // A site with typed pages can be searched by what the reader is doing.
    const kinds = make("div", { class: "chips", role: "group", "aria-label": "Kind of page" });
    if ((data.types || []).length > 0) {
      for (const one of [{ id: "", title: "Any kind" }, ...data.types]) {
        const chip = make("button", { type: "button", text: one.title, "aria-pressed": String(one.id === kind) });
        chip.addEventListener("click", () => {
          kind = one.id;
          for (const other of kinds.children) other.setAttribute("aria-pressed", String(other === chip));
          ask();
          input.focus();
        });
        kinds.append(chip);
      }
    }
    const key = (text) => make("kbd", { class: "key", text });
    dialog = make("dialog", { class: "finder", "aria-label": "Search" }, [
      make("div", { class: "bar" }, [make("span", { "aria-hidden": "true", text: "\\u2315" }), input, close]),
      chips.children.length > 0 ? chips : null,
      kinds.children.length > 0 ? kinds : null,
      make("div", { class: "results" }, [list, note]),
      make("div", { class: "keys" }, [
        make("span", {}, [key("\\u2191"), key("\\u2193"), document.createTextNode(" Move")]),
        make("span", {}, [key("\\u21b5"), document.createTextNode(" Open")]),
        make("span", {}, [key("esc"), document.createTextNode(" Close")]),
        count,
      ]),
    ]);
    close.addEventListener("click", () => hide());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) hide(); });
    // Escape closes it as everything else does: moving away.
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); hide(); });
    input.addEventListener("input", ask);
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); activate(active + 1); }
      if (event.key === "ArrowUp") { event.preventDefault(); activate(active - 1); }
      if (event.key === "Enter") {
        const all = items();
        if (all[active]) { event.preventDefault(); location.href = all[active].href; }
      }
    });
    list.addEventListener("click", () => hide());
    body.append(dialog);
  };
  const FRAMES = [{ opacity: 0, transform: "translateY(-8px) scale(0.98)" }, { opacity: 1, transform: "none" }];
  const BACKDROP = [{ opacity: 0 }, { opacity: 1 }];
  const motion = (frames, options, pseudo) => {
    if (still || typeof dialog.animate !== "function") return null;
    try { return dialog.animate(frames, pseudo ? { ...options, pseudoElement: "::backdrop" } : options); } catch (_) { return null; }
  };
  let hiding = false;
  function hide() {
    if (!dialog || !dialog.open || hiding) return;
    hiding = true;
    const run = motion([...FRAMES].reverse(), { duration: 140, easing: EASE });
    motion([...BACKDROP].reverse(), { duration: 140, easing: EASE }, true);
    const done = () => { hiding = false; dialog.close(); };
    if (run) { run.onfinish = done; run.oncancel = done; } else done();
  }
  const open = (event) => {
    if (event) event.preventDefault();
    if (!dialog) build();
    closeNav(false);
    if (!dialog.open) {
      dialog.showModal();
      motion(FRAMES, { duration: 180, easing: EASE });
      motion(BACKDROP, { duration: 180, easing: EASE }, true);
    }
    input.select();
    ask();
  };
  for (const trigger of triggers) trigger.addEventListener("click", open);
  addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") open(event);
    else if (event.key === "/" && !typing) open(event);
    else if (event.key === "Escape" && body.classList.contains("nav-open")) closeNav(true);
  });
})();
`;
