/**
 * Reads a version 3 source map, enough to turn a line and column in a
 * bundle's code into a line and column in the repository's TypeScript. Small
 * on purpose: the control plane only ever asks where one failure happened.
 */

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGIT = new Map([...BASE64].map((char, index) => [char, index]));

/** Decodes one segment's base64 VLQ numbers. */
function decodeSegment(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = DIGIT.get(char);
    if (digit === undefined) return [];
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

export interface Position {
  source: string;
  /** 1-based, as editors and stack traces count. */
  line: number;
  /** 1-based. */
  column: number;
}

/**
 * Where a place in the generated code came from. `line` and `column` are
 * 1-based, as in a stack trace. Undefined when the map says nothing there.
 */
export function originalPosition(map: string, line: number, column: number): Position | undefined {
  let parsed: { mappings?: string; sources?: string[] };
  try {
    parsed = JSON.parse(map);
  } catch {
    return undefined;
  }
  const lines = (parsed.mappings ?? "").split(";");
  const sources = parsed.sources ?? [];
  // The fields are relative to the previous segment, across lines, except the generated column.
  let source = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let found: Position | undefined;
  for (let index = 0; index < lines.length && index < line; index++) {
    let generatedColumn = 0;
    for (const segment of (lines[index] ?? "").split(",")) {
      if (!segment) continue;
      const fields = decodeSegment(segment);
      generatedColumn += fields[0] ?? 0;
      if (fields.length < 4) continue;
      source += fields[1] ?? 0;
      sourceLine += fields[2] ?? 0;
      sourceColumn += fields[3] ?? 0;
      if (index === line - 1 && generatedColumn <= column - 1) {
        const name = sources[source];
        if (name !== undefined)
          found = { source: name, line: sourceLine + 1, column: sourceColumn + 1 };
      }
    }
  }
  return found;
}

/**
 * The first place in a stack that lies in a bundle's module, as written by the
 * worker: `<digest>.mjs:line:column`.
 */
export function bundleFrames(stack: string, digest: string): { line: number; column: number }[] {
  const pattern = new RegExp(`${digest}\\.mjs:(\\d+):(\\d+)`, "g");
  return [...stack.matchAll(pattern)].map((match) => ({
    line: Number(match[1]),
    column: Number(match[2]),
  }));
}
