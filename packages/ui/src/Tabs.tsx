import { Tabs as Base } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export interface TabItem {
  /** Identifies the tab in `value` and `onChange`. */
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
  /** A dot after the label: there is something set in this tab. */
  dot?: boolean;
  /** A small drawing before the label: a page's icon in the menu. */
  icon?: ReactNode;
  /** A count after the label. */
  count?: number;
}

export interface TabsProps {
  /** Names the row of tabs for screen readers: "Order sections". */
  label: string;
  tabs: TabItem[];
  /** The open tab. Leave it out to let the tabs keep track themselves, starting at the first. */
  value?: string;
  onChange?: (id: string) => void;
  /** Tighter tabs for a narrow panel (an inspector), so a row of four fits without scrolling. */
  dense?: boolean;
  /**
   * `underline` is a row of words with a line under the open one. `pills` is the
   * boards' segmented bar: a dark track, the open tab raised in it, the tabs
   * sharing its width.
   */
  variant?: "underline" | "pills";
}

/** Sections of one page, one visible at a time. The arrow keys move between the tabs. */
export function Tabs({
  label,
  tabs,
  value,
  onChange,
  dense = false,
  variant = "underline",
}: TabsProps) {
  const pills = variant === "pills";
  return (
    <Base.Root
      {...(value === undefined ? { defaultValue: tabs[0]?.id } : { value })}
      onValueChange={(next: string) => onChange?.(next)}
    >
      <Base.List
        aria-label={label}
        className={
          pills
            ? "grid auto-cols-fr grid-flow-col gap-0.5 overflow-x-auto rounded-control border border-line bg-track p-1"
            : `flex ${dense ? "gap-0" : "gap-1"} overflow-x-auto border-b border-line`
        }
      >
        {tabs.map((tab) => (
          <Base.Tab
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled === true}
            className={
              pills
                ? "inline-flex h-7 items-center justify-center gap-1.5 rounded-inner px-2 text-body-sm font-medium whitespace-nowrap text-ink-muted hover:text-ink data-[active]:bg-raised data-[active]:text-ink data-[active]:shadow-[0_0_0_1px_var(--vx-line-strong)] data-[disabled]:opacity-50"
                : `-mb-px border-b-2 border-transparent ${dense ? "px-2 text-body-sm" : "px-3"} py-2 font-medium whitespace-nowrap text-ink-muted hover:text-ink data-[active]:border-action data-[active]:text-action data-[disabled]:opacity-50`
            }
          >
            {tab.icon ? <span aria-hidden="true" className="mr-1.5 inline-flex shrink-0 align-text-bottom">{tab.icon}</span> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <span className="text-meta text-ink-subtle tabular-nums">{tab.count}</span>
            ) : null}
            {tab.dot ? (
              <span aria-hidden="true" className="size-1.5 rounded-full bg-action" />
            ) : null}
          </Base.Tab>
        ))}
      </Base.List>
      {tabs.map((tab) => (
        <Base.Panel key={tab.id} value={tab.id} className={pills ? "pt-3" : "pt-4"}>
          {tab.content}
        </Base.Panel>
      ))}
    </Base.Root>
  );
}
