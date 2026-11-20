import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useOpening } from "./presence.tsx";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  /**
   * `wide` is for a form with a table or an editor in it. `palette` fills a
   * phone's screen, and is a panel near the top on anything wider. `table` is
   * for a dialog that is a table to read: most of the window, with the table
   * filling it, and the whole screen on a phone. A table in a `regular` dialog
   * is always scrolled.
   */
  size?: "regular" | "wide" | "palette" | "table";
  /**
   * Called once it has left, after its motion. What closing it leads to, such as
   * opening another screen, waits for this, so the dialog is seen to go.
   */
  onClosed?: () => void;
  children: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "regular",
  onClosed,
  children,
}: DialogProps) {
  const shown = useOpening(open);
  return (
    <Base.Root
      open={shown}
      onOpenChange={(next: boolean) => !next && onClose()}
      onOpenChangeComplete={(now: boolean) => {
        if (!now) onClosed?.();
      }}
    >
      <Base.Portal>
        {/* Above a side sheet: a question asked from one is answered over it. */}
        <Base.Backdrop className="fixed inset-0 layer-dialog bg-ink/40 transition-opacity motion-slow data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          className={`fixed layer-dialog overflow-y-auto border-line bg-surface p-5 shadow-modal transition-[opacity,scale] motion-slow data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0 ${
            size === "table"
              ? "inset-0 flex flex-col md:inset-auto md:top-[8vh] md:left-1/2 md:h-[84vh] md:w-[min(76rem,calc(100vw-3rem))] md:-translate-x-1/2 md:rounded-overlay md:border"
              : size === "palette"
                ? "inset-0 md:inset-auto md:top-[10vh] md:left-1/2 md:max-h-[80vh] md:w-[min(40rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-overlay md:border"
                : `left-1/2 max-h-[88vh] -translate-x-1/2 rounded-overlay border ${
                    size === "wide"
                      ? "top-[6vh] w-[min(46rem,calc(100vw-2rem))]"
                      : "top-[12vh] w-[min(30rem,calc(100vw-2rem))]"
                  }`
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <Base.Title className="m-0 text-title font-semibold">{title}</Base.Title>
            {/* A way out that can be seen and pressed, beside Esc and the backdrop. */}
            <Base.Close
              aria-label="Close"
              className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
            >
              <X aria-hidden="true" size={16} />
            </Base.Close>
          </div>
          {description ? (
            <Base.Description className="mt-1 mb-0 text-ink-muted">{description}</Base.Description>
          ) : null}
          <div className={size === "table" ? "mt-4 flex min-h-0 flex-1 flex-col" : "mt-4"}>
            {children}
          </div>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
