import type { WidgetViewProps } from "@volvel/widgets";
import type { ReactNode } from "react";

/**
 * Phase 27's composition widgets, drawn plainly so that the registry is whole: Section,
 * Tabs, Search and filter, and Action group. Each is replaced by its own view (M4, M5).
 */

/** A Section: what is placed in it, on its grid. */
export function SectionView(props: WidgetViewProps<{ description?: string }>) {
  return (
    <div className="flex flex-col gap-2">
      {props.config.description ? (
        <p className="m-0 text-body-sm text-ink-muted">{props.config.description}</p>
      ) : null}
      {(props.place?.() as ReactNode) ?? null}
    </div>
  );
}

/** Tabs: the open tab's widgets. */
export function TabsView(props: WidgetViewProps<{ tabs: { id: string; title: string }[] }>) {
  const open = props.tab?.open ?? props.config.tabs[0]?.id;
  return <div>{(props.place?.(open) as ReactNode) ?? null}</div>;
}

/** Search and filter: drawn by the page for now. */
export function FilterView(_props: WidgetViewProps) {
  return null;
}

/** Action group: its buttons, in a row. */
export function ActionsView(props: WidgetViewProps<{ actions: { id: string; label: string }[] }>) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.config.actions.map((one, index) => (
        <button
          key={one.id}
          type="button"
          disabled={!props.act}
          onClick={() => void props.act?.(`config/actions/${index}/action`)}
        >
          {one.label}
        </button>
      ))}
    </div>
  );
}
