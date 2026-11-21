import { GlossaryProvider, type GlossaryTerm } from "@volvel/ui";
import { ExternalLink } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useLoad } from "../api.ts";
import { usePreference } from "../prefs.ts";

/** A page of a docs app the reader may open, and where it is served. */
export interface PageLink {
  app: string;
  /** The page, by its path in the workspace. */
  path: string;
  title: string;
  url: string;
}

/** A glossary term as the workspace's `/terms` gives it. */
export interface WorkspaceTerm extends GlossaryTerm {
  aliases: string[];
  /** Where to read more. */
  page: PageLink | null;
}

/** What the workspace's `/terms` answers: its words, and its pages that join the help. */
export interface WorkspaceTerms {
  terms: WorkspaceTerm[];
  resources: Described[];
  /** The team's own notes on the product's help, by topic. */
  extensions: { topic: string; page: PageLink }[];
  /** The pages that say they document a resource. */
  attachments: { kind: string; resource: string; page: PageLink }[];
  topics: { topic: string; page: PageLink }[];
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
const EMPTY: WorkspaceTerms = {
  terms: NONE,
  resources: [],
  extensions: [],
  attachments: [],
  topics: [],
};

/** What the workspace's words mean, to whoever is signed in. Asked once for each workspace. */
export function useWorkspaceTerms(
  tenantId: string | undefined,
  workspaceId: string | undefined,
): WorkspaceTerms {
  const loaded = useLoad<Partial<WorkspaceTerms>>(
    tenantId && workspaceId ? `/tenants/${tenantId}/workspaces/${workspaceId}/terms` : null,
  );
  return useMemo(() => ({ ...EMPTY, ...loaded.data }), [loaded.data]);
}

/** The tenant and the workspace an API root names: `/tenants/<t>/workspaces/<w>`. */
export function workspaceOf(root: string): {
  tenantId: string | undefined;
  workspaceId: string | undefined;
} {
  const [, , tenantId, , workspaceId] = root.split("/");
  return { tenantId, workspaceId };
}

/** A link to one of the team's own pages, where it is served. It opens beside the console, not over it. */
export function PageLinkTo({ page, children }: { page: PageLink; children?: ReactNode }) {
  return (
    <a
      href={page.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-action underline"
    >
      {children ?? page.title}
      <ExternalLink aria-hidden="true" size={14} />
    </a>
  );
}

/**
 * The pages of the team's documentation that say they document a resource,
 * listed where the resource is shown. Nothing is drawn when there are none,
 * or none the reader may open.
 */
export function AttachedPages({
  tenantId,
  workspaceId,
  kind,
  path,
}: {
  tenantId: string | undefined;
  workspaceId: string | undefined;
  kind: string;
  path: string;
}) {
  const { attachments } = useWorkspaceTerms(tenantId, workspaceId);
  const pages = attachments.filter((one) => one.kind === kind && one.resource === path);
  if (pages.length === 0) return null;
  return (
    <section
      aria-label="Documentation"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-meta"
    >
      <span className="text-ink-subtle">In your team's documentation:</span>
      {pages.map((one) => (
        <PageLinkTo key={`${one.page.app}:${one.page.path}`} page={one.page} />
      ))}
    </section>
  );
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
  /** Draws the way to read more about a term. Left out, a link to the term's page where it is served. */
  more?: (term: WorkspaceTerm) => ReactNode;
  children: ReactNode;
}) {
  const [underline] = useUnderlineTerms();
  const { terms } = useWorkspaceTerms(underline ? tenantId : undefined, workspaceId);
  const toPage = useMemo(
    () =>
      more ??
      ((term: WorkspaceTerm) =>
        term.page ? <PageLinkTo page={term.page}>More about {term.term}</PageLinkTo> : null),
    [more],
  );
  return (
    <GlossaryProvider
      terms={underline ? terms : NONE}
      more={toPage as (term: GlossaryTerm) => ReactNode}
    >
      {children}
    </GlossaryProvider>
  );
}
