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
