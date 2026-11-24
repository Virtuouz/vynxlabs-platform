import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_EVENTS } from "@volvel/manifest";
import { expect, test } from "vitest";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });

test("every event the platform publishes is in the list the editors offer (OPS-MP2)", () => {
  const published = new Set<string>();
  for (const file of walk(join(import.meta.dirname))) {
    const text = readFileSync(file, "utf8");
    for (const found of text.matchAll(/"(platform\/[a-z]+(?:-[a-z]+)+)"/g))
      published.add(found[1] as string);
  }
  expect([...published].sort()).toEqual(PLATFORM_EVENTS.map((one) => one.name).sort());
});
