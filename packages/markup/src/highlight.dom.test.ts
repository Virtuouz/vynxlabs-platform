// @vitest-environment happy-dom
/// <reference lib="dom" />
import { expect, test } from "vitest";

test("importing the markup in a page does not highlight that page, and Prism is told so before it loads", async () => {
  document.body.innerHTML = '<pre><code class="language-js">const a = 1;</code></pre>';
  const before = document.body.innerHTML;
  await import("./index.js");
  await new Promise((done) => setTimeout(done, 30));
  expect(document.body.innerHTML).toBe(before);
  expect((globalThis as { Prism?: { manual?: boolean } }).Prism?.manual).toBe(true);
});
