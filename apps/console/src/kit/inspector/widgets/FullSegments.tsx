import type { ReactNode } from "react";

/** A segmented choice stretched across its row, each part the same width, as the boards draw it. */
export function FullSegments({ children }: { children: ReactNode }) {
  return (
    <div className="[&>fieldset]:flex [&>fieldset]:w-full [&_label]:flex-1 [&_label]:justify-center">
      {children}
    </div>
  );
}
