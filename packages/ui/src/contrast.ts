/**
 * Contrast between two colors, as WCAG 2 measures it: from 1 (the same) to 21
 * (black on white). Text needs 4.5 or more, large text and the edges of
 * controls 3 or more. A color with some transparency is laid over the ground it
 * is drawn on first (and that over the page, `white` unless said), so a faint ink
 * is judged as the faint ink it is.
 */
export function contrastRatio(a: string, b: string, page = "#ffffff"): number | undefined {
  const ink = parseColor(a);
  const ground = parseColor(b);
  const behind = parseColor(page) ?? { r: 255, g: 255, b: 255, a: 1 };
  if (!ink || !ground) return undefined;
  const solidGround = over(ground, { ...behind, a: 1 });
  const one = relative(over(ink, solidGround));
  const two = relative(solidGround);
  const [light, dark] = one > two ? [one, two] : [two, one];
  return (light + 0.05) / (dark + 0.05);
}

/** The least each kind of pair needs. */
export const CONTRAST_NEEDED = { text: 4.5, edge: 3 } as const;

/** A color's relative luminance when it is solid. Anything that is not a color gives nothing. */
export function luminance(color: string): number | undefined {
  const parsed = parseColor(color);
  return parsed ? relative(over(parsed, { r: 255, g: 255, b: 255, a: 1 })) : undefined;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const relative = (color: Rgba): number => {
  const [r, g, b] = [color.r, color.g, color.b].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** `top` laid over a solid `ground`. */
const over = (top: Rgba, ground: Rgba): Rgba => ({
  r: top.r * top.a + ground.r * (1 - top.a),
  g: top.g * top.a + ground.g * (1 - top.a),
  b: top.b * top.a + ground.b * (1 - top.a),
  a: 1,
});

const NAMED = new Map(
  "aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32"
    .split(" ")
    .map((pair) => pair.split(":") as [string, string]),
);

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Reads a CSS color written as a name, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`,
 * `hsl()` or `hsla()` (commas or spaces, `/` before an alpha). Anything else, a `var()` or a color
 * function this does not know, gives nothing: it is not checked, and is said not to be.
 */
export function parseColor(input: string): Rgba | undefined {
  const color = input.trim().toLowerCase();
  if (color === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED.get(color);
  if (named) return fromHex(named);
  if (color.startsWith("#")) return fromHex(color.slice(1));
  const fn = /^(rgba?|hsla?)\(\s*([^)]*)\)$/.exec(color);
  if (!fn) return undefined;
  const parts = (fn[2] as string).split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return undefined;
  const alpha = parts[3] === undefined ? 1 : amount(parts[3], 1);
  if (alpha === undefined) return undefined;
  if (fn[1]?.startsWith("rgb")) {
    const channels = parts.slice(0, 3).map((part) => amount(part, 255));
    if (channels.some((value) => value === undefined)) return undefined;
    const [r, g, b] = channels as [number, number, number];
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(alpha, 0, 1) };
  }
  const hue = /^(-?[\d.]+)(deg|turn)?$/.exec(parts[0] as string);
  const saturation = percent(parts[1] as string);
  const lightness = percent(parts[2] as string);
  if (!hue || saturation === undefined || lightness === undefined) return undefined;
  const h = ((((Number(hue[1]) * (hue[2] === "turn" ? 360 : 1)) % 360) + 360) % 360) / 30;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const k = (n: number) => (n + h) % 12;
  const f = (n: number) =>
    (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255;
  return { r: Math.round(f(0)), g: Math.round(f(8)), b: Math.round(f(4)), a: clamp(alpha, 0, 1) };
}

/** A number, or a percent of `whole`. */
function amount(part: string, whole: number): number | undefined {
  const found = /^(-?[\d.]+)(%?)$/.exec(part);
  if (!found || Number.isNaN(Number(found[1]))) return undefined;
  return found[2] ? (Number(found[1]) / 100) * whole : Number(found[1]);
}

function percent(part: string): number | undefined {
  const found = /^(-?[\d.]+)%$/.exec(part);
  return found ? Number(found[1]) / 100 : undefined;
}

function fromHex(hex: string): Rgba | undefined {
  if (!/^[0-9a-f]+$/.test(hex)) return undefined;
  const full =
    hex.length === 3 || hex.length === 4
      ? [...hex].map((digit) => `${digit}${digit}`).join("")
      : hex;
  if (full.length !== 6 && full.length !== 8) return undefined;
  const byte = (at: number) => Number.parseInt(full.slice(at, at + 2), 16);
  return { r: byte(0), g: byte(2), b: byte(4), a: full.length === 8 ? byte(6) / 255 : 1 };
}
