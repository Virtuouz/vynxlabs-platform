import { existsSync, type FSWatcher, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type BundleManifest, WIDGET_FRAME_FILE, WIDGET_POLICY } from "@volvel/manifest";
import { build as esbuild } from "esbuild";
import { contentTypeOf } from "./apps.js";
import { buildRepository } from "./build.js";
import { PREVIEW_CSS } from "./dev-widgets-css.js";
import { BuildError } from "./errors.js";
import { buildWidgets, WidgetBuildFailure } from "./widget-build.js";

const IGNORED = /(^|[\\/])(node_modules|\.git|\.platform|dist)([\\/]|$)/;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** What the preview page's own files are allowed: its script and styles, its frame, its event stream. */
export const PREVIEW_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'";

interface WidgetBody {
  version: string;
  title: string;
  description?: string;
  entry: string;
  config: { properties?: Record<string, Record<string, unknown>> };
  data?: Record<string, { shape: string; values?: { min: number }; breakdowns?: { min: number } }>;
  events?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
}

/** One widget as the preview knows it, read from the repository's files. */
interface Preview {
  type: string;
  name: string;
  body: WidgetBody;
  problems: string[];
  /** The frame page and script, by file name, when the view built. */
  files: Map<string, { type: string; body: Buffer }>;
  built: string;
  fixture: { config?: unknown; data?: unknown; state?: unknown } | undefined;
}

interface Loaded {
  widgets: Preview[];
  /** What stops every widget: the repository does not build. */
  problems: string[];
}

/** The default of each property of a config schema. */
function schemaDefaults(properties: Record<string, Record<string, unknown>> | undefined) {
  const found: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(properties ?? {})) {
    if ("default" in schema) found[key] = schema.default;
  }
  return found;
}

const SAMPLE_WORDS = ["Open", "Closed", "Waiting", "Done", "Late"];

/** Rows to try a view with, made up from the shape an input declares. */
export function sampleData(inputs: WidgetBody["data"]): Record<string, Record<string, unknown>> {
  const made: Record<string, Record<string, unknown>> = {};
  for (const [name, input] of Object.entries(inputs ?? {})) {
    const label = { name: "label", label: "Label", type: "text" };
    const amount = (n: string) => ({
      name: n,
      label: n.replace(/^./, (c) => c.toUpperCase()),
      type: "integer",
    });
    if (input.shape === "summary") {
      const values = Math.max(1, input.values?.min ?? 1);
      const names = Array.from({ length: values }, (_, i) =>
        i === 0 ? "total" : `total_${i + 1}`,
      );
      made[name] = {
        shape: "summary",
        columns: [label, ...names.map(amount)],
        breakdowns: ["label"],
        values: names,
        rows: SAMPLE_WORDS.map((word, row) => ({
          label: word,
          ...Object.fromEntries(names.map((one, i) => [one, ((row + 2) * 7 * (i + 1)) % 53])),
        })),
      };
    } else if (input.shape === "rows") {
      made[name] = {
        shape: "rows",
        columns: [label, amount("amount")],
        rows: SAMPLE_WORDS.map((word, row) => ({
          id: `row-${row + 1}`,
          label: word,
          amount: ((row + 2) * 7) % 53,
        })),
        total: SAMPLE_WORDS.length,
      };
    } else if (input.shape === "record") {
      made[name] = {
        shape: "record",
        columns: [label, amount("amount")],
        record: { label: "Open", amount: 12 },
      };
    } else {
      made[name] = { shape: "approvals", waiting: [], decided: [], more: false };
    }
  }
  return made;
}

async function readFixture(directory: string, entry: string): Promise<Preview["fixture"]> {
  try {
    return JSON.parse(await readFile(join(directory, dirname(entry), "fixture.json"), "utf8"));
  } catch {
    return undefined;
  }
}

