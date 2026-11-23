import { buildDocSet, readPage } from "@volvel/docs-engine";
import { describe, expect, test } from "vitest";
import { DOCS_POLICY, docPage, PRODUCT_DOCS_POLICY, type SiteView } from "./index.js";

const { set } = buildDocSet([
  readPage("index", "---\ntitle: Home\n---\n\nHello.\n", { profile: "product" }).entry,
]);
const view: SiteView = {
  title: "Docs",
  set,
  base: "/docs/",
  look: { themeHref: "/docs/_theme.css" },
};

describe("what a host may add", () => {
  test("a site that adds nothing is drawn as before", () => {
    const page = docPage(view, "index");
    expect(page).not.toContain("Version");
    expect(page).not.toMatch(/<script src="\/docs\/_theme\.js"/);
  });

  test("a version, and a script of the host's own, are drawn when given", () => {
    const page = docPage(
      { ...view, version: "1.2.3", look: { ...view.look, scriptHref: "/docs/_theme.js" } },
      "index",
    );
    // The home page has no navigation: its foot says it.
    expect(page).toContain("Docs · Version 1.2.3");
    expect(page).toContain('<script src="/docs/_theme.js"></script>');
    expect(page.indexOf("_theme.js")).toBeLessThan(page.indexOf("/_platform/docs."));
  });

  test("the product's policy takes https pictures and framing away from a docs app's", () => {
    expect(DOCS_POLICY).toContain("img-src 'self' https: data:");
    expect(PRODUCT_DOCS_POLICY).toContain("img-src 'self' data:");
    expect(PRODUCT_DOCS_POLICY).not.toContain("https:");
    expect(PRODUCT_DOCS_POLICY).toContain("frame-ancestors 'none'");
  });
});

test("a page with a navigation says the version under it", () => {
  const two = buildDocSet([
    readPage("index", "---\ntitle: Home\n---\n", { profile: "product" }).entry,
    readPage("a", "---\ntitle: A\n---\n\nText.\n", { profile: "product" }).entry,
  ]).set;
  expect(docPage({ ...view, set: two, version: "1.2.3" }, "a")).toContain(
    '<p class="version">Version 1.2.3</p>',
  );
});
