import type { Config } from "vega-lite";

/** The theme tokens a chart is drawn with, as the values they have where the chart sits. */
export interface ChartTokens {
  ink: string;
  inkMuted: string;
  line: string;
  action: string;
  actionSoft: string;
  attention: string;
  success: string;
  danger: string;
  font: string;
  /** What the chart sits on: the fill of a ring that marks a point, and the edge between slices. */
  surface?: string;
  /** The console's type scale where the chart sits (body size over 14 px): 1 where nothing sets it. */
  typeScale?: number;
}

const variables: Record<Exclude<keyof ChartTokens, "typeScale">, string> = {
  ink: "--vx-ink",
  inkMuted: "--vx-ink-muted",
  line: "--vx-line",
  action: "--vx-action",
  actionSoft: "--vx-action-soft",
  attention: "--vx-attention",
  success: "--vx-success",
  danger: "--vx-danger",
  font: "--vx-font",
  surface: "--vx-surface",
};

/**
 * Stands in a spec for the color of what the chart sits on. A spec is JSON and a chart's SVG cannot
 * hold `var()`, so the chart puts the theme's value where this is written when it draws.
 */
export const SURFACE = "chart-surface";

/**
 * Reads the tokens as they apply to one element, so that a chart inside a
 * themed part of the page takes that theme. A chart is drawn as SVG
 * attributes, which cannot hold `var()`: the values have to be read.
 */
export function readChartTokens(element: Element): ChartTokens {
  const style = getComputedStyle(element);
  const tokens = {} as ChartTokens;
  for (const [token, variable] of Object.entries(variables)) {
    (tokens as unknown as Record<string, string>)[token] = style.getPropertyValue(variable).trim();
  }
  tokens.typeScale = readTypeScale(style.getPropertyValue("--vx-type-scale"));
  return tokens;
}

/** `calc(18 / 14)` or `1.2857`, as the stylesheet gives the type scale: a number, 1 when there is none. */
function readTypeScale(value: string): number {
  const ratio = /calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/.exec(value);
  const scale = ratio ? Number(ratio[1]) / Number(ratio[2]) : Number.parseFloat(value);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Whether a color is a light one: the ink of a dark theme is. */
function isLight(color: string): boolean {
  const found = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!found) return false;
  const rgb = Number.parseInt(found[1] as string, 16);
  const [r, g, b] = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

/**
 * The colors of a chart's series, in the order they are given out. Neighbours differ in hue as
 * well as in lightness (teal, amber, violet, green, coral, blue, gray), so that two series drawn
 * side by side are never two greens, in either theme. The first is the theme's action color.
 */
export function seriesColors(tokens: ChartTokens): string[] {
  const dark = isLight(tokens.ink);
  const fixed = dark
    ? { violet: "#a78bfa", blue: "#7aa7ff" }
    : { violet: "#6741d9", blue: "#2f5fd0" };
  return [
    tokens.action,
    tokens.attention,
    fixed.violet,
    tokens.success,
    tokens.danger,
    fixed.blue,
    tokens.inkMuted,
  ].filter((color) => color !== "");
}

/**
 * The Vega-Lite configuration that makes a chart look like the rest of the
 * kit, and as the boards draw one: a few quiet rules and short labels, no box, no
 * axis lines, rounded bars with room between them, a line with rings on its points.
 * A token with no value is left out, so the engine's default applies.
 */
export function chartConfig(tokens: ChartTokens): Config {
  const grow = (size: number) => Math.round(size * (tokens.typeScale ?? 1));
  const set = <Key extends string>(key: Key, value: string) =>
    (value === "" ? {} : { [key]: value }) as { [K in Key]?: string };
  const labels = { ...set("labelColor", tokens.inkMuted), ...set("titleColor", tokens.ink) };
  const category = seriesColors(tokens);
  const ramp = [tokens.actionSoft, tokens.action].filter((color) => color !== "");
  const ground = tokens.surface ?? "";
  const quiet = {
    ...set("labelColor", tokens.inkMuted),
    ...set("titleColor", tokens.inkMuted),
    labelFontSize: grow(10),
    labelPadding: 6,
    labelOverlap: "greedy" as const,
    labelSeparation: 8,
    titleFontSize: grow(11),
    titleFontWeight: "normal" as const,
    titlePadding: 10,
    domain: false,
    ticks: false,
    ...set("gridColor", tokens.line),
    gridWidth: 1,
  };

  return {
    background: "transparent",
    ...set("font", tokens.font),
    mark: set("color", tokens.action),
    text: { ...set("color", tokens.ink), fontSize: grow(11) },
    rule: set("color", tokens.inkMuted),
    view: { stroke: null },
    axis: quiet,
    axisY: { tickCount: 4, grid: true },
    axisX: { grid: false, labelPadding: 8 },
    bar: { cornerRadiusTopLeft: 4, cornerRadiusTopRight: 4, fillOpacity: 0.9 },
    line: { strokeWidth: 2.2, strokeJoin: "round", strokeCap: "round" },
    area: { fillOpacity: 0.08, line: { strokeWidth: 2.2 } },
    rect: { cornerRadius: 3, ...(ground === "" ? {} : { stroke: ground }), strokeWidth: 2 },
    arc: { ...(ground === "" ? {} : { stroke: ground }), strokeWidth: 2 },
    scale: { bandPaddingInner: 0.35, bandPaddingOuter: 0.15 },
    legend: {
      ...labels,
      ...set("titleColor", tokens.inkMuted),
      labelFontSize: grow(11),
      titleFontSize: grow(11),
      titleFontWeight: "normal" as const,
      symbolType: "circle",
      symbolSize: 70,
      orient: "top",
      direction: "horizontal",
      offset: 8,
      padding: 4,
    },
    header: labels,
    title: { ...set("color", tokens.ink), ...set("subtitleColor", tokens.inkMuted) },
    range: {
      ...(category.length > 0 ? { category } : {}),
      ...(ramp.length === 2 ? { ramp, heatmap: ramp } : {}),
    },
  };
}
