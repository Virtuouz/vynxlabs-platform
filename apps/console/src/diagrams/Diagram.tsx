import { useEffect, useRef } from "react";
import { drawFigure, undraw } from "./draw.ts";

/**
 * A diagram in a preview of a page, drawn as a served site draws it. Mermaid
 * is fetched the first time a page has one. It is drawn again a moment after
 * its source stops changing, and when the console's theme changes.
 *
 * The figure's insides are the drawing's, not React's: React draws an empty
 * figure, and the drawing fills it.
 */
export function Diagram({ source }: { source: string }) {
  const figure = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    let gone = false;
    const draw = () => {
      undraw(element);
      const pre = document.createElement("pre");
      pre.className = "vd-mermaid-source";
      const code = document.createElement("code");
      code.className = "language-mermaid";
      code.textContent = source;
      pre.append(code);
      element.replaceChildren(pre);
      void import("mermaid").then(({ default: mermaid }) => {
        if (!gone) void drawFigure(element, mermaid);
      });
    };
    const timer = setTimeout(draw, 250);
    const themes = matchMedia("(prefers-color-scheme: dark)");
    themes.addEventListener("change", draw);
    const watching = new MutationObserver(draw);
    watching.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => {
      gone = true;
      clearTimeout(timer);
      themes.removeEventListener("change", draw);
      watching.disconnect();
      undraw(element);
    };
  }, [source]);
  return <figure ref={figure} className="vd-mermaid" data-vd-mermaid="1" />;
}
