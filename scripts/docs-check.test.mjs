import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "packages/docs");
const run = (...args) =>
  spawnSync(process.execPath, [join(DOCS, "check.mjs"), ...args], { encoding: "utf8" });

test("docs:check asks whether the generated pages are old before anything rewrites them", () => {
  const script = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts["docs:check"];
  const steps = script.split("&&").map((step) => step.trim());
  const asks = steps.findIndex((step) => step.includes("check.mjs --staleness"));
  const writes = steps.findIndex((step) => step.includes("docs/generate.mjs"));
  expect(asks).toBeGreaterThan(-1);
  expect(asks).toBeLessThan(writes);
});

test("a generated page that is not what the code says fails the check, with no regenerating first", () => {
  const generated = join(DOCS, "generated/errors.md");
  if (!existsSync(generated)) {
    // A checkout that has never been built has no generated pages to be old.
    expect(run("--staleness").status).toBe(0);
    return;
  }
  const kept = readFileSync(generated, "utf8");
  try {
    expect(run("--staleness").status).toBe(0);
    writeFileSync(generated, `${kept}\nA line the code does not say.\n`);
    const old = run("--staleness");
    expect(old.status).toBe(1);
    expect(old.stderr).toContain("generated/errors.md is not what the code says now");
  } finally {
    writeFileSync(generated, kept);
  }
});
