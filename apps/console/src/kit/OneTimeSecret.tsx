import { Button } from "@vynxlabs/ui";
import { type ReactNode, useState } from "react";
import { ask } from "../ask.tsx";
import { CopyButton } from "../ListScreen.tsx";

/**
 * A value shown once, such as a new API key: the value to copy, a Copy button,
 * and Done, which asks first if it was not copied, since it cannot be shown again.
 */
export function OneTimeSecret({
  value,
  noun,
  onDone,
  children,
}: {
  value: string;
  /** What it is, in the sentence: "key", "credential", "token". */
  noun: string;
  /** Takes it away. Without it, the value stays until the page is left. */
  onDone?: (() => void) | undefined;
  /** More to say, such as a command that uses the value. */
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const done = async () => {
    if (!copied) {
      const sure = await ask.confirm({
        title: `Close without copying the ${noun}?`,
        text: `It is shown only once. Once closed, a new ${noun} has to be made.`,
        action: "Close it",
        cancel: "Go back",
      });
      if (!sure) return;
    }
    onDone?.();
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0">Copy this {noun} now. It is shown only once, and cannot be read again.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5 font-mono text-[13px] break-all select-all">
          {value}
        </code>
        <CopyButton value={value} label={`Copy the ${noun}`} onCopied={() => setCopied(true)} />
        {onDone ? (
          <Button size="small" variant="quiet" onClick={() => void done()}>
            Done
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
