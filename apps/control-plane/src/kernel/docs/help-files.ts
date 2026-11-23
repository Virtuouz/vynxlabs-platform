import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/** A picture of the console named by what it holds: its name ends in a hash of its content, so it never changes. */
const HASHED = /^assets\/screenshots\/[^/]+\.[0-9a-f]{12}\.png$/;

export interface HelpFile {
  body: Buffer;
  type: string;
  /** Set when the file was read from a compressed copy. */
  encoding?: "br" | "gzip";
  /** Whether the name says what the file holds for ever. */
  immutable: boolean;
}

/**
 * A file of the documentation the console carries, by its name under `help/` (`manifest.json`,
 * `assets/screenshots/…`). The best compressed copy the build left beside it that the browser
 * accepts is sent. Nothing for a name that is not a file there, or that leaves the folder.
 */
export function helpFile(consoleDir: string, name: string, accepts = ""): HelpFile | undefined {
  if (name === "" || name.includes("\0") || name.split(/[\\/]/).includes("..")) return undefined;
  const root = normalize(join(consoleDir, "help"));
  const file = normalize(join(root, name));
  if (!file.startsWith(root + sep)) return undefined;
  const isFile = (path: string) => {
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  };
  if (!isFile(file)) return undefined;
  const base = {
    type: TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    immutable: HASHED.test(name.split(sep).join("/")),
  };
  for (const [encoding, suffix] of [
    ["br", ".br"],
    ["gzip", ".gz"],
  ] as const) {
    if (new RegExp(`\\b${encoding}\\b`).test(accepts) && isFile(file + suffix)) {
      return { ...base, body: readFileSync(file + suffix), encoding };
    }
  }
  return { ...base, body: readFileSync(file) };
}
