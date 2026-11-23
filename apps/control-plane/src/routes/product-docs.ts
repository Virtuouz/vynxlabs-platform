import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { type OpenedPackage, openPackage, urlOf } from "@volvel/docs-engine";
import {
  docPage,
  docsAssetHref,
  notFoundPage,
  PRODUCT_DOCS_POLICY,
  pageAt,
  pageMarkdown,
  type SiteView,
  searchAnswer,
  searchPage,
} from "@volvel/docs-site";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { MemoryLimiter } from "../kernel/apps/limit.js";
import { DEFAULT_THEME, themeCss } from "../kernel/apps/theme.js";
import { helpFile } from "../kernel/docs/help-files.js";
import { consoleDirectory } from "../kernel/docs/product.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { DEFAULT_PRODUCT_NAME } from "./branding.js";

/** The reader's own choice of light or dark, as the console kept it, put on the page before it is drawn. */
const THEME_SCRIPT = `try{var v=JSON.parse(localStorage.getItem("vx-pref:theme"));if(v==="light"||v==="dark")document.documentElement.dataset.theme=v}catch(e){}
/* A screenshot has a dark source for a reader whose system is dark. A look chosen in the console wins over the system's. */
(function(){function f(){var t=document.documentElement.dataset.theme;if(t!=="light"&&t!=="dark")return;var s=document.querySelectorAll("picture source");for(var i=0;i<s.length;i++)s[i].media=t==="dark"?"all":"not all"}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",f);else f()})();
`;
const RENDERED_KEPT = 300;
const BASE = "/docs/";

/** A package of documentation, opened once for as long as the file that names its build is the same. */
interface Opened {
  pkg: OpenedPackage;
  /** What says the build is the same: a hash of its manifest. */
  build: string;
  fields: () => Record<string, string> | undefined;
  hasAsset: (file: string) => boolean;
}

/**
 * The product's own documentation, at `/docs` on the instance's main address. Public: nobody signs
 * in to read how the product works. The pages are those the console carries for its help panel
 * (`help/` beside its files), opened lazily, and drawn by the same renderer a tenant's docs site
 * uses, in the instance's own branding. The apps address and a tenant's hostnames never serve it:
 * the front door answers those before any route is reached.
 */
