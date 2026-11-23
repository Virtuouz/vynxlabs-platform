export function recordProblems(input: {
  written: Iterable<string>;
  types: Record<string, string>;
  has: (path: string) => boolean;
  unchecked: string[];
}): string[];
