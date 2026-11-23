// A release, rehearsed: every package that is published is packed as it would
// be, each pack is read for what must not be in it, and the packed CLI and SDK
// are installed in an empty folder, where `volvel` has to run and build a
// repository. Nothing is published. Run after `pnpm build`.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** What is published, and what each pack has to hold. */
export const PUBLISHED = [
  {
    folder: "packages/widget-sdk",
    name: "@volvel/widgets",
    holds: ["dist/index.js", "dist/page.d.ts", "dist/action.d.ts"],
  },
  { folder: "packages/markup", name: "@volvel/markup", holds: ["dist/index.js", "dist/react.js"] },
  {
    folder: "packages/docs-engine",
    name: "@volvel/docs-engine",
    holds: ["dist/index.js", "dist/search-query.js"],
  },
  {
    folder: "packages/docs-site",
    name: "@volvel/docs-site",
    holds: ["dist/index.js", "dist/export.js"],
  },
  {
    folder: "packages/docs",
    name: "@volvel/docs",
    holds: ["dist/manifest.json", "dist/search.json", "content/index.md"],
  },
  {
    folder: "packages/ui",
    name: "@volvel/ui",
    holds: ["dist/index.js", "dist/tokens.css"],
    build: true,
  },
  { folder: "packages/app", name: "@volvel/app", holds: ["dist/index.js"], build: true },
  { folder: "packages/sdk", name: "@volvel/sdk", holds: ["dist/index.js", "dist/index.d.ts"] },
  {
    folder: "packages/cli",
    name: "@volvel/cli",
    holds: ["dist/volvel.mjs", "dist/screens/index.html"],
  },
];

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const out = mkdtempSync(join(tmpdir(), "volvel-release-"));
const problems = [];
const packs = new Map();
try {
  for (const one of PUBLISHED) {
    const folder = join(ROOT, one.folder);
    if (one.build) run("pnpm", ["run", "build"], folder);
    const before = new Set(readdirSync(out));
    run("pnpm", ["pack", "--pack-destination", out], folder);
    const pack = readdirSync(out).find((file) => !before.has(file));
    if (!pack) {
      problems.push(`${one.name}: nothing was packed.`);
      continue;
    }
    packs.set(one.name, join(out, pack));
    const files = run("tar", ["-tzf", join(out, pack)])
      .split("\n")
      .filter(Boolean);
    for (const held of one.holds) {
      if (!files.includes(`package/${held}`))
        problems.push(`${one.name}: its pack has no ${held}.`);
    }
    for (const file of files) {
      if (/\.test\.[a-z]+$/.test(file))
        problems.push(`${one.name}: its pack holds a test, ${file}.`);
      if (/(^|\/)\.env/.test(file)) problems.push(`${one.name}: its pack holds ${file}.`);
    }
    const manifest = JSON.parse(run("tar", ["-xzOf", join(out, pack), "package/package.json"]));
    if (manifest.private) problems.push(`${one.name}: is marked private.`);
    if (manifest.name !== one.name) problems.push(`${one.name}: is named ${manifest.name}.`);
    const needs = { ...manifest.dependencies, ...manifest.peerDependencies };
    for (const [name, range] of Object.entries(needs)) {
      if (String(range).startsWith("workspace:")) {
        problems.push(
          `${one.name}: depends on ${name} as ${range}, which means nothing once published.`,
        );
      }
      // A package that is not published cannot be installed by whoever installs this one.
      if (name.startsWith("@volvel/") && !PUBLISHED.some((other) => other.name === name)) {
        problems.push(`${one.name}: depends on ${name}, which is not published.`);
      }
    }
    console.log(`${one.name}@${manifest.version}: ${files.length} files`);
  }

  // The packed CLI and SDK, installed where there is nothing else.
  const cli = packs.get("@volvel/cli");
  const sdk = packs.get("@volvel/sdk");
  // What the SDK is made of is not on npm yet at this version, so its pack is installed beside it.
  const widgets = packs.get("@volvel/widgets");
  if (cli && sdk && widgets && problems.length === 0) {
    const clean = join(out, "clean");
    mkdirSync(join(clean, "src"), { recursive: true });
    writeFileSync(
      join(clean, "package.json"),
      JSON.stringify({ name: "release-check", private: true, type: "module" }),
    );
    writeFileSync(
      join(clean, "src/index.ts"),
      'import { column, defineTable } from "@volvel/sdk";\nexport const orders = defineTable({ path: "orders", columns: { number: column.text({ required: true, description: "The number printed on it." }) } });\n',
    );
    mkdirSync(join(clean, "platform/docs/handbook"), { recursive: true });
    writeFileSync(
      join(clean, "platform/docs/handbook/index.md"),
      "---\ntitle: Handbook\n---\n\nStart here.\n",
    );
    run("npm", ["install", "--no-audit", "--no-fund", "--silent", cli, sdk, widgets], clean);
    const bin = join(clean, "node_modules/.bin/volvel");
    const help = run(bin, ["--help"], clean);
    if (!help.startsWith("Usage: volvel <command>"))
      problems.push("@volvel/cli: `volvel --help` did not print its usage.");
    const built = run(bin, ["build"], clean);
    if (!/table\s+orders/.test(built) || !/doc\s+handbook\/index/.test(built)) {
      problems.push(
        `@volvel/cli: \`volvel build\` did not list the table and the page of a repository:\n${built}`,
      );
    }
    console.log(
      "volvel --help and volvel build ran from the packed CLI, in a folder of their own.",
    );
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\nThe release would not be right: ${problems.length} problem${problems.length === 1 ? "" : "s"}.`,
  );
  process.exit(1);
}
console.log(`\n${PUBLISHED.length} packages pack as they should. Nothing was published.`);
