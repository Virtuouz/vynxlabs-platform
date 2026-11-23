import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const root = new URL("../../../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "content")
      return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** What is said to a person, a program or an API reader is Volvel, never "the platform". Comments are for developers. */
test("no user-facing string says 'the platform'", () => {
  const found: string[] = [];
  for (const base of ["apps", "packages"]) {
    for (const path of files(join(root, base))) {
      let inBlock = false;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const t = line.trim();
          if (inBlock) {
            if (t.includes("*/")) inBlock = false;
            return;
          }
          if (t.startsWith("/*")) {
            if (!t.includes("*/")) inBlock = true;
            return;
          }
          if (t.startsWith("//") || t.startsWith("*")) return;
          const code = line.replace(/\s\/\/.*$/, "");
          if (/\bthe platform\b/i.test(code)) found.push(`${relative(root, path)}:${index + 1}`);
        });
    }
  }
  expect(found).toEqual([]);
});
