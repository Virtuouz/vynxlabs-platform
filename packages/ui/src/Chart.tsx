import { useEffect, useRef, useState } from "react";
import { chartSpec, createChartView, loadChartEngine } from "./chartEngine.ts";
import { chartConfig, readChartTokens } from "./chartTheme.ts";
import { Notice } from "./Notice.tsx";

export interface ChartProps {
  /** A Vega-Lite spec. */
  spec: object;
  /** Rows to draw. When given, they replace the spec's own data. */
  data?: readonly Record<string, unknown>[];
  /** Names the chart for screen readers. */
  title: string;
  /** Says what the chart shows, for someone who cannot see it. */
  description?: string;
  /** In pixels, unless the spec sets its own height. */
  height?: number;
}

/**
 * A chart drawn from a Vega-Lite spec, in the theme's colours and font. The
 * engine is fetched when the first chart appears.
 */
export function Chart({ spec, data, title, description, height = 240 }: ChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [scheme, setScheme] = useState(0);
  // A spec written inline is a new object on every render. Its text says whether it changed.
  const specText = JSON.stringify(spec);

  // The tokens change with the colour scheme, and the chart holds their values, not the variables.
  useEffect(() => {
    const dark = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!dark) return;
    const redraw = () => setScheme((count) => count + 1);
    dark.addEventListener("change", redraw);
    return () => dark.removeEventListener("change", redraw);
  }, []);

  // `scheme` is a dependency so that the chart is drawn again with the new token values.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `scheme` is listed so the chart is drawn again with the new token values
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let left = false;
    let view: ReturnType<typeof createChartView> | undefined;
    loadChartEngine()
      .then((engine) => {
        if (left) return;
        const config = chartConfig(readChartTokens(element));
        view = createChartView(
          engine,
          chartSpec(JSON.parse(specText), data, height),
          config,
          element,
        );
        return view.runAsync();
      })
      .then(
        () => {
          if (left) return;
          setFailure(undefined);
          setDrawn(true);
        },
        (caught) => {
          if (!left) setFailure(caught instanceof Error ? caught.message : String(caught));
        },
      );
    return () => {
      left = true;
      view?.finalize();
      element.replaceChildren();
    };
  }, [specText, data, height, scheme]);

  return (
    <div className="relative w-full">
      {failure ? <Notice tone="danger">This chart could not be drawn. {failure}</Notice> : null}
      {/* The engine labels its own element, so the chart's name goes on one around it. */}
      <div
        role="img"
        aria-label={description ? `${title}. ${description}` : title}
        hidden={failure !== undefined}
      >
        <div ref={container} className="w-full" style={{ minHeight: `${height}px` }} />
      </div>
      {drawn || failure ? null : (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex animate-pulse items-center justify-center rounded-control bg-sunken text-[13px] text-ink-muted"
        >
          Loading chart
        </div>
      )}
    </div>
  );
}
