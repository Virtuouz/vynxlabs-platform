import { Dialog as Base } from "@base-ui/react/dialog";
import type { ComponentChildren } from "preact";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ComponentChildren;
}

export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  return (
    <Base.Root open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <Base.Portal>
        <Base.Backdrop class="fixed inset-0 bg-ink/40" />
        <Base.Popup class="fixed top-[12vh] left-1/2 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-panel border border-line bg-surface p-5 shadow-xl">
          <Base.Title class="m-0 text-base font-semibold">{title}</Base.Title>
          {description ? (
            <Base.Description class="mt-1 mb-0 text-ink-muted">{description}</Base.Description>
          ) : null}
          <div class="mt-4">{children}</div>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
