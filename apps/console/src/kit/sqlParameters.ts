/** The most parameters a saved query holds (its manifest's limit). */
export const MOST_PARAMETERS = 20;

/**
 * The highest `$n` a query's text uses, outside what is not code: strings, quoted names, both
 * kinds of comment and dollar-quoted text. The text is read once, as Postgres reads it, so a
 * quote inside a comment does not hide a parameter after it, nor a `$` inside a string make one.
 */
export function parametersIn(text: string): number {
  let most = 0;
  let at = 0;
  const end = text.length;
  const skipTo = (marker: string, from: number) => {
    const found = text.indexOf(marker, from);
    return found < 0 ? end : found + marker.length;
  };
  while (at < end) {
    const char = text[at] as string;
    const next = text[at + 1];
    if (char === "'" || char === '"') {
      // A quote inside is doubled.
      at++;
      while (at < end) {
        if (text[at] === char) {
          if (text[at + 1] === char) at += 2;
          else break;
        } else at++;
      }
      at++;
    } else if (char === "-" && next === "-") {
      at = skipTo("\n", at + 2);
    } else if (char === "/" && next === "*") {
      // Block comments nest.
      let depth = 1;
      at += 2;
      while (at < end && depth > 0) {
        if (text[at] === "/" && text[at + 1] === "*") {
          depth++;
          at += 2;
        } else if (text[at] === "*" && text[at + 1] === "/") {
          depth--;
          at += 2;
        } else at++;
      }
    } else if (char === "$" && !/[A-Za-z0-9_$]/.test(text[at - 1] ?? "")) {
      const digits = /^\$(\d+)/.exec(text.slice(at, at + 12));
      const tag = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(text.slice(at));
      if (digits) {
        most = Math.max(most, Number(digits[1]));
        at += digits[0].length;
      } else if (tag) {
        at = skipTo(tag[0], at + tag[0].length);
      } else at++;
    } else at++;
  }
  return Math.min(most, MOST_PARAMETERS);
}
