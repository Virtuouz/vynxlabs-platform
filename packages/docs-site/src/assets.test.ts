import { describe, expect, test } from "vitest";
import { DOCS_CSS, DOCS_SCRIPT, docsAsset, docsAssetHref } from "./index.js";

describe("the platform's files of a docs site", () => {
  test("a name holds the hash of its file, and answers for ever", () => {
    const css = docsAssetHref("/_platform/", "css");
    const js = docsAssetHref("/x/", "js");
    expect(css).toMatch(/^\/_platform\/docs\.[0-9a-f]{10}\.css$/);
    expect(js).toMatch(/^\/x\/docs\.[0-9a-f]{10}\.js$/);
    expect(docsAsset(css.slice("/_platform/".length))).toMatchObject({
      body: DOCS_CSS,
      type: "text/css",
      immutable: true,
    });
    expect(docsAsset(js.slice("/x/".length))).toMatchObject({
      body: DOCS_SCRIPT,
      type: "text/javascript",
      immutable: true,
    });
  });

  test("the old names answer with the file as it is, not as immutable", () => {
    expect(docsAsset("docs.css")).toMatchObject({ body: DOCS_CSS, immutable: false });
    expect(docsAsset("docs.js")).toMatchObject({ body: DOCS_SCRIPT, immutable: false });
  });

  test("a hash that is not the file's, and other names, are not served", () => {
    expect(docsAsset("docs.0000000000.css")).toBeUndefined();
    expect(docsAsset("docs.js.map")).toBeUndefined();
    expect(docsAsset("../docs.css")).toBeUndefined();
  });
});
