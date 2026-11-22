/**
 * The groups an action or a widget may name (`runBy`, `seenBy`, "the current user is in"): the
 * tenant's groups of members and of end users, each by its path (`groups/<key>`,
 * `end-user-groups/<key>`), which is what never changes and what the server matches, with the name
 * people know it by. They are read from the workspace's `group-keys` route (one read for the
 * builder: `useGroupKeys`). The builder wraps the inspector in `GroupChoicesProvider`; without
 * one there are no groups to offer, and a group already named is shown by its key.
 */
import { createContext, type ReactNode, useContext } from "react";
import { useLoad } from "../../api.ts";
import type { GroupChoice } from "./timelineModel.ts";

/** A group of members or of end users, as an action's `runBy` and a widget's `seenBy` name it. */
export interface GroupKey {
  key: string;
  name: string;
  kind: "member" | "end_user";
}

/** The tenant's groups by key. Empty until they are read. `root` is the workspace's path. */
export function useGroupKeys(root: string): { groups: GroupKey[]; loaded: boolean } {
  const read = useLoad<{ items: GroupKey[] }>(`${root}/group-keys`);
  return { groups: read.data?.items ?? [], loaded: read.data !== undefined };
}

/** The path a group is named by: what `runBy` and `seenBy` hold. */
export const groupPath = (group: Pick<GroupKey, "key" | "kind">): string =>
  group.kind === "member" ? `groups/${group.key}` : `end-user-groups/${group.key}`;

export function choicesOf(groups: readonly GroupKey[]): GroupChoice[] {
  return groups.map((one) => ({ path: groupPath(one), name: one.name, kind: one.kind }));
}

export function useGroupChoices(root: string): GroupChoice[] {
  return choicesOf(useGroupKeys(root).groups);
}

const Choices = createContext<readonly GroupChoice[] | undefined>(undefined);

/** Gives the drawer groups a host has read already (so they are read once). */
export function GroupsProvided({
  groups,
  children,
}: {
  groups: readonly GroupKey[];
  children: ReactNode;
}) {
  return <Choices.Provider value={choicesOf(groups)}>{children}</Choices.Provider>;
}

/** Reads the tenant's groups and gives them to the drawer. `root` is the workspace's path, as `useCatalog` takes it. */
export function GroupChoicesProvider({ root, children }: { root: string; children: ReactNode }) {
  return <GroupsProvided groups={useGroupKeys(root).groups}>{children}</GroupsProvided>;
}

/** The groups to offer: the provider's. */
export function useChosenGroups(): readonly GroupChoice[] {
  return useContext(Choices) ?? [];
}
