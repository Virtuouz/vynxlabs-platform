// Builds the product's documentation into dist/: a manifest, one tree for each
// page, and the search index. The console ships these and reads them offline.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { packageOutput } from "@volvel/docs-engine";
import { fieldDescriptions } from "./generators/reference.mjs";
import { HERE, loadDocs, report, VERSION } from "./load.mjs";

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
const taken = [];
const collect = (folder, under) => {
  if (!existsSync(folder)) return;
  for (const name of readdirSync(folder).sort()) {
    const full = join(folder, name);
    const inside = under === "" ? name : `${under}/${name}`;
    if (statSync(full).isDirectory()) collect(full, inside);
    else if (name.endsWith(".png")) {
      const to = join(out, "assets/screenshots", inside);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(full, to);
      taken.push(inside.slice(0, -".png".length));
    }
  }
};
collect(shots, "");
const manifestFile = join(out, "manifest.json");
writeFileSync(
  manifestFile,
  `${JSON.stringify({ ...JSON.parse(readFileSync(manifestFile, "utf8")), screenshots: taken })}\n`,
);

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
