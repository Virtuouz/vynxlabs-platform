import { buildDocSet, readPage } from "@volvel/docs-engine";
import { DOC_CSS, parse, renderHtml } from "@volvel/markup";
import { describe, expect, test } from "vitest";
import { DOCS_CSS, docPage, pageAt, type SiteView, THEME_SCRIPT } from "./index.js";

/** Type that grows with the window, a heading for each level, anchors, a deeper contents list, and the theme script (phase 33). */

const body = [
  "# One",
  "",
  "Text.",
  "",
  "## Two",
  "",
  "### Three",
  "",
  "#### Four",
  "",
  "##### Five",
  "",
  "```",
  "## Not a heading",
  "```",
  "",
].join("\n");
const { set } = buildDocSet([
  readPage("index", "---\ntitle: Home\n---\n\nHello.\n").entry,
  readPage("a", `---\ntitle: A\n---\n\n${body}`).entry,
]);
const view: SiteView = { title: "Docs", set, base: "/", look: { themeHref: "/theme.css" } };

describe("body type and the heading scale", () => {
  test("body text is 16px on a phone and 20px from about 1440px wide, and reads at 1.65", () => {
    const clamp = /--body: clamp\(([^)]*)\)/.exec(DOCS_CSS)?.[1] ?? "";
    // In px: a tenant's theme may set the root size, and the body must not follow it.
    expect(clamp).toBe("16px, 14.4px + 0.45vw, 20px");
    // The preferred value in px at a width: 16px is the floor, 20px the ceiling.
    const at = (width: number) => Math.min(20, Math.max(16, 0.9 * 16 + 0.0045 * width));
    expect(at(390)).toBeLessThan(16.2);
    expect(at(320)).toBe(16);
    expect(at(1440)).toBe(20);
    expect(at(2560)).toBe(20);
    expect(DOCS_CSS).toMatch(/\.vd-doc \{ font-size: var\(--body\); line-height: 1\.65; \}/);
    expect(DOCS_CSS).toContain("max-width: 72ch");
  });

  test("the page's title, lead and contents are steps of the same size", () => {
    expect(DOCS_CSS).toMatch(/\.lead h1 \{[^}]*font-size: calc\(var\(--body\) \* 2\.4\)/);
    expect(DOCS_CSS).toMatch(/\.lead > p \{[^}]*font-size: calc\(var\(--body\) \* 1\.15\)/);
    expect(DOCS_CSS).toMatch(/\.toc \{[^}]*font-size: calc\(var\(--body\) \* 0\.8125\)/);
  });

  test("h2 to h6 are each a size of their own, falling from h2, and none is the body's but h6, which is set apart in small caps", () => {
    const sizes = [2, 3, 4, 5, 6].map((level) => {
      const rule = new RegExp(`\\n\\.vd-doc h${level} \\{([^}]*)\\}`).exec(DOC_CSS)?.[1] ?? "";
      return { rule, size: Number(/font-size: ([\d.]+)em/.exec(rule)?.[1]) };
    });
    expect(sizes.map((one) => one.size)).toEqual([2, 1.6, 1.3, 1.1, 1]);
    for (const one of sizes.slice(0, 4)) expect(one.size).toBeGreaterThan(1);
    expect(sizes[4]?.rule).toContain("small-caps");
    // Em of the body: a site that grows its body grows the headings.
    expect(DOC_CSS).not.toMatch(/\.vd-doc h[2-6] \{[^}]*font-size: [\d.]+px/);
  });
});

describe("heading anchors", () => {
  const page = docPage(view, "a");

  test("every heading of a served page links to itself, with a name for a screen reader", () => {
    for (const [level, id] of [
      [2, "one"],
      [3, "two"],
      [4, "three"],
      [5, "four"],
      [6, "five"],
    ] as const) {
      expect(page).toContain(
        `<h${level} id="${id}">${id[0]?.toUpperCase()}${id.slice(1)}<a class="anchor" href="#${id}" data-copy="#${id}" aria-label="Link to this section">#</a></h${level}>`,
      );
    }
  });

  test("a heading written inside a code block is not one", () => {
    expect(page).toContain("## Not a heading");
    expect(page.match(/class="anchor"/g)).toHaveLength(5);
  });

  test("the console's own Doc does not get them", () => {
    expect(renderHtml(parse("# One\n\n## Two\n"))).not.toContain("anchor");
  });

  test("CSS shows one while its heading is hovered or it has focus, and always where there is no hover", () => {
    expect(DOCS_CSS).toMatch(/\.vd-doc \.anchor \{[^}]*opacity: 0/);
    expect(DOCS_CSS).toMatch(
      /:is\(h2, h3, h4, h5, h6\):hover > \.anchor, \.vd-doc \.anchor:focus-visible \{ opacity: 1; \}/,
    );
    expect(DOCS_CSS).toMatch(/@media \(hover: none\) \{ \.vd-doc \.anchor \{ opacity: 1; \} \}/);
  });
});

