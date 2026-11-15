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
        <Base.Backdrop className="fixed inset-0 z-[60] bg-ink/40" />
        <Base.Popup
          className={`fixed z-[61] overflow-y-auto border-line bg-surface p-5 shadow-xl ${
            size === "palette"
              ? "inset-0 md:inset-auto md:top-[10vh] md:left-1/2 md:max-h-[80vh] md:w-[min(40rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-panel md:border"
              : `left-1/2 max-h-[88vh] -translate-x-1/2 rounded-panel border ${
                  size === "wide"
                    ? "top-[6vh] w-[min(46rem,calc(100vw-2rem))]"
                    : "top-[12vh] w-[min(30rem,calc(100vw-2rem))]"
                }`
          }`}
        >
          <Base.Title className="m-0 text-base font-semibold">{title}</Base.Title>
          {description ? (
            <Base.Description className="mt-1 mb-0 text-ink-muted">{description}</Base.Description>
          ) : null}
          <div className="mt-4">{children}</div>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
