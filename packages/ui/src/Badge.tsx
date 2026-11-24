import type { ReactNode } from "react";
import { contrastRatio } from "./contrast.ts";

export type BadgeTone = "neutral" | "action" | "attention" | "danger" | "success";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-muted",
  action: "bg-action-soft text-action",
  attention: "bg-attention-soft text-attention",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-meta font-medium forced-colors:border forced-colors:border-[CanvasText] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const BLACK = "#000000";
const WHITE = "#ffffff";

/**
 * Black or white, whichever is easier to read on `color`. One of the two
 * always reaches 4.5 to 1, the contrast text needs, whatever the color is.
 */
export function readableOn(color: string): string {
  // The color is the ground; one with some transparency is laid over a white page first.
  const onBlack = contrastRatio(BLACK, color) ?? 0;
  const onWhite = contrastRatio(WHITE, color) ?? 0;
  return onBlack >= onWhite ? BLACK : WHITE;
}

/**
 * One value of a column that holds a choice, on the color its table gives it.
 * The text is black or white, worked out from the color, so any color a
 * table's author picks can be read. A value with no color is a plain badge.
 */
export function ValueChip({
  color,
  children,
}: {
  color?: string | undefined;
  children: ReactNode;
}) {
  if (!color || contrastRatio(color, BLACK) === undefined) {
    return <Badge>{children}</Badge>;
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-meta font-medium forced-colors:border forced-colors:border-[CanvasText]"
      style={{ backgroundColor: color, color: readableOn(color) }}
    >
      {children}
    </span>
  );
}
