import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
let directory: string;
const script = `console.log(${JSON.stringify("x".repeat(4000))});\n`;

beforeAll(async () => {
  // A console as its build leaves it: a page, a file named by its content, and compressed copies.
  directory = mkdtempSync(join(tmpdir(), "vx-console-"));
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "index.html"), "<!doctype html><title>Console</title>\n");
  const asset = join(directory, "assets", "index-Bof_UAWc.js");
  writeFileSync(asset, script);
  writeFileSync(`${asset}.br`, brotliCompressSync(Buffer.from(script)));
  writeFileSync(`${asset}.gz`, gzipSync(Buffer.from(script)));
  t = await startTestApp({ config: { consoleDir: directory } });
});

afterAll(async () => {
  await t?.stop();
  rmSync(directory, { recursive: true, force: true });
});

const get = (url: string, encoding?: string) =>
  t.app.inject({
    method: "GET",
    url,
    headers: encoding ? { "accept-encoding": encoding } : {},
  });

test("a file of the console is sent compressed to a browser that takes it, and kept for good", async () => {
  const brotli = await get("/assets/index-Bof_UAWc.js", "gzip, deflate, br");
  expect(brotli.statusCode).toBe(200);
  expect(brotli.headers["content-encoding"]).toBe("br");
  expect(brotli.headers["content-type"]).toContain("javascript");
  expect(brotliDecompressSync(brotli.rawPayload).toString()).toBe(script);
  expect(brotli.rawPayload.length).toBeLessThan(script.length / 10);
  // Its name changes when its content does, so a browser never asks again.
  expect(brotli.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

  const gzip = await get("/assets/index-Bof_UAWc.js", "gzip");
  expect(gzip.headers["content-encoding"]).toBe("gzip");
  expect(gunzipSync(gzip.rawPayload).toString()).toBe(script);

  const plain = await get("/assets/index-Bof_UAWc.js");
  expect(plain.headers["content-encoding"]).toBeUndefined();
  expect(plain.body).toBe(script);
});

test("the page itself is asked for afresh, at any address that is one of its screens", async () => {
  for (const url of ["/", "/t/acme/workspaces/main/flows"]) {
    const page = await get(url, "br");
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("<title>Console</title>");
    expect(page.headers["cache-control"]).toBe("no-cache");
  }
  // The API is not the console: an address it does not have is said to be missing.
  expect((await get("/api/v1/nothing-here")).statusCode).toBe(404);
  // A file that is not there is a screen's address like any other: the page answers, and says so itself.
  expect((await get("/assets/missing-00000000.js")).body).toContain("<title>Console</title>");
});
