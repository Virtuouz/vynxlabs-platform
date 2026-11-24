import { createHash } from "node:crypto";
import { DOCS_CSS } from "./css.js";
import { DOCS_SCRIPT } from "./script.js";
import { THEME_SCRIPT } from "./theme-script.js";

/** The platform's own files of a docs site: its stylesheet, its script, and the small script that sets light or dark before the first paint. */
const FILES = { css: DOCS_CSS, js: DOCS_SCRIPT, theme: THEME_SCRIPT } as const;
type Kind = keyof typeof FILES;

const digest = (kind: Kind) => createHash("sha256").update(FILES[kind]).digest("hex").slice(0, 10);
const HASHES: Record<Kind, string> = {
  css: digest("css"),
  js: digest("js"),
  theme: digest("theme"),
};

/**
 * Where the stylesheet or the script is served from. The name holds a hash of the file, so a file
 * changed by an upgrade has a new name, and a page and the script it loads can never be of two
 * releases. `platform` ends in a slash.
 */
export function docsAssetHref(platform: string, kind: Kind): string {
  return kind === "theme"
    ? `${platform}docs-theme.${HASHES.theme}.js`
    : `${platform}docs.${HASHES[kind]}.${kind}`;
}

/** The theme script, which a page loads before it paints. */
export const themeScriptHref = (platform: string) => docsAssetHref(platform, "theme");

/** The names of the platform's docs files, as a request path names them: what the servers answer with `docsAsset`. */
export const DOCS_ASSET_PATH = /^\/_platform\/(docs(?:-theme)?(?:\.[0-9a-f]{10})?\.(?:css|js))$/;

/**
 * The file a request for the platform's docs files asks for. A hashed name is answered only while
 * it names the file as it is, and is for ever the same file (`immutable`). The old unhashed names
 * are answered as they were, with the file as it is now, for a page drawn by an older release
 * that a browser still holds.
 */
export function docsAsset(
  name: string,
): { body: string; type: string; immutable: boolean } | undefined {
  const found = /^docs(-theme)?(?:\.([0-9a-f]{10}))?\.(css|js)$/.exec(name);
  if (!found) return undefined;
  // The theme script is the one `.js` file with its own name; a stylesheet of that name is nothing.
  if (found[1] && found[3] !== "js") return undefined;
  const kind: Kind = found[1] ? "theme" : (found[3] as "css" | "js");
  if (found[2] !== undefined && found[2] !== HASHES[kind]) return undefined;
  return {
    body: FILES[kind],
    type: kind === "css" ? "text/css" : "text/javascript",
    immutable: found[2] !== undefined,
  };
}
