import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { buildDocSet, packageOutput, readPage } from "@volvel/docs-engine";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { helpFile } from "./kernel/docs/help-files.js";
import { startTestApp, type TestApp } from "./testing.js";

const MAIN = "localhost:8080";
const SHOT = "table-help.light.0123456789ab.png";
const SHOT_DARK = "table-help.dark.0123456789ab.png";
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

const PAGES: Record<string, string> = {
  index:
    "---\ntitle: Welcome\ndescription: How the product works.\npages: [start]\n---\n\nStart with [the first page](start/first).\n",
  "start/index":
    "---\ntitle: Getting started\ndescription: The first steps.\npages: [first]\n---\n",
  "start/first":
    '---\ntitle: The first page\ndescription: Do the first thing.\n---\n\n## A section\n\nWords about a zebra crossing.\n\n![A small picture](pic.png)\n\n::screenshot{name=table-help alt="The table"}\n\n::screenshot{name=never-taken alt="A table that was not photographed"}\n\n```js\nconst a = 1;\n```\n',
};

let dir: string;
let t: TestApp;
let apps: TestApp;

function writeHelp(consoleDir: string, version: string, extra: Record<string, string> = {}) {
  const entries = Object.entries(PAGES).map(
    ([path, text]) => readPage(path, text, { profile: "product" }).entry,
  );
  const { set } = buildDocSet(entries);
  const files = packageOutput(set, { version, productName: "Volvel" });
  const manifest = JSON.parse(files.get("manifest.json") as string);
  manifest.screenshots = ["table-help"];
  manifest.screenshotFiles = { "table-help": { light: SHOT, dark: SHOT_DARK } };
  files.set("manifest.json", `${JSON.stringify(manifest)}\n`);
  files.set("redirects.json", `${JSON.stringify({ "old/first": "start/first" })}\n`);
  for (const [path, text] of Object.entries(PAGES)) files.set(`md/${path}.md`, text);
  for (const [name, text] of Object.entries(extra)) files.set(name, text);
  for (const [name, text] of files) {
    const file = join(consoleDir, "help", name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  for (const name of [
    "assets/start/pic.png",
    `assets/screenshots/${SHOT}`,
    `assets/screenshots/${SHOT_DARK}`,
  ]) {
    const file = join(consoleDir, "help", name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, PNG);
  }
}

const get = (app: TestApp, url: string, headers: Record<string, string> = {}, host = MAIN) =>
  app.app.inject({ method: "GET", url, headers: { host, ...headers } });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "vx-docs-"));
  writeHelp(dir, "9.9.9");
  t = await startTestApp({ config: { consoleDir: dir }, version: "4.5.6" });
  apps = await startTestApp({
    config: { consoleDir: dir, appsUrl: "http://apps.localhost:8080" },
  });
});
afterAll(async () => {
  await t?.stop();
  await apps?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("the product's documentation at /docs", () => {
  test("anyone reads it without signing in, drawn from the pages the console carries", async () => {
    const home = await get(t, "/docs/");
    expect(home.statusCode).toBe(200);
    expect(home.headers["content-type"]).toContain("text/html");
    expect(home.body).toContain("Welcome");
    expect(home.body).toContain("Getting started");
    const page = await get(t, "/docs/start/first");
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("The first page");
    expect(page.body).toContain("zebra crossing");
    // Highlighted by classes, not styles; the instance's version is at the foot of the navigation.
    expect(page.body).toContain("hljs-");
    expect(page.body).toContain("Version 4.5.6");
    expect((await get(t, "/docs")).statusCode).toBe(308);
    expect((await get(t, "/docs")).headers.location).toBe("/docs/");
  });

  test("only the main address serves it: not the apps address, not a tenant's hostname", async () => {
    expect((await get(t, "/docs/", {}, "localhost:8080")).statusCode).toBe(200);
    // An unregistered name is the instance by another name.
    expect((await get(t, "/docs/", {}, "10.0.0.5:8080")).statusCode).toBe(200);

    const there = await get(apps, "/docs/", {}, "apps.localhost:8080");
    expect(there.statusCode).toBe(404);
    expect(there.body).not.toContain("Welcome");
    expect((await get(apps, "/docs/start/first", {}, "apps.localhost:8080")).statusCode).toBe(404);
    expect((await get(apps, "/docs/_theme.css", {}, "apps.localhost:8080")).statusCode).toBe(404);
    expect((await get(apps, "/docs/", {}, "localhost:8080")).statusCode).toBe(200);

    // A name a tenant has registered is that tenant's app, and what is at /docs there is its own.
    const original = t.kernel.hosts.domain.bind(t.kernel.hosts);
    t.kernel.hosts.domain = async (hostname: string) =>
      hostname === "docs.customer.test"
        ? {
            id: "d",
            tenantId: "00000000-0000-0000-0000-000000000001",
            workspaceId: "00000000-0000-0000-0000-000000000002",
            appPath: "",
            hostname,
          }
        : original(hostname);
    try {
      const theirs = await get(t, "/docs/", {}, "docs.customer.test");
      expect(theirs.statusCode).toBe(404);
      expect(theirs.body).not.toContain("Welcome");
      expect((await get(t, "/docs/start/first", {}, "docs.customer.test")).body).not.toContain(
        "zebra crossing",
      );
    } finally {
      t.kernel.hosts.domain = original;
    }
  });

  test("the policy keeps the page offline and unframed, and nothing indexes it", async () => {
    const page = await get(t, "/docs/start/first");
    const csp = String(page.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).not.toContain("https:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(page.headers["x-robots-tag"]).toBe("noindex");
    expect(page.headers["x-content-type-options"]).toBe("nosniff");
    expect(page.headers["cache-control"]).toBe("public, no-cache");
    for (const url of [
      "/docs/",
      "/docs/_search?q=zebra",
      "/docs/nothing-here",
      "/docs/_theme.css",
    ]) {
      expect((await get(t, url)).headers["x-robots-tag"], url).toBe("noindex");
    }
  });

  test("a page loads nothing from another address", async () => {
    for (const url of ["/docs/", "/docs/start/first", "/docs/_search?q=zebra", "/docs/nothing"]) {
      const body = (await get(t, url)).body;
      expect(body, url).not.toMatch(
        /<(?:script|img|link|iframe|source)\b[^>]*\b(?:src|href)="(?:https?:)?\/\//i,
      );
      expect(body, url).not.toMatch(/url\(\s*["']?https?:/i);
    }
    const css = (await get(t, "/docs/_theme.css")).body;
    expect(css).not.toMatch(/https?:/);
  });

  test("an unchanged page answers 304, and a changed build or look does not", async () => {
    const first = await get(t, "/docs/start/first");
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
    const again = await get(t, "/docs/start/first", { "if-none-match": etag });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe("");
    // Another page, another tag.
    expect((await get(t, "/docs/")).headers.etag).not.toBe(etag);
    expect((await get(t, "/docs/start/first", { "if-none-match": '"other"' })).statusCode).toBe(
      200,
    );
    expect((await get(t, "/docs/_theme.css")).headers.etag).toBeTruthy();
    const theme = await get(t, "/docs/_theme.css");
    expect(
      (await get(t, "/docs/_theme.css", { "if-none-match": theme.headers.etag as string }))
        .statusCode,
    ).toBe(304);
  });

  test("the instance's branding is over the defaults: its name, its colors, its mark", async () => {
    const before = await get(t, "/docs/start/first");
    expect(before.body).toContain("Volvel documentation");
    const beforeCss = await get(t, "/docs/_theme.css");
    expect(beforeCss.body).toContain("--vx-ink:");

    const set = await t.admin.put("/instance/branding", {
      productName: "Northwind Ops",
      theme: { tokens: { action: "#7c3aed" }, dark: { action: "#c4b5fd" } },
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);

    const after = await get(t, "/docs/start/first");
    expect(after.body).toContain("Northwind Ops documentation");
    expect(after.body).toContain('rel="stylesheet" href="/docs/_theme.css"');
    // The old tag no longer matches: a changed look is a changed page.
    expect(
      (await get(t, "/docs/start/first", { "if-none-match": before.headers.etag as string }))
        .statusCode,
    ).toBe(200);
    const css = await get(t, "/docs/_theme.css");
    expect(css.headers["content-type"]).toContain("text/css");
    expect(css.body).toContain("--vx-action: #7c3aed;");
    expect(css.body).toContain("--vx-action: #c4b5fd;");
    // The values it did not set are the defaults, so the page needs no other stylesheet.
    expect(css.body).toContain("--vx-ink:");
    expect(css.body).toContain('data-theme="dark"');
    expect((await get(t, "/docs/_theme.js")).body).toContain("vx-pref:theme");
  });

  test("search answers as a page and as JSON, and a word deep in a page finds it", async () => {
    const page = await get(t, "/docs/_search?q=zebra");
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("The first page");
    expect(page.headers["cache-control"]).toBe("no-store");
    const json = await get(t, "/docs/_search.json?q=zebra");
    expect(json.statusCode).toBe(200);
    expect(JSON.stringify(json.json())).toContain("start/first");
    const none = await get(t, "/docs/_search?q=qqqqzzzz");
    expect(none.statusCode).toBe(200);
    expect(none.body).toContain("Nothing here matches");
  });

  test("an old address leads to the page's new one for good, and a missing page is a page that says so", async () => {
    const moved = await get(t, "/docs/old/first");
    expect(moved.statusCode).toBe(308);
    expect(moved.headers.location).toBe("/docs/start/first");
    expect((await get(t, "/docs/old/first/")).statusCode).toBe(308);
    const missing = await get(t, "/docs/no/such/page");
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain("There is no page here");
    expect(missing.headers["content-security-policy"]).toBeTruthy();
  });

  test("a reader's own choice of look decides which shot a page shows, over the system's", async () => {
    const script = (await get(t, "/docs/_theme.js")).body;
    expect(script).toContain("picture source");
    expect(script).toContain("not all");
  });

  test("the pictures and the screenshots are served from the build, and a screenshot never changes", async () => {
    const page = await get(t, "/docs/start/first");
    expect(page.body).toContain('src="/docs/assets/start/pic.png"');
    expect(page.body).toContain(`src="/docs/assets/screenshots/${SHOT}"`);
    // In dark a reader is given the dark shot: the light one is the picture's own source.
    expect(page.body).toContain(
      `<picture><source media="(prefers-color-scheme: dark)" srcset="/docs/assets/screenshots/${SHOT_DARK}"/>`,
    );
    expect((await get(t, `/docs/assets/screenshots/${SHOT_DARK}`)).statusCode).toBe(200);
    // A screenshot that was not taken is said in words.
    expect(page.body).toContain("A table that was not photographed");
    const shot = await get(t, `/docs/assets/screenshots/${SHOT}`);
    expect(shot.statusCode).toBe(200);
    expect(shot.headers["content-type"]).toBe("image/png");
    expect(shot.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const pic = await get(t, "/docs/assets/start/pic.png");
    expect(pic.headers["cache-control"]).toBe("public, no-cache");
    expect((await get(t, "/docs/assets/start/missing.png")).statusCode).toBe(404);
    expect((await get(t, "/docs/assets/%2e%2e/manifest.json")).statusCode).toBe(404);
    expect((await get(t, "/docs/assets/..%2f..%2fmanifest.json")).statusCode).toBe(404);
  });

  test("a page can be copied as Markdown", async () => {
    const md = await get(t, "/docs/start/first.md");
    expect(md.statusCode).toBe(200);
    expect(md.headers["content-type"]).toContain("text/markdown");
    expect(md.body).toContain("# The first page");
    expect(md.body).toContain("zebra crossing");
    expect(md.body).not.toContain("title: The first page");
  });
});

describe("one handler for /help", () => {
  test("a file is sent with the cache its name earns; a missing one is missing", async () => {
    const manifest = await get(t, "/help/manifest.json");
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers["content-type"]).toContain("application/json");
    expect(manifest.headers["cache-control"]).toBe("no-cache");
    const shot = await get(t, `/help/assets/screenshots/${SHOT}`);
    expect(shot.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    // A name that says nothing of its content is not for ever, even under assets.
    const pic = await get(t, "/help/assets/start/pic.png");
    expect(pic.statusCode).toBe(200);
    expect(pic.headers["cache-control"]).toBe("no-cache");
    for (const url of [
      "/help/nothing.json",
      "/help/assets/none.png",
      "/help/",
      "/help/start/first",
    ]) {
      expect((await get(t, url)).statusCode, url).toBe(404);
    }
    expect((await get(t, "/help/..%2f..%2fpackage.json")).statusCode).toBe(404);
  });

  test("the best compressed copy the browser takes is sent", async () => {
    writeFileSync(join(dir, "help", "redirects.json.br"), brotliCompressSync(Buffer.from("{}")));
    const sent = await get(t, "/help/redirects.json", { "accept-encoding": "gzip, br" });
    expect(sent.statusCode).toBe(200);
    expect(sent.headers["content-encoding"]).toBe("br");
    expect(sent.headers.vary).toContain("accept-encoding");
    const plain = await get(t, "/help/redirects.json");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(helpFile(dir, "redirects.json", "br")?.encoding).toBe("br");
    expect(helpFile(dir, "../manifest.json")).toBeUndefined();
  });
});

describe("an instance with no documentation built", () => {
  test("serves nothing at /docs", async () => {
    const bare = mkdtempSync(join(tmpdir(), "vx-nodocs-"));
    const s = await startTestApp({ config: { consoleDir: bare } });
    try {
      expect((await get(s, "/docs/")).statusCode).toBe(404);
      expect((await get(s, "/help/manifest.json")).statusCode).toBe(404);
    } finally {
      await s.stop();
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

// The documentation as this repository builds it, when it has been built (`pnpm --filter @volvel/docs build`).
const BUILT = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/docs/dist");
describe.skipIf(!existsSync(join(BUILT, "manifest.json")))("the documentation as built", () => {
  test("every page is drawn, offline, and its Markdown is there", async () => {
    const root = mkdtempSync(join(tmpdir(), "vx-built-"));
    cpSync(BUILT, join(root, "help"), { recursive: true });
    const s = await startTestApp({ config: { consoleDir: root } });
    try {
      const manifest = JSON.parse(readFileSync(join(BUILT, "manifest.json"), "utf8"));
      for (const page of manifest.pages as { url: string }[]) {
        const drawn = await get(s, `/docs/${page.url}`);
        expect(drawn.statusCode, page.url).toBe(200);
        expect(drawn.body, page.url).not.toMatch(
          /<(?:script|img|link|iframe)\b[^>]*\b(?:src|href)="(?:https?:)?\/\//i,
        );
        if (page.url) expect((await get(s, `/docs/${page.url}.md`)).statusCode, page.url).toBe(200);
      }
    } finally {
      await s.stop();
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
