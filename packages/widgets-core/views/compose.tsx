import type { WidgetViewProps } from "@volvel/widgets";
import type { ReactNode } from "react";

/**
 * Phase 27's containers, drawn plainly so that the registry is whole: Section and Tabs.
 * Search and filter and Action group have views of their own (`filter.tsx`, `actions.tsx`).
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
