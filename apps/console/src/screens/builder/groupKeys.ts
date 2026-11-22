import { useLoad } from "../../api.ts";

/** A group of members or of end users, as an action's `runBy` and a widget's `seenBy` name it. */
export interface GroupKey {
  key: string;
  name: string;
  kind: "member" | "end_user";
}

/** The tenant's groups by key. Empty until they are read. */
export function useGroupKeys(root: string): { groups: GroupKey[]; loaded: boolean } {
  const read = useLoad<{ items: GroupKey[] }>(`${root}/group-keys`);
  return { groups: read.data?.items ?? [], loaded: read.data !== undefined };
}
