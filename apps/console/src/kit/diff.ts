/** A line of a diff: the same on both sides, only on the left (removed), or only on the right (added). */
export interface DiffLine {
  type: "same" | "removed" | "added";
  text: string;
}

/** Past this many lines a side, the diff is said to be too long to work out line by line. */
export const MAX_DIFF_LINES = 4000;

/**
 * The lines of `before` and `after` as one sequence of same, removed and
 * added lines, by their longest common subsequence. Lines the two share at
 * the start and the end are taken off first, so a small change in a large
 * body is cheap.
 */
export function lineDiff(before: string[], after: string[]): DiffLine[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  const middle: DiffLine[] = [];
  if (a.length * b.length > (MAX_DIFF_LINES * MAX_DIFF_LINES) / 4) {
    for (const text of a) middle.push({ type: "removed", text });
    for (const text of b) middle.push({ type: "added", text });
  } else {
    // lengths[i][j]: the longest common subsequence of a[i..] and b[j..].
    const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i--) {
      const row = lengths[i] as number[];
      const next = lengths[i + 1] as number[];
      for (let j = b.length - 1; j >= 0; j--) {
        row[j] =
          a[i] === b[j]
            ? (next[j + 1] as number) + 1
            : Math.max(next[j] as number, row[j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        middle.push({ type: "same", text: a[i] as string });
        i++;
        j++;
      } else if ((lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0)) {
        middle.push({ type: "removed", text: a[i] as string });
        i++;
      } else {
        middle.push({ type: "added", text: b[j] as string });
        j++;
      }
    }
    for (; i < a.length; i++) middle.push({ type: "removed", text: a[i] as string });
    for (; j < b.length; j++) middle.push({ type: "added", text: b[j] as string });
  }
  return [
    ...before.slice(0, start).map((text) => ({ type: "same" as const, text })),
    ...middle,
    ...before.slice(endBefore).map((text) => ({ type: "same" as const, text })),
  ];
}

/** A value as pretty JSON with its keys in order, so two bodies line up wherever they agree. */
export function sortedJson(value: unknown): string[] {
  const sort = (one: unknown): unknown => {
    if (Array.isArray(one)) return one.map(sort);
    if (one && typeof one === "object") {
      return Object.fromEntries(
        Object.keys(one)
          .sort()
          .map((key) => [key, sort((one as Record<string, unknown>)[key])]),
      );
    }
    return one;
  };
  if (value === null || value === undefined) return [];
  return JSON.stringify(sort(value), null, 2).split("\n");
}

/**
 * Same lines far from any change folded into one marker, keeping `context`
 * lines around each change: what a reader needs of a long body.
 */
export function folded(
  lines: DiffLine[],
  context = 3,
): (DiffLine | { type: "fold"; count: number })[] {
  const near = new Set<number>();
  lines.forEach((line, index) => {
    if (line.type === "same") return;
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k++
    )
      near.add(k);
  });
  const out: (DiffLine | { type: "fold"; count: number })[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (line.type !== "same" || near.has(index)) {
      if (skipped > 0) out.push({ type: "fold", count: skipped });
      skipped = 0;
      out.push(line);
    } else skipped++;
  });
  if (skipped > 0) out.push({ type: "fold", count: skipped });
  return out;
}
