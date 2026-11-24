import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, buildSearchIndex, type DocsApp, loadSearchIndex } from "@volvel/docs-engine";
import { describe, expect, test } from "vitest";
import { docPage, homePage, type SiteView, searchAnswer } from "./index.js";

/**
 * A site whose pages have types: the eyebrow, the cards on a collection's page, the related pages,
 * and a search narrowed to a type. Golden files, as the untyped site's are. `UPDATE_GOLDEN=1`
 * writes them again on purpose.
 */
const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), "..", "golden");
const app: DocsApp = { path: "shop", title: "Shop docs", docs: "shop" };
const doc = (path: string, frontmatter: string, body: string) => ({
  kind: "doc",
  path,
  body: { source: `---\n${frontmatter}\n---\n\n${body}` },
  updated: "2026-03-04T10:00:00.000Z",
});
const steps = ":::steps\n1. Open it.\n2. Save it.\n:::\n";
const resources = [
  doc("shop/index", "title: Shop\npages: [orders]", "Welcome.\n"),
  doc(
    "shop/orders/index",
    "title: Orders\ndescription: Taking and refunding orders.",
    "Start here.\n",
  ),
  doc("shop/orders/tutorials/index", "title: Tutorials\ntype: tutorial", ""),
  doc(
    "shop/orders/tutorials/first-order",
    "title: Take your first order\nsubjects: [orders, refunds]",
    `## Goal\n\n${steps}`,
  ),
  doc("shop/orders/how-to/index", "title: How-to guides\ntype: how-to", ""),
  doc(
    "shop/orders/how-to/refund-an-order",
    "title: Refund an order\nsubjects: [refunds]",
    `## Goal\n\nGive the money back.\n\n${steps}`,
  ),
  doc("shop/orders/reference/index", "title: Reference\ntype: reference", ""),
  doc(
    "shop/orders/reference/statuses",
    "title: Order statuses\nsubjects: [orders]",
    "Words about statuses.\n",
  ),
];
const built = buildApp(app, resources, { product: { terms: [], topics: [] } });
const at: SiteView = {
  title: app.title,
  look: { themeHref: "/theme.css" },
  base: "/apps/shop/",
  set: built.set,
};
const normal = (html: string) =>
  html.replace(/\/_platform\/docs(-theme)?(\.[0-9a-f]{8,})?\.(css|js)/g, "/_platform/docs$1.$3");

const cases: Record<string, () => string> = {
  "typed-collection-landing": () => docPage(at, "orders/index"),
  "typed-page-howto": () => docPage(at, "orders/how-to/refund-an-order"),
  "typed-page-reference": () => docPage(at, "orders/reference/statuses"),
  "typed-home": () => homePage(at),
};

describe("a typed site, drawn", () => {
  test("it has no warnings of its own", () => {
    expect(built.issues).toEqual([]);
  });

  for (const [name, draw] of Object.entries(cases)) {
    test(name, () => {
      const html = normal(draw());
      const file = join(GOLDEN, `${name}.html`);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(file, html);
      }
      expect(html).toBe(readFileSync(file, "utf8"));
    });
  }

  test("a typed page has its type as an eyebrow, and a folder's index has none", () => {
    expect(docPage(at, "orders/how-to/refund-an-order")).toContain(
      '<p class="eyebrow" data-type="how-to">How-to guide</p>',
    );
    expect(docPage(at, "orders/how-to/index")).not.toContain('class="eyebrow"');
  });

  test("a collection's page offers a card for each type, and a page inside it does not", () => {
    const landing = docPage(at, "orders/index");
    expect(landing.match(/class="card" data-type=/g)).toHaveLength(3);
    expect(landing).toContain("Tutorials");
    expect(docPage(at, "orders/how-to/refund-an-order")).not.toContain('class="types"');
    expect(docPage(at, "orders/how-to/index")).not.toContain('class="types"');
  });

  test("related pages are of other types and share a subject", () => {
    const html = docPage(at, "orders/how-to/refund-an-order");
    expect(html).toContain('<aside class="related"');
    expect(html).toContain("Take your first order");
    expect(html.slice(html.indexOf('<aside class="related"'))).not.toContain("Order statuses");
    expect(docPage(at, "orders/reference/statuses")).toContain("Take your first order");
  });

  test("the script is told the site's types, and an untyped site is not", () => {
    expect(docPage(at, "orders/index")).toContain('"types":[{"id":"tutorial"');
    const untyped = buildApp(app, [doc("shop/index", "title: Shop", "Hi.\n")], {});
    expect(homePage({ ...at, set: untyped.set })).not.toContain('"types"');
  });

  test("search can be narrowed to a type, in the results and in what the dialog is answered", () => {
    const search = loadSearchIndex(buildSearchIndex(built.set));
    expect(search.search("order", 20, { type: "how-to" }).map((hit) => hit.path)).toEqual([
      "orders/how-to/refund-an-order",
    ]);
    const all = search.grouped("order").map((hit) => hit.path);
    expect(all.length).toBeGreaterThan(1);
    const only = search.grouped("order", { type: "reference" });
    expect(only.map((hit) => hit.path)).toEqual(["orders/reference/statuses"]);
    expect(only[0]?.docType).toBe("reference");
    expect(searchAnswer(at, only).pages).toHaveLength(1);
  });
});
