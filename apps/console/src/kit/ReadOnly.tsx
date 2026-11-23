import { Notice } from "@volvel/ui";
import { useLoad } from "../api.ts";

interface Readiness {
  checks?: { database?: { readOnly?: boolean } };
}

/** What a person is told wherever a change would be refused: said once, here. */
export const READ_ONLY_WORDS =
  "The database is taking no changes for now: its disk may be full, or it is in maintenance. Reading still works. An operator of this instance can look at its Health screen or run `volvel status`.";

/**
 * Whether the instance's database takes no writes right now, asked of `/readyz` every
 * half minute while the console is in view. A failed answer is not "read only": nothing is said
 * that was not seen.
 */
export function useReadOnly(): boolean {
  const readiness = useLoad<Readiness>("/readyz", { every: 30_000 });
  return readiness.data?.checks?.database?.readOnly === true;
}

/** The strip under the shell's header while the database takes no changes. */
export function ReadOnlyStrip() {
  if (!useReadOnly()) return null;
  return (
    <div className="shrink-0 px-3 pt-2 md:px-4">
      <Notice tone="attention">
        <strong>The instance is read only.</strong> {READ_ONLY_WORDS}
      </Notice>
    </div>
  );
}
