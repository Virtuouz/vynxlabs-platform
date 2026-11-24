import { type DocEntry, type DocIssue, readPage } from "./page.js";
import { ABOUT_KINDS, type AboutKind } from "./schema.js";
import { type BuildOptions, buildDocSet, type DocSet, PRODUCT_PREFIX } from "./set.js";
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
  /** The resource's key, which a rename keeps, if whoever gives it knows. */
  key?: string | undefined;
  path: string;
  title?: string | null | undefined;
  body: unknown;
  /** When the resource last changed, if whoever gives it knows. A served page says it. */
  updated?: string | Date | null | undefined;
}

/** An app that serves a folder of pages. */
export interface DocsApp {
  /** The app's own path. */
  path: string;
  /** The app's key, which a rename keeps. Set where a bundle says it. */
  key?: string;
  title: string;
  /** The folder of pages it serves: every page whose path is under it. */
  docs: string;
  /** The table its readers' answers to "Was this page helpful?" are kept in, when it asks. */
  feedback?: string;
  /** False when the site is not served: its pages and the app are kept. Absent means served. */
  published?: false;
}

/** The one table of a workspace in which every docs site keeps its readers' answers. */
export const FEEDBACK_TABLE = "docs-feedback";

/**
 * The columns of that table, and of what type: what the console makes, what a
 * served site writes, and what a doc writer's deploy is held to.
 */
export const FEEDBACK_COLUMNS = {
  site_key: {
    type: "text",
    required: true,
    description: "The key of the site's app, which a rename keeps.",
  },
  site: { type: "text", required: false, description: "The site's name when the reader said so." },
  page: { type: "text", required: true, description: "The page, by its path in the site." },
  helpful: { type: "boolean", required: true, description: "Whether it helped." },
  version: { type: "text", required: false, description: "The deployed version they read." },
  at: { type: "timestamp", required: false, description: "When they said so." },
} as const;

/** Whether a table's body has exactly the feedback columns, of the same types. */
export function hasFeedbackColumns(body: unknown): boolean {
  const columns = (body as { columns?: Record<string, { type?: unknown; required?: unknown }> })
    ?.columns;
  if (!columns || typeof columns !== "object") return false;
  const names = Object.keys(columns).sort();
  if (names.join() !== Object.keys(FEEDBACK_COLUMNS).sort().join()) return false;
  return names.every((name) => {
    const want = FEEDBACK_COLUMNS[name as keyof typeof FEEDBACK_COLUMNS];
    const have = columns[name];
    return have?.type === want.type && (have?.required === true) === want.required;
  });
}

/** Whether a resource is the workspace's table of readers' answers, as it should be made. */
export const isFeedbackTable = (kind: string, path: string, body: unknown): boolean =>
  kind === "table" && path === FEEDBACK_TABLE && hasFeedbackColumns(body);

/** The apps of a workspace that serve documentation. */
export function docsApps(resources: readonly ResourceLike[]): DocsApp[] {
  return resources
    .filter((one) => one.kind === "app")
    .flatMap((one) => {
      const body = one.body as {
        title?: unknown;
        docs?: unknown;
        feedback?: { table?: unknown };
        published?: unknown;
      };
      const feedback = body.feedback?.table;
      return typeof body.docs === "string"
        ? [
            {
              path: one.path,
              ...(one.key !== undefined ? { key: one.key } : {}),
              title: typeof body.title === "string" ? body.title : one.path,
              docs: body.docs,
              ...(typeof feedback === "string" ? { feedback } : {}),
              ...(body.published === false ? { published: false as const } : {}),
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
    const updated =
      resource.updated instanceof Date ? resource.updated.toISOString() : resource.updated;
    const read = readPage(path, sourceOf(resource), updated ? { updated } : {});
    entries.push(read.entry);
    issues.push(...read.issues);
  }
  const built = buildDocSet(entries, {
    resource: resourceChecker(resources),
    reservedPrefix: PRODUCT_PREFIX,
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

function definedTerms(resources: readonly ResourceLike[]): Set<string> {
  const defined = new Set<string>();
  for (const resource of resources) {
    if (resource.kind !== "doc") continue;
    for (const term of readPage(resource.path, sourceOf(resource)).entry.frontmatter.terms ?? []) {
      defined.add(term.id);
    }
  }
  return defined;
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

  // A site is a folder of the documentation's own: a top-level one.
  for (const app of apps) {
    if (app.docs.includes("/")) {
      problems.push(
        `${app.path} (app): serves "${app.docs}", which is inside another folder. A docs app serves a top-level folder: move its pages to a folder of their own, or serve "${app.docs.split("/")[0]}".`,
      );
    }
  }

  // Readers' answers are kept in a table that is there, and holds what an answer is.
  for (const app of apps) {
    if (app.feedback === undefined) continue;
    const table = resources.find((one) => one.kind === "table" && one.path === app.feedback);
    if (!table) {
      problems.push(
        `${app.path} (app): keeps its readers' answers in the table ${app.feedback}, and there is no such table.`,
      );
      continue;
    }
    const columns = ((table.body as { columns?: Record<string, { type?: string }> }).columns ??
      {}) as Record<string, { type?: string }>;
    const wrong = Object.entries(FEEDBACK_COLUMNS).filter(
      ([name, column]) => columns[name]?.type !== column.type,
    );
    if (wrong.length > 0) {
      problems.push(
        `${app.path} (app): the table ${app.feedback} keeps its readers' answers, and needs ${wrong
          .map(([name, column]) => `a ${column.type} column ${name}`)
          .join(", ")}.`,
      );
    }
  }

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
  const defined = definedTerms(resources);

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

/**
 * What is worth knowing about a workspace's documentation that stops nothing:
 * each warning as a line that names its page. A deploy is never refused for one.
 */
export function workspaceDocsWarnings(
  resources: readonly ResourceLike[],
  options: WorkspaceOptions = {},
): string[] {
  const defined = definedTerms(resources);
  return docsApps(resources).flatMap((app) =>
    buildApp(app, resources, { ...options, knownTerms: defined })
      .issues.filter((issue) => issue.severity === "warning")
      .map(said),
  );
}

export { ABOUT_KINDS, type AboutKind };
