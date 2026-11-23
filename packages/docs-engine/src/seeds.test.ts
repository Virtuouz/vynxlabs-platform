import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { readPage } from "./index.js";

test("DOC-01 the pages the screenshot spec seeds pass the page schema a deploy holds them to", () => {
  const spec = readFileSync(new URL("../../../e2e/screenshots.spec.ts", import.meta.url), "utf8");
  const seeded = [...spec.matchAll(/source\(\s*("(?:[^"\\]|\\.)*")/g)].map(
    (found) => JSON.parse(found[1] as string) as string,
  );
  expect(seeded.length).toBeGreaterThan(2);
  for (const frontmatter of seeded) {
    const { issues } = readPage("handbook/page", `---\n${frontmatter}\n---\n\nWords.\n`);
    expect(
      issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
      frontmatter,
    ).toEqual([]);
  }
});
