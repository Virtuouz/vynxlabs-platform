// Gives everything that carries the product's version the version being released. A release
// workflow runs it before it builds, and nothing commits what it writes: the version in the
// repository is the one last agreed, and a tag says the next.
//
// Five things say the version: the published packages, the control plane, the console and the
// worker (read at run time from their package.json), the SDK's two constants (what a bundle
// says it was built with, and the cores it works on), and the range the CLI's starter
// repository asks the SDK for.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLISHED = ["widget-sdk", "markup", "docs-engine", "docs", "ui", "app", "sdk", "cli"].map(
  (name) => `packages/${name}`,
);
/** Not published to npm, but what runs and reports its version: the image's own parts. */
const RUNS = ["apps/control-plane", "apps/console", "packages/worker"];
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** Writes `version` into everything under `root`. Returns what was written, for the log. */
export function setVersion(root, version) {
  if (!VERSION.test(version)) {
    throw new Error(
      `"${version}" is not a version. Give one such as 1.2.3 or 1.2.3-next.4be1c09a.`,
    );
  }
  for (const folder of [...PUBLISHED, ...RUNS]) {
    const file = join(root, folder, "package.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.version = version;
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  // A bundle built with this SDK runs on the cores of its minor version, a prerelease included.
  const [major, minor] = version.split("-")[0].split(".").map(Number);
  const range = { min: `${major}.${minor}.0`, below: `${major}.${minor + 1}.0` };
  const sdk = join(root, "packages/sdk/src/index.ts");
  const before = readFileSync(sdk, "utf8");
  const after = before
    .replace(/export const SDK_VERSION = "[^"]*";/, `export const SDK_VERSION = "${version}";`)
    .replace(
      /export const CORE_RANGE = \{[^}]*\};/,
      `export const CORE_RANGE = { min: "${range.min}", below: "${range.below}" };`,
    );
  if (after === before && !before.includes(`SDK_VERSION = "${version}"`)) {
    throw new Error("packages/sdk/src/index.ts has no SDK_VERSION and CORE_RANGE to set.");
  }
  writeFileSync(sdk, after);
  const local = join(root, "packages/cli/src/local.ts");
  const starter = readFileSync(local, "utf8").replace(
    /export const STARTER_SDK_RANGE = "[^"]*";/,
    `export const STARTER_SDK_RANGE = "^${version}";`,
  );
  if (!starter.includes(`"^${version}"`)) {
    throw new Error("packages/cli/src/local.ts has no STARTER_SDK_RANGE to set.");
  }
  writeFileSync(local, starter);
  return { packages: PUBLISHED.length + RUNS.length, range };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const done = setVersion(process.argv[3] ?? join(HERE, ".."), process.argv[2] ?? "");
    console.log(
      `${done.packages} packages are at ${process.argv[2]}; bundles built with the SDK ask for cores ${done.range.min} up to ${done.range.below}.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
