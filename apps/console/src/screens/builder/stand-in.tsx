/**
 * TEMPORARY: REMOVE WHEN STREAMS B AND D ARE MERGED (phase 25).
 *
 * Stream B builds `PageView`, `FilterBar`, `viewRegistry` and the core pack's
 * views in `packages/screens` and `packages/widgets-core/views`; stream D builds
 * `labsPack` in `@volvel/widgets-labs/views`. Until they are here, this file
 * stands in for them, written to the contract's types (contract §2).
 *
 * The integrator replaces the whole body of this file with:
 *
 *   export { FilterBar, PageView, viewRegistry } from "@volvel/screens";
 *   export type { FilterValues, PageDataClient, PageViewProps, ViewRegistry, WidgetPack, WireData } from "@volvel/screens";
 *   export { corePack } from "@volvel/widgets-core/views";
 *   export { labsPack } from "@volvel/widgets-labs/views";
 *
 * Nothing else imports `@volvel/screens`'s page renderer: every import of these
 * names in the console goes through this file, so that is the only change.
 */
import type { PageFilter, PageWidget } from "@volvel/manifest";
import { Skeleton } from "@volvel/ui";
import type { ColumnInfo, WidgetDefinition, WidgetViewProps } from "@volvel/widgets";
import { CORE_WIDGETS } from "@volvel/widgets-core";
import { type ComponentType, useEffect, useState } from "react";

export type FilterValues = Record<string, unknown>;

export type WireData =
  | {
      shape: "rows";
      columns: ColumnInfo[];
      rows: Record<string, unknown>[];
      next?: string;
      names?: Record<string, Record<string, string>>;
    }
  | {
      shape: "summary";
      columns: ColumnInfo[];
      breakdowns: string[];
      values: string[];
      rows: Record<string, unknown>[];
      previous?: Record<string, unknown>[];
    }
  | { shape: "record"; columns: ColumnInfo[]; record: Record<string, unknown> | null };

export interface PageDataClient {
  read(
    widget: string,
    filters: FilterValues,
    options?: { input?: string; cursor?: string; signal?: AbortSignal },
  ): Promise<{ inputs: Record<string, WireData> }>;
}

export interface WidgetPack {
  definitions: readonly WidgetDefinition[];
  // biome-ignore lint/suspicious/noExplicitAny: the contract's own type
  views: Record<string, ComponentType<WidgetViewProps<any>>>;
}

export type ViewRegistry = Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: the contract's own type
  { definition: WidgetDefinition; View: ComponentType<WidgetViewProps<any>> }
>;

export function viewRegistry(...packs: WidgetPack[]): ViewRegistry {
  const registry: ViewRegistry = {};
  for (const pack of packs) {
    for (const definition of pack.definitions) {
      const View = pack.views[definition.type];
      if (View) registry[definition.type] = { definition, View };
    }
  }
  return registry;
}

export const corePack: WidgetPack = { definitions: CORE_WIDGETS, views: {} };
export const labsPack: WidgetPack = { definitions: [], views: {} };

export interface PageViewProps {
  widgets: readonly PageWidget[];
  filters: readonly PageFilter[];
  registry: ViewRegistry;
  client: PageDataClient;
  filterValues: FilterValues;
  onFilterValues(values: FilterValues): void;
  refreshKey?: number;
  editing?: {
    selected: string | undefined;
    onSelect(id: string | undefined): void;
    onChange(widgets: PageWidget[], label: string): void;
    onRename(id: string, title: string): void;
    onColumn?(id: string, column: string): void;
  };
}

export function FilterBar(_props: {
  filters: readonly PageFilter[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
}) {
  return null;
}

/** One widget of the stand-in: its title and what it read, said in words. */
function Placeholder({
  widget,
  client,
  filterValues,
  refreshKey,
}: Pick<PageViewProps, "client" | "filterValues"> & {
  refreshKey: number | undefined;
  widget: PageWidget;
}) {
  const [state, setState] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked again when what it asks changes
  useEffect(() => {
    let current = true;
    setState(undefined);
    client.read(widget.id, filterValues).then(
      (answer) => current && setState(`${Object.keys(answer.inputs).length} read`),
      (error: Error) => current && setState(error.message),
    );
    return () => {
      current = false;
    };
  }, [client, widget.id, JSON.stringify(widget.data), JSON.stringify(filterValues), refreshKey]);
  return <>{state ?? <Skeleton className="h-4 w-24" />}</>;
}

/**
 * Draws the widgets on twelve columns, each as a titled box. Click selects.
 * It does not draw data, move or resize: stream B's canvas does.
 */
export function PageView(props: PageViewProps) {
  return (
    <div className="grid grid-cols-12 gap-3" data-stand-in="page-view">
      {props.widgets.map((widget) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: a stand-in for the canvas, removed with it
        <div
          key={widget.id}
          data-widget={widget.id}
          onClick={() => props.editing?.onSelect(widget.id)}
          onKeyDown={undefined}
          style={{ gridColumn: `${widget.at.x + 1} / span ${widget.at.w}` }}
          className={`rounded-panel border p-3 ${
            props.editing?.selected === widget.id ? "border-action" : "border-line"
          }`}
        >
          <p className="m-0 font-medium">{widget.title ?? widget.id}</p>
          <p className="m-0 text-meta text-ink-muted">
            {props.registry[widget.type]?.definition.title ?? widget.type}
            {" · "}
            <Placeholder
              widget={widget}
              client={props.client}
              filterValues={props.filterValues}
              refreshKey={props.refreshKey}
            />
          </p>
        </div>
      ))}
    </div>
  );
}
