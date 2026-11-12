import type { ComponentChildren } from "preact";

export type BadgeTone = "neutral" | "action" | "attention" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-muted",
  action: "bg-action-soft text-action",
  attention: "bg-attention-soft text-attention",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ComponentChildren;
}) {
  return (
    <span
      class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