export function productDocsRoutes(app: FastifyInstance, kernel: Kernel): void {
  const consoleDir = consoleDirectory(kernel.config);
  const searches = new MemoryLimiter(120, 60);
  const rendered = new Map<string, string>();
  let opened: { stamp: string; value: Opened } | undefined;

  function open(): Opened | undefined {
    if (!consoleDir) return undefined;
    const manifest = join(consoleDir, "help", "manifest.json");
    let stamp: string;
    try {
      const info = statSync(manifest);
      stamp = `${info.mtimeMs}:${info.size}`;
    } catch {
      return undefined;
    }
    if (opened?.stamp === stamp) return opened.value;
    const text = readFileSync(manifest, "utf8");
    const pkg = openPackage((name) => {
      const file = helpFile(consoleDir, name);
      return file ? file.body.toString("utf8") : undefined;
    });
    let fields: Record<string, string> | undefined;
    const value: Opened = {
      pkg,
      build: createHash("sha256").update(text).digest("hex").slice(0, 16),
      fields: () => {
        if (fields) return fields;
        const file = helpFile(consoleDir, "fields.json");
        try {
          fields = file ? JSON.parse(file.body.toString("utf8")) : undefined;
        } catch {
          fields = undefined;
        }
        return fields;
      },
      hasAsset: (file) => helpFile(consoleDir, `assets/${file}`) !== undefined,
    };
    opened = { stamp, value };
    rendered.clear();
    return value;
  }

  const branding = () => kernel.db.selectFrom("instance_branding").selectAll().executeTakeFirst();

  const gone = (reply: FastifyReply) =>
    reply
      .code(404)
      .header("content-type", "text/plain; charset=utf-8")
      .header("x-content-type-options", "nosniff")
      .header("x-robots-tag", "noindex")
      .send("Not found.\n");

  /** What every answer of the documentation says of itself. */
  function headers(reply: FastifyReply, type: string, etag?: string) {
    reply
      .header("content-type", type)
      .header("x-content-type-options", "nosniff")
      .header("x-robots-tag", "noindex")
      .header("referrer-policy", "same-origin")
      .header("content-security-policy", PRODUCT_DOCS_POLICY)
      // Answered from the instance's own build and branding: kept, but asked about each time.
      .header("cache-control", "public, no-cache");
    if (etag) reply.header("etag", etag);
    return reply;
  }

  /** The tag of an answer: the build, what was asked, the instance's look and name, and the renderer. */
  const tagOf = (parts: string[]) =>
    `"${createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24)}"`;
  const matches = (request: FastifyRequest, etag: string) =>
    String(request.headers["if-none-match"] ?? "")
      .split(",")
      .some((one) => one.trim().replace(/^W\//, "") === etag);

  async function answer(request: FastifyRequest, reply: FastifyReply) {
    const here = open();
    if (!here) return gone(reply);
    const { pkg } = here;
    const url = new URL(request.url, "http://docs");
    let sub: string;
    try {
      sub = decodeURIComponent(url.pathname.slice(BASE.length));
    } catch {
      return gone(reply);
    }
    if (sub.includes("\0")) return gone(reply);

    const row = await branding();
    const name = row?.product_name ?? DEFAULT_PRODUCT_NAME;
    const revision = `${row?.updated_at?.toISOString() ?? ""}|${name}|${row?.logo_key ? "logo" : ""}`;
    const renderer = `${docsAssetHref("", "css")}${docsAssetHref("", "js")}`;
    const tag = (...extra: string[]) =>
      tagOf([here.build, kernel.version, revision, renderer, sub, url.search, ...extra]);

    // The pictures of the pages and the screenshots of the console, from the build's own files.
    if (sub.startsWith("assets/")) {
      const file = consoleDir
        ? helpFile(consoleDir, sub, String(request.headers["accept-encoding"] ?? ""))
        : undefined;
      if (!file) return gone(reply);
      reply
        .header("content-type", file.type)
        .header("x-content-type-options", "nosniff")
        .header("x-robots-tag", "noindex")
        // A picture is shown by its own page, and sent alone it must run nothing.
        .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'")
        .header(
          "cache-control",
          file.immutable ? "public, max-age=31536000, immutable" : "public, no-cache",
        )
        .header("vary", "accept-encoding");
      if (file.encoding) reply.header("content-encoding", file.encoding);
      return reply.send(file.body);
    }

    if (sub === "_theme.js") {
      const etag = tagOf(["theme-script", THEME_SCRIPT]);
      if (matches(request, etag))
        return headers(reply, "text/javascript; charset=utf-8", etag).code(304).send();
      return headers(reply, "text/javascript; charset=utf-8", etag).send(THEME_SCRIPT);
    }

    if (sub === "_theme.css") {
      const etag = tag();
      const type = "text/css; charset=utf-8";
      if (matches(request, etag)) return headers(reply, type, etag).code(304).send();
      // The console's own values, with the ones the operator set over them: a page must not
      // depend on a stylesheet of the console being loaded beside it.
      return headers(reply, type, etag).send(
        themeCss({
          tokens: { ...DEFAULT_THEME.tokens, ...(row?.theme.tokens ?? {}) },
          dark: { ...DEFAULT_THEME.dark, ...(row?.theme.dark ?? {}) },
        }),
      );
    }

    const view: SiteView = {
      title: `${name} documentation`,
      set: pkg.set,
      base: BASE,
      look: {
        themeHref: `${BASE}_theme.css`,
        scriptHref: `${BASE}_theme.js`,
        ...(row?.logo_key ? { logoHref: "/api/v1/instance/branding/logo" } : {}),
        iconsHref: "/api/v1/instance/branding/icons",
      },
      profile: "product",
      productName: name,
      version: kernel.version,
      resolve: {
        asset: (file) => (here.hasAsset(file) ? `${BASE}assets/${file}` : undefined),
        screenshot: (shot) => {
          const file = pkg.manifest.screenshotFiles?.[shot]?.light;
          return file ? `${BASE}assets/screenshots/${file}` : null;
        },
        // The reader's system may be dark: a page then offers the dark shot where there is one.
        screenshotDark: (shot) => {
          const files = pkg.manifest.screenshotFiles?.[shot];
          return files?.light && files.dark ? `${BASE}assets/screenshots/${files.dark}` : null;
        },
        field: (path) => {
          const text = here.fields()?.[path];
          return text ? { description: text } : null;
        },
      },
    };
    const canonical = kernel.config.docsUrl;
    const send = (status: number, body: string, etag?: string, kept = true) => {
      headers(reply, "text/html; charset=utf-8", status === 200 ? etag : undefined);
      // What a search found is not kept.
      if (!kept) reply.header("cache-control", "no-store");
      if (canonical && status === 200) {
        reply.header("link", `<${canonical}/docs/${sub.replace(/\/+$/, "")}>; rel="canonical"`);
      }
      return reply.code(status).send(body);
    };
    const json = (body: unknown) =>
      headers(reply, "application/json; charset=utf-8")
        .header("cache-control", "no-store")
        .send(JSON.stringify(body));

    if (sub === "_search" || sub === "_search.json") {
      if (!(await searches.allow(request.ip))) {
        return reply
          .code(429)
          .header("content-type", "text/plain; charset=utf-8")
          .send("Too many searches. Wait a minute and try again.\n");
      }
      const asked = request.query as { q?: unknown; in?: unknown; type?: unknown } | undefined;
      const query = String(asked?.q ?? "").slice(0, 200);
      const type = typeof asked?.type === "string" ? asked.type.slice(0, 40) : undefined;
      const index = pkg.search();
      if (sub === "_search.json") {
        const collection = typeof asked?.in === "string" ? asked.in.slice(0, 255) : undefined;
        return json(
          searchAnswer(
            view,
            index.grouped(query, {
              ...(collection ? { collection } : {}),
              ...(type ? { type } : {}),
            }),
          ),
        );
      }
      return send(
        200,
        searchPage(view, query, index.search(query, 30, type ? { type } : {})),
        undefined,
        false,
      );
    }

    const etag = tag();
    if (matches(request, etag))
      return headers(reply, "text/html; charset=utf-8", etag).code(304).send();
    const cached = rendered.get(etag);
    const draw = (): string | undefined => {
      const path = pageAt(pkg.set, sub);
      if (path !== undefined) return docPage(view, path);
      return undefined;
    };

    const markdown = pageMarkdown(pkg.set, sub, (path) => pkg.source(path));
    if (markdown !== undefined) {
      return headers(reply, "text/markdown; charset=utf-8", etag)
        .header("content-security-policy", "default-src 'none'; sandbox")
        .send(markdown);
    }
    const page = cached ?? draw();
    if (page !== undefined) {
      if (cached === undefined) {
        rendered.set(etag, page);
        if (rendered.size > RENDERED_KEPT) rendered.delete(rendered.keys().next().value as string);
      }
      return send(200, page, etag);
    }
    // A page that moved: its old address leads to the new one, for good.
    const now = pkg.moved(sub);
    if (now !== undefined) {
      return reply
        .code(308)
        .header("location", `${BASE}${urlOf(now)}`)
        .header("x-robots-tag", "noindex")
        .header("cache-control", "public, max-age=3600")
        .send();
    }
    return send(404, notFoundPage(view));
  }

  app.get(
    "/docs",
    { config: { access: access.public }, schema: { hide: true } },
    async (request, reply) => {
      const search = new URL(request.url, "http://docs").search;
      return reply
        .code(308)
        .header("location", `${BASE}${search}`)
        .header("cache-control", "public, max-age=3600")
        .send();
    },
  );
  app.get("/docs/", { config: { access: access.public }, schema: { hide: true } }, answer);
  app.get("/docs/*", { config: { access: access.public }, schema: { hide: true } }, answer);
}
