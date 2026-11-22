import { Tabs } from "@volvel/ui";
import type { WidgetViewProps } from "@volvel/widgets";
import type { ReactNode } from "react";

interface TabsConfig {
  tabs: { id: string; title: string }[];
  look?: "underline" | "pills";
  opensFirst?: string;
  remember?: boolean;
}

/**
 * Tabs: a strip of them, the open one marked and reached by the arrow keys, and under it what
 * is placed in the open tab. The host keeps which is open: in the page's address (so a reload
 * and a shared link keep it), else the last tab this person had on this device (`remember`),
 * else `opensFirst`. A host that gives none of that gets `opensFirst`, then the first.
 */
export function TabsView({ config, place, tab, title }: WidgetViewProps<TabsConfig>) {
  const ids = config.tabs.map((one) => one.id);
  const first = config.opensFirst && ids.includes(config.opensFirst) ? config.opensFirst : ids[0];
  const open = tab?.open !== undefined && ids.includes(tab.open) ? tab.open : first;
  const pills = config.look === "pills";
  return (
    // The strip is one row of the page's grid, with what is in the tab under it.
    <div
      data-look={pills ? "pills" : "underline"}
      className={`[&_[role=tabpanel]]:pt-2.5 ${
        pills
          ? "[&_[role=tablist]]:gap-1 [&_[role=tablist]]:border-b-0 [&_[role=tab]]:mb-0 [&_[role=tab]]:rounded-control [&_[role=tab]]:border-b-0 [&_[role=tab]]:py-1.5 [&_[role=tab][data-active]]:bg-action-soft"
          : ""
      }`}
    >
      <Tabs
        label={title ?? "Tabs"}
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
