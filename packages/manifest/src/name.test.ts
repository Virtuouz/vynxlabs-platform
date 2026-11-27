import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// The product is Volvel. The company that makes it keeps its own name, and is
// named where the documents mean the company. The record of earlier phases is
// left as it was written.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OLD = ["vy", "nx"].join("");
const COMPANY = `V${OLD.slice(1)}labs`;

/** What was written before the name, and is a record. Decisions and their specs are never rewritten. */
const RECORD = ["docs/adr/", "docs/specs/", "CHANGELOG.md"];

/** Where the company is meant, and so named: by its name, or by its mail domain. */
const NAMES_THE_COMPANY = new Set([
  "CODE_OF_CONDUCT.md",
  "docs/master-spec.md",
  "docs/self-hosting.md",
  "deploy/fly/README.md",
]);

test("nothing is named for the company where the product is meant", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((file) => file !== "" && !RECORD.some((record) => file.startsWith(record)));
  const found: string[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    if (!text.toLowerCase().includes(OLD)) continue;
    text.split("\n").forEach((line, index) => {
      const rest = NAMES_THE_COMPANY.has(file)
        ? line.replaceAll(COMPANY, "").replaceAll(`@${COMPANY.toLowerCase()}.com`, "")
        : line;
      if (rest.toLowerCase().includes(OLD)) found.push(`${file}:${index + 1}`);
    });
  }
  expect(found).toEqual([]);
});
