import { useEffect } from "react";
import { api } from "./api.ts";

/** The kinds the palette remembers as recent. */
export type RecentKind =
  | "script"
  | "flow"
  | "table"
  | "interface"
  | "connection"
  | "event"
  | "doc"
  | "variable"
  | "query"
  | "data_source"
  | "run"
  | "flow_run";

/**
 * Remembers that the member opened something, for the palette's Recent list.
 * A preference of their own: it leaves no audit entry, and a failure is ignored.
 */
export function useRecordRecent(
  tenantId: string | undefined,
  workspaceId: string | undefined,
  kind: RecentKind | undefined,
  ref: string | undefined,
) {
  useEffect(() => {
    if (!tenantId || !workspaceId || !kind || !ref) return;
    api.put("/me/recent-items", { tenantId, workspaceId, kind, ref }).catch(() => {});
  }, [tenantId, workspaceId, kind, ref]);
}

/**
 * What a page's address says was opened, for the kinds known by address alone. `query` is the
 * address's `?query=`, which is where a saved query opens.
 */
export function openedAt(
  path: string,
  query?: string | null,
): { kind: RecentKind; ref: string } | undefined {
  const queries = /^\/t\/[^/]+\/workspaces\/[^/]+\/queries\/?$/.exec(path);
  if (queries) return query ? { kind: "query", ref: query } : undefined;
  const match =
    /^\/t\/[^/]+\/workspaces\/[^/]+\/(scripts\/edit|scripts|flows(?:\/edit)?|tables|screens|connections|events|docs|variables|sources)\/(.+)$/.exec(
      path,
    );
  if (!match) return undefined;
  const [, area, rest] = match as unknown as [string, string, string];
  if (rest === "new") return undefined;
  if (area === "connections") return { kind: "connection", ref: decodeURIComponent(rest) };
  if (area === "events") return { kind: "event", ref: decodeURIComponent(rest) };
  if (area === "docs") return { kind: "doc", ref: decodeURIComponent(rest) };
  if (area === "variables") return { kind: "variable", ref: decodeURIComponent(rest) };
  if (area === "sources") return { kind: "data_source", ref: decodeURIComponent(rest) };
  if (area.startsWith("flows")) {
    if (rest === "new") return undefined;
    return { kind: "flow", ref: decodeURIComponent(rest) };
  }
  if (area === "tables") return { kind: "table", ref: decodeURIComponent(rest) };
  if (area === "screens") return { kind: "interface", ref: decodeURIComponent(rest) };
  return { kind: "script", ref: decodeURIComponent(rest) };
}
