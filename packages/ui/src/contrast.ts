/**
 * Contrast between two colors, as WCAG 2 measures it: from 1 (the same) to 21
 * (black on white). Text needs 4.5 or more, large text and the edges of
 * controls 3 or more.
 */
export function contrastRatio(a: string, b: string): number | undefined {
  const one = luminance(a);
  const two = luminance(b);
  if (one === undefined || two === undefined) return undefined;
  const [light, dark] = one > two ? [one, two] : [two, one];
  return (light + 0.05) / (dark + 0.05);
}

/** The least each kind of pair needs. */
export const CONTRAST_NEEDED = { text: 4.5, edge: 3 } as const;

/** A color's relative luminance, from `#rgb`, `#rrggbb` or `rgb(r, g, b)`. Anything else gives nothing. */
export function luminance(color: string): number | undefined {
  const rgb = channels(color.trim().toLowerCase());
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function channels(color: string): [number, number, number] | undefined {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(color);
  if (short) {
    return short.slice(1).map((digit) => Number.parseInt(`${digit}${digit}`, 16)) as [
      number,
      number,
      number,
    ];
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(color);
  if (long)
    return long.slice(1).map((pair) => Number.parseInt(pair, 16)) as [number, number, number];
  const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(color);
  if (fn) return fn.slice(1).map(Number) as [number, number, number];
  return undefined;
}
