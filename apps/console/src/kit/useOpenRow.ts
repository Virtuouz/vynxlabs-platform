import { useState } from "react";
import type { Loaded } from "../api.ts";

/**
 * The row of a list that is open in the address. What a save answered is shown at once, until
 * the list has been read again after it: from then on the list is the truth, which matters when
 * something else a person did changed the row (removing a provider's last domain turns it off).
 */
export function useOpenRow<T extends { id: string }>(
  list: Loaded<{ items: T[] }>,
  open: string | undefined,
): [T | undefined, (row: T | undefined) => void] {
  const [fresh, setFresh] = useState<{ row: T; at: number }>();
  const listed = list.data?.items.find((one) => one.id === open);
  const answered =
    fresh !== undefined && fresh.row.id === open && !(list.updatedAt && list.updatedAt > fresh.at);
  return [
    answered ? fresh?.row : (listed ?? undefined),
    (row) => setFresh(row && { row, at: Date.now() }),
  ];
}
