import { buildApp, type DocsApp } from "@volvel/docs-engine";
import { describe, expect, test } from "vitest";
import { DOCS_CSS, described, docPage, homePage, type SiteView, searchPage } from "./index.js";

/** What the phase 30 walks found of a served site: narrow widths, descriptions, names, and where a page is. */
const app: DocsApp = { path: "shop", title: "Shop docs", docs: "shop" };
const doc = (path: string, frontmatter: string, body = "Words.\n") => ({
  kind: "doc",
  path,
  body: { source: `---\n${frontmatter}\n---\n\n${body}` },
  updated: "2026-03-04T10:00:00.000Z",
});
const steps = ":::steps\n1. Open it.\n2. Save it.\n:::\n";
const resources = [
  doc("shop/index", "title: Help\ndescription: How the shop runs.\npages: [orders, stock]"),
  doc(
    "shop/orders/index",
    "title: Orders\ndescription: Everything `@shop/orders` exports.\npages: [flows]",
  ),
  doc("shop/orders/flows/index", "title: Flows\ntype: how-to"),
  doc("shop/orders/flows/refund", "title: Refund an order", `## Goal\n\n${steps}`),
  doc("shop/orders/reference/index", "title: Reference\ntype: reference"),
  doc("shop/orders/reference/statuses", "title: Order statuses"),
  doc("shop/stock/index", "title: Stock\ndescription: Counting."),
  doc("shop/stock/flows/index", "title: Flows"),
  doc("shop/stock/flows/count", "title: Count stock"),
];
const built = buildApp(app, resources, { product: { terms: [], topics: [] } });
const at: SiteView = {
  title: "Shop docs",
  look: { themeHref: "/theme.css" },
  base: "/apps/shop/",
  set: built.set,
};
const titleOf = (html: string) => /<title>(.*?)<\/title>/.exec(html)?.[1];

describe("a served site at 390 px", () => {
  test("the pager's columns may shrink, and a long title breaks instead of widening the page", () => {
    expect(DOCS_CSS).toMatch(/\.pager \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    expect(DOCS_CSS).toMatch(/\.pager a \{[^}]*overflow-wrap: anywhere/);
  });

  test("no grid of the frame has a column that cannot shrink", () => {
    for (const line of DOCS_CSS.split("\n")) {
      for (const columns of line.matchAll(/grid-template-columns:\s*([^;}]*)/g)) {
        for (const track of (columns[1] as string).replace(/minmax\([^)]*\)|repeat\(.*\)/g, "").split(/\s+/)) {
          expect(track, line).not.toMatch(/^[\d.]+fr$/);
        }
      }
    }
  });

  test("the search dialog is as wide as the screen, past the browser's own limit, and its chips wrap", () => {
    expect(DOCS_CSS).toMatch(/\.finder:modal \{ max-width: none; \}/);
    expect(DOCS_CSS).toMatch(/\.finder \.chips \{[^}]*flex-wrap: wrap/);
    expect(DOCS_CSS).not.toMatch(/\.finder \.chips \{[^}]*overflow-x/);
  });

  test("a breadcrumb that wraps keeps each separator with the crumb after it", () => {
    expect(DOCS_CSS).toMatch(/\.crumbs li \{ display: flex;/);
  });
});

describe("descriptions", () => {
  test("backticks are code, and the rest is escaped", () => {
    expect(described("Everything `@shop/<x>` & more.")).toBe(
      "Everything <code>@shop/&lt;x&gt;</code> &amp; more.",
    );
  });

  test("a page's subtitle and a card draw them the same way", () => {
    expect(docPage(at, "orders/index")).toContain("<p>Everything <code>@shop/orders</code> exports.</p>");
    expect(homePage(at)).toContain("Everything <code>@shop/orders</code> exports.");
    expect(docPage(at, "orders/index")).not.toContain("`");
  });
});

describe("names and places", () => {
  test("the tab says the page, the folder or collection it is in, then the site", () => {
    expect(titleOf(docPage(at, "orders/flows/refund"))).toBe("Refund an order · Flows · Shop docs");
    expect(titleOf(docPage(at, "orders/flows/index"))).toBe("Flows · Orders · Shop docs");
    expect(titleOf(docPage(at, "stock/flows/index"))).toBe("Flows · Stock · Shop docs");
    expect(titleOf(docPage(at, "orders/index"))).toBe("Orders · Shop docs");
  });

  test("the home of the product's own documentation is named by the site, not by the panel's word", () => {
    const product: SiteView = { ...at, profile: "product", title: "Volvel documentation" };
    const html = homePage(product);
    expect(html).toContain("<h1>Volvel documentation</h1>");
    expect(titleOf(html)).toBe("Volvel documentation");
    expect(html).toContain('placeholder="Search Volvel documentation"');
    // A tenant's own home is still its own page.
    expect(homePage(at)).toContain("<h1>Help</h1>");
  });

  test("a collection's own page says where it is, and its pager does not lead into another collection", () => {
    const html = docPage(at, "stock/index");
    expect(html).toContain('<ol class="crumbs" aria-label="Where this page is"><li><a href="/apps/shop/">Shop docs</a></li></ol>');
    expect(html).not.toContain("<small>Previous");
    const last = docPage(at, "orders/reference/statuses");
    expect(last).not.toContain('class="next"');
  });

  test("a search page says where each result is", () => {
    const hit = {
      path: "stock/flows/count",
      url: "stock/flows/count",
      title: "Count stock",
      description: "",
      excerpt: "Counting what is on the shelf.",
    };
    expect(searchPage(at, "count", [hit])).toContain('<small class="where">Stock › Flows</small>');
  });
});

describe("a site of typed pages", () => {
  test("its home offers a card for each type, as a collection's page does", () => {
    const html = homePage(at);
    expect(html.match(/class="card" data-type=/g)).toHaveLength(2);
    expect(html.indexOf('class="types"')).toBeLessThan(html.indexOf('id="collections"'));
  });

  test("a site with no types has none on its home", () => {
    const plain = buildApp(app, [doc("shop/index", "title: Shop"), doc("shop/a/b", "title: B")], {});
    expect(homePage({ ...at, set: plain.set })).not.toContain('class="types"');
  });

  test("a related link is drawn as a link", () => {
    expect(DOCS_CSS).toMatch(/\.related li a \{[^}]*text-decoration: underline/);
  });
});
