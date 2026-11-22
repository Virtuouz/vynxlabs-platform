import type { InterfaceBody } from "@volvel/manifest";
import { widgetChanges } from "./PublishDialog.tsx";

/**
 * How many things the draft changes against what is deployed: the app's name, each page added,
 * removed or set differently, and each widget added, removed or changed. With nothing deployed
 * yet, everything is new.
 */
export function draftChangeCount(
  deployed: InterfaceBody | undefined,
  draft: InterfaceBody,
): number {
  let count = widgetChanges(deployed, draft).length;
  if (!deployed) return count + draft.pages.length;
  if (deployed.title !== draft.title) count += 1;
  const before = new Map(deployed.pages.map((page) => [page.id, page]));
  for (const page of draft.pages) {
    const was = before.get(page.id);
    if (!was) count += 1;
    else {
      const { widgets: _now, ...now } = page;
      const { widgets: _then, ...then } = was;
      if (JSON.stringify(now) !== JSON.stringify(then)) count += 1;
    }
    before.delete(page.id);
  }
  count += before.size;
  // Pages in another order change the app's menu.
  const kept = draft.pages.filter((page) => deployed.pages.some((one) => one.id === page.id));
  const was = deployed.pages.filter((page) => draft.pages.some((one) => one.id === page.id));
  if (kept.map((page) => page.id).join() !== was.map((page) => page.id).join()) count += 1;
  return count;
}
