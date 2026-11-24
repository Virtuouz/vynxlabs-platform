import type { FrameTheme } from "@volvel/widgets/frame";
import { useEffect, useState } from "react";

/** The page's theme values a widget is given, by the name the page's stylesheet gives them (`--vx-<name>`). */
export const THEME_TOKENS = [
  "canvas",
  "surface",
  "sunken",
  "raised",
  "structure",
  "selected",
  "line",
  "line-strong",
  "line-control",
  "ink",
  "ink-muted",
  "ink-subtle",
  "action",
  "action-ink",
  "action-soft",
  "attention",
  "attention-soft",
  "danger",
  "danger-soft",
  "success",
  "success-soft",
  "code-bg",
  "focus",
  "radius-control",
  "radius-panel",
  "font",
  "font-code",
] as const;

/** Light or dark now: the page's choice (`data-theme`), else the browser's. */
export function currentScheme(): "light" | "dark" {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The theme as the page draws it now: its scheme, and the values of its tokens. */
export function readTheme(): FrameTheme {
  const style = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const name of THEME_TOKENS) {
    const value = style.getPropertyValue(`--vx-${name}`).replace(/\s+/g, " ").trim();
    if (value) tokens[name] = value;
  }
  return { scheme: currentScheme(), tokens };
}

const same = (a: FrameTheme, b: FrameTheme) => JSON.stringify(a) === JSON.stringify(b);

/** The page's theme, again when a person or the browser switches light and dark. */
export function useFrameTheme(): FrameTheme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const update = () => setTheme((now) => (same(now, readTheme()) ? now : readTheme()));
    update();
    const watching = new MutationObserver(update);
    watching.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    const query =
      typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    query?.addEventListener?.("change", update);
    return () => {
      watching.disconnect();
      query?.removeEventListener?.("change", update);
    };
  }, []);
  return theme;
}
