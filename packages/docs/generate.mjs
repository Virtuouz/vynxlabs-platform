// Writes the generated pages of reference into generated/. Run by the build
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
import { generate, referenceIndex } from "./generators/reference.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GENERATED = join(HERE, "generated");

/** Pages something else writes into generated/, and this leaves alone: the API's, which needs a database. */
const KEPT = new Set(["api.md", "openapi.json"]);

function existing(folder = GENERATED) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name);
    return statSync(full).isDirectory()
      ? existing(full)
      : [relative(GENERATED, full).split("\\").join("/")];
  });
}

/** Every file that should be in generated/, as text. */
export function expected() {
  const files = generate();
  const api = existsSync(join(GENERATED, "api.md"));
  files.set(
    "index.md",
    referenceIndex(api ? ["- [The API](api): every route, and what it needs"] : []),
  );
  return files;
}

/** What differs between generated/ and what the code says now. Empty when they agree. */
export function stale() {
  const files = expected();
  const out = [];
  for (const [name, text] of files) {
    const file = join(GENERATED, name);
    if (!existsSync(file)) out.push(`generated/${name} is missing.`);
    else if (readFileSync(file, "utf8") !== text)
      out.push(`generated/${name} is not what the code says now.`);
  }
  for (const name of existing()) {
    if (!files.has(name) && !KEPT.has(name))
      out.push(`generated/${name} is drawn from nothing any more.`);
  }
  return out;
}

export function write() {
  const files = expected();
  for (const name of existing()) {
    if (!files.has(name) && !KEPT.has(name)) rmSync(join(GENERATED, name));
  }
  for (const [name, text] of files) {
    const file = join(GENERATED, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return files.size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Wrote ${write()} pages of reference into packages/docs/generated.`);
}
