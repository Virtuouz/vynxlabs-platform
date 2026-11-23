// Builds the product's documentation into dist/: a manifest, one tree for each
// page, and the search index. The console ships these and reads them offline.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { packageOutput } from "@volvel/docs-engine";
import { fieldDescriptions } from "./generators/reference.mjs";
import { HERE, loadDocs, report, VERSION } from "./load.mjs";
import { readIndex } from "./screenshots.mjs";

const { set, issues, assets, redirects } = loadDocs();
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
// Old path to new, for what moved or was deleted. `/docs` and the static export read it.
writeFileSync(join(out, "redirects.json"), `${JSON.stringify(redirects)}\n`);
// What each field of each kind is, for `::field` in a page and for the console's forms.
writeFileSync(join(out, "fields.json"), `${JSON.stringify(fieldDescriptions())}\n`);
// Pictures of the console, taken from a running instance by `pnpm docs:screenshots`
// when a version is released. A build without them is whole: a page then says in
// words what its picture would have shown.
const shots = join(HERE, "assets/screenshots");
// The index says which file is which picture in which look; only those are shipped.
const files = readIndex(shots);
const taken = Object.keys(files).sort();
for (const looks of Object.values(files)) {
  for (const file of Object.values(looks)) {
    const to = join(out, "assets/screenshots", file);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(shots, file), to);
  }
}
const manifestFile = join(out, "manifest.json");
writeFileSync(
  manifestFile,
  `${JSON.stringify({ ...JSON.parse(readFileSync(manifestFile, "utf8")), screenshots: taken, screenshotFiles: files })}\n`,
);

for (const asset of assets) {
  // A generated page is mounted where it is written, so its pictures are found there.
  const made = join(HERE, "generated", asset);
  const from = existsSync(made) ? made : join(HERE, "content", asset);
  const to = join(out, "assets", asset);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(
  `Documentation ${VERSION}: ${set.pages.size} pages, ${Object.keys(set.topics).length} topics, ${Object.keys(set.terms).length} terms.`,
);
