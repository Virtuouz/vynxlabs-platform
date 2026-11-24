import type { DeployedWidget, WidgetDefinition, WidgetViewProps } from "@volvel/widgets";
import type { ComponentType } from "react";
import type { ViewEntry, ViewRegistry } from "./types.ts";

/**
 * What draws a widget of the tenant's own (`x/...`). A tenant's widget has no React view in
 * the platform: its view runs in a sandboxed frame (decision 0005), which lane B4 puts here.
 * Until then the host draws a plain box that says which widget and version it stands for, and
 * fills its cell, so a page is laid out as it will be.
 *
 * Everything a frame needs is a prop of this one component: the page's config and data, the
 * size of the cell, `emit` for the events the definition declares, the type and the version
 * the page names, and the definition of that version.
 */
export interface TenantWidgetHostProps extends WidgetViewProps {
  /** `x/<name>`. */
  type: string;
  /** The version the page names (the current one when it names none). */
  version: string;
  /** The definition of that version. */
  definition: WidgetDefinition;
}

export function TenantWidgetHost({ definition, version, size }: TenantWidgetHostProps) {
  const name = `Widget ${definition.title} v${version}`;
  return (
    <section
      aria-label={`${definition.title} v${version}`}
      data-tenant-widget={definition.type}
      data-tenant-widget-version={version}
      className="flex h-full min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-inner border border-dashed border-line bg-sunken/50 p-3 text-center text-body-sm text-ink-muted"
    >
      <span className="max-w-full truncate font-medium text-ink">{name}</span>
      {size.narrow ? null : (
        <span className="max-w-full truncate text-caption">{definition.description}</span>
      )}
    </section>
  );
}

/**
 * The registry of one workspace: the views the platform ships, and a host for each tenant
 * widget it deployed, by its current definition, with every version's definition kept so a
 * page is drawn by the version it names. The registry it is made from is left as it was.
 */
export function workspaceViews(
  platform: ViewRegistry,
  deployed: readonly DeployedWidget[],
): ViewRegistry {
  const entries = new Map(platform);
  for (const widget of deployed) {
    if (entries.has(widget.type)) throw new Error(`${widget.type} is in two packs`);
    const versions = new Map(widget.versions.map((one) => [one.version, one.definition]));
    // A removed widget has no current version; pages that still pin an older one draw it.
    const latest = widget.current ?? widget.versions.at(-1)?.version;
    const current = latest === undefined ? undefined : versions.get(latest);
    if (latest === undefined || !current)
      throw new Error(`${widget.type} has no deployed version ${widget.current}`);
    // biome-ignore lint/correctness/noComponentHookFactories: made once per workspace registry, so a page keeps its widgets' state
    const View: ComponentType<WidgetViewProps & { version?: string }> = (props) => {
      const version = props.version && versions.has(props.version) ? props.version : latest;
      return (
        <TenantWidgetHost
          {...props}
          type={widget.type}
          version={version}
          definition={versions.get(version) as WidgetDefinition}
        />
      );
    };
    const entry: ViewEntry = { definition: current, versions, View };
    entries.set(widget.type, entry);
  }
  return entries;
}
