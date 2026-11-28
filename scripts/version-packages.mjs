// Turns the changesets in .changeset/ into the next version: a section of CHANGELOG.md written from
// what each changeset says, then the version itself on every package (by Changesets for the
// published ones, and by release-version.mjs for the rest and the SDK's constants). The release
// pull request is this script's output.
//
// `node scripts/version-packages.mjs notes <version>` prints that version's section, which the
// release workflow puts at the top of the GitHub release, above the pull requests GitHub lists.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setVersion } from "./release-version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The package whose version is the product's. Every published package shares it. */
const LEAD = "@volvel/sdk";
/** Audiences in the order a reader meets them. Any other heading follows, and "Changes" is last. */
const ORDER = ["For operators", "For tenant developers"];
const REST = "Changes";

/**
 * The CHANGELOG section for `version`, from changesets as `changeset status --output` gives them.
 * A changeset's `### Heading` sections are merged with the same heading from the others. What a
 * changeset says before any heading goes under "Changes".
 */
export function changelogSection(changesets, version, date) {
  const groups = new Map();
  const add = (heading, text) => {
    const body = text.trim();
    if (body === "") return;
    if (!groups.has(heading)) groups.set(heading, []);
    groups.get(heading).push(body);
  };
  for (const { summary } of changesets) {
    let heading = REST;
    let lines = [];
    for (const line of summary.split("\n")) {
      const match = /^###\s+(.+?)\s*$/.exec(line);
      if (match) {
        add(heading, lines.join("\n"));
        heading = match[1];
        lines = [];
      } else {
        lines.push(line);
      }
    }
    add(heading, lines.join("\n"));
  }
  const headings = [
    ...ORDER.filter((one) => groups.has(one)),
    ...[...groups.keys()].filter((one) => !ORDER.includes(one) && one !== REST),
    ...(groups.has(REST) ? [REST] : []),
  ];
  // "0.6.0, released 2026-12-01": the docs' changelog pages take the version from before the comma.
  const parts = [`## ${version}, released ${date}`];
  for (const heading of headings) {
    parts.push(`### ${heading}`, groups.get(heading).join("\n\n"));
  }
  return `${parts.join("\n\n")}\n`;
}

/** The changelog with `section` before its first version. */
export function insertSection(changelog, section) {
  const at = changelog.search(/^## /m);
  if (at === -1) return `${changelog.trimEnd()}\n\n${section}`;
  return `${changelog.slice(0, at)}${section}\n${changelog.slice(at)}`;
}

/** The section of `version`, without its heading, or undefined when the changelog has none. */
export function sectionFor(changelog, version) {
  const escaped = version.replaceAll(".", "\\.");
  const start = new RegExp(`^## ${escaped}(?:[ ,]|$)`, "m").exec(changelog);
  if (!start) return undefined;
  const from = changelog.indexOf("\n", start.index) + 1;
  const rest = changelog.slice(from);
  const end = rest.search(/^## /m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit" });
}

function versionPackages() {
  const scratch = mkdtempSync(join(tmpdir(), "volvel-version-"));
  const statusFile = join(scratch, "status.json");
  try {
    run("pnpm", ["exec", "changeset", "status", "--output", statusFile]);
    const status = JSON.parse(readFileSync(statusFile, "utf8"));
    if (status.changesets.length === 0) {
      console.log("No changesets: nothing to release.");
      return;
    }
    const lead = status.releases.find((one) => one.name === LEAD);
    if (!lead) throw new Error(`The changesets do not move ${LEAD}. Check .changeset/config.json.`);
    const version = lead.newVersion;
    const date = new Date().toISOString().slice(0, 10);
    const file = join(ROOT, "CHANGELOG.md");
    writeFileSync(
      file,
      insertSection(readFileSync(file, "utf8"), changelogSection(status.changesets, version, date)),
    );
    run("pnpm", ["exec", "changeset", "version"]);
    setVersion(ROOT, version);
    console.log(`Volvel ${version}: CHANGELOG.md has its section, and every package its version.`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "notes") {
    const version = process.argv[3] ?? "";
    const notes = sectionFor(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"), version);
    if (notes === undefined) {
      console.error(`CHANGELOG.md has no section for ${version}.`);
      process.exit(1);
    }
    console.log(notes);
  } else {
    versionPackages();
  }
}
