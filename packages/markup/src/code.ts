/** A description's words, in order, with what was written between backticks marked as code. */
export function splitCode(text: string): { text: string; code?: true }[] {
  const out: { text: string; code?: true }[] = [];
  let last = 0;
  for (const found of text.matchAll(/`([^`\n]+)`/g)) {
    const at = found.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: found[1] as string, code: true });
    last = at + found[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
