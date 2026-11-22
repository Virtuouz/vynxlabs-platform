import { Eye } from "lucide-react";
import { useLoad } from "../../api.ts";

/** What `GET …/summary` says of who may edit what is built in a workspace (the fields this uses). */
interface Authoring {
  mayAuthor?: boolean;
  authorBlockedBy?: "production" | "permission" | null;
}

export type ReadOnlyWhy = "production" | "permission" | null;

/**
 * Whether the builder is read only for this person: they may not edit here, or the workspace is
 * production. `known` is false until the workspace's summary has been read, so a screen waits for
 * it before it chooses what to draw.
 */
export function useReadOnly(root: string): { known: boolean; readOnly: boolean; why: ReadOnlyWhy } {
  const summary = useLoad<Authoring>(`${root}/summary`);
  if (summary.data === undefined && !summary.error) {
    return { known: false, readOnly: false, why: null };
  }
  // A server that does not say is taken as one that allows: its own refusals still stand.
  const readOnly = summary.data?.mayAuthor === false;
  return {
    known: true,
    readOnly,
    why: readOnly ? (summary.data?.authorBlockedBy ?? "permission") : null,
  };
}

/** What the quiet line says: that it is read only, and why. */
export function readOnlyWords(what: string, why: ReadOnlyWhy): string {
  return why === "production"
    ? `Read only: this is the production workspace. ${what} are changed in a dev workspace and arrive here by promotion.`
    : `Read only: you may look at this but not change it. Changing ${what.toLowerCase()} needs the resource:write or interface:write permission in this workspace.`;
}

export function ReadOnlyLine({
  what,
  why,
}: {
  /** The plural noun, capitalised: "Apps", "Dashboards". */
  what: string;
  why: ReadOnlyWhy;
}) {
  return (
    <p
      role="note"
      data-read-only=""
      className="m-0 flex items-center gap-2 rounded-inner bg-sunken px-3 py-1.5 text-body-sm text-ink-muted"
    >
      <Eye aria-hidden="true" size={14} className="shrink-0" />
      <span>{readOnlyWords(what, why)}</span>
    </p>
  );
}
