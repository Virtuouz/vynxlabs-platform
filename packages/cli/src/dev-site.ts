import { existsSync, type FSWatcher, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildApp,
  buildSearchIndex,
  type DocsApp,
  loadSearchIndex,
  type ResourceLike,
} from "@volvel/docs-engine";
import {
  changelogFeed,
  DOCS_ASSET_PATH,
  DOCS_POLICY,
  docPage,
  docsAsset,
  escapeHtml,
  notFoundPage,
  pageAt,
  pageMarkdown,
  type SiteView,
  searchAnswer,
  searchPage,
} from "@volvel/docs-site";
import { appPolicy } from "@volvel/manifest";
import { contentTypeOf } from "./apps.js";
import { buildRepository } from "./build.js";
import { BuildError } from "./errors.js";

export interface SiteApp {
  path: string;
  kind: "interface" | "docs";
  title: string;
  /** The interface it draws, or the folder of pages it serves. */
  of: string;
}

interface Manifest {
  kind: string;
  path: string;
  body: Record<string, unknown>;
}

/** The apps of a repository that are drawn from their files and not built: interfaces and docs. */
export async function siteApps(options: {
  directory: string;
  entry?: string;
  resources?: string;
}): Promise<SiteApp[]> {
  const { bundle } = await buildRepository({ ...options, withoutAppSources: true });
  return appsIn(bundle.manifests as unknown as Manifest[]);
}

function appsIn(manifests: readonly Manifest[]): SiteApp[] {
  return manifests.flatMap((manifest): SiteApp[] => {
    if (manifest.kind !== "app") return [];
    const { body } = manifest;
    const title = typeof body.title === "string" ? body.title : manifest.path;
    if (typeof body.interface === "string") {
      return [{ path: manifest.path, kind: "interface", title, of: body.interface }];
    }
    if (typeof body.docs === "string") {
      return [{ path: manifest.path, kind: "docs", title, of: body.docs }];
    }
    return [];
  });
}

/**
 * Where the files that draw an interface are: `SCREENS_DIR` as on an instance, else the ones
 * packed with the CLI (`dist/screens`, beside this file, put there by `bundle.mjs`), else the
 * platform's own build in a checkout.
 */
export function screensDirectory(given?: string): string | undefined {
  const candidates = given
    ? [given]
    : [
        process.env.SCREENS_DIR,
        fileURLToPath(new URL("./screens", import.meta.url)),
        fileURLToPath(new URL("../../screens/runtime/dist", import.meta.url)),
      ];
  return candidates.find(
    (found): found is string => found !== undefined && existsSync(join(found, "index.html")),
  );
}

export interface SiteServerOptions {
  directory: string;
  entry?: string;
  resources?: string;
  app: SiteApp;
  port: number;
  strict?: boolean;
  /** Where the files that draw an interface are. See `screensDirectory`. */
  screens?: string;
  instance: { url: string; token: string };
  tenant: { id: string; slug: string; name: string };
  workspace: { id: string; slug: string };
  principal: { type: string; id?: string | null; name: string | null; email: string | null };
  /** Whether the tenant has a logo, as the instance says; left out when it is not known. */
  logo?: boolean | undefined;
}

const forHtml = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const IGNORED = /(^|[\\/])(node_modules|\.git|\.platform|dist)([\\/]|$)/;
const RELOAD = `new EventSource("/_dev/events").addEventListener("reload", () => location.reload());\n`;

/** What is said on a docs page that the instance would draw more of. */
export const DOCS_NOTICE =
  "Drawn from the files on this computer by volvel dev. What only the instance knows is not here: the product's own terms, readers' answers to \"Was this page helpful?\", and diagrams.";

/**
 * Serves an interface or a docs app of the repository, drawn from its files with the packages
 * the instance draws it with, and reloaded as the files change. Calls to the platform go to the
 * chosen instance as the developer, as for an app built from source.
 */
