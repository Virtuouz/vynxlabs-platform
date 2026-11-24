/**
 * The locale the person reading a page writes numbers in: the browser's first preferred
 * language, and US English where there is no browser or it says nothing. The one place
 * numbers take their marks from, so a figure reads back as it was typed (D38).
 */
export function readerLocale(): string {
  if (typeof navigator === "undefined") return "en-US";
  return navigator.languages?.[0] || navigator.language || "en-US";
}

/** A locale the runtime knows, or the reader's own when it is one it does not. */
export function usableLocale(locale: string | undefined): string {
  const wanted = locale || readerLocale();
  try {
    return Intl.NumberFormat.supportedLocalesOf(wanted)[0] ?? "en-US";
  } catch {
    return "en-US";
  }
}
