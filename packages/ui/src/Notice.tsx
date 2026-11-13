import type { ReactNode } from "react";

const tones = {
  attention: "border-attention/40 bg-attention-soft text-ink",
  danger: "border-danger/40 bg-danger-soft text-ink",
};

/** A message that needs to be seen: an error, or a state the person must not miss. */
export function Notice({
  tone,
  children,
  action,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-control border px-3 py-2 ${tones[tone]}`}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}

/** What an empty list shows: what belongs here, and the way to add the first one. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-panel border border-dashed border-line px-5 py-8">
      <p className="m-0 font-medium">{title}</p>
      {children ? <p className="mt-1 mb-0 max-w-[60ch] text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
