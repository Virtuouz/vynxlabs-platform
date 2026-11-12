import { Tabs as Base } from "@base-ui/react/tabs";
import type { ComponentChildren } from "preact";

export interface TabItem {
  /** Identifies the tab in `value` and `onChange`. */
  id: string;
  label: string;
  content: ComponentChildren;
  disabled?: boolean;
}

export interface TabsProps {
  /** Names the row of tabs for screen readers: "Order sections". */
  label: string;
  tabs: TabItem[];
  /** The open tab. Leave it out to let the tabs keep track themselves, starting at the first. */
  value?: string;
  onChange?: (id: string) => void;
}

/** Sections of one page, one visible at a time. The arrow keys move between the tabs. */
export function Tabs({ label, tabs, value, onChange }: TabsProps) {
  return (
    <Base.Root
      {...(value === undefined ? { defaultValue: tabs[0]?.id } : { value })}
      onValueChange={(next: string) => onChange?.(next)}
    >
      <Base.List aria-label={label} class="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab) => (
          <Base.Tab
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled === true}
            class="-mb-px border-b-2 border-transparent px-3 py-2 font-medium whitespace-nowrap text-ink-muted hover:text-ink data-[active]:border-action data-[active]:text-action data-[disabled]:opacity-50"
          >
            {tab.label}
          </Base.Tab>
        ))}
      </Base.List>
      {tabs.map((tab) => (
        <Base.Panel key={tab.id} value={tab.id} class="pt-4">
          {tab.content}
        </Base.Panel>
      ))}
    </Base.Root>
  );
}
