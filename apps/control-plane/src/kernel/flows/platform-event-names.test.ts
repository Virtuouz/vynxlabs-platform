import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORM_EVENTS } from "@volvel/manifest";
import { expect, test } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");

function sourcesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((one) =>
    one.isDirectory()
      ? sourcesOf(join(dir, one.name))
      : one.name.endsWith(".ts") && !one.name.endsWith(".test.ts") && !one.name.endsWith(".d.ts")
        ? [join(dir, one.name)]
        : [],
  );
}

// The editors offer a trigger the events in PLATFORM_EVENTS, and the reference lists them: an
// event the platform publishes that is not there cannot be listened for, and no page says it exists.
test("every event the control plane publishes under platform/ is in the list the editors and the reference are drawn from", () => {
  const listed = new Set(PLATFORM_EVENTS.map((one) => one.name));
  const published = new Map<string, string>();
  for (const file of sourcesOf(SRC)) {
    for (const found of readFileSync(file, "utf8").matchAll(
      /["'`](platform\/[a-z][a-z-]*)["'`]/g,
    )) {
      published.set(found[1] as string, file.slice(SRC.length + 1));
    }
  }
  expect(published.size).toBeGreaterThan(4);
  const missing = [...published].filter(([name]) => !listed.has(name));
  expect(missing).toEqual([]);
  // And what is listed is published by something.
  for (const name of listed) expect(published.has(name), `${name} is published`).toBe(true);
});
