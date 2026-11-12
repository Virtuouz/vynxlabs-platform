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
}

const variables: Record<keyof ChartTokens, string> = {
  ink: "--vx-ink",
  inkMuted: "--vx-ink-muted",
  line: "--vx-line",
  action: "--vx-action",
  actionSoft: "--vx-action-soft",
  attention: "--vx-attention",
  success: "--vx-success",
  danger: "--vx-danger",
  font: "--vx-font",
};

/**
 * Reads the tokens as they apply to one element, so that a chart inside a
 * themed part of the page takes that theme. A chart is drawn as SVG
 * attributes, which cannot hold `var()`: the values have to be read.
 */
export function readChartTokens(element: Element): ChartTokens {
  const style = getComputedStyle(element);
  const tokens = {} as ChartTokens;
  for (const [token, variable] of Object.entries(variables)) {
    tokens[token as keyof ChartTokens] = style.getPropertyValue(variable).trim();
  }
  return tokens;
}

/**
 * The Vega-Lite configuration that makes a chart look like the rest of the
 * kit. A token with no value is left out, so the engine's default applies.
 */
export function chartConfig(tokens: ChartTokens): Config {
  const set = <Key extends string>(key: Key, value: string) =>
    (value === "" ? {} : { [key]: value }) as { [K in Key]?: string };
  const labels = { ...set("labelColor", tokens.inkMuted), ...set("titleColor", tokens.ink) };
  const category = [
    tokens.action,
    tokens.attention,
    tokens.success,
    tokens.danger,
    tokens.inkMuted,
  ].filter((colour) => colour !== "");
  const ramp = [tokens.actionSoft, tokens.action].filter((colour) => colour !== "");

  return {
    background: "transparent",
    ...set("font", tokens.font),
    mark: set("color", tokens.action),
    text: set("color", tokens.ink),
    rule: set("color", tokens.inkMuted),
    view: set("stroke", tokens.line),
    axis: {
      ...labels,
      ...set("domainColor", tokens.line),
      ...set("tickColor", tokens.line),
      ...set("gridColor", tokens.line),
    },
    legend: labels,
    header: labels,
    title: { ...set("color", tokens.ink), ...set("subtitleColor", tokens.inkMuted) },
    range: {
      ...(category.length > 0 ? { category } : {}),
      ...(ramp.length === 2 ? { ramp, heatmap: ramp } : {}),
    },
  };
}
