import { GlossaryProvider, type GlossaryTerm } from "@volvel/ui";
import type { ReactNode } from "react";
import { useLoad } from "../api.ts";
import { usePreference } from "../prefs.ts";

/** A glossary term as the workspace's `/terms` gives it. */
export interface WorkspaceTerm extends GlossaryTerm {
  aliases: string[];
  /** Where to read more: a docs app by its path, and the page inside it. */
  page: { app: string; path: string } | null;
}

/** What a resource is for, as `/terms` gives it. */
export interface Described {
  kind: string;
  path: string;
  title: string | null;
  description: string | null;
  columns?: { name: string; description: string }[];
}

const UNDERLINE = "terms.underline";

/** Whether the workspace's own terms are underlined in labels. On, until someone turns it off. */
export const useUnderlineTerms = () => usePreference<boolean>(UNDERLINE, true);

const NONE: WorkspaceTerm[] = [];

/** What the workspace's words mean, to whoever is signed in. Asked once for each workspace. */
export function useWorkspaceTerms(tenantId: string | undefined, workspaceId: string | undefined) {
  const loaded = useLoad<{ terms: WorkspaceTerm[]; resources: Described[] }>(
    tenantId && workspaceId ? `/tenants/${tenantId}/workspaces/${workspaceId}/terms` : null,
  );
  return { terms: loaded.data?.terms ?? NONE, resources: loaded.data?.resources ?? [] };
}

/**
 * Around a workspace's screens: the terms its documentation defines are
 * underlined where a heading, a title or a description first uses one. Only
 * in text that names things, never in a row's values.
 */
export function WorkspaceGlossary({
  tenantId,
  workspaceId,
  more,
  children,
}: {
  tenantId: string | undefined;
  workspaceId: string | undefined;
  more?: (term: WorkspaceTerm) => ReactNode;
  children: ReactNode;
}) {
  const [underline] = useUnderlineTerms();
  const { terms } = useWorkspaceTerms(underline ? tenantId : undefined, workspaceId);
  return (
    <GlossaryProvider
      terms={underline ? terms : NONE}
      {...(more ? { more: more as (term: GlossaryTerm) => ReactNode } : {})}
    >
      {children}
    </GlossaryProvider>
  );
}
