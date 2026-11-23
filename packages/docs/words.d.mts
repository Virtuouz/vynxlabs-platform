export const BRITISH: RegExp;
export const AVOIDED: { pattern: RegExp; say: string }[];
export function outsideCode(text: string): string[];
export function wordProblems(text: string): { line: number; word: string; say: string }[];
