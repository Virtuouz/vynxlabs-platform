import { Dialog as Base } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  return (
    <Base.Root open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 bg-ink/40" />
        <Base.Popup className="fixed top-[12vh] left-1/2 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-panel border border-line bg-surface p-5 shadow-xl">
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