async function load(
  directory: string,
  options: { entry?: string; resources?: string },
): Promise<Loaded> {
  let manifests: BundleManifest[];
  try {
    const built = await buildRepository({ directory, ...options, withoutAppSources: true });
    manifests = built.bundle.manifests as BundleManifest[];
  } catch (error) {
    if (error instanceof BuildError) return { widgets: [], problems: error.problems };
    throw error;
  }
  const widgets: Preview[] = [];
  for (const manifest of manifests) {
    if (manifest.kind !== "widget") continue;
    const body = manifest.body as unknown as WidgetBody;
    const name = manifest.path.replace(/^x\//, "");
    const files = new Map<string, { type: string; body: Buffer }>();
    let problems: string[] = [];
    let built = "";
    try {
      const output = await buildWidgets(directory, [manifest]);
      for (const asset of output.assets) {
        const content = output.files.get(asset.sha256);
        if (content) files.set(asset.path, { type: asset.contentType, body: content });
        if (asset.path !== WIDGET_FRAME_FILE) built = asset.sha256.slice(0, 8);
      }
    } catch (error) {
      if (!(error instanceof WidgetBuildFailure)) throw error;
      problems = error.problems;
    }
    widgets.push({
      type: manifest.path,
      name,
      body,
      problems,
      files,
      built,
      fixture: await readFixture(directory, body.entry),
    });
  }
  return { widgets: widgets.sort((a, b) => (a.name < b.name ? -1 : 1)), problems: [] };
}

/** Whether a repository has widgets, and which of its apps `volvel dev` could draw. */
export async function widgetsOf(options: {
  directory: string;
  entry?: string;
  resources?: string;
}) {
  const { widgets } = await load(resolve(options.directory), options);
  return widgets.map((one) => one.type);
}

/**
 * Where the preview page's script comes from: built beside the CLI when it is published, else
 * built now from the screens package's source, which a checkout has.
 */
async function hostScript(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "widget-host.js"), join(here, "../dist/widget-host.js")]) {
    if (existsSync(candidate)) return readFile(candidate, "utf8");
  }
  const source = join(here, "../../screens/runtime/dev-widget-host.ts");
  const result = await esbuild({
    entryPoints: [source],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
    logLevel: "silent",
    jsx: "automatic",
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
  });
  return result.outputFiles[0]?.text ?? "";
}

export interface WidgetServerOptions {
  directory: string;
  entry?: string;
  resources?: string;
  port: number;
}

