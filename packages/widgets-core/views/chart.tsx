import { Chart } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";
import { useCallback, useRef, useState } from "react";
import { type ChartConfig, chartFor } from "./chartSpec.ts";
import { labelOf } from "./format.ts";
import { listensTo } from "./press.tsx";

/** How big an element is, kept as it changes: for a chart that fills the widget it is in. */
function useRoom<E extends HTMLElement>(): [(node: E | null) => void, number, number] {
  const [room, setRoom] = useState({ height: 0, width: 0 });
  const watching = useRef<ResizeObserver | undefined>(undefined);
  const ref = useCallback((node: E | null) => {
    watching.current?.disconnect();
    if (!node || typeof ResizeObserver !== "function") return;
    const measure = () => {
      const next = { height: Math.floor(node.clientHeight), width: Math.floor(node.clientWidth) };
      // Widths within a few pixels are the same chart: a scrollbar appearing must not redraw it.
      setRoom((was) =>
        Math.abs(was.width - next.width) < 12 && was.height === next.height ? was : next,
      );
    };
    watching.current = new ResizeObserver(measure);
    watching.current.observe(node);
  }, []);
  return [ref, room.height, room.width];
}

let canvas: CanvasRenderingContext2D | null | undefined;

/** How wide a text is at the size a chart's labels are set, 10px, as the browser draws it. */
function measureLabel(text: string): number {
  try {
    canvas ??= document.createElement("canvas").getContext("2d");
  } catch {
    canvas = null;
  }
  if (!canvas) return text.length * 5.6;
  canvas.font = "10px Geist, ui-sans-serif, system-ui, sans-serif";
  return canvas.measureText(text).width || text.length * 5.6;
}

/** Over a page this narrow a chart has a height of its own: the widgets are stacked. */
const STACKED_HEIGHT = 260;

export function ChartView(props: WidgetViewProps<ChartConfig>) {
  const { config, data, size, emit, building } = props;
  const [room, height, width] = useRoom<HTMLDivElement>();
  const summary = data.rows;
  if (summary?.shape !== "summary") return null;
  const { spec, rows, description } = chartFor(config, summary, {
    width,
    height: height || STACKED_HEIGHT,
    measure: measureLabel,
  });
  const fills = !size.narrow && height > 0;
  // Nothing to draw, or nothing in what there is: the words, not an empty plot.
  const drawn = summary.rows.some((row) =>
    summary.values.some((name) => row[name] !== null && row[name] !== undefined),
  );
  return (
    <div ref={room} className="min-h-0 flex-1 overflow-hidden">
      {!drawn ? (
        <p className="m-0 text-body-sm text-ink-muted">There is nothing to chart yet.</p>
      ) : (
        <Chart
          title={`${labelOf(summary.columns, summary.values[0] ?? "")} chart`}
          description={description}
          // On the grid the height it is given holds its axes and legend too, so nothing is cut.
          spec={{ ...spec, ...(fills ? { autosize: { type: "fit", contains: "padding" } } : {}) }}
          data={rows}
          height={fills ? Math.max(120, height) : STACKED_HEIGHT}
          // A bar, a point or a slice: the group it stands for.
          // Only when the page does something with it: a point that does nothing is not drawn pressable.
          onPick={
            building || !(props.listens === undefined || listensTo(props, "pointClick"))
              ? undefined
              : (row) => {
                  const group: Record<string, unknown> = {};
                  for (const name of summary.breakdowns) if (name in row) group[name] = row[name];
                  emit("pointClick", { group });
                }
          }
        />
      )}
    </div>
  );
}
