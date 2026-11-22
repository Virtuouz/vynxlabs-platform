import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);
/** What is worth compressing: text, once, when the files are read, never while a request waits. */
const COMPRESSIBLE = new Set(["js", "mjs", "css", "json", "svg", "txt", "map"]);
const MIN_COMPRESSED = 1024;

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
};
const MAX_FILES = 2000;

export interface RuntimeFile {
  path: string;
  sha256: string;
  contentType: string;
  /** The same bytes compressed, for a browser that takes them. Left out for what does not compress. */
  br?: Buffer;
  gzip?: Buffer;
}

/**
 * The files of the app that draws an interface. They are the platform's own,
 * built with it and the same for every tenant, so they are read from the
 * image and not from a bundle. An app that serves an interface is given these
 * in place of files of its own.
 */
export class RuntimeFiles {
  readonly #directory: string | undefined;
  #index: Promise<Map<string, RuntimeFile & { content: Buffer }>> | undefined;

  constructor(directory: string | undefined) {
    this.#directory = directory && existsSync(directory) ? directory : undefined;
  }

  /** Whether this instance can serve generated apps at all. */
  get present(): boolean {
    return this.#directory !== undefined;
  }

  /** Every file, by its path under the app. Read once: the image does not change while it runs. */
  files(): Promise<Map<string, RuntimeFile & { content: Buffer }>> {
    this.#index ??= this.#read();
    return this.#index;
  }

  async #read() {
    const found = new Map<string, RuntimeFile & { content: Buffer }>();
    const root = this.#directory;
    if (!root) return found;
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && found.size < MAX_FILES) {
          const content = await readFile(full);
          const path = relative(root, full).split(sep).join("/");
          const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
          const packed =
            COMPRESSIBLE.has(extension) && content.length >= MIN_COMPRESSED
              ? {
                  br: await brotli(content, {
                    params: {
                      [constants.BROTLI_PARAM_QUALITY]: 9,
                      [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
                    },
                  }),
                  gzip: await gzipped(content, { level: 9 }),
                }
              : {};
          found.set(path, {
            path,
            sha256: createHash("sha256").update(content).digest("hex"),
            contentType: TYPES[extension] ?? "application/octet-stream",
            content,
            ...packed,
          });
        }
      }
    };
    await walk(root);
    return found;
  }
}
