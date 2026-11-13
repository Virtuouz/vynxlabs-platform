// Writes a Brotli and a gzip copy beside each file of the build that compresses well, so the
// server can send one without compressing anything while a request waits.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = process.argv[2] ?? "dist";
const TEXT = new Set([".js", ".css", ".html", ".svg", ".json", ".map", ".txt", ".ttf"]);
let before = 0;
let after = 0;
let files = 0;
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!TEXT.has(extname(name)) || statSync(path).size < 1024) continue;
    const content = readFileSync(path);
    const brotli = brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    });
    writeFileSync(`${path}.br`, brotli);
    writeFileSync(`${path}.gz`, gzipSync(content, { level: 9 }));
    before += content.length;
    after += brotli.length;
    files += 1;
  }
};
walk(root);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(`Compressed ${files} files: ${mb(before)} is ${mb(after)} as Brotli.`);
