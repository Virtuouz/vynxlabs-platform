import { Chart } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";
import { useCallback, useRef, useState } from "react";
import { type ChartConfig, chartFor } from "./chartSpec.ts";
import { labelOf } from "./format.ts";
import { listensTo } from "./press.tsx";

/** How tall an element is, kept as it changes: for a chart that fills the widget it is in. */
function useRoom<E extends HTMLElement>(): [(node: E | null) => void, number] {
  const [height, setHeight] = useState(0);
  const watching = useRef<ResizeObserver | undefined>(undefined);
  const ref = useCallback((node: E | null) => {
    watching.current?.disconnect();
    if (!node || typeof ResizeObserver !== "function") return;
    watching.current = new ResizeObserver(() => setHeight(Math.floor(node.clientHeight)));
    watching.current.observe(node);
  }, []);
  return [ref, height];
}

/** Over a page this narrow a chart has a height of its own: the widgets are stacked. */
const STACKED_HEIGHT = 260;

export function ChartView(props: WidgetViewProps<ChartConfig>) {
  const { config, data, size, emit, building } = props;
  const [room, height] = useRoom<HTMLDivElement>();
  const summary = data.rows;
  if (summary?.shape !== "summary") return null;
  const { spec, rows, description } = chartFor(config, summary);
  const fills = !size.narrow && height > 0;
  return (
    <div ref={room} className="min-h-0 flex-1 overflow-hidden">
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
    </div>
  );
}
