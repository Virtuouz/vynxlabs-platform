// Volvel's own changelog, as the pages of a changelog: one entry for each release in the repository's
// CHANGELOG.md, and one for everything that is not released yet. CHANGELOG.md stays the one place
// it is written; these pages are drawn from it, so `docs:check` says when they are not what it says.
//
// `changelogFiles()` gives every file as text, by its name under the changelog's folder. The folder
// is `changelog/` of the Get started collection's reference (see `placeOf` in generate.mjs), and
// `::changelog` on "What's new" lists it. The file's own text is read; nothing is fetched.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { page } from "./schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CHANGELOG_FILE = join(HERE, "..", "..", "..", "CHANGELOG.md");

/** Where the entries are kept, under the folder generated pages mount in. */
export const CHANGELOG_FOLDER = "changelog";

const UNRELEASED = /^Unreleased: (.+)$/;

/** The sections of a changelog: what comes before the first `## `, and each `## ` with its body. */
export function sectionsOf(text) {
  const out = [];
  let current;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], lines: [] };
      out.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return out.map((one) => ({ title: one.title, body: one.lines.join("\n").trim() }));
}

const capital = (words) => words.charAt(0).toUpperCase() + words.slice(1);

/** A version as a file name: `0.5.0` is `0-5-0`. */
const nameOf = (version) =>
  version
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * A link to a file of the repository leads nowhere in the documentation: it is its words, and the
 * file's name stays where the words give it. Links to an address or a mail stay links.
 */
const unlinked = (body) =>
  body.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, words, to) =>
    /^(https?:|mailto:|#)/i.test(to) ? all : words,
  );

/** A release section's headings one level up, so that the entry's title is the only `#` above them. */
const raised = (body) => body.replace(/^(#{3,6}) /gm, (_, marks) => `${marks.slice(1)} `);

/** Every file of the changelog's pages, as text, by its name under the changelog's folder. */
export function changelogFiles(source = readFileSync(CHANGELOG_FILE, "utf8")) {
  const files = new Map();
  const unreleased = [];
  for (const section of sectionsOf(source)) {
    const phase = UNRELEASED.exec(section.title);
    if (phase) {
      unreleased.push(`## ${capital(phase[1])}\n\n${unlinked(section.body)}`);
      continue;
    }
    // "0.5.0, not yet released": the version is the title. Only the Unreleased entry says it is
    // not released: a version with no known date shows its number and no date.
    const version = section.title.replace(/,.*$/, "").trim();
    files.set(
      `${CHANGELOG_FOLDER}/${nameOf(version)}.md`,
      page(
        {
          title: version,
          description: `What changed in ${version}.`,
        },
        raised(unlinked(section.body)),
      ),
    );
  }
  if (unreleased.length > 0) {
    files.set(
      `${CHANGELOG_FOLDER}/unreleased.md`,
      page(
        {
          title: "Unreleased",
          description: "Everything built since the last release, by phase, newest first.",
        },
        unreleased.join("\n\n"),
      ),
    );
  }
  if (files.size > 0) {
    files.set(
      `${CHANGELOG_FOLDER}/index.md`,
      page(
        {
          title: "Changelog",
          icon: "calendar",
          description: "What changed in each release, drawn from the repository's CHANGELOG.md.",
        },
        "These pages are not written. Each is drawn from a section of the repository's `CHANGELOG.md`, when a version is built. [What's new](../whats-new) lists the newest.",
      ),
    );
  }
  return files;
}
