// Builds the product's documentation into dist/: a manifest, one tree for each
// page, and the search index. The console ships these and reads them offline.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { packageOutput } from "@volvel/docs-engine";
import { HERE, loadDocs, report, VERSION } from "./load.mjs";

const { set, issues, assets } = loadDocs();
if (issues.some((issue) => issue.severity === "error")) {
  report(issues);
  console.error(
    `\nThe documentation has ${issues.length} problem${issues.length === 1 ? "" : "s"}. Nothing was built.`,
  );
  process.exit(1);
}

const out = join(HERE, "dist");
rmSync(out, { recursive: true, force: true });
for (const [name, text] of packageOutput(set, { version: VERSION, productName: "Volvel" })) {
  const file = join(out, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
for (const asset of assets) {
  const from = asset.startsWith("reference/")
    ? join(HERE, "generated", asset.slice("reference/".length))
    : join(HERE, "content", asset);
  const to = join(out, "assets", asset);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(
  `Documentation ${VERSION}: ${set.pages.size} pages, ${Object.keys(set.topics).length} topics, ${Object.keys(set.terms).length} terms.`,
);
