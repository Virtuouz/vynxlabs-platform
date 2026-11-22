/**
 * The groups an action or a widget may name (`runBy`, `seenBy`): the tenant's groups of members
 * and its groups of end users, each by its path (`groups/<key>`, `end-user-groups/<key>`), which
 * is what never changes, with the name people know it by. The builder wraps the inspector in
 * `GroupChoicesProvider`; without one the Rules tab falls back to the names it was given.
 */
import { createContext, type ReactNode, useContext } from "react";
import { useLoad } from "../../api.ts";
import type { GroupChoice } from "./timelineModel.ts";

interface Row {
  name: string;
  key?: string;
}

/** Reads the tenant's groups of both kinds, once. `root` is the workspace's path. */
export function useGroupChoices(root: string): GroupChoice[] {
  const base = root.split("/workspaces/")[0] ?? "";
  const members = useLoad<{ items: Row[] }>(`${base}/groups?limit=200`);
  const endUsers = useLoad<{ items: Row[] }>(`${base}/end-user-groups?limit=200`);
  return [
    ...(members.data?.items ?? []).map(
      (row): GroupChoice => ({
        path: `groups/${row.key ?? row.name}`,
        name: row.name,
        kind: "member",
      }),
    ),
    ...(endUsers.data?.items ?? []).map(
      (row): GroupChoice => ({
        path: `end-user-groups/${row.key ?? row.name}`,
        name: row.name,
        kind: "end_user",
      }),
    ),
  ];
}

const Choices = createContext<readonly GroupChoice[] | undefined>(undefined);

/** Gives the Rules tab the tenant's groups. `root` is the workspace's path, as `useCatalog` takes it. */
export function GroupChoicesProvider({ root, children }: { root: string; children: ReactNode }) {
  return <Choices.Provider value={useGroupChoices(root)}>{children}</Choices.Provider>;
}

/** The groups to offer: the provider's, else the names the inspector was given, taken as keys. */
export function useChosenGroups(names: readonly string[]): readonly GroupChoice[] {
  const given = useContext(Choices);
  return (
    given ??
    names.map(
      (name): GroupChoice => ({
        path: `groups/${name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`,
        name,
        kind: "member",
      }),
    )
  );
}
