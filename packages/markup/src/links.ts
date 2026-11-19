import type { LinkKind } from "./registry.js";

/**
 * What kind of address a link goes to. Anything with a scheme other than
 * http, https or mailto is refused, whatever it is, and so is an address that
 * names another host without a scheme. Spaces and control characters are taken
 * out before looking, as a browser takes them out before following.
 */
export function linkKind(href: string): LinkKind | "refused" {
  const bare = [...href]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x20 && (code < 0x7f || code > 0x9f);
    })
    .join("");
  if (bare === "") return "refused";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(bare);
  if (scheme) {
    const name = (scheme[1] as string).toLowerCase();
    if (name === "http" || name === "https") return "http";
    if (name === "mailto") return "mailto";
    return "refused";
  }
  if (bare.startsWith("//") || bare.startsWith("\\")) return "refused";
  return "relative";
}

/** Where a picture comes from: a file beside the page, an https address, or somewhere refused. */
export function imageKind(src: string): "relative" | "https" | "refused" {
  const kind = linkKind(src);
  if (kind === "relative") return "relative";
  if (kind === "http" && /^https:/i.test(src.trim())) return "https";
  return "refused";
}

/** A link's address when a profile lets it be followed, and nothing when it does not. */
export function safeHref(href: string, allowed: ReadonlySet<LinkKind>): string | undefined {
  const kind = linkKind(href);
  return kind !== "refused" && allowed.has(kind) ? href.trim() : undefined;
}

/** Whether a link leaves the documentation for another site. */
export function isExternal(href: string): boolean {
  return linkKind(href) === "http";
}
