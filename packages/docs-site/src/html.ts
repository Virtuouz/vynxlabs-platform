import { splitCode } from "@volvel/markup";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char] as string);

/** The links to a site's icons, by size. Nothing without an address for them. */
export function iconLinks(iconsHref: string | undefined): string {
  if (!iconsHref) return "";
  const at = escapeHtml(iconsHref);
  return `<link rel="icon" type="image/png" sizes="32x32" href="${at}/32"><link rel="apple-touch-icon" href="${at}/180">`;
}

/** A description as HTML: its words escaped, and what is between backticks drawn as code. One rule, everywhere a description is shown. */
export function described(text: string): string {
  return splitCode(text)
    .map((part) => (part.code ? `<code>${escapeHtml(part.text)}</code>` : escapeHtml(part.text)))
    .join("");
}
