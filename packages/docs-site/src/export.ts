import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSearchIndex,
  type DocSet,
  type OpenedPackage,
  openPackage,
  urlOf,
} from "@volvel/docs-engine";
import { build } from "esbuild";
import { docsAsset, docsAssetHref } from "./assets.js";
import { changelogFeed } from "./feed.js";
import { escapeHtml } from "./html.js";
import {
  crumbOf,
  docPage,
  notFoundPage,
  pageAt,
  pageMarkdown,
  type SiteView,
  searchPage,
} from "./render.js";

/** The files of a built package of documentation, by name, as `packageOutput` and the docs build wrote them. */
export interface ExportSource {
  /** A text file: `manifest.json`, `pages/<path>.json`, `md/<path>.md`, `redirects.json`, `fields.json`. */
  read(name: string): string | undefined;
  /** Every picture and file beside the pages, by its name under `assets/`. */
  assets(): string[];
  readAsset(name: string): Uint8Array | undefined;
}

/** A version of the documentation the website lists. */
export interface VersionEntry {
  version: string;
  /** The day it was released, `YYYY-MM-DD`. */
  date: string;
  /** Where its pages are, from the site's root: `/docs/` or `/docs/1.2.0/`. */
  path: string;
}

export interface ExportOptions {
  source: ExportSource;
  /** Where the site is served: `/docs/`. Starts and ends in a slash. Every link is made from it. */
  base: string;
  /** The site's name, shown on every page. */
  title: string;
  /** What `:product[]` is drawn as. */
  productName?: string;
  /** The stylesheet of the site's look: the tokens of light and dark. */
  theme: string;
  /** The version the pages describe. The package's own when left out. */
  version?: string;
  /** The day of the version, `YYYY-MM-DD`. Today when left out. */
  date?: string;
  /** The site's address, `https://example.com`. With it the sitemap and the redirects carry whole addresses. */
  origin?: string;
  /** The versions listed before this one: they are kept in `versions.json` beside it. */
  previous?: VersionEntry[];
  /** The drawing script of diagrams, served beside the pages when a page has one. */
  diagrams?: Uint8Array;
  /** Told of what could not be exported. The export goes on without it. */
  warn?: (message: string) => void;
}

