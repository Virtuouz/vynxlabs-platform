import { ContextMenu as Base } from "@base-ui/react/context-menu";
import type { ReactNode } from "react";
import type { MenuItem } from "./Menu.tsx";

/**
 * A menu that opens where something is right-clicked, or from the keyboard
 * with Shift+F10 or the Menu key on what has focus (08 §3.16). Its items have
 * the same shape as `Menu`'s, so an action is offered the same way in both.
 * `items` may depend on what was clicked: read it in `onOpen`.
 */
export function ContextMenu({
  items,
  children,
  onOpen,
  className = "",
}: {
  items: MenuItem[];
  /** What a right-click opens the menu on. */
  children: ReactNode;
  /** Called as the menu opens, with what was right-clicked, so the items can be for it. */
  onOpen?: ((target: Element | null) => void) | undefined;
  className?: string;
}) {
  return (
    <Base.Root>
      <Base.Trigger
        className={className}
        onContextMenu={(event) => onOpen?.(event.target instanceof Element ? event.target : null)}
      >
        {children}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner className="layer-popover">
          <Base.Popup className="max-h-[70vh] min-w-44 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[starting-style]:-translate-y-1">
            {items.map((item) => (
              <div key={item.label}>
                {item.separated ? <Base.Separator className="my-1 h-px bg-line" /> : null}
                <Base.Item
                  onClick={item.onSelect}
                  className={`flex cursor-default items-center gap-2 rounded-inner px-3 py-1.5 data-[highlighted]:bg-action-soft ${
                    item.danger ? "text-danger data-[highlighted]:bg-danger-soft" : ""
                  }`}
                >
                  {item.icon ? <span className="flex w-4 justify-center">{item.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.keys ? (
                    <kbd className="font-mono text-code-sm text-ink-subtle">{item.keys}</kbd>
                  ) : null}
                </Base.Item>
              </div>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
