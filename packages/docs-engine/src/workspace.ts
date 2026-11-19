import { type DocEntry, type DocIssue, readPage } from "./page.js";
import { ABOUT_KINDS, type AboutKind } from "./schema.js";
import { type BuildOptions, buildDocSet, type DocSet } from "./set.js";
import { clashes } from "./stack.js";

/**
 * A workspace's documentation, worked out from its resources: which pages
 * each docs app serves, and whether they hold together. The control plane
 * runs this on every bundle before it is stored, and the CLI runs it when it
 * builds, so a page that does not read, a link that leads nowhere and a term
 * defined twice all stop a deploy and never reach a reader.
 *
 * It is given resources as plain objects and knows nothing else about them.
 */

/** A resource, as much of it as documentation needs. */
export interface ResourceLike {
  kind: string;
  path: string;
  title?: string | undefined;
  body: unknown;
}

/** An app that serves a folder of pages. */
export interface DocsApp {
  /** The app's own path. */
  path: string;
  title: string;
  /** The folder of pages it serves: every page whose path is under it. */
  docs: string;
}

/** The apps of a workspace that serve documentation. */
export function docsApps(resources: readonly ResourceLike[]): DocsApp[] {
  return resources
    .filter((one) => one.kind === "app")
    .flatMap((one) => {
      const body = one.body as { title?: unknown; docs?: unknown };
      return typeof body.docs === "string"
        ? [
            {
              path: one.path,
              title: typeof body.title === "string" ? body.title : one.path,
              docs: body.docs,
            },
          ]
        : [];
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

const sourceOf = (resource: ResourceLike) =>
  String((resource.body as { source?: unknown } | null)?.source ?? "");

/** The pages a docs app serves, each by its path under the app's folder. */
export function pagesOf(
  app: Pick<DocsApp, "docs">,
  resources: readonly ResourceLike[],
): { path: string; resource: ResourceLike }[] {
  const prefix = `${app.docs}/`;
  return resources
    .filter((one) => one.kind === "doc" && one.path.startsWith(prefix))
    .map((resource) => ({ path: resource.path.slice(prefix.length), resource }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** The docs app a page belongs to, if any: the one whose folder holds it. */
export function appOf(apps: readonly DocsApp[], docPath: string): DocsApp | undefined {
  return apps.find((app) => docPath.startsWith(`${app.docs}/`));
}

/** Whether resources of a workspace say a resource is there, for `about:` and for a term that names one. */
export function resourceChecker(
  resources: readonly ResourceLike[],
): NonNullable<BuildOptions["resource"]> {
  const byPath = new Map(resources.map((one) => [one.path, one]));
  return (kind, path, column) => {
    const found = byPath.get(path);
    if (found?.kind !== kind) return false;
    if (column === undefined) return true;
    const columns = (found.body as { columns?: Record<string, unknown> } | null)?.columns ?? {};
    return Object.hasOwn(columns, column) || ["id", "created_at", "updated_at"].includes(column);
  };
}

export interface BuiltApp {
  app: DocsApp;
  set: DocSet;
  issues: DocIssue[];
}

export interface WorkspaceOptions {
  /** The product's own terms and topics. A tenant's page may use and extend them, and not take their names. */
  product?: { terms: readonly string[]; topics: readonly string[] } | undefined;
  /**
   * Whether a docs app has a picture, by the app's path and the picture's path
   * under the app's folder of pages. Left out, pictures are not checked.
   */
  asset?: ((app: string, file: string) => boolean) | undefined;
}

/** Reads a docs app's pages and builds its set. Each issue names its page by the page's path in the workspace. */
export function buildApp(
  app: DocsApp,
  resources: readonly ResourceLike[],
  options: WorkspaceOptions & Pick<BuildOptions, "knownTerms"> = {},
): BuiltApp {
  const has = options.asset;
  const issues: DocIssue[] = [];
  const entries: DocEntry[] = [];
  for (const { path, resource } of pagesOf(app, resources)) {
    const read = readPage(path, sourceOf(resource));
    entries.push(read.entry);
    issues.push(...read.issues);
  }
  const built = buildDocSet(entries, {
    resource: resourceChecker(resources),
    ...(options.product
      ? { reservedTerms: options.product.terms, reservedTopics: options.product.topics }
      : {}),
    ...(options.knownTerms ? { knownTerms: options.knownTerms } : {}),
    ...(has ? { asset: (file: string) => has(app.path, file) } : {}),
  });
  issues.push(...built.issues);
  return {
    app,
    set: built.set,
    issues: issues
      .map((issue) => ({ ...issue, path: `${app.docs}/${issue.path}` }))
      // One page's problems together, in the order they are met reading it.
      .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column),
  };
}

const said = (issue: DocIssue) =>
  `${issue.path} (doc): ${issue.line > 1 ? `line ${issue.line}: ` : ""}${issue.message.replace(/\n/g, " ")}`;

/**
 * Everything wrong with a workspace's documentation, each as one line that
 * names its resource first: `support/refunds (doc): line 12: …`. An empty
 * list means it can be deployed.
 */
export function checkWorkspaceDocs(
  resources: readonly ResourceLike[],
  options: WorkspaceOptions = {},
): string[] {
  const problems: string[] = [];
  const apps = docsApps(resources);

  // Two apps may not serve the same page.
  for (const [index, app] of apps.entries()) {
    for (const other of apps.slice(index + 1)) {
      if (
        app.docs === other.docs ||
        app.docs.startsWith(`${other.docs}/`) ||
        other.docs.startsWith(`${app.docs}/`)
      ) {
        problems.push(
          `${other.path} (app): its pages are under "${other.docs}", and the app ${app.path} serves "${app.docs}". A page belongs to one docs app: give them folders that do not hold each other.`,
        );
      }
    }
  }

  // A term of one app can be used on a page of another: terms are the workspace's.
  const defined = new Set<string>();
  for (const resource of resources) {
    if (resource.kind !== "doc") continue;
    for (const term of readPage(resource.path, sourceOf(resource)).entry.frontmatter.terms ?? []) {
      defined.add(term.id);
    }
  }

  const built: BuiltApp[] = [];
  for (const app of apps) {
    const one = buildApp(app, resources, { ...options, knownTerms: defined });
    if (one.set.pages.size === 0) {
      problems.push(
        `${app.path} (app): serves the pages under "${app.docs}", and there are none. A page is a Markdown file there, or a page made in the console.`,
      );
    }
    built.push(one);
    problems.push(...one.issues.filter((issue) => issue.severity === "error").map(said));
  }
  for (const clash of clashes(built.map((one) => ({ id: one.app.path, set: one.set })))) {
    problems.push(
      `${clash.layers[1]} (app): the ${clash.kind} "${clash.id}" is also defined in the docs app ${clash.layers[0]}. A ${clash.kind} belongs to the workspace: define it once.`,
    );
  }

  // A page no app serves is still a page: it has to read.
  for (const resource of resources) {
    if (resource.kind !== "doc" || appOf(apps, resource.path)) continue;
    problems.push(
      ...readPage(resource.path, sourceOf(resource))
        .issues.filter((issue) => issue.severity === "error")
        .map(said),
    );
  }
  return problems;
}

export { ABOUT_KINDS, type AboutKind };
