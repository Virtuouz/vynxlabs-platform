import { Button, TextField } from "@volvel/ui";
import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ago } from "../kit/format.ts";

/**
 * A credential that is stored sealed and never shown (08 §3.31): whether one is
 * set, when and by whom, and a way to replace it. A new value is typed only
 * after Replace, so keeping the stored one is never a field left empty on
 * purpose. With nothing stored, it asks for one at once.
 */
export function SecretField({
  label,
  name,
  stored,
  setAt,
  setBy,
  value,
  onChange,
  hint,
  required = false,
  disabled = false,
  autoComplete = "new-password",
  removed = false,
  onRemove,
}: {
  label: string;
  name: string;
  /** Whether a value is stored now. */
  stored: boolean;
  setAt?: string | null | undefined;
  setBy?: string | null | undefined;
  /** What has been typed to replace it. Empty keeps the stored one. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  /** The stored one is to be removed when the form is saved. */
  removed?: boolean;
  /** Offers Remove beside Replace, and Keep it once chosen. Leave out where a credential cannot be removed. */
  onRemove?: (removed: boolean) => void;
}) {
  const [replacing, setReplacing] = useState(false);
  // A control that was used goes away: the focus follows to the one that took its place.
  const root = useRef<HTMLDivElement>(null);
  const next = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each change of what is drawn
  useEffect(() => {
    const want = next.current;
    if (!want) return;
    next.current = null;
    root.current
      ?.querySelector<HTMLElement>(want === "field" ? "input" : `[data-secret-focus="${want}"]`)
      ?.focus();
  }, [replacing, removed, stored]);
  // Saved: the stored value now is the one just given, so the stored line shows again and the
  // form does not go on asking for another.
  const [seen, setSeen] = useState(setAt);
  if (seen !== setAt) {
    setSeen(setAt);
    setReplacing(false);
  }
  if (stored && removed) {
    return (
      <div ref={root} className="flex flex-col gap-1">
        <span className="text-body-sm font-medium text-ink">{label}</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-sunken px-3 py-2">
          <span className="text-body-sm">
            The stored {label.toLowerCase()} will be removed when you save.
          </span>
          <Button
            size="small"
            data-secret-focus="keep"
            onClick={() => {
              next.current = "remove";
              onRemove?.(false);
            }}
          >
            Keep the stored one
          </Button>
        </div>
      </div>
    );
  }
  if (stored && !replacing) {
    return (
      <div ref={root} className="flex flex-col gap-1">
        <span className="text-body-sm font-medium text-ink">{label}</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-sunken px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-body-sm">
            <KeyRound aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
            <span className="min-w-0">
              Stored
              {setAt ? (
                <span className="text-ink-muted">
                  {" "}
                  · set <time dateTime={setAt}>{ago(setAt)}</time>
                  {setBy ? ` by ${setBy}` : ""}
                </span>
              ) : null}
            </span>
          </span>
          {disabled ? null : (
            <span className="flex flex-wrap gap-2">
              <Button
                size="small"
                aria-label={`Replace the ${label.toLowerCase()}`}
                data-secret-focus="replace"
                onClick={() => {
                  next.current = "field";
                  setReplacing(true);
                }}
              >
                Replace
              </Button>
              {onRemove ? (
                <Button
                  size="small"
                  variant="danger"
                  aria-label={`Remove the ${label.toLowerCase()}`}
                  data-secret-focus="remove"
                  onClick={() => {
                    next.current = "keep";
                    onRemove(true);
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </span>
          )}
        </div>
        <span className="text-body-sm text-ink-muted">Stored encrypted. It is never shown.</span>
      </div>
    );
  }
  return (
    <div ref={root} className="flex flex-col gap-1">
      <TextField
        label={stored ? `New ${label.toLowerCase()}` : label}
        name={name}
        type="password"
        autoComplete={autoComplete}
        value={value}
        required={required && !stored}
        disabled={disabled}
        hint={
          hint ??
          (stored
            ? "It replaces the stored one when you save."
            : "Stored encrypted, and never shown again.")
        }
        onChange={onChange}
      />
      {stored ? (
        <Button
          size="small"
          variant="quiet"
          className="w-fit"
          onClick={() => {
            next.current = "replace";
            onChange("");
            setReplacing(false);
          }}
        >
          Keep the stored one
        </Button>
      ) : null}
    </div>
  );
}
