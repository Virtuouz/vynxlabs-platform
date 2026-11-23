/**
 * Where a page that moved can be found. A page says where it was (`moved_from`), and a
 * file beside the pages says where a page that was deleted went. Both become one map of old
 * path to new path, which the console, `/docs` and the static export all read.
 */

export interface MovedPage {
  /** The page's path now. */
  path: string;
  /** The paths it was at before. */
  movedFrom: readonly string[];
}

export interface RedirectProblem {
  path: string;
  code: "redirect_taken" | "redirect_duplicate" | "redirect_unknown" | "redirect_loop";
  message: string;
}

/** Every old path and the page that now answers for it, with what is wrong with the map. */
export function redirectMap(
  pages: ReadonlySet<string>,
  moved: readonly MovedPage[],
  files: Readonly<Record<string, string>> = {},
): { redirects: Record<string, string>; problems: RedirectProblem[] } {
  const redirects: Record<string, string> = {};
  const problems: RedirectProblem[] = [];
  const add = (from: string, to: string, where: string) => {
    if (pages.has(from)) {
      problems.push({
        path: where,
        code: "redirect_taken",
        message: `"${from}" is said to have moved to "${to}", and a page is at "${from}" now. Remove it from the moved list, or move that page.`,
      });
    } else if (redirects[from] !== undefined && redirects[from] !== to) {
      problems.push({
        path: where,
        code: "redirect_duplicate",
        message: `"${from}" is said to have moved to both "${redirects[from]}" and "${to}". An old path leads to one page.`,
      });
    } else redirects[from] = to;
  };
  for (const page of moved) for (const from of page.movedFrom) add(from, page.path, page.path);
  for (const [from, to] of Object.entries(files)) add(from, to, "redirects.json");
  // Every old path must end at a page, by however many moves.
  for (const from of Object.keys(redirects)) {
    const end = follow(redirects, from);
    if (end === "loop") {
      problems.push({
        path: from,
        code: "redirect_loop",
        message: `"${from}" leads back to itself through the moves.`,
      });
    } else if (!pages.has(end)) {
      problems.push({
        path: from,
        code: "redirect_unknown",
        message: `"${from}" leads to "${end}", and there is no such page.`,
      });
    }
  }
  return { redirects, problems };
}

function follow(redirects: Readonly<Record<string, string>>, path: string): string | "loop" {
  const seen = new Set<string>();
  let at = path;
  while (redirects[at] !== undefined) {
    if (seen.has(at)) return "loop";
    seen.add(at);
    at = redirects[at] as string;
  }
  return at;
}

/**
 * The path a page is at now, for an address that may be an old one. Undefined when the map
 * does not know it. `a/b/index` and `a/b` are one address.
 */
export function redirectedPath(
  redirects: Readonly<Record<string, string>>,
  path: string,
): string | undefined {
  const bare = path.replace(/\/+$/, "");
  for (const candidate of [bare, `${bare}/index`, bare.replace(/\/index$/, "")]) {
    if (candidate === "" || redirects[candidate] === undefined) continue;
    const end = follow(redirects, candidate);
    if (end !== "loop") return end;
  }
  return undefined;
}
