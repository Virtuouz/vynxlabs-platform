import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { BundleAsset } from "@vynxlabs/manifest";
import { BuildError } from "./errors.js";

/** An app as the repository defines it: its path, and the directory its page is in. */
export interface AppSource {
  path: string;
  source: string;
}

export interface BuiltApps {
  assets: BundleAsset[];
  /** The bytes of each file, by checksum. */
  files: Map<string, Buffer>;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};
export const contentTypeOf = (file: string) =>
  TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";

const CONFIG_FILES = ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.mts"];

// biome-ignore lint/suspicious/noExplicitAny: Vite is the repository's own copy, loaded at run time
type Vite = any;

/**
 * The build tool for apps is the repository's own, not the CLI's: it decides
 * what an app may be written with, and a tenant repository pins it like any
 * other dependency.
 */
export async function loadVite(directory: string): Promise<{ vite: Vite; plugins: unknown[] }> {
  const require = createRequire(join(directory, "package.json"));
  const load = async (name: string) => {
    try {
      return await import(pathToFileURL(require.resolve(name)).href);
    } catch {
      return undefined;
    }
  };
  const vite = await load("vite");
  if (!vite) {
    throw new BuildError([
      "This repository defines an app, which is built with Vite. Install it: add vite and @vitejs/plugin-react to devDependencies.",
    ]);
  }
  // A plugin's package may be loaded in either module format, which changes where its function is.
  const factory = (loaded: Vite) =>
    [loaded, loaded?.default, loaded?.default?.default].find(
      (candidate) => typeof candidate === "function",
    ) as (() => unknown) | undefined;
  const plugins: unknown[] = [];
  for (const name of ["@vitejs/plugin-react", "@tailwindcss/vite"]) {
    const make = factory(await load(name));
    if (make) plugins.push(make());
  }
  return { vite, plugins };
}

/** The inline settings shared by a build and the development server. An app's own Vite config wins. */
export function viteSettings(root: string, plugins: unknown[]) {
  const own = CONFIG_FILES.some((name) => existsSync(join(root, name)));
  return { root, ...(own ? {} : { configFile: false as const, plugins }) };
}

async function filesUnder(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(path)));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

/**
 * Builds each app with Vite and lists its files by checksum. Addresses inside
 * the built pages are relative, so the same build is served under a path and
 * at the root of a hostname.
 */
export async function buildApps(directory: string, apps: AppSource[]): Promise<BuiltApps> {
  const built: BuiltApps = { assets: [], files: new Map() };
  if (apps.length === 0) return built;
  const { vite, plugins } = await loadVite(directory);
  for (const app of apps) {
    const root = resolve(directory, app.source);
    if (relative(directory, root).startsWith("..")) {
      throw new BuildError([
        `${app.path} (app): its source ${app.source} is outside the repository.`,
      ]);
    }
    if (!existsSync(join(root, "index.html"))) {
      throw new BuildError([`${app.path} (app): ${app.source}/index.html does not exist.`]);
    }
    const out = join(directory, ".platform", "apps", app.path);
    try {
      await vite.build({
        ...viteSettings(root, plugins),
        base: "./",
        mode: "production",
        logLevel: "silent",
        build: { outDir: out, emptyOutDir: true },
      });
    } catch (error) {
      throw new BuildError([`${app.path} (app): ${(error as Error).message}`]);
    }
    for (const file of await filesUnder(out)) {
      const content = await readFile(file);
      const sha256 = createHash("sha256").update(content).digest("hex");
      const path = relative(out, file).split(sep).join("/");
      built.assets.push({
        app: app.path,
        path,
        sha256,
        size: content.length,
        contentType: contentTypeOf(path),
      });
      built.files.set(sha256, content);
    }
    await rm(out, { recursive: true, force: true });
  }
  return built;
}
