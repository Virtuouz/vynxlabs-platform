/**
 * The inspector as the builder mounts it: with what only a host can give it. The tenant's groups
 * (read once, by the builder), the sample record the page is drawn with (for the confirm preview),
 * the widget's own read summary and its table's column counts (for the chart sections' previews
 * and hints), and "When a row is clicked". The drawer itself reads from none of these by name.
 */
import type { PageWidget } from "@volvel/manifest";
import type { PageDataClient } from "@volvel/screens";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLoadOf } from "../../api.ts";
import { type ColumnCounts, useColumnCounts } from "./catalog.ts";
import { SampleRecordProvider } from "./confirmPreview.tsx";
import { type GroupKey, GroupsProvided } from "./groupChoices.tsx";
import { Inspector, type InspectorProps } from "./Inspector.tsx";
import { type Catalog, visualOf } from "./model.ts";
import { type DrawerData, DrawerDataProvider } from "./widgets/chartShared.tsx";

/** The table the widget's first data input reads, when it reads one. */
const tableOf = (widget: PageWidget): string | undefined => {
  for (const input of Object.values(widget.data ?? {})) {
    const visual = visualOf(input);
    if (visual) return visual.table;
  }
  return undefined;
};

/** The catalog with the real counts of the widget's table: how many rows, how many values a column has. */
function counted(catalog: Catalog, table: string | undefined, found: ColumnCounts | undefined) {
  if (!table || !found) return catalog;
  // A count of a sample is not the table's own: it is left out rather than shown as exact.
  const exact = found.sampled !== true;
  return {
    ...catalog,
    tables: catalog.tables.map((one) =>
      one.name !== table
        ? one
        : {
            ...one,
            ...(exact ? { rows: found.rows } : {}),
            columns: one.columns.map((column) => {
              const distinct = found.columns[column.name];
              if (!exact || distinct === undefined || distinct === null) return column;
              const more = found.more?.includes(column.name) === true;
              return { ...column, distinct, ...(more ? { distinctMore: true } : {}) };
            }),
          },
    ),
  };
}

/** The summary the widget draws on the canvas, read the way the canvas reads it. */
function useSummary(
  client: PageDataClient,
  widget: PageWidget,
  filterValues: Record<string, unknown>,
): DrawerData["summary"] {
  const [summary, setSummary] = useState<DrawerData["summary"]>();
  const asked = JSON.stringify([widget.id, widget.type, widget.data, widget.config, filterValues]);
  const reads = ["core/chart", "core/stat", "core/pivot", "labs/goal"].includes(widget.type);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `asked` stands for what is read
  useEffect(() => {
    if (!reads) return;
    const controller = new AbortController();
    // The editor saves 700 ms after a change: wait for the draft that holds the change.
    const timer = setTimeout(() => {
      client.read(widget.id, filterValues, { signal: controller.signal }).then(
        (read) => {
          if (controller.signal.aborted) return;
          const first = Object.values(read.inputs).find((one) => one.shape === "summary");
          setSummary(first?.shape === "summary" ? first : undefined);
        },
        () => {
          if (!controller.signal.aborted) setSummary(undefined);
        },
      );
    }, 900);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [client, asked, reads]);
  return reads ? summary : undefined;
}

export function InspectorHost({
  root,
  client,
  filterValues,
  groupKeys,
  sample,
  rowClick,
  catalog,
  ...props
}: Omit<InspectorProps, "rowClickEditor"> & {
  /** The workspace's path. */
  root: string;
  /** The page's own client: the same reads the canvas makes. */
  client: PageDataClient;
  filterValues: Record<string, unknown>;
  /** The tenant's groups, read once by the builder. */
  groupKeys: readonly GroupKey[];
  /** The previewed record: its table and id. */
  sample: { table: string | undefined; record: string | undefined };
  /** "When a row is clicked", for a table or a list. */
  rowClick?: ReactNode;
}) {
  const table = tableOf(props.widget);
  const found = useColumnCounts(root, table);
  const withCounts = useMemo(() => counted(catalog, table, found), [catalog, table, found]);
  const summary = useSummary(client, props.widget, filterValues);
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    if (found && found.sampled !== true) {
      for (const [name, value] of Object.entries(found.columns)) {
        if (typeof value === "number") out[name] = value;
      }
    }
    return out;
  }, [found]);
  // The same read the sample bar makes, so it is asked once.
  // Where the page has no record of its own, the widget's own table gives the first row, so the confirmation is written with a real one.
  const sampleTable = sample.table ?? table;
  const rows = useLoadOf<{ items: Record<string, unknown>[] }>(
    sampleTable ? `${root}/rows/${sampleTable}?limit=25` : null,
  );
  const row = sample.record
    ? rows.data?.items.find((one) => one.id === sample.record)
    : rows.data?.items[0];
  const data: DrawerData = { ...(summary ? { summary } : {}), counts };
  return (
    <GroupsProvided groups={groupKeys}>
      <SampleRecordProvider record={row}>
        <DrawerDataProvider value={data}>
          <Inspector {...props} catalog={withCounts} rowClickEditor={rowClick} />
        </DrawerDataProvider>
      </SampleRecordProvider>
    </GroupsProvided>
  );
}
