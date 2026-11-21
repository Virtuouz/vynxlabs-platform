import type { SummaryData } from "@volvel/widgets";
import { axisFormat, labelOf, numberOf, type ValueFormat } from "./format.ts";

export interface ChartConfig {
  mark?: "line" | "bar" | "area" | "pie" | "scatter" | "heatmap";
  format?: ValueFormat;
  legend?: "auto" | "shown" | "hidden";
  horizontal?: boolean;
  bars?: "stacked" | "grouped";
  compareTo?: string;
  x?: string;
  y?: string;
}

/** The column that carries the period before, point for point, on a compared chart. */
export const BEFORE = "period_before";

const TEMPORAL = new Set(["date", "timestamp"]);

/**
 * What a chart draws: its Vega-Lite spec and the rows, from a summary. The
 * first breakdown goes along the bottom and the second becomes a series each;
 * several values with no second breakdown are a series each too.
 */
export function chartFor(
  config: ChartConfig,
  data: SummaryData,
): { spec: object; rows: Record<string, unknown>[]; description: string } {
  const mark = config.mark ?? "bar";
  const typeOf = (name: string) => data.columns.find((column) => column.name === name)?.type;
  const title = (name: string) => labelOf(data.columns, name);
  const x =
    config.x && data.columns.some((c) => c.name === config.x)
      ? config.x
      : (data.breakdowns[0] ?? "");
  const others = data.breakdowns.filter((name) => name !== x);
  const series = others[0];
  const measured =
    config.y && data.columns.some((c) => c.name === config.y) ? [config.y] : [...data.values];
  const y = measured[0] ?? "";
  const axis = config.format ? axisFormat(config.format) : undefined;
  const compared =
    data.previous !== undefined && (mark === "line" || mark === "area" || mark === "bar");

  const rows = data.rows.map((row, at) => {
    const copy: Record<string, unknown> = { ...row };
    for (const name of measured) {
      const value = numberOf(row[name]);
      if (value !== undefined) copy[name] = value / (axis?.divide ?? 1);
    }
    if (compared) {
      const before = numberOf(data.previous?.[at]?.[y]);
      copy[BEFORE] = before === undefined ? null : before / (axis?.divide ?? 1);
    }
    return copy;
  });

  const yTitle = axis?.note ? `${title(y)} (${axis.note})` : title(y);
  const valueAxis = axis ? { format: axis.format } : {};
  const temporal = TEMPORAL.has(typeOf(x) ?? "");
  // A few periods are each named, by the day they begin: not ticked on hours the data does not have.
  const few = temporal && rows.length <= 12 && mark !== "scatter";
  const dayAxis = { labelOverlap: true, format: "%b %-d" };
  const legend = config.legend === "hidden" ? { legend: null } : {};
  const description = `${mark} chart of ${measured.map(title).join(", ")} by ${[x, ...others].map(title).join(" and ")}`;
  const xEncoding = {
    field: x,
    type:
      mark === "scatter"
        ? typeOf(x) === "number" || typeOf(x) === "integer"
          ? "quantitative"
          : temporal
            ? "temporal"
            : "nominal"
        : few
          ? "ordinal"
          : temporal
            ? "temporal"
            : "nominal",
    title: title(x),
    ...(few
      ? {
          sort: null,
          axis: {
            labelAngle: 0,
            labelOverlap: true,
            labelExpr: "utcFormat(toDate(datum.value), '%b %-d')",
          },
        }
      : temporal
        ? { axis: dayAxis }
        : typeOf(x) === "number"
          ? {}
          : { sort: null, axis: { labelAngle: 0, labelOverlap: true } }),
  };

  if (mark === "heatmap") {
    const down = series ?? "";
    return {
      description,
      rows,
      spec: {
        mark: { type: "rect", tooltip: true },
        encoding: {
          x: { field: x, type: "ordinal", title: title(x), sort: null, axis: { labelAngle: 0 } },
          y: { field: down, type: "ordinal", title: title(down), sort: null },
          color: {
            field: y,
            type: "quantitative",
            title: title(y),
            ...(config.legend === "hidden"
              ? { legend: null }
              : axis
                ? { legend: { format: axis.format } }
                : {}),
          },
        },
      },
    };
  }
  if (mark === "pie") {
    return {
      description,
      rows,
      spec: {
        mark: { type: "arc", tooltip: true },
        encoding: {
          theta: {
            field: y,
            type: "quantitative",
            stack: true,
            ...(axis ? { format: axis.format } : {}),
          },
          color: { field: x, type: "nominal", title: title(x), ...legend },
        },
      },
    };
  }
  if (mark === "scatter") {
    return {
      description,
      rows,
      spec: {
        mark: { type: "point", tooltip: true, filled: true },
        encoding: {
          x: xEncoding,
          y: { field: y, type: "quantitative", title: yTitle, axis: valueAxis },
          ...(series
            ? { color: { field: series, type: "nominal", title: title(series), ...legend } }
            : {}),
        },
      },
    };
  }

  // Several values and no second breakdown: folded into one series each, named by the value.
  const several = measured.length > 1 && !series;
  const colour = several ? "series" : series;
  const value = several ? "value" : y;
  const grouped = mark === "bar" && colour && config.bars === "grouped";
  const base = {
    mark: { type: mark, tooltip: true, ...(mark === "line" ? { point: true } : {}) },
    encoding: {
      x: xEncoding,
      y: {
        field: value,
        type: "quantitative",
        title: several ? "" : yTitle,
        axis: valueAxis,
        ...(mark === "bar" && colour ? { stack: grouped ? null : true } : {}),
      },
      ...(colour
        ? {
            color: {
              field: colour,
              type: "nominal",
              title: several ? "" : title(colour),
              ...legend,
            },
          }
        : {}),
      ...(grouped ? { xOffset: { field: colour, type: "nominal" } } : {}),
    },
    ...(several ? { transform: [{ fold: measured, as: ["series", "value"] }] } : {}),
  };
  const lying = mark === "bar" && config.horizontal === true;
  const drawn = lying
    ? (() => {
        const { x: across, y: up, xOffset, ...rest } = base.encoding as Record<string, unknown>;
        return {
          ...base,
          encoding: {
            ...rest,
            y: { ...(across as object), axis: { labelOverlap: true } },
            x: up,
            ...(xOffset ? { yOffset: xOffset } : {}),
          },
        };
      })()
    : base;
  if (compared && !lying) {
    // The period before, point for point, on the same scale.
    return {
      description,
      rows,
      spec: {
        layer: [
          drawn,
          {
            mark: {
              type: "line",
              strokeDash: [4, 4],
              tooltip: true,
              color: "currentColor",
              opacity: 0.6,
            },
            encoding: {
              x: xEncoding,
              y: { field: BEFORE, type: "quantitative", title: null },
            },
          },
        ],
      },
    };
  }
  return { description, rows, spec: drawn };
}
