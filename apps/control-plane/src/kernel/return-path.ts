/**
 * A path on this same address, or nothing. Never another site.
 *
 * A browser drops a tab or a line break from an address before it reads it, so "/<tab>/x.example"
 * is "//x.example". A backslash is read as a slash. So the value may hold no backslash, no control
 * character and no white space anywhere, and must not begin with two slashes.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
const NOT_IN_A_PATH = /[\\\x00-\x20\x7f-\x9f\u2028\u2029]/;

export function ownPath(raw: string | null | undefined): string | undefined {
  if (!raw?.startsWith("/") || raw.startsWith("//") || NOT_IN_A_PATH.test(raw)) return undefined;
  return raw;
}