const page = (title: string, body: string, script = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/_dev/widgets/preview.css"></head><body>${body}${script}</body></html>`;

/**
 * Serves a preview of each widget a repository defines: the widget's own frame page and script
 * (the files a deploy would serve) under the content policy of production, hosted by the same
 * checks as the platform's host, with controls for its config, data, state, size and theme and
 * a log of the events it raises. A saved file rebuilds the view and reloads the frame.
 */
export async function startWidgetServer(options: WidgetServerOptions) {
  const directory = resolve(options.directory);
  const place = {
    ...(options.entry ? { entry: options.entry } : {}),
    ...(options.resources ? { resources: options.resources } : {}),
  };
  const script = await hostScript();
  let current = load(directory, place);
  const listeners = new Set<ServerResponse>();
  let pending: ReturnType<typeof setTimeout> | undefined;
  const changed = (file: string | null) => {
    if (file && IGNORED.test(file)) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      current = load(directory, place);
      void current.then(() => {
        for (const listener of listeners) listener.write("event: reload\ndata: 1\n\n");
      });
    }, 150);
  };
  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(directory, { recursive: true }, (_event, file) => changed(file));
  } catch {
    // Served as read when this platform cannot watch a folder.
  }

  const send = (
    response: ServerResponse,
    status: number,
    type: string,
    body: string | Buffer,
    policy = PREVIEW_POLICY,
  ) => {
    response.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": policy,
    });
    response.end(body);
  };
  const html = (response: ServerResponse, status: number, body: string) =>
    send(response, status, "text/html; charset=utf-8", body);

  const server: Server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = decodeURIComponent(url.pathname);
      if (path === "/") {
        response.writeHead(302, { location: "/_dev/widgets" });
        return response.end();
      }
      if (path === "/_dev/events") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
          "content-security-policy": PREVIEW_POLICY,
        });
        response.write(": connected\n\n");
        listeners.add(response);
        request.on("close", () => listeners.delete(response));
        return;
      }
      if (path === "/_dev/widgets/host.js")
        return send(response, 200, "text/javascript; charset=utf-8", script);
      if (path === "/_dev/widgets/preview.css")
        return send(response, 200, "text/css; charset=utf-8", PREVIEW_CSS);

      const loaded = await current;
      if (path === "/_dev/widgets") {
        const list = loaded.widgets.length
          ? `<ul class="widgets">${loaded.widgets.map((one) => `<li><a href="/_dev/widgets/x/${encodeURIComponent(one.name)}">${escapeHtml(one.body.title)}<span>${escapeHtml(one.type)} v${escapeHtml(one.body.version)}${one.problems.length ? " (does not build)" : ""}</span></a></li>`).join("")}</ul>`
          : `<p>This repository defines no widget. Make one with <code>volvel widget new &lt;name&gt;</code>.</p>`;
        const problems = loaded.problems.length
          ? `<div class="problems" role="alert"><h2>This repository does not build</h2><ul>${loaded.problems.map((one) => `<li>${escapeHtml(one)}</li>`).join("")}</ul></div>`
          : "";
        return html(
          response,
          200,
          page(
            "Widgets - volvel dev",
            `<header><h1>Widgets</h1></header>${problems}<main>${list}</main><script src="/_dev/widgets/index.js"></script>`,
          ),
        );
      }
      if (path === "/_dev/widgets/index.js") {
        return send(
          response,
          200,
          "text/javascript; charset=utf-8",
          `new EventSource("/_dev/events").addEventListener("reload", () => location.reload());\n`,
        );
      }
      const data = /^\/_dev\/widgets\/data\/(.+)\.json$/.exec(path);
      if (data) {
        const one = loaded.widgets.find((candidate) => candidate.name === data[1]);
        if (!one)
          return send(response, 404, "text/plain; charset=utf-8", "There is no such widget.");
        const fixture = one.fixture ?? {};
        const sampled = !fixture.data;
        const config = {
          ...schemaDefaults(one.body.config.properties),
          ...(one.body.defaults ?? {}),
          ...((fixture.config as object | undefined) ?? {}),
        };
        return send(
          response,
          200,
          "application/json; charset=utf-8",
          JSON.stringify({
            type: one.type,
            name: one.name,
            version: one.body.version,
            title: one.body.title,
            problems: loaded.problems.length ? loaded.problems : one.problems,
            frame: one.files.has(WIDGET_FRAME_FILE)
              ? `/_widgets/dev/${one.type}@${one.body.version}/${WIDGET_FRAME_FILE}`
              : null,
            built: one.built,
            events: one.body.events ?? {},
            schema: { properties: one.body.config.properties ?? {} },
            config,
            data: sampled ? sampleData(one.body.data) : fixture.data,
            state: fixture.state ?? { status: "ready" },
            sampled,
          }),
        );
      }
      const preview = /^\/_dev\/widgets\/x\/([^/]+)$/.exec(path);
      if (preview) {
        const one = loaded.widgets.find((candidate) => candidate.name === preview[1]);
        if (!one && loaded.problems.length === 0) {
          return html(
            response,
            404,
            page(
              "No such widget",
              `<header><a href="/_dev/widgets">All widgets</a></header><main><p>This repository does not define the widget x/${escapeHtml(preview[1] as string)}.</p></main>`,
            ),
          );
        }
        return html(
          response,
          200,
          page(
            `${preview[1]} - widget preview`,
            `<div id="app"></div><script src="/_dev/widgets/host.js"></script>`,
          ),
        );
      }
      // The widget's own files, as a deploy would serve them: the production policy.
      const file = /^\/_widgets\/dev\/(x\/[^/@]+)@([^/]+)\/([^/]+)$/.exec(path);
      if (file) {
        const one = loaded.widgets.find(
          (candidate) => candidate.type === file[1] && candidate.body.version === file[2],
        );
        const served = one?.files.get(file[3] as string);
        if (!served)
          return send(
            response,
            404,
            "text/plain; charset=utf-8",
            "There is no such file.",
            WIDGET_POLICY,
          );
        return send(
          response,
          200,
          contentTypeOf(posix.basename(file[3] as string)),
          served.body,
          WIDGET_POLICY,
        );
      }
      send(response, 404, "text/plain; charset=utf-8", "There is no such page.");
    } catch (error) {
      send(
        response,
        500,
        "text/plain; charset=utf-8",
        `volvel dev could not answer: ${(error as Error).message}`,
      );
    }
  });
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
    url: `http://localhost:${port}/_dev/widgets`,
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
