import { createHash } from "node:crypto";
import { DOCS_CSS } from "./css.js";
import { DOCS_SCRIPT } from "./script.js";

/** The platform's own files of a docs site: its stylesheet and its script. */
const FILES = { css: DOCS_CSS, js: DOCS_SCRIPT } as const;
type Kind = keyof typeof FILES;

const digest = (kind: Kind) => createHash("sha256").update(FILES[kind]).digest("hex").slice(0, 10);
const HASHES: Record<Kind, string> = { css: digest("css"), js: digest("js") };

/**
 * Where the stylesheet or the script is served from. The name holds a hash of the file, so a file
 * changed by an upgrade has a new name, and a page and the script it loads can never be of two
 * releases. `platform` ends in a slash.
 */
export function docsAssetHref(platform: string, kind: Kind): string {
  return `${platform}docs.${HASHES[kind]}.${kind}`;
}

/**
 * The file a request for the platform's docs files asks for. A hashed name is answered only while
 * it names the file as it is, and is for ever the same file (`immutable`). The old unhashed names
 * are answered as they were, with the file as it is now, for a page drawn by an older release
 * that a browser still holds.
 */
export function docsAsset(
  name: string,
): { body: string; type: string; immutable: boolean } | undefined {
  const found = /^docs(?:\.([0-9a-f]{10}))?\.(css|js)$/.exec(name);
  if (!found) return undefined;
  const kind = found[2] as Kind;
  if (found[1] !== undefined && found[1] !== HASHES[kind]) return undefined;
  return {
    body: FILES[kind],
    type: kind === "js" ? "text/javascript" : "text/css",
    immutable: found[1] !== undefined,
  };
}
