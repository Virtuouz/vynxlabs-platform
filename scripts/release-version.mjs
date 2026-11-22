// Gives every package that is published the version being released. A release
// workflow runs it before it builds, and nothing commits what it writes: the
// version in the repository is the one last agreed, and a tag says the next.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLISHED = ["widget-sdk", "markup", "docs-engine", "docs", "ui", "app", "sdk", "cli"];

const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`"${version}" is not a version. Give one such as 1.2.3 or 1.2.3-next.4be1c09a.`);
  process.exit(1);
}
for (const name of PUBLISHED) {
  const file = join(ROOT, "packages", name, "package.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  manifest.version = version;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`${PUBLISHED.length} packages are at ${version}.`);
