import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// A list with four or more columns says which a phone keeps (`priority`), or it scrolls sideways
// at 390 px. The scan reads every `columns={[ ... ]}` of the screens.
const screens = join(dirname(fileURLToPath(import.meta.url)), "screens");

test("p31 fc: every list of four columns or more gives its columns a priority", () => {
  const bare: string[] = [];
  for (const file of readdirSync(screens).filter((name) => name.endsWith(".tsx"))) {
    const text = readFileSync(join(screens, file), "utf8");
    for (const found of text.matchAll(/columns=\{\[/g)) {
      let depth = 0;
      let at = (found.index ?? 0) + found[0].length - 1;
      const from = at;
      for (; at < text.length; at++) {
        if (text[at] === "[") depth++;
        if (text[at] === "]" && --depth === 0) break;
      }
      const block = text.slice(from, at + 1);
      const headers = (block.match(/header:/g) ?? []).length;
      if (headers >= 4 && !/priority:/.test(block)) {
        bare.push(`${file}:${text.slice(0, found.index).split("\n").length}`);
      }
    }
  }
  expect(bare).toEqual([]);
});
