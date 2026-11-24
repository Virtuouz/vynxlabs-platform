import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildDocSet, packageOutput, readPage } from "@volvel/docs-engine";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { docsAsset, docsAssetHref } from "./assets.js";
import {
  directorySource,
  type ExportOptions,
  type ExportSource,
  exportSite,
  exportToDirectory,
} from "./export.js";

/**
 * A static site is only as good as its links. These tests write the export under a base path,
 * serve it as a host that serves files would (no redirects, no index page without its slash),
 * and follow everything a page names.
 */

const page = (path: string, text: string) => readPage(path, text, { profile: "product" }).entry;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function fixture(): ExportSource {
  const { set } = buildDocSet([
    page(
      "index",
      "---\ntitle: Volvel documentation\ndescription: How it works.\npages: [start, develop]\n---\n\nStart with [the intro](start/intro).\n",
    ),
    page(
      "start/index",
      "---\ntitle: Start\ndescription: First steps.\npages: [intro]\n---\n\n::pages\n",
    ),
    page(
      "start/intro",
      "---\ntitle: Introduction\ndescription: What it is.\nsince: 0.5.0\n---\n\nSee [the CLI](../develop/cli) and [setup](#setup).\n\n![A chart](./pic.png)\n\n::screenshot{name=console/deploy alt=Deploy}\n\n## Setup\n\nInstall the thing, then deploy it. Deploying takes a minute.\n\n```sh\nvolvel deploy\n```\n\n```js\nconst a = 1;\n```\n",
    ),
    page(
      "develop/index",
      "---\ntitle: Develop\ndescription: Build with code.\ntype: reference\npages: [cli]\n---\n\n::pages\n",
    ),
    page("start/news", "---\ntitle: News\n---\n\nWhat changed lately.\n\n::changelog{limit=1}\n"),
    page(
      "changelog/2026-11-24-new-intake",
      "---\ntitle: New intake\n---\n\nIntake takes a photo.\n\n## Details\n\nSee [the intro](../start/intro).\n",
    ),
    page(
      "changelog/older-2026-10-02",
      "---\ntitle: Older & <odd>\ndescription: Before.\n---\n\nOld.\n",
    ),
    page(
      "develop/cli",
      "---\ntitle: The CLI\ndescription: Commands.\n---\n\nRun `volvel deploy` to ship. Back to [the start](../start/intro).\n",
    ),
  ]);
  const files = packageOutput(set, { version: "0.5.0", productName: "Volvel" });
  const manifest = JSON.parse(files.get("manifest.json") as string);
  manifest.screenshotFiles = {
    "console/deploy": { light: "deploy.aaaa.png", dark: "deploy.bbbb.png" },
  };
  files.set("manifest.json", JSON.stringify(manifest));
  files.set(
    "redirects.json",
    JSON.stringify({
      "build/intro": "start/intro",
      "start/old": "start/intro",
      "tenant/index": "develop/index",
    }),
  );
  files.set("fields.json", "{}");
  for (const path of set.pages.keys()) {
    files.set(`md/${path}.md`, `---\ntitle: x\n---\n\nSource of ${path}.\n`);
  }
  const assets = new Map<string, Uint8Array>([
    ["start/pic.png", PNG],
    ["screenshots/deploy.aaaa.png", PNG],
    ["screenshots/deploy.bbbb.png", PNG],
  ]);
  return {
    read: (name) => files.get(name),
    assets: () => [...assets.keys()],
    readAsset: (name) => assets.get(name),
  };
}

const THEME = ":root { --vx-ink: #111; }\n";
const options = (base: string, more: Partial<ExportOptions> = {}): ExportOptions => ({
  source: fixture(),
  base,
  title: "Volvel documentation",
  productName: "Volvel",
  theme: THEME,
  date: "2026-11-19",
  ...more,
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".md": "text/markdown",
  ".xml": "application/xml",
};

/** A host that serves files: a path is a file, a path with a slash at its end is that folder's index.html, nothing else. */
function serve(root: string, base: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, reply) => {
    const url = new URL(request.url ?? "/", "http://host");
    const path = decodeURIComponent(url.pathname);
    let file: string | undefined;
    if (path.startsWith(base) && !path.includes("..")) {
      const rest = path.slice(base.length);
      file = join(root, rest.endsWith("/") || rest === "" ? `${rest}index.html` : rest);
    }
    if (!file || !existsSync(file) || !/\.[a-z0-9]+$/.test(file)) {
      reply.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    reply
      .writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" })
      .end(readFileSync(file));
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      done({ server, origin: `http://127.0.0.1:${(address as { port: number }).port}` });
    }),
  );
}

