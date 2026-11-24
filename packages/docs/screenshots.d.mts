export const CLOCK: string;
export const THEMES: string[];
export const INDEX: string;
export const SHOTS: {
  name: string;
  address: string;
  as: string;
  setup: string;
  themes: string[];
  viewport: { width: number; height: number };
  ready: Record<string, unknown>[];
  steps: Record<string, unknown>[];
  mask: (string | { role: string; hasText: string })[];
}[];
export function shotNames(): string[];
export function fileName(name: string, theme: string, bytes: Uint8Array): string;
export function readIndex(folder: string): Record<string, Record<string, string>>;
export function writeIndex(folder: string, shots: Record<string, Record<string, string>>): void;
export function missing(taken: Record<string, Record<string, string>>): string[];