export interface ExportFile {
  /** Under the site's folder, with forward slashes. */
  file: string;
  bytes: Uint8Array;
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const digest = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex").slice(0, 10);

/** What the search needs on the reader's side: the query half of the engine, in one file. */
const SEARCH_CLIENT = `
import { loadSearchIndex } from "@volvel/docs-engine/search-query";
const indexes = new Map();
let meta;
const text = async (address) => {
  const answer = await fetch(address, { credentials: "same-origin" });
  if (!answer.ok) throw new Error("Could not read " + address);
  return answer.text();
};
const indexOf = (address) => {
  if (!indexes.has(address)) indexes.set(address, text(address).then(loadSearchIndex));
  return indexes.get(address);
};
/** Asks the indexes of a site served as files: the one of a collection, or all of them. */
export async function search(prefix, query, options = {}) {
  if (!meta) meta = text(prefix + "index.json").then(JSON.parse);
  const { files, crumbs } = await meta;
  const wanted = options.collection ? [options.collection] : Object.keys(files);
  const found = [];
  for (const id of wanted) {
    if (!files[id]) continue;
    const index = await indexOf(prefix + files[id]);
    found.push(...index.grouped(query, options.type ? { type: options.type } : {}));
  }
  found.sort((a, b) => b.score - a.score);
  return {
    pages: found.slice(0, 8).map((page) => ({ url: page.url, title: page.title, crumb: crumbs[page.path] || "", places: page.places })),
  };
}
`;

/** The search script of an export, bundled from the engine of this release. */
export async function searchClient(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = await build({
    stdin: { contents: SEARCH_CLIENT, resolveDir: here, loader: "js", sourcefile: "search.js" },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    write: false,
    legalComments: "none",
  });
  return out.outputFiles[0]?.text ?? "";
}

/** A page's address under the site: ends in a slash, and the home page's is empty. */
const slashed = (url: string) => (url === "" ? "" : `${url}/`);

/**
 * A site of documentation as the files of a static site, to be served from `base` of any host that
 * serves files. Pages are drawn by the same renderer `/docs` uses, from the same kind of view; the
 * differences are what a server does and a file cannot: search is answered in the reader's browser
 * from indexes the site carries, and a moved page leads to its new address by a page of its own.
 */
export async function* exportSite(options: ExportOptions): AsyncGenerator<ExportFile> {
  const { source, base } = options;
  if (!/^\/(?:[^/?#\s]+\/)*$/.test(base)) {
    throw new Error(`The base path must start and end with a slash, as "/docs/". Got "${base}".`);
  }
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`The date must be a day, as 2026-11-19. Got "${date}".`);
  }
  const pkg: OpenedPackage = openPackage((name) => source.read(name));
  const { set, manifest } = pkg;
  const version = options.version ?? pkg.version;
  const assets = new Set(source.assets());
  const emitted = new Set<string>();
  const file = (name: string, body: string | Uint8Array): ExportFile => {
    emitted.add(name);
    return { file: name, bytes: typeof body === "string" ? encode(body) : body };
  };
  const warn = options.warn ?? (() => {});

  // The platform's own files, named by what is in them.
  const platform = `${base}_platform/`;
  const client = await searchClient();
  const clientName = `search.${digest(client)}.js`;
  const themeName = `theme.${digest(options.theme)}.css`;
  for (const kind of ["css", "js", "theme"] as const) {
    const name = docsAssetHref("", kind);
    const found = docsAsset(name);
    if (found) yield file(`_platform/${name}`, found.body);
  }
  yield file(`_platform/${clientName}`, client);
  yield file(`_platform/${themeName}`, options.theme);

  // Search: one index for each collection, and the places the script draws a result from.
  const collections = new Map<string, string[]>();
  for (const path of set.pages.keys()) {
    const id = path.includes("/") ? (path.split("/")[0] as string) : "";
    collections.set(id, [...(collections.get(id) ?? []), path]);
  }
  const files: Record<string, string> = {};
  const crumbs: Record<string, string> = {};
  for (const [id, paths] of [...collections].sort(([a], [b]) => a.localeCompare(b))) {
    const part: DocSet = {
      ...set,
      pages: new Map(
        paths.flatMap((path) =>
          set.pages.has(path) ? [[path, set.pages.get(path)]] : [],
        ) as never,
      ),
    };
    const name = `${id === "" ? "_root" : id}.json`;
    files[id] = name;
    yield file(
      `search/${name}`,
      buildSearchIndex(part, options.productName ? { productName: options.productName } : {}),
    );
    for (const path of paths) crumbs[path] = crumbOf(set, path);
  }
  yield file("search/index.json", JSON.stringify({ files, crumbs }));

  const screenshots = manifest.screenshotFiles ?? {};
  const shot = (look: "light" | "dark") => (name: string) => {
    const picture = screenshots[name]?.[look];
    return picture && assets.has(`screenshots/${picture}`)
      ? `${base}assets/screenshots/${picture}`
      : null;
  };
  let fields: Record<string, string> | undefined;
  try {
    const text = source.read("fields.json");
    fields = text ? JSON.parse(text) : undefined;
  } catch {
    fields = undefined;
  }
  const view: SiteView = {
    title: options.title,
    set,
    base,
    platform,
    look: { themeHref: `${platform}${themeName}` },
    profile: "product",
    ...(options.productName ? { productName: options.productName } : {}),
    version,
    trailingSlash: true,
    search: { kind: "static", index: `${base}search/`, module: `${platform}${clientName}` },
    resolve: {
      asset: (name) => (assets.has(name) ? `${base}assets/${name}` : undefined),
      screenshot: shot("light"),
      screenshotDark: shot("dark"),
      field: (path) => (fields?.[path] ? { description: fields[path] as string } : null),
    },
  };

  // Every page, and its Markdown.
  const markdown = (path: string) => source.read(`md/${path}.md`);
  for (const path of [...set.pages.keys()].sort()) {
    const url = urlOf(path);
    yield file(url === "" ? "index.html" : `${url}/index.html`, docPage(view, path));
    const text = pageMarkdown(set, `${url === "" ? "index" : url}.md`, markdown);
    if (text !== undefined) yield file(`${url === "" ? "index" : url}.md`, text);
  }
  yield file("404.html", notFoundPage(view));
  yield file("_search/index.html", searchPage(view, "", []));

  // The pictures and files beside the pages, and the drawing script of diagrams.
  for (const name of [...assets].sort()) {
    const bytes = source.readAsset(name);
    if (bytes) yield file(`assets/${name}`, bytes);
  }
  if (options.diagrams) yield file("_platform/diagrams.js", options.diagrams);

  // Moves: a static host has no 308, so an old address is a page that leads on, and a file for hosts that read one.
  const address = (path: string) => `${options.origin ?? ""}${base}${slashed(urlOf(path))}`;
  const rules: string[] = [];
  for (const old of Object.keys(pkg.redirects).sort()) {
    const target = pkg.moved(old);
    if (target === undefined) {
      warn(`${old} is said to have moved, but the page it moved to is not in the set.`);
      continue;
    }
    const from = urlOf(old);
    if (pageAt(set, from) !== undefined) continue;
    const name = from === "" ? "index.html" : `${from}/index.html`;
    if (emitted.has(name)) continue;
    const to = address(target);
    const title = set.pages.get(target)?.frontmatter.title ?? target;
    yield file(
      name,
      `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>This page has moved</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${escapeHtml(to)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(to)}">
</head>
<body>
<p>This page has moved to <a href="${escapeHtml(to)}">${escapeHtml(title)}</a>.</p>
</body>
</html>
`,
    );
    rules.push(`${base}${from}  ${base}${slashed(urlOf(target))}  308`);
    rules.push(`${base}${from}.md  ${base}${urlOf(target) || "index"}.md  308`);
  }
  yield file("_redirects", `${rules.join("\n")}${rules.length > 0 ? "\n" : ""}`);

  // For search engines.
  const entries = [...set.pages.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, entry]) => {
      const modified = entry.updated
        ? `<lastmod>${escapeHtml(entry.updated.slice(0, 10))}</lastmod>`
        : "";
      return `<url><loc>${escapeHtml(address(path))}</loc>${modified}</url>`;
    });
  yield file(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`,
  );

  // For readers who follow a changelog: the entries, newest first.
  const feed = changelogFeed(set, {
    title: options.title,
    base,
    ...(options.origin ? { origin: options.origin } : {}),
  });
  if (feed !== undefined) yield file("changelog.xml", feed);

  // For the website to list versions: this one, and those it was given.
  const mine: VersionEntry = { version, date, path: base };
  const versions = [mine, ...(options.previous ?? []).filter((one) => one.version !== version)];
  yield file("versions.json", `${JSON.stringify({ version, date, versions }, null, 2)}\n`);
}

/** A built package of documentation in a folder, as `packages/docs/dist` is. */
export function directorySource(directory: string): ExportSource {
  const walk = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir).flatMap((name) => {
          const path = join(dir, name);
          return statSync(path).isDirectory() ? walk(path) : [path];
        })
      : [];
  return {
    read(name) {
      const path = join(directory, name);
      return existsSync(path) ? readFileSync(path, "utf8") : undefined;
    },
    assets: () =>
      walk(join(directory, "assets"))
        .map((path) => relative(join(directory, "assets"), path).split(sep).join("/"))
        .sort(),
    readAsset(name) {
      const path = join(directory, "assets", name);
      return existsSync(path) ? readFileSync(path) : undefined;
    },
  };
}

/** Writes the export into a folder. Returns the files written. */
export async function exportToDirectory(out: string, options: ExportOptions): Promise<string[]> {
  const written: string[] = [];
  for await (const { file, bytes } of exportSite(options)) {
    const path = join(out, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    written.push(file);
  }
  return written;
}