const decodeEntities = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<");

/** What a page of HTML names: links, pictures, scripts, a stylesheet, a form's address, a refresh, and where the script reads its indexes. */
export function namesIn(html: string): string[] {
  const out: string[] = [];
  for (const found of html.matchAll(/\s(?:href|src|action|data-copy)="([^"]*)"/g)) {
    out.push(decodeEntities(found[1] as string));
  }
  for (const found of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const part of (found[1] as string).split(","))
      out.push(part.trim().split(/\s+/)[0] as string);
  }
  for (const found of html.matchAll(/http-equiv="refresh"\s+content="\d+;\s*url=([^"]*)"/g)) {
    out.push(decodeEntities(found[1] as string));
  }
  const data = /<script type="application\/json" id="docs-data">(.*?)<\/script>/s.exec(html);
  if (data) {
    const parsed = JSON.parse((data[1] as string).replace(/\\u003c/g, "<"));
    if (parsed.search) out.push(parsed.search.module, `${parsed.search.index}index.json`);
  }
  return out.filter((name) => name !== "link" && !name.startsWith("#") && name !== "");
}

interface Crawl {
  visited: Set<string>;
  problems: string[];
}

async function crawl(origin: string, base: string, seeds: string[]): Promise<Crawl> {
  const visited = new Set<string>();
  const problems: string[] = [];
  const bodies = new Map<string, string>();
  const queue = seeds.map((seed) => `${origin}${base}${seed}`);
  while (queue.length > 0) {
    const url = queue.shift() as string;
    const clean = url.split("#")[0] as string;
    if (visited.has(clean)) continue;
    visited.add(clean);
    const answer = await fetch(clean);
    if (answer.status !== 200) {
      problems.push(`${answer.status} ${clean}`);
      continue;
    }
    const type = answer.headers.get("content-type") ?? "";
    if (!/html|css/.test(type)) {
      await answer.arrayBuffer();
      continue;
    }
    const body = await answer.text();
    bodies.set(clean, body);
    const names = type.includes("css")
      ? [...body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((one) => one[1] as string)
      : namesIn(body);
    for (const name of names) {
      let target: URL;
      try {
        target = new URL(name, clean);
      } catch {
        problems.push(`not an address: ${name} on ${clean}`);
        continue;
      }
      if (target.origin !== origin) {
        problems.push(`external: ${name} on ${clean}`);
        continue;
      }
      if (!target.pathname.startsWith(base)) {
        problems.push(`escapes the base: ${name} on ${clean}`);
        continue;
      }
      queue.push(target.href);
    }
  }
  // A link to a part of a page leads to a part that is there.
  for (const [url, body] of bodies) {
    for (const found of body.matchAll(/\shref="([^"]*#[^"]+)"/g)) {
      const target = new URL(decodeEntities(found[1] as string), url);
      const into = target.hash.slice(1);
      const where = bodies.get(target.href.split("#")[0] as string);
      if (where !== undefined && !where.includes(`id="${decodeURIComponent(into)}"`)) {
        problems.push(`no #${into} on ${target.pathname}, linked from ${url}`);
      }
    }
  }
  return { visited, problems };
}

async function exported(base: string, more: Partial<ExportOptions> = {}) {
  const root = mkdtempSync(join(tmpdir(), "volvel-export-"));
  const written = await exportToDirectory(root, options(base, more));
  return { root, written };
}

const BASES = ["/docs/", "/handbook/volvel/"];

describe.each(BASES)("the export served from %s", (base) => {
  let root = "";
  let server: Server;
  let origin = "";
  let written: string[] = [];
  beforeAll(async () => {
    ({ root, written } = await exported(base));
    ({ server, origin } = await serve(root, base));
  });
  afterAll(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  test("every link, picture, script and stylesheet of every page is a file under the base, and none leaves it", async () => {
    const seeds = ["", "404.html", "_search/", "start/old/", "build/intro/", "tenant/"];
    const found = await crawl(origin, base, seeds);
    expect(found.problems).toEqual([]);
    for (const page of ["", "start/intro/", "develop/cli/", "start/", "develop/"]) {
      expect(found.visited, page).toContain(`${origin}${base}${page}`);
    }
    // Both pictures of a screenshot, the picture beside a page, the search script and an index.
    expect(
      [...found.visited].filter((url) => url.endsWith(".png")).map((url) => url.split("/").at(-1)),
    ).toEqual(expect.arrayContaining(["pic.png", "deploy.aaaa.png", "deploy.bbbb.png"]));
    expect([...found.visited].some((url) => /_platform\/search\.[0-9a-f]{10}\.js$/.test(url))).toBe(
      true,
    );
    expect([...found.visited].some((url) => url.endsWith("search/index.json"))).toBe(true);
  });

  test("the changelog is a feed beside the pages, linked from every page's head, and valid RSS with whole links when there is an origin", async () => {
    expect(written).toContain("changelog.xml");
    const feed = readFileSync(join(root, "changelog.xml"), "utf8");
    // Without an origin the links are paths, as the sitemap's are.
    expect(feed).toContain(`<link>${base}changelog/2026-11-24-new-intake/</link>`);
    const html = readFileSync(join(root, "start/intro/index.html"), "utf8");
    expect(html).toContain(
      `<link rel="alternate" type="application/rss+xml" title="Volvel documentation: changelog" href="${base}changelog.xml">`,
    );
    // The page that lists the entries draws the newest, with its date, its body and its link.
    const news = readFileSync(join(root, "start/news/index.html"), "utf8");
    expect(news).toContain(
      '<time class="vd-changelog-date" datetime="2026-11-24">24 November 2026</time>',
    );
    expect(news).toContain("Intake takes a photo.");
    expect(news).toContain("1 older entry, from Older &amp; &lt;odd&gt;");
  });

  test("pages are folders with an index, and each has a copy as Markdown", () => {
    expect(written).toEqual(
      expect.arrayContaining([
        "index.html",
        "index.md",
        "start/index.html",
        "start.md",
        "start/intro/index.html",
        "start/intro.md",
        "develop/cli/index.html",
        "404.html",
        "_search/index.html",
        "sitemap.xml",
        "_redirects",
        "versions.json",
      ]),
    );
    const md = readFileSync(join(root, "start/intro.md"), "utf8");
    expect(md).toBe("# Introduction\n\nSource of start/intro.\n");
    // The page's own button names the copy that is there.
    const html = readFileSync(join(root, "start/intro/index.html"), "utf8");
    expect(html).toContain(`data-copy="${base}start/intro.md"`);
  });

  test("a page is drawn as /docs draws it: the same renderer, the product profile and trailing slashes", () => {
    const html = readFileSync(join(root, "start/intro/index.html"), "utf8");
    expect(html).toContain(`href="${base}develop/cli/"`);
    expect(html).toContain('<p class="since">New in version 0.5.0</p>');
    expect(html).toContain("Version 0.5.0");
    expect(html).toContain('class="token ');
    expect(html).not.toContain("_search.json");
    expect(html).not.toContain("/_platform/diagrams.js");
  });

  test("a screenshot is drawn in both looks", () => {
    const html = readFileSync(join(root, "start/intro/index.html"), "utf8");
    expect(html).toContain(`class="vd-shot-light" src="${base}assets/screenshots/deploy.aaaa.png"`);
    expect(html).toContain(`class="vd-shot-dark" src="${base}assets/screenshots/deploy.bbbb.png"`);
  });

  test("the platform's files are named by what is in them", () => {
    const css = docsAssetHref("", "css");
    expect(readFileSync(join(root, "_platform", css), "utf8")).toBe(docsAsset(css)?.body);
    expect(written.filter((name) => name.startsWith("_platform/"))).toHaveLength(4);
    expect(written.some((name) => /^_platform\/theme\.[0-9a-f]{10}\.css$/.test(name))).toBe(true);
  });

  test("search is asked of the indexes: one for each collection, and no server", async () => {
    const meta = JSON.parse(readFileSync(join(root, "search/index.json"), "utf8"));
    expect(Object.keys(meta.files).sort()).toEqual(["", "changelog", "develop", "start"]);
    expect(meta.crumbs["start/intro"]).toBe("Start");
    const html = readFileSync(join(root, "_search/index.html"), "utf8");
    expect(html).toContain("data-static-results");
    expect(html).toContain(`"index":"${base}search/"`);
    // Without script, every page is listed to look through.
    expect(html).toContain(`href="${base}develop/cli/"`);
    expect(html).toContain(`href="${base}start/intro/"`);

    // The script of the page, run as a browser runs it, against the files as a host serves them.
    const client = written.find((name) => /^_platform\/search\./.test(name)) as string;
    const copy = join(root, "..", `client-${Date.now()}.mjs`);
    writeFileSync(copy, readFileSync(join(root, client)));
    const real = globalThis.fetch;
    globalThis.fetch = ((address: string) => real(`${origin}${address}`)) as typeof fetch;
    try {
      const { search } = await import(pathToFileURL(copy).href);
      const all = await search(`${base}search/`, "deploying");
      expect(all.pages[0].url).toBe("start/intro");
      expect(all.pages[0].crumb).toBe("Start");
      expect(all.pages[0].title.map((part: { text: string }) => part.text).join("")).toBe(
        "Introduction",
      );
      const inDevelop = await search(`${base}search/`, "deploy", { collection: "develop" });
      expect(inDevelop.pages.map((one: { url: string }) => one.url)).toEqual(["develop/cli"]);
      expect((await search(`${base}search/`, "zzzzqq")).pages).toEqual([]);
    } finally {
      globalThis.fetch = real;
      rmSync(copy, { force: true });
    }
  });

  test("with an origin the feed's links are whole", async () => {
    const root2 = mkdtempSync(join(tmpdir(), "volvel-export-feed-"));
    await exportToDirectory(root2, options(base, { origin: "https://docs.example.com" }));
    const feed = readFileSync(join(root2, "changelog.xml"), "utf8");
    expect(feed).toContain(
      `<link>https://docs.example.com${base}changelog/2026-11-24-new-intake/</link>`,
    );
    expect(feed).toContain(`<atom:link href="https://docs.example.com${base}changelog.xml"`);
    rmSync(root2, { recursive: true, force: true });
  });

  test("a moved page is a page that leads on, a line for a host that reads one, and not a 308", async () => {
    const stub = readFileSync(join(root, "start/old/index.html"), "utf8");
    expect(stub).toContain(`<meta http-equiv="refresh" content="0; url=${base}start/intro/">`);
    expect(stub).toContain(`<link rel="canonical" href="${base}start/intro/">`);
    expect(stub).toContain("noindex");
    expect(readFileSync(join(root, "build/intro/index.html"), "utf8")).toContain(
      `${base}start/intro/`,
    );
    // A folder's old address too: `tenant/index` is `tenant/`.
    expect(readFileSync(join(root, "tenant/index.html"), "utf8")).toContain(`url=${base}develop/`);
    const rules = readFileSync(join(root, "_redirects"), "utf8").split("\n");
    expect(rules).toContain(`${base}start/old  ${base}start/intro/  308`);
    expect(rules).toContain(`${base}start/old.md  ${base}start/intro.md  308`);
    expect(rules).toContain(`${base}tenant  ${base}develop/  308`);
  });

  test("the versions file says the version and its day, and the sitemap lists every page", () => {
    const versions = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
    expect(versions).toEqual({
      version: "0.5.0",
      date: "2026-11-19",
      versions: [{ version: "0.5.0", date: "2026-11-19", path: base }],
    });
    const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
    expect(sitemap).toContain(`<loc>${base}start/intro/</loc>`);
    expect(sitemap.match(/<loc>/g)).toHaveLength(8);
  });
});

describe("the crawl itself", () => {
  test("finds a missing file, a link out of the base and a link to another site", async () => {
    const root = mkdtempSync(join(tmpdir(), "volvel-crawl-"));
    try {
      writeFileSync(
        join(root, "index.html"),
        '<a href="gone/">a</a> <a href="/other/">b</a> <a href="https://example.com/">c</a> <a href="#nowhere">d</a>',
      );
      const { server, origin } = await serve(root, "/docs/");
      try {
        const found = await crawl(origin, "/docs/", [""]);
        expect(found.problems).toEqual([
          expect.stringContaining("escapes the base: /other/"),
          expect.stringContaining("external: https://example.com/"),
          expect.stringMatching(/^404 .*\/docs\/gone\/$/),
          expect.stringContaining("no #nowhere"),
        ]);
      } finally {
        server.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("what a host and a release choose", () => {
  test("with an origin, the sitemap and the pages that lead on carry whole addresses", async () => {
    const { root } = await exported("/docs/", { origin: "https://example.com" });
    try {
      expect(readFileSync(join(root, "sitemap.xml"), "utf8")).toContain(
        "<loc>https://example.com/docs/start/intro/</loc>",
      );
      expect(readFileSync(join(root, "start/old/index.html"), "utf8")).toContain(
        '<link rel="canonical" href="https://example.com/docs/start/intro/">',
      );
      // The pages themselves name nothing outside the site, origin or not.
      expect(readFileSync(join(root, "start/intro/index.html"), "utf8")).not.toContain(
        "example.com",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the versions of earlier exports are kept, and this one is not listed twice", async () => {
    const earlier = [
      { version: "0.4.0", date: "2026-10-01", path: "/docs/0.4.0/" },
      { version: "0.5.0", date: "2026-11-01", path: "/docs/0.5.0/" },
    ];
    const out = new Map<string, string>();
    for await (const { file, bytes } of exportSite(
      options("/docs/0.5.0/", { previous: earlier }),
    )) {
      out.set(file, new TextDecoder().decode(bytes));
    }
    expect(JSON.parse(out.get("versions.json") as string).versions).toEqual([
      { version: "0.5.0", date: "2026-11-19", path: "/docs/0.5.0/" },
      { version: "0.4.0", date: "2026-10-01", path: "/docs/0.4.0/" },
    ]);
  });

  test("the same input gives the same files, byte for byte", async () => {
    const one: Record<string, string> = {};
    const two: Record<string, string> = {};
    for await (const { file, bytes } of exportSite(options("/docs/")))
      one[file] = Buffer.from(bytes).toString("base64");
    for await (const { file, bytes } of exportSite(options("/docs/")))
      two[file] = Buffer.from(bytes).toString("base64");
    expect(two).toEqual(one);
  });

  test("a base path that is not a folder, and a date that is not a day, are said", async () => {
    await expect(exportSite(options("docs")).next()).rejects.toThrow(/start and end with a slash/);
    await expect(exportSite(options("/docs")).next()).rejects.toThrow(/start and end with a slash/);
    await expect(exportSite(options("/docs/", { date: "yesterday" })).next()).rejects.toThrow(
      /must be a day/,
    );
  });

  test("a move to a page that is not there is said, and left out", async () => {
    const source = fixture();
    const warned: string[] = [];
    const bad: ExportSource = {
      ...source,
      read: (name) =>
        name === "redirects.json"
          ? JSON.stringify({ "gone/page": "nowhere/at-all" })
          : source.read(name),
    };
    const names: string[] = [];
    for await (const { file } of exportSite(
      options("/docs/", { source: bad, warn: (text) => warned.push(text) }),
    )) {
      names.push(file);
    }
    expect(warned).toEqual([
      "gone/page is said to have moved, but the page it moved to is not in the set.",
    ]);
    expect(names).not.toContain("gone/page/index.html");
  });
});

/** Volvel's own documentation, when it is built: every page, as the website would serve it. */
const BUILT = join(__dirname, "../../docs/dist/manifest.json");
describe.skipIf(!existsSync(BUILT))("Volvel's own documentation, exported", () => {
  const base = "/handbook/docs/";
  let root = "";
  let server: Server;
  let origin = "";
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "volvel-export-real-"));
    mkdirSync(dirname(root), { recursive: true });
    await exportToDirectory(root, {
      source: directorySource(dirname(BUILT)),
      base,
      title: "Volvel documentation",
      productName: "Volvel",
      theme: THEME,
      date: "2026-11-19",
    });
    ({ server, origin } = await serve(root, base));
  });
  afterAll(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  test("every page, picture and script is a file; no link is broken, escapes the base or leaves the site", async () => {
    const manifest = JSON.parse(readFileSync(BUILT, "utf8")) as { pages: { url: string }[] };
    const redirects = JSON.parse(
      readFileSync(join(dirname(BUILT), "redirects.json"), "utf8"),
    ) as Record<string, string>;
    const slash = (url: string) => (url === "" ? "" : `${url}/`);
    const seeds = [
      "404.html",
      "_search/",
      ...manifest.pages.map((one) => slash(one.url)),
      ...Object.keys(redirects).map((old) =>
        slash(old.replace(/\/index$/, "").replace(/^index$/, "")),
      ),
    ];
    const found = await crawl(origin, base, seeds);
    expect(found.problems).toEqual([]);
    expect(found.visited.size).toBeGreaterThan(manifest.pages.length);
  }, 120_000);
});
