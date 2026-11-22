import { appFor, type DocPage, type DocsList, inApp } from "../screens/docs/model.ts";

/**
 * A page of the workspace's documentation as something to choose: what a help topic (or anything
 * else that points at a page of the documentation) is picked from. A page is named by its `topic`,
 * which stays with it when the page moves; one with no topic cannot be chosen yet.
 */
export interface DocPick {
  path: string;
  title: string;
  description: string;
  /** The folder it is in, under its docs app ("guides/billing"), or the app's name at the top. */
  folder: string;
  /** Its path under its app. */
  where: string;
  topic: string | null;
}

const dirname = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** The pages that can be chosen from, in order: by folder, then by title. A page that is being removed is not offered. */
export function picksOf(list: DocsList): DocPick[] {
  const many = list.apps.length > 1;
  return list.pages
    .filter((page: DocPage) => page.state !== "removed")
    .map((page) => {
      const app = appFor(list.apps, page.path);
      const where = inApp(app, page.path);
      const folder = dirname(where);
      return {
        path: page.path,
        title: page.title || where,
        description: page.description ?? "",
        folder:
          folder === ""
            ? (app?.title ?? "Pages")
            : many && app
              ? `${app.title} › ${folder}`
              : folder,
        where,
        topic: page.topic,
      };
    })
    .sort(
      (a, b) =>
        a.folder.localeCompare(b.folder, undefined, { sensitivity: "base" }) ||
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
}

/** The pages that match what was typed, over title, description, folder, path and topic. Every word must be found. */
export function matching(picks: readonly DocPick[], query: string): DocPick[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...picks];
  return picks.filter((one) => {
    const hay = [one.title, one.description, one.folder, one.where, one.topic ?? ""]
      .join(" ")
      .toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}

/** The matches grouped by folder, in the order given. */
export function grouped(picks: readonly DocPick[]): { folder: string; items: DocPick[] }[] {
  const out: { folder: string; items: DocPick[] }[] = [];
  for (const one of picks) {
    const last = out.at(-1);
    if (last && last.folder === one.folder) last.items.push(one);
    else out.push({ folder: one.folder, items: [one] });
  }
  return out;
}

/** The page that has a topic, when one does. */
export const pickOfTopic = (picks: readonly DocPick[], topic: string): DocPick | undefined =>
  picks.find((one) => one.topic === topic);
