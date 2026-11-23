// Writes Volvel's own documentation as a static site, for any host that serves files.
//
//   pnpm docs:export --out <dir> --base /docs/ [--origin https://example.com] [--version 1.2.0]
//                    [--date 2026-11-19] [--versions <versions.json of earlier exports>]
//                    [--theme <css file>] [--diagrams <diagrams.js>] [--title "Volvel documentation"]
//
// It reads `dist/` (`pnpm --filter @volvel/docs build` writes it). The files are what is served at
// `--base`: `<dir>/index.html` is the page at `<base>`.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THEME, themeCss } from "@volvel/control-plane/testing";
import { directorySource, exportToDirectory } from "@volvel/docs-site/export";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const flags = {};
const argv = process.argv.slice(2);
for (let at = 0; at < argv.length; at += 2) {
  const name = argv[at];
  if (!name?.startsWith("--") || argv[at + 1] === undefined) {
    console.error(`Unknown or incomplete option "${name}". Options are written --name value.`);
    process.exit(2);
  }
  flags[name.slice(2)] = argv[at + 1];
}
const known = [
  "diagrams",
  "out",
  "base",
  "origin",
  "version",
  "date",
  "versions",
  "theme",
  "title",
];
for (const name of Object.keys(flags)) {
  if (!known.includes(name)) {
    console.error(`Unknown option --${name}. Known: ${known.map((one) => `--${one}`).join(", ")}.`);
    process.exit(2);
  }
}
if (!flags.out) {
  console.error("Say where to write the site: --out <dir>.");
  process.exit(2);
}
const dist = join(HERE, "dist");
if (!existsSync(join(dist, "manifest.json"))) {
  console.error("The documentation is not built. Run `pnpm --filter @volvel/docs build` first.");
  process.exit(1);
}
const out = resolve(flags.out);
let previous = [];
if (flags.versions) {
  try {
    previous = JSON.parse(readFileSync(flags.versions, "utf8")).versions ?? [];
  } catch {
    console.error(`${flags.versions} is not a versions.json this export wrote.`);
    process.exit(1);
  }
}
// The drawing script of diagrams is the console's own, built beside it.
const drawing = flags.diagrams ?? join(HERE, "../../apps/console/dist/_platform/diagrams.js");
const diagrams = existsSync(drawing) ? readFileSync(drawing) : undefined;
rmSync(out, { recursive: true, force: true });
const problems = [];
const written = await exportToDirectory(out, {
  source: directorySource(dist),
  base: flags.base ?? "/docs/",
  title: flags.title ?? "Volvel documentation",
  productName: "Volvel",
  theme: flags.theme ? readFileSync(flags.theme, "utf8") : themeCss(DEFAULT_THEME),
  ...(flags.origin ? { origin: flags.origin.replace(/\/+$/, "") } : {}),
  ...(flags.version ? { version: flags.version } : {}),
  ...(flags.date ? { date: flags.date } : {}),
  previous,
  ...(diagrams ? { diagrams } : {}),
  warn: (message) => problems.push(message),
});
for (const problem of problems) console.warn(`Warning: ${problem}`);
console.log(`Wrote ${written.length} files to ${out}, to be served at ${flags.base ?? "/docs/"}.`);
if (!diagrams) {
  console.log(
    "No drawing script for diagrams (apps/console/dist/_platform/diagrams.js): a diagram shows as its source.",
  );
}
if (!flags.origin) {
  console.log("No --origin: the sitemap lists paths. Give --origin https://… for whole addresses.");
}
