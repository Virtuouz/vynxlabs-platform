import { Menu as Base } from "@base-ui/react/menu";
import type { ComponentChildren } from "preact";

export interface MenuProps {
  /** What the trigger button shows. */
  label: ComponentChildren;
  items: { label: string; onSelect: () => void }[];
}

export function Menu({ label, items }: MenuProps) {
  return (
    <Base.Root>
      <Base.Trigger class="flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left hover:bg-sunken">
        {label}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner sideOffset={6}>
          <Base.Popup class="min-w-40 rounded-control border border-line bg-surface p-1 shadow-lg">
            {items.map((item) => (
              <Base.Item
                key={item.label}
                onClick={item.onSelect}
                class="cursor-default rounded-[4px] px-2.5 py-1.5 data-[highlighted]:bg-action-soft"
              >
                {item.label}
              </Base.Item>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
