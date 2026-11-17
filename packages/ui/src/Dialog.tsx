import { Dialog as Base } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  /**
   * `wide` is for a form with a table or an editor in it. `palette` fills a
   * phone's screen, and is a panel near the top on anything wider.
   */
  size?: "regular" | "wide" | "palette";
  children: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "regular",
  children,
}: DialogProps) {
  return (
    <Base.Root open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <Base.Portal>
        {/* Above a side sheet: a question asked from one is answered over it. */}
        <Base.Backdrop className="fixed inset-0 layer-dialog bg-ink/40 transition-opacity motion-slow data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          className={`fixed layer-dialog overflow-y-auto border-line bg-surface p-5 shadow-modal transition-[opacity,scale] motion-slow data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0 ${
            size === "palette"
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
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </Base.Close>
          </div>
          {description ? (
            <Base.Description className="mt-1 mb-0 text-ink-muted">{description}</Base.Description>
          ) : null}
          <div className="mt-4">{children}</div>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
