import { Menu as Base } from "@base-ui/react/menu";
import type { ReactNode } from "react";

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
          "flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left hover:bg-sunken"
        }
      >
        {label}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner sideOffset={6} align={align} className="z-50">
          <Base.Popup className="max-h-[70vh] min-w-44 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-lg">
            {items.map((item) => (
              <div key={item.label}>
                {item.separated ? <Base.Separator className="my-1 h-px bg-line" /> : null}
                <Base.Item
                  onClick={item.onSelect}
                  className={`flex cursor-default items-center gap-2 rounded-[4px] px-2.5 py-1.5 data-[highlighted]:bg-action-soft ${
                    item.danger ? "text-danger data-[highlighted]:bg-danger-soft" : ""
                  } ${item.current ? "font-medium" : ""}`}
                >
                  {item.icon ? <span className="flex w-4 justify-center">{item.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.current ? <span aria-hidden="true">✓</span> : null}
                </Base.Item>
              </div>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
