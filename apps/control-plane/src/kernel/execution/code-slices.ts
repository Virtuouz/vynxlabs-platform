/**
 * What one export of a bundle's code is, as text, so that a deploy can tell which scripts' code
 * changed when their manifests did not. A bundle's code is one ES module. Its top-level
 * statements start at the first column, as a bundler writes them; an export is the statement
 * that declares it, or the one an `export { local as name }` list points at.
 */

const START =
  /^(?:export\s+)?(?:async\s+function|function|class|var|let|const)\s+([A-Za-z_$][\w$]*)/;

export function exportSlices(code: string): Map<string, string> {
  const chunks: { local?: string; exported: boolean; text: string[] }[] = [];
  for (const line of code.split("\n")) {
    const begins = /^\S/.test(line) && !/^[)}\]]/.test(line);
    if (begins || chunks.length === 0) {
      const declared = START.exec(line);
      chunks.push({
        ...(declared?.[1] ? { local: declared[1] } : {}),
        exported: /^export\s/.test(line),
        text: [line],
      });
    } else {
      chunks[chunks.length - 1]?.text.push(line);
    }
  }
  const byLocal = new Map<string, string>();
  const slices = new Map<string, string>();
  for (const chunk of chunks) {
    if (chunk.local === undefined) continue;
    const text = chunk.text.join("\n");
    byLocal.set(chunk.local, text);
    if (chunk.exported) slices.set(chunk.local, text);
  }
  // `export { a as b, c };`
  for (const match of code.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of (match[1] ?? "").split(",")) {
      const [local, name] = part.trim().split(/\s+as\s+/);
      if (!local) continue;
      const text = byLocal.get(local);
      if (text !== undefined) slices.set(name ?? local, text);
    }
  }
  return slices;
}

/**
 * Whether the code behind one export is not what it was. An export that cannot be found in
 * either module counts as changed when the modules differ at all: better to say a script was
 * updated than to say nothing changed.
 */
export function exportChanged(before: string, after: string, name: string): boolean {
  if (before === after) return false;
  const was = exportSlices(before).get(name);
  const now = exportSlices(after).get(name);
  if (was === undefined || now === undefined) return true;
  return was !== now;
}
