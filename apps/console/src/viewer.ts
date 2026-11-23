import type { ActingUser } from "@volvel/manifest";
import { useMemo } from "react";
import { type Me, useLoad } from "./api.ts";

/**
 * The signed-in member as a page is drawn for them: who they are and the groups of members they are
 * in, with what each is called now. A page's rules (`seenBy`, "user is in group", `{ user }`) are
 * judged for this person; nothing is hidden from them while they are read, and the server decides
 * again. One helper for every console host of a `PageView` (a dashboard, a sheet's preview).
 */
export function useViewer(root: string): ActingUser | undefined {
  const me = useLoad<Me>("/me");
  const tenant = root.split("/workspaces/")[0] ?? "";
  const groups = useLoad<{ items: { key: string; name: string }[] }>(`${tenant}/me/groups`);
  const principal = me.data?.principal;
  return useMemo(() => {
    if (!principal || !groups.data) return undefined;
    return {
      id: principal.id,
      ...(principal.email ? { email: principal.email } : {}),
      ...(principal.name ? { name: principal.name } : {}),
      groups: groups.data.items.map((one) => one.key),
      groupNames: Object.fromEntries(
        groups.data.items.map((one) => [`groups/${one.key}`, one.name]),
      ),
    };
  }, [principal, groups.data]);
}
