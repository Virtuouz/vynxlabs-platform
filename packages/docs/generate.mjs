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
import { LIST_LINKS, LIST_PAGES, listFiles } from "./generators/lists.mjs";
import { generate, referenceIndex } from "./generators/reference.mjs";

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

/** Every file that should be in generated/, as text. */
export async function expected() {
  const files = generate();
  for (const [name, text] of await apiFiles()) files.set(name, text);
  for (const [name, text] of listFiles()) files.set(name, text);
  files.set(
    "index.md",
    referenceIndex(
      ["- [The API](api/index): every route, and what it needs", ...LIST_LINKS],
      LIST_PAGES,
    ),
  );
  return files;
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
