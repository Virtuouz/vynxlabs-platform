// Writes the generated of reference and of the API into generated/. Run by the build
// and by `pnpm docs:generate`.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { apiFiles } from "./generators/api.mjs";
import { CHANGELOG_FOLDER, changelogFiles } from "./generators/changelog.mjs";
import { LIST_LINKS, LIST_PAGES, listFiles } from "./generators/lists.mjs";
import { generate, referenceIndex } from "./generators/reference.mjs";
import { sdkFiles } from "./generators/sdk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GENERATED = join(HERE, "generated");

function existing(folder = GENERATED) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name);
    return statSync(full).isDirectory()
      ? existing(full)
      : [relative(GENERATED, full).split("\\").join("/")];
  });
}

/**
 * Where a generated page lives: in the collection it belongs to, under that collection's
 * `reference/`. What each page says is drawn from the code; where it is shown is decided here.
 * The permissions are for whoever administers a tenant, the settings for whoever hosts the
 * instance, and the rest (kinds, API, command line, error codes, the syntax of pages) for
 * whoever writes for the product.
 */
export function placeOf(name) {
  if (!name.endsWith(".md")) return name;
  if (name === "permissions.md") return "administer/reference/permissions.md";
  if (name === "settings.md") return "self-host/reference/settings.md";
  if (name === "metrics.md") return "self-host/reference/metrics.md";
  if (name === "audit-actions.md") return "administer/reference/audit-actions.md";
  // The changelog's entries are Get started's reference: "What's new" there lists them.
  if (name.startsWith(`${CHANGELOG_FOLDER}/`)) return `start/reference/${name}`;
  return `develop/reference/${name}`;
}

/** The address a generated page had when it was mounted under `reference/`, without `.md`. */
const wasAt = (name) => `reference/${name.replace(/\.md$/, "")}`;
const sameAddress = (one, other) => one.replace(/\/index$/, "") === other.replace(/\/index$/, "");

/** A page's own text, with where it was before the collections existed said in its `moved_from`. */
function withMoved(name, text) {
  const was = wasAt(name);
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front) return text;
  const lines = front[1].split("\n");
  const at = lines.findIndex((line) => line.startsWith("moved_from:"));
  if (at === -1) {
    return text.replace(front[0], `---\n${front[1]}\nmoved_from:\n  - ${was}\n---\n`);
  }
  // A generator may write the list on the one line: it already says where the page was.
  const inline = /^moved_from:\s*\[(.*)\]\s*$/.exec(lines[at]);
  if (inline) {
    const listed = inline[1].split(",").map((one) => one.trim().replace(/^["']|["']$/g, ""));
    if (listed.some((one) => sameAddress(one, was))) return text;
    lines[at] =
      `moved_from: [${[...inline[1].split(",").map((one) => one.trim()), JSON.stringify(was)].join(", ")}]`;
    return text.replace(front[0], `---\n${lines.join("\n")}\n---\n`);
  }
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith("  - ")) end++;
  const listed = lines.slice(at + 1, end).map((line) => line.slice(4).replace(/^["']|["']$/g, ""));
  if (listed.some((one) => sameAddress(one, was))) return text;
  lines.splice(end, 0, `  - ${was}`);
  return text.replace(front[0], `---\n${lines.join("\n")}\n---\n`);
}

/** Every file that should be in generated/, as text, by the path it is written to. */
export async function expected() {
  const made = generate();
  for (const [name, text] of await apiFiles()) made.set(name, text);
  for (const [name, text] of listFiles()) made.set(name, text);
  for (const [name, text] of sdkFiles()) made.set(name, text);
  for (const [name, text] of changelogFiles()) made.set(name, text);
  made.set(
    "index.md",
    referenceIndex(
      ["- [The API](api/index): every route, and what it needs", ...LIST_LINKS],
      [...LIST_PAGES, ...writtenReference()],
    ),
  );
  const files = new Map();
  for (const [name, text] of made) {
    // A changelog entry was never at `reference/…`: nothing moved from there.
    const moved = name.endsWith(".md") && !name.startsWith(`${CHANGELOG_FOLDER}/`);
    files.set(placeOf(name), moved ? withMoved(name, text) : text);
  }
  return files;
}

/**
 * Folders and pages written by hand beside the generated ones, under content/develop/reference/: the
 * Develop collection's reference index is generated, so it lists them too, after the drawn lists.
 */
function writtenReference() {
  const folder = join(HERE, "content", "develop", "reference");
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name !== "index.md" && !name.startsWith("."))
    .filter((name) => statSync(join(folder, name)).isDirectory() || name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();
}

/** What differs between generated/ and what the code says now. Empty when they agree. */
export async function stale() {
  const files = await expected();
  const out = [];
  for (const [name, text] of files) {
    const file = join(GENERATED, name);
    if (!existsSync(file)) out.push(`generated/${name} is missing.`);
    else if (readFileSync(file, "utf8") !== text)
      out.push(`generated/${name} is not what the code says now.`);
  }
  for (const name of existing()) {
    if (!files.has(name)) out.push(`generated/${name} is drawn from nothing any more.`);
  }
  return out;
}

export async function write() {
  const files = await expected();
  for (const name of existing()) {
    if (!files.has(name)) rmSync(join(GENERATED, name));
  }
  for (const [name, text] of files) {
    const file = join(GENERATED, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return files.size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Wrote ${await write()} files of reference into packages/docs/generated.`);
}
