import { Menu as Base } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Kbd } from "./Tooltip.tsx";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Drawn before the label. */
  icon?: ReactNode;
  /** Marks an action that removes or ends something. */
  danger?: boolean;
  /** Draws a line above this item, to set a group apart. */
  separated?: boolean;
  /** Marks the item that is the current one, in a menu that switches between things. */
  current?: boolean;
  /** The shortcut that does the same, written for people: `⌘D`. */
  keys?: string | undefined;
  /** Drawn after the label, such as a tag that says what kind the item is. */
  detail?: ReactNode;
}

export interface MenuProps {
  /** What the trigger button shows. */
  label: ReactNode;
  items: MenuItem[];
  /** Names the trigger for screen readers when its label is only an icon. */
  ariaLabel?: string;
  /** Replaces the trigger's own look, for a trigger that is part of a bar or a header. */
  triggerClassName?: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
}

export function Menu({ label, items, ariaLabel, triggerClassName, align = "start" }: MenuProps) {
  return (
    <Base.Root>
      <Base.Trigger
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        className={
          triggerClassName ??
          "flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left hover:bg-hover"
        }
      >
        {label}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner sideOffset={6} align={align} className="layer-popover">
          <Base.Popup className="max-h-[70vh] min-w-48 overflow-y-auto rounded-panel border border-line-strong bg-raised p-1.5 shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0">
            {items.map((item) => (
              <div key={item.label}>
                {item.separated ? <Base.Separator className="my-1.5 h-px bg-line" /> : null}
                <Base.Item
                  onClick={item.onSelect}
                  className={`flex cursor-default items-center gap-2 rounded-inner px-3 py-1.5 text-body-sm data-[highlighted]:bg-hover ${
                    item.danger ? "text-danger data-[highlighted]:bg-danger-soft" : ""
                  } ${item.current ? "font-medium" : ""}`}
                >
                  {item.icon ? <span className="flex w-4 justify-center">{item.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.detail}
                  {item.current ? <Check aria-hidden="true" size={14} /> : null}
                  {item.keys ? <Kbd>{item.keys}</Kbd> : null}
                </Base.Item>
              </div>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
