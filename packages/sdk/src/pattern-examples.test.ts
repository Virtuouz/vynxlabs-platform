import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { matchPattern, patternProblem } from "@volvel/widgets/pattern";
import { expect, test } from "vitest";
import { z } from "./index.js";

// Tenant patterns run on RE2 (packages/widget-sdk/src/pattern.ts). Every pattern the examples
// write, by hand or through zod, must be one RE2 runs, and must still tell good values from bad.

const root = join(import.meta.dirname, "../../../examples");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|yaml|yml|json)$/.test(name) ? [path] : [];
  });
}

test("every pattern written in the examples is one RE2 runs", () => {
  const found: string[] = [];
  for (const file of files(root)) {
    const text = readFileSync(file, "utf8");
    // `pattern: ...` in YAML, `"pattern": "..."` in JSON, `pattern: "..."` in code.
    for (const match of text.matchAll(/^\s*pattern:\s*(.+)$/gm)) {
      const raw = (match[1] as string).trim();
      found.push(/^["'].*["']$/.test(raw) ? JSON.parse(raw.replace(/^'(.*)'$/, '"$1"')) : raw);
    }
    for (const match of text.matchAll(/"pattern"\s*:\s*("(?:[^"\\]|\\.)*")/g))
      found.push(JSON.parse(match[1] as string));
    for (const match of text.matchAll(/\.regex\(\s*\/((?:[^/\\\n]|\\.)+)\/[a-z]*/g))
      found.push(match[1] as string);
    for (const match of text.matchAll(/\.matches\(\s*["']((?:[^"'\\]|\\.)*)["']\s*\)/g))
      found.push(match[1] as string);
  }
  expect(found.length).toBeGreaterThan(2);
  for (const pattern of found) expect(patternProblem(pattern), pattern).toBeUndefined();
});

test("the patterns zod writes for what the examples use run, and tell good values from bad", () => {
  const cases: [string, z.ZodType, string, string][] = [
    ["uuid", z.uuid(), "0b8f6c3e-2a51-4d8e-9a6f-3c1e7d2b4a90", "not-a-uuid"],
    ["datetime", z.iso.datetime(), "2026-11-26T10:00:00Z", "2026-11-26"],
    ["date", z.iso.date(), "2026-11-26", "26-11-2026"],
    ["email", z.email(), "dan.price@example.net", "dan.price@"],
    ["student number", z.string().regex(/^S\d{7}$/), "S1002003", "S100"],
  ];
  for (const [name, schema, good, bad] of cases) {
    const pattern = (z.toJSONSchema(schema) as { pattern?: string }).pattern;
    expect(pattern, name).toBeTypeOf("string");
    expect(matchPattern(pattern as string, good), name).toEqual({ matches: true });
    expect(matchPattern(pattern as string, bad), name).toEqual({ matches: false });
  }
});
