/**
 * A path on this same address, or nothing. Never another site.
 *
 * A browser drops a tab or a line break from an address before it reads it, so "/<tab>/x.example"
 * is "//x.example". A backslash is read as a slash. So the value may hold no backslash, no control
 * character and no white space anywhere, and must not begin with two slashes, nor do so once
 * its dot segments are resolved.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
const NOT_IN_A_PATH = /[\\\x00-\x20\x7f-\x9f\u2028\u2029]/;

export function ownPath(raw: string | null | undefined): string | undefined {
  if (!raw?.startsWith("/") || raw.startsWith("//") || NOT_IN_A_PATH.test(raw)) return undefined;
  // A browser takes the dot segments out before it looks at the address, so "/.//x.example" is
  // "//x.example". The path is read as a browser reads it, and what comes out must still be a
  // path on the same address.
  try {
    const read = new URL(raw, "http://own.invalid");
    if (read.origin !== "http://own.invalid" || read.pathname.startsWith("//")) return undefined;
  } catch {
    return undefined;
  }
  return raw;
}