describe("On this page", () => {
  test("lists # to ### as levels 1 to 3, in the side list and the phone's bar, and no deeper", () => {
    const page = docPage(view, "a");
    const items = [...page.matchAll(/<li data-level="(\d)"><a href="#([a-z]+)">/g)].map((one) => [
      one[1],
      one[2],
    ]);
    // Once in each list.
    expect(items).toEqual([
      ["1", "one"],
      ["2", "two"],
      ["3", "three"],
      ["1", "one"],
      ["2", "two"],
      ["3", "three"],
    ]);
    expect(page).not.toContain('href="#four"><');
    expect(page).not.toContain('class="deep"');
  });

  test("a page that starts at ## or deeper is drawn from h2 and lists three levels from its top one", () => {
    const text = "## Top\n\n### Mid\n\n#### Low\n\n##### Deeper\n";
    const { set: deep } = buildDocSet([
      readPage("index", "---\ntitle: Home\n---\n\nHello.\n").entry,
      readPage("d", `---\ntitle: D\n---\n\n${text}`).entry,
    ]);
    const page = docPage({ ...view, set: deep }, "d");
    expect(page).toContain('<h2 id="top">');
    expect(page).toContain('<h3 id="mid">');
    expect(page).toContain('<h4 id="low">');
    expect(page).toContain('<h5 id="deeper">');
    const ids = [...page.matchAll(/<li data-level="(\d)"><a href="#([a-z]+)">/g)].map(
      (one) => `${one[1]}${one[2]}`,
    );
    expect(ids).toEqual(["1top", "2mid", "3low", "1top", "2mid", "3low"]);
  });

  test("each level is indented a step more, in both lists", () => {
    expect(DOCS_CSS).toMatch(
      /\.toc li\[data-level="2"\] a, \.tocbar li\[data-level="2"\] a \{ padding-left: 26px; \}/,
    );
    expect(DOCS_CSS).toMatch(
      /\.toc li\[data-level="3"\] a, \.tocbar li\[data-level="3"\] a \{ padding-left: 38px; \}/,
    );
  });
});

/** Runs the before-paint script against a page and a storage, as a browser would. */
function paint(storage: Record<string, string> | "refused"): string | undefined {
  const root: { dataset: Record<string, string> } = { dataset: {} };
  const localStorage =
    storage === "refused"
      ? {
          getItem() {
            throw new Error("denied");
          },
        }
      : { getItem: (key: string) => storage[key] ?? null };
  new Function("document", "localStorage", THEME_SCRIPT)({ documentElement: root }, localStorage);
  return root.dataset.theme;
}

describe("the theme script, run before the page paints", () => {
  test("is the first script of the head and blocks, so the stylesheet is never drawn first", () => {
    const page = docPage(view, "a");
    const tag = /<script src="\/_platform\/docs-theme\.[0-9a-f]{10}\.js"><\/script>/.exec(page);
    expect(tag).not.toBeNull();
    expect(page.indexOf(tag?.[0] ?? "")).toBeLessThan(page.indexOf("<link"));
    expect(page.indexOf(tag?.[0] ?? "")).toBeLessThan(page.indexOf("</head>"));
    expect(tag?.[0]).not.toContain("defer");
  });

  test("sets the stored choice, and leaves the system's when there is none or it is not one", () => {
    expect(paint({ "vd-theme": "dark" })).toBe("dark");
    expect(paint({ "vd-theme": "light" })).toBe("light");
    expect(paint({})).toBeUndefined();
    expect(paint({ "vd-theme": "system" })).toBeUndefined();
    expect(paint({ "vd-theme": "mauve" })).toBeUndefined();
    expect(paint("refused")).toBeUndefined();
  });

  test("on the product's pages the console's choice is read first, so the two stay in step", () => {
    expect(paint({ "vx-pref:theme": '"light"', "vd-theme": "dark" })).toBe("light");
    expect(paint({ "vx-pref:theme": '"dark"' })).toBe("dark");
    expect(paint({ "vx-pref:theme": "not json", "vd-theme": "dark" })).toBe("dark");
  });

  test("the page names, for the control, where the product keeps its choice", () => {
    expect(docPage({ ...view, profile: "product" }, "a")).toContain('"themeKey":"vx-pref:theme"');
    expect(docPage(view, "a")).not.toContain("themeKey");
  });

  test("the control is drawn hidden, three choices, in the header of every kind of page", () => {
    for (const html of [docPage(view, "a"), docPage(view, "index")]) {
      expect(html).toContain(
        '<div class="themes" role="group" aria-label="Color theme" data-themes hidden>',
      );
      for (const choice of ["system", "light", "dark"]) {
        expect(html).toContain(`data-theme-choice="${choice}" aria-pressed="false"`);
      }
    }
  });
});

describe("a changelog folder with no page of its own", () => {
  const { set: news } = buildDocSet([
    readPage("index", "---\ntitle: Home\n---\n\nHello.\n").entry,
    readPage("ref/changelog/2026-01-01-one", "---\ntitle: First\n---\n\nOne.\n").entry,
    readPage("ref/changelog/2026-02-01-two", "---\ntitle: Second\n---\n\nTwo.\n").entry,
  ]);
  const own: SiteView = { ...view, set: news };

  test("is answered with its entries, newest first, as ::changelog lists them", () => {
    const path = pageAt(news, "ref/changelog");
    expect(path).toBe("ref/changelog/index");
    const page = docPage(own, path as string);
    expect(page).toContain("<h1>Changelog</h1>");
    expect(page.indexOf("Second")).toBeLessThan(page.indexOf("First"));
    expect(page).not.toContain("There is no page here");
  });

  test("a folder of another name, or with no entries, is still not a page", () => {
    expect(pageAt(news, "ref")).toBeUndefined();
    expect(pageAt(news, "nothing/changelog")).toBeUndefined();
  });
});
