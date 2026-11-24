import { expect, test } from "vitest";
import { nonceToolingScripts } from "./dev.js";

test("only the scripts the tooling added carry the run's nonce, not the app's own inline script", () => {
  const own = `<html><head><script>window.mine = 1;</script></head><body><script type="module" src="/main.tsx"></script></body></html>`;
  const built = own.replace(
    "<head>",
    `<head><script type="module">import RefreshRuntime from "/@react-refresh";</script>`,
  );
  const out = nonceToolingScripts(built, own, "abc");
  expect(out).toContain(`<script nonce="abc" type="module">import RefreshRuntime`);
  expect(out).toContain("<script>window.mine = 1;</script>");
  expect(out).toContain(`<script type="module" src="/main.tsx"></script>`);
});
