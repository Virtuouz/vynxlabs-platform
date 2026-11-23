import { describe, expect, test } from "vitest";
import { buildDocSet, openPackage, packageOutput, readPage } from "./index.js";

const PAGES: Record<string, string> = {
  index: "---\ntitle: Home\n---\n\nHello.\n",
  "guide/index": "---\ntitle: Guide\npages: [one]\n---\n",
  "guide/one":
    "---\ntitle: One\ntopic: one-topic\nsubjects: [a]\n---\n\n## Deep\n\nA quokka lives here.\n",
};

function files() {
  const { set } = buildDocSet(
    Object.entries(PAGES).map(([path, text]) => readPage(path, text, { profile: "product" }).entry),
  );
  return packageOutput(set, { version: "1.0.0", productName: "Volvel" });
}

describe("openPackage", () => {
  test("reads the manifest at once and a page's tree only when it is used", () => {
    const made = files();
    const asked: string[] = [];
    const opened = openPackage((name) => {
      asked.push(name);
      return made.get(name);
    });
    expect(asked).toEqual(["manifest.json"]);
    expect([...opened.set.pages.keys()].sort()).toEqual(["guide/index", "guide/one", "index"]);
    expect(opened.set.pages.get("guide/one")?.frontmatter.title).toBe("One");
    expect(opened.set.topics["one-topic"]).toBe("guide/one");
    expect(asked).toEqual(["manifest.json"]);
    const tree = opened.set.pages.get("guide/one")?.tree;
    expect(JSON.stringify(tree)).toContain("quokka");
    expect(asked).toEqual(["manifest.json", "pages/guide/one.json"]);
    // Kept for the next use.
    opened.set.pages.get("guide/one")?.tree;
    expect(asked.length).toBe(2);
    expect(opened.version).toBe("1.0.0");
  });

  test("search is read on the first search, and a missing file is no results", () => {
    const made = files();
    const asked: string[] = [];
    const opened = openPackage((name) => {
      asked.push(name);
      return made.get(name);
    });
    expect(asked).not.toContain("search.json");
    expect(opened.search().search("quokka")[0]?.path).toBe("guide/one");
    expect(asked.filter((one) => one === "search.json").length).toBe(1);
    opened.search();
    expect(asked.filter((one) => one === "search.json").length).toBe(1);

    const without = openPackage((name) => (name === "search.json" ? undefined : made.get(name)));
    expect(without.search().search("quokka")).toEqual([]);
    expect(
      openPackage((name) =>
        name === "pages/guide/one.json" ? undefined : made.get(name),
      ).set.pages.get("guide/one")?.tree.children,
    ).toEqual([]);
  });

  test("an old address is followed from redirects.json and from the manifest", () => {
    const made = files();
    made.set("redirects.json", JSON.stringify({ "old/one": "guide/one", gone: "nowhere" }));
    const opened = openPackage((name) => made.get(name));
    expect(opened.moved("old/one")).toBe("guide/one");
    expect(opened.moved("gone")).toBeUndefined();
    expect(opened.moved("never")).toBeUndefined();
    expect(() => openPackage(() => undefined)).toThrow(/manifest/);
  });
});