export async function startSiteServer(options: SiteServerOptions) {
  const directory = resolve(options.directory);
  const instance = options.instance.url.replace(/\/+$/, "");
  const { app } = options;
  const screens = app.kind === "interface" ? screensDirectory(options.screens) : undefined;
  if (app.kind === "interface" && !screens) {
    throw new BuildError([
      "The files that draw an interface are not in this install, and an interface app is drawn with them.",
      "Reinstall @volvel/cli, or set SCREENS_DIR to the folder packages/screens/runtime/dist of a build of Volvel.",
    ]);
  }
  const policy =
    options.strict === false ? undefined : app.kind === "docs" ? DOCS_POLICY : appPolicy();
  const theme = `/api/v1/tenants/${options.tenant.id}/workspaces/${options.workspace.id}/theme.css`;

  // What the files say now. Read again when they change, one reading at a time.
  interface Loaded {
    manifests: Manifest[];
    pictures: Map<string, { sha256: string; contentType: string }>;
    files: Map<string, Buffer>;
    docs?: {
      app: DocsApp;
      built: ReturnType<typeof buildApp>;
      search: ReturnType<typeof loadSearchIndex>;
    };
    problems?: string[];
  }
  const read = async (): Promise<Loaded> => {
    try {
      const built = await buildRepository({
        directory,
        ...(options.entry ? { entry: options.entry } : {}),
        ...(options.resources ? { resources: options.resources } : {}),
        withoutAppSources: true,
      });
      const manifests = built.bundle.manifests as unknown as Manifest[];
      const found = appsIn(manifests).find((one) => one.path === app.path);
      if (!found) {
        throw new BuildError([`${app.path} is no longer defined by this repository.`]);
      }
      const pictures = new Map<string, { sha256: string; contentType: string }>();
      for (const asset of built.bundle.assets ?? []) {
        if (asset.app === app.path) pictures.set(asset.path, asset);
      }
      const loaded: Loaded = { manifests, pictures, files: built.files };
      if (found.kind === "docs") {
        const served: DocsApp = { path: found.path, title: found.title, docs: found.of };
        const drawn = buildApp(served, manifests as unknown as ResourceLike[]);
        loaded.docs = {
          app: served,
          built: drawn,
          search: loadSearchIndex(buildSearchIndex(drawn.set)),
        };
      }
      return loaded;
    } catch (error) {
      if (error instanceof BuildError) {
        return { manifests: [], pictures: new Map(), files: new Map(), problems: error.problems };
      }
      throw error;
    }
  };
  let current = read();
  const listeners = new Set<ServerResponse>();
  let pending: ReturnType<typeof setTimeout> | undefined;
  const changed = (file: string | null) => {
    if (file && IGNORED.test(file)) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      current = read();
      void current.then(() => {
        for (const listener of listeners) listener.write("event: reload\ndata: 1\n\n");
      });
    }, 150);
  };
  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(directory, { recursive: true }, (_event, file) => changed(file));
  } catch {
    // A platform that cannot watch a folder serves the files as they were read.
  }

  const context = {
    api: "/api/v1",
    tenant: {
      ...options.tenant,
      ...(options.logo === undefined ? {} : { logo: options.logo }),
    },
    workspace: options.workspace,
    app: { path: app.path, title: app.title, interface: app.of },
    base: "/",
    portal: `/portal/${options.tenant.slug}`,
    principal: { id: null, ...options.principal },
  };

  const send = (
    response: ServerResponse,
    status: number,
    type: string,
    body: string | Buffer,
    more: Record<string, string> = {},
  ) => {
    response.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(policy ? { "content-security-policy": policy } : {}),
      ...more,
    });
    response.end(body);
  };
  const problemPage = (problems: string[]) =>
    `<!doctype html><meta charset="utf-8"><title>This app cannot be drawn</title><body style="font-family:system-ui;max-width:42rem;margin:3rem auto;padding:0 1rem"><h1>This app cannot be drawn yet</h1><p>The repository does not build. The page reloads when a file changes.</p><ul>${problems.map((one) => `<li>${escapeHtml(one)}</li>`).join("")}</ul><script src="/_dev/reload.js"></script>`;
  const withReload = (html: string) =>
    html.includes("</body>")
      ? html.replace("</body>", '<script src="/_dev/reload.js"></script></body>')
      : `${html}<script src="/_dev/reload.js"></script>`;

  // The platform's own calls, answered by the instance as the developer.
  const forward = (
    request: IncomingMessage,
    response: ServerResponse,
    headers: Record<string, string>,
    rewrite?: (body: Buffer) => Buffer,
  ) => {
    const target = new URL(request.url ?? "/", instance);
    const make = target.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = make(
      target,
      {
        method: request.method,
        headers: { ...request.headers, host: target.host, ...headers },
      },
      (answer) => {
        const out = { ...answer.headers };
        if (rewrite) {
          const chunks: Buffer[] = [];
          answer.on("data", (chunk: Buffer) => chunks.push(chunk));
          answer.on("end", () => {
            const body = rewrite(Buffer.concat(chunks));
            delete out["content-length"];
            delete out["content-encoding"];
            response.writeHead(answer.statusCode ?? 502, out);
            response.end(body);
          });
          return;
        }
        response.writeHead(answer.statusCode ?? 502, out);
        answer.pipe(response);
      },
    );
    upstream.on("error", () =>
      send(
        response,
        502,
        "text/plain; charset=utf-8",
        `The instance at ${instance} did not answer. Check that it is running and that its address is right.`,
      ),
    );
    request.pipe(upstream);
  };

  const interfaceCall = new RegExp(
    `^/api/v1/tenants/${options.tenant.id}/workspaces/${options.workspace.id}/interfaces/(.+?)(?:\\?.*)?$`,
  );

  const server: Server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = decodeURIComponent(url.pathname);
      if (path === "/_dev/reload.js") {
        return send(response, 200, "text/javascript; charset=utf-8", RELOAD);
      }
      if (path === "/_dev/events") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        response.write(": connected\n\n");
        listeners.add(response);
        request.on("close", () => listeners.delete(response));
        return;
      }
      if (path.startsWith("/portal/") || path === "/portal") {
        return forward(request, response, { origin: instance });
      }
      const loaded = await current;

      if (path.startsWith("/api/")) {
        const call = interfaceCall.exec(request.url ?? "");
        const mine = app.kind === "interface" && call?.[1] === app.of && request.method === "GET";
        const headers = { authorization: `Bearer ${options.instance.token}` };
        if (!mine) return forward(request, response, headers);
        // The definition is the file's. What the instance adds to it (the columns of its tables,
        // the names of its groups) is the deployed interface's, kept when there is one.
        const local = loaded.manifests.find(
          (one) => one.kind === "interface" && one.path === app.of,
        );
        if (!local) return forward(request, response, headers);
        return forward(request, response, headers, (body) => {
          let said: Record<string, unknown> = {};
          try {
            said = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
          } catch {
            said = {};
          }
          return Buffer.from(
            JSON.stringify({
              tables: {},
              ...(said.tables ? { tables: said.tables } : {}),
              ...(said.groupNames ? { groupNames: said.groupNames } : {}),
              path: app.of,
              body: local.body,
            }),
          );
        });
      }

      if (loaded.problems) {
        return send(response, 500, "text/html; charset=utf-8", problemPage(loaded.problems));
      }

      if (app.kind === "interface" && screens) {
        const wanted = path.replace(/^\/+/, "");
        const file = wanted === "" ? undefined : normalize(join(screens, wanted));
        if (file?.startsWith(screens) && existsSync(file) && extname(file) !== "") {
          if (extname(file) !== ".html") {
            return send(response, 200, contentTypeOf(file), await readFile(file), {
              "cache-control": "no-cache",
            });
          }
        }
        // The runtime asks for what each field means. Field help is the instance's: here nothing is
        // described, and the runtime is told so, not refused.
        if (wanted === "help/fields.json") {
          return send(response, 200, "application/json; charset=utf-8", "{}", {
            "cache-control": "no-cache",
          });
        }
        if (wanted !== "" && /\.[A-Za-z0-9]+$/.test(wanted)) {
          return send(response, 404, "text/plain; charset=utf-8", "There is no such file.");
        }
        const interfaceBody = loaded.manifests.find(
          (one) => one.kind === "interface" && one.path === app.of,
        )?.body as { pages?: { id: string; title: string; kind?: string }[] } | undefined;
        const pages = (interfaceBody?.pages ?? [])
          .filter((one) => one.kind === undefined || one.kind === "page")
          .map((one) => ({ id: one.id, title: one.title }));
        const data = { ...context, app: { ...context.app, ...(pages.length ? { pages } : {}) } };
        const index = await readFile(join(screens, "index.html"), "utf8");
        const head = `<base href="/"><script type="application/json" id="vx-context">${forHtml(data)}</script>`;
        const page = /<head[^>]*>/i.test(index)
          ? index.replace(/<head[^>]*>/i, (tag) => `${tag}${head}`)
          : `${head}${index}`;
        const themed = /<\/head>/i.test(page)
          ? page.replace(/<\/head>/i, () => `<link rel="stylesheet" href="${theme}"></head>`)
          : page;
        return send(response, 200, "text/html; charset=utf-8", withReload(themed));
      }

      // A docs app.
      const platformFile = DOCS_ASSET_PATH.exec(path);
      if (platformFile) {
        const asset = docsAsset(platformFile[1] as string);
        if (!asset)
          return send(response, 404, "text/plain; charset=utf-8", "There is no such file.");
        return send(response, 200, `${asset.type}; charset=utf-8`, asset.body);
      }
      const docs = loaded.docs;
      if (!docs) return send(response, 404, "text/plain; charset=utf-8", "There is no such page.");
      const file = path.replace(/^\/+/, "");
      const picture = loaded.pictures.get(file);
      if (picture) {
        const content = loaded.files.get(picture.sha256);
        if (content) return send(response, 200, picture.contentType, content);
      }
      const drawn: SiteView = {
        title: docs.app.title,
        base: "/",
        set: docs.built.set,
        look: {
          themeHref: theme,
          ...(options.logo ? { logoHref: `/api/v1/tenants/${options.tenant.id}/portal/logo` } : {}),
        },
        notice: DOCS_NOTICE,
        resolve: { asset: (name: string) => (loaded.pictures.has(name) ? `/${name}` : undefined) },
      };
      const html = (status: number, body: string) =>
        send(response, status, "text/html; charset=utf-8", withReload(body));
      const query = String(url.searchParams.get("q") ?? "").slice(0, 200);
      if (file === "_search")
        return html(200, searchPage(drawn, query, docs.search.search(query, 30)));
      if (file === "_search.json") {
        const collection = url.searchParams.get("in")?.slice(0, 255);
        return send(
          response,
          200,
          "application/json; charset=utf-8",
          JSON.stringify(
            searchAnswer(drawn, docs.search.grouped(query, collection ? { collection } : {})),
          ),
        );
      }
      if (file === "changelog.xml") {
        // The page head links it wherever the site has entries; origin is the one the browser used.
        const feed = changelogFeed(docs.built.set, {
          title: drawn.title,
          base: drawn.base,
          origin: `http://${request.headers.host ?? "localhost"}`,
        });
        if (feed !== undefined) {
          return send(response, 200, "application/rss+xml; charset=utf-8", feed, {
            "x-content-type-options": "nosniff",
          });
        }
      }
      const markdown = pageMarkdown(docs.built.set, file, (page) => {
        const found = loaded.manifests.find(
          (one) => one.kind === "doc" && one.path === `${docs.app.docs}/${page}`,
        );
        return typeof found?.body.source === "string" ? found.body.source : undefined;
      });
      if (markdown !== undefined) {
        return send(response, 200, "text/markdown; charset=utf-8", markdown, {
          "content-security-policy": "default-src 'none'; sandbox",
        });
      }
      const found = pageAt(docs.built.set, file);
      if (found !== undefined) return html(200, docPage(drawn, found));
      return html(404, notFoundPage(drawn));
    } catch (error) {
      send(
        response,
        500,
        "text/plain; charset=utf-8",
        `volvel dev could not answer: ${(error as Error).message}`,
      );
    }
  });
  // As the Vite server does for an app of files: the next port when this one is taken.
  for (let port = options.port; ; port += 1) {
    const listening = await new Promise<boolean>((done, failed) => {
      server.once("error", (error: NodeJS.ErrnoException) =>
        error.code === "EADDRINUSE" && port < options.port + 20 && options.port !== 0
          ? done(false)
          : failed(error),
      );
      server.listen(port, () => done(true));
    });
    if (listening) break;
  }
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    app,
    url: `http://localhost:${port}/`,
    close: () =>
      new Promise<void>((done) => {
        watcher?.close();
        clearTimeout(pending);
        for (const listener of listeners) listener.end();
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}
