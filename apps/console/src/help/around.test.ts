import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Manifest } from "@volvel/docs-engine";
import { setFromManifest } from "@volvel/docs-engine";
import { describe, expect, test } from "vitest";
import { docPage } from "../../../../packages/docs-site/src/index.ts";
import { around } from "./around.ts";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/docs/dist");
const real = JSON.parse(readFileSync(join(DOCS, "manifest.json"), "utf8")) as Manifest;

const page = (path: string, title: string, extra: object = {}) => ({
  type: "page" as const,
  path,
  url: path.replace(/\/index$/, ""),
  title,
  ...extra,
});
/** Two collections; `a` has a folder `how` with three pages, `b` has pages of other types on the same subject. */
const made = (): Manifest => {
  const how = {
    type: "folder" as const,
    id: "how",
    path: "a/how",
    title: "How-to guides",
    index: page("a/how/index", "How-to guides"),
    items: [page("a/how/one", "One"), page("a/how/two", "Two"), page("a/how/three", "Three")],
  };
  const a = {
    type: "folder" as const,
    id: "a",
    path: "a",
    title: "Alpha",
    index: page("a/index", "Alpha"),
    items: [how, page("a/other", "Other")],
  };
  const b = {
    type: "folder" as const,
    id: "b",
    path: "b",
    title: "Beta",
    items: [page("b/ref", "Ref"), page("b/why", "Why")],
  };
  const pages = [
    { path: "a/how/one", title: "One", docType: "how-to", subjects: ["tables"] },
    { path: "a/how/two", title: "Two", docType: "how-to" },
    { path: "a/how/three", title: "Three", docType: "how-to" },
    { path: "b/ref", title: "Ref", docType: "reference", subjects: ["tables"] },
    { path: "b/why", title: "Why", docType: "explanation", subjects: ["tables"] },
    { path: "a/other", title: "Other" },
    { path: "index", title: "Home" },
  ].map((one) => ({ ...one, url: one.path }));
  return {
    version: "1",
    nav: { home: page("index", "Home"), collections: [a, b] },
    pages,
    topics: {},
    terms: {
      t1: { id: "t1", term: "Tenant", short: "A team.", path: "a/other" },
      t2: { id: "t2", term: "Deploy", short: "Ship it.", path: "b/ref" },
    },
    attachments: {},
    extensions: {},
  } as unknown as Manifest;
};
const at = (path: string) => `#help:${path}`;

describe("where a page is, for the help panel", () => {
  test("the trail is the collection, the folders, then the page, each folder leading to its own page", () => {
    const set = around(made(), "a/how/two", at);
    expect(set.trail.map((one) => one.title)).toEqual(["Alpha", "How-to guides", "Two"]);
    expect(set.trail.map((one) => one.path)).toEqual(["a/index", "a/how/index", undefined]);
  });

  test("a folder's own page is the last of its trail, not repeated", () => {
    const set = around(made(), "a/how/index", at);
    expect(set.trail.map((one) => one.title)).toEqual(["Alpha", "How-to guides"]);
    expect(set.trail.at(-1)?.path).toBeUndefined();
  });

  test("a folder with no page of its own is a name that leads nowhere", () => {
    const set = around(made(), "b/ref", at);
    expect(set.trail.map((one) => [one.title, one.path])).toEqual([
      ["Beta", undefined],
      ["Ref", undefined],
    ]);
  });

  test("previous and next are the whole navigation's order, folders' own pages among them", () => {
    expect(around(made(), "a/how/two", at)).toMatchObject({
      before: { path: "a/how/one" },
      after: { path: "a/how/three" },
    });
    expect(around(made(), "a/how/three", at).after?.path).toBe("a/other");
    expect(around(made(), "a/how/index", at).before?.path).toBe("a/index");
    expect(around(made(), "b/why", at).after).toBeUndefined();
  });

  test("the panel's previous and next are the served site's, for every page of the product docs", () => {
    const set = setFromManifest(real);
    const view = { title: "Docs", set, base: "/docs/", look: { themeHref: "/t.css" } };
    const decode = (text: string) =>
      text
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&quot;/g, '"');
    for (const one of real.pages) {
      if (one.path === "index") continue;
      const html = docPage(view, one.path);
      const pager = /<nav class="pager"[^>]*>(.*?)<\/nav>/s.exec(html)?.[1] ?? "";
      const served = (side: "Previous" | "Next") =>
        new RegExp(
          `<small>[^<]*(?:<svg.*?</svg>)?${side}[^<]*(?:<svg.*?</svg>)?</small>([^<]*)</a>`,
          "s",
        ).exec(pager)?.[1];
      const here = around(real, one.path, at);
      expect(decode(served("Previous") ?? ""), one.path).toBe(here.before?.title ?? "");
      expect(decode(served("Next") ?? ""), one.path).toBe(here.after?.title ?? "");
    }
  });

  test("the home page has a trail of itself and no neighbours", () => {
    const set = around(made(), "index", at);
    expect(set.trail).toEqual([{ title: "Home" }]);
    expect(set.before).toBeUndefined();
    expect(set.after).toBeUndefined();
  });

  test("related pages are those of other types about the same subjects, grouped by type", () => {
    const set = around(made(), "a/how/one", at);
    expect(set.related.map((group) => [group.label, group.pages.map((one) => one.path)])).toEqual([
      ["Reference", ["b/ref"]],
      ["Explanations", ["b/why"]],
    ]);
    expect(around(made(), "a/how/two", at).related).toEqual([]);
  });

  test("::pages lists the folder the page is in, and ::glossary the terms of its collection or all", () => {
    const set = around(made(), "a/how/two", at);
    expect(set.folder().map((one) => one.title)).toEqual(["One", "Two", "Three"]);
    expect(set.folder()[0]?.href).toBe("#help:a/how/one");
    expect(set.glossary("collection").map((one) => one.id)).toEqual(["t1"]);
    expect(set.glossary("site").map((one) => one.id)).toEqual(["t1", "t2"]);
    expect(set.glossary("site")[0]?.href).toBe("#help:a/other");
  });

  test("every page of the real documentation has a trail ending at its title, and the trail never repeats", () => {
    for (const one of real.pages) {
      const set = around(real, one.path, at);
      expect(set.trail.at(-1)?.title, one.path).toBe(one.title);
      const names = set.trail.map((crumb) => crumb.title);
      if (one.path !== "index") expect(new Set(names).size, one.path).toBe(names.length);
    }
  });
});
