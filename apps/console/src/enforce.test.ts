import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/**
 * Every list in the console is drawn by `DataTable` (08 §3.6), so a list is learned
 * once. A screen that writes its own `<table>` or uses the kit's plain `Table` fails
 * here. A table that is not a list, such as a form laid out as a grid or a chart's
 * numbers for screen readers, says why on the line before it with `table-allowed:`.
 */
const here = new URL(".", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

test("no screen draws a list of its own", () => {
  const found: string[] = [];
  for (const path of [
    ...files(join(here, "screens")),
    ...files(join(here, "kit")),
    join(here, "ListScreen.tsx"),
  ]) {
    if (path.endsWith("DataTable.tsx")) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const why = `${lines[index - 1] ?? ""}${lines[index - 2] ?? ""}`;
      if (/<table\b/.test(line) && !why.includes("table-allowed:")) {
        found.push(`${path.slice(here.length)}:${index + 1} draws a <table>`);
      }
      if (/import \{[^}]*\bTable\b[^}]*\} from "@vynxlabs\/ui"/.test(line)) {
        found.push(`${path.slice(here.length)}:${index + 1} imports the kit's Table`);
      }
    });
  }
  expect(found).toEqual([]);
});
