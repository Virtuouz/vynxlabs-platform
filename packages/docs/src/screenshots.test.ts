import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  fileName,
  missing,
  readIndex,
  SHOTS,
  shotNames,
  THEMES,
  writeIndex,
} from "../screenshots.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("DOC-17 a picture's file is named by its content and its look, so a file never changes under its name", () => {
  const a = fileName("console/table-help", "light", Buffer.from("one"));
  expect(a).toMatch(/^console\/table-help\.light\.[0-9a-f]{12}\.png$/);
  expect(fileName("console/table-help", "light", Buffer.from("one"))).toBe(a);
  expect(fileName("console/table-help", "light", Buffer.from("two"))).not.toBe(a);
  expect(fileName("console/table-help", "dark", Buffer.from("one"))).not.toBe(a);
});

test("DOC-17 the list says each picture in light and dark, once, and every page's picture is on it", () => {
  expect(new Set(shotNames()).size).toBe(SHOTS.length);
  for (const shot of SHOTS) expect(shot.themes).toEqual(THEMES);
  const content = join(HERE, "..", "content");
  const named = new Set<string>();
  const walkFiles = (folder: string, files: string[] = []): string[] => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walkFiles(full, files);
      else if (name.endsWith(".md")) files.push(full);
    }
    return files;
  };
  for (const file of walkFiles(content)) {
    for (const found of readFileSync(file, "utf8").matchAll(/::screenshot\{name=([^\s}]+)/g)) {
      named.add(found[1] as string);
    }
  }
  expect(named.size).toBeGreaterThan(0);
  for (const name of named) expect(shotNames(), `a page names ${name}`).toContain(name);
});

test("DOC-17 a shot of the list that was not taken in a look is named as missing, and the index is read back by name", () => {
  const folder = mkdtempSync(join(tmpdir(), "shots-"));
  const taken: Record<string, Record<string, string>> = {
    "console/table-help": { light: "console/table-help.light.aaaaaaaaaaaa.png" },
  };
  writeIndex(folder, taken);
  expect(readIndex(folder)).toEqual(taken);
  const gone = missing(taken);
  expect(gone).toContain("console/table-help (dark)");
  expect(gone).toContain("console/documentation (light)");
  expect(gone).not.toContain("console/table-help (light)");
  writeFileSync(join(folder, "other"), "");
  expect(missing(readIndex(folder))).toEqual(gone);
});
