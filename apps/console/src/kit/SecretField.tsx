import { Button, TextField } from "@volvel/ui";
import { KeyRound } from "lucide-react";
import { useState } from "react";
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
}) {
  const [replacing, setReplacing] = useState(false);
  if (stored && !replacing) {
    return (
      <div className="flex flex-col gap-1">
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
            <Button
              size="small"
              aria-label={`Replace the ${label.toLowerCase()}`}
              onClick={() => setReplacing(true)}
            >
              Replace
            </Button>
          )}
        </div>
        <span className="text-body-sm text-ink-muted">Stored encrypted. It is never shown.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
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
