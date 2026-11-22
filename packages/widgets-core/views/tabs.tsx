import { Tabs } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";
import type { ReactNode } from "react";

/**
 * Tabs: a strip of them, the open one marked and reached by the arrow keys, and under it what
 * is placed in the open tab. The host keeps which is open (in the page's address, so a reload
 * and a shared link keep it).
 */
export function TabsView({
  config,
  place,
  tab,
}: WidgetViewProps<{ tabs: { id: string; title: string }[] }>) {
  const open = config.tabs.some((one) => one.id === tab?.open) ? tab?.open : config.tabs[0]?.id;
  return (
    // The strip is one row of the page's grid, with what is in the tab under it.
    <div className="[&_[role=tabpanel]]:pt-2.5">
      <Tabs
        label="Tabs"
        value={open ?? ""}
        onChange={(id) => tab?.choose(id)}
        tabs={config.tabs.map((one) => ({
          id: one.id,
          label: one.title,
          content: one.id === open ? ((place?.(one.id) as ReactNode) ?? null) : null,
        }))}
      />
    </div>
  );
}
