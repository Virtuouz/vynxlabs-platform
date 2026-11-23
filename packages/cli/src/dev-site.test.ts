import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_POLICY } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { run } from "./cli.js";
import { startDevServer } from "./dev.js";
import { BuildError } from "./errors.js";

const example = (name: string) =>
  fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true }))));

/** An instance that answers the calls the app makes and keeps what it was asked. */
let instance: Server;
const asked: { path: string; authorization?: string | undefined }[] = [];
let address = "";
beforeAll(async () => {
  instance = createServer((request, response) => {
    asked.push({ path: request.url ?? "", authorization: request.headers.authorization });
    if (request.url?.includes("/interfaces/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          path: "screens/performance",
          body: { title: "Deployed title", pages: [] },
          tables: { visits: { columns: [] } },
        }),
      );
      return;
    }
    response.writeHead(request.url?.endsWith("/logo") ? 404 : 200, {
      "content-type": "application/json",
    });
    response.end("{}");
  });
  await new Promise<void>((done) => instance.listen(0, "127.0.0.1", done));
  address = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => instance.close(() => done())));

const options = (directory: string, app: string | undefined, screens?: string) => ({
  directory,
  app,
  port: 0,
  instance: { url: address, token: "key-1" },
  tenant: { id: "t1", slug: "fernhill", name: "Fernhill" },
  workspace: { id: "w1", slug: "main" },
  principal: { type: "member", id: "u1", name: "Dev", email: "dev@example.test" },
  ...(screens ? { screens } : {}),
});

async function runtime() {
  const dir = await mkdtemp(join(tmpdir(), "screens-"));
  scratch.push(dir);
  await mkdir(join(dir, "assets"));
  await writeFile(
    join(dir, "index.html"),
    '<!doctype html><html><head><title><!--vx:title--></title></head><body><div id="root"></div><script type="module" src="./assets/app.js"></script></body></html>',
  );
  await writeFile(join(dir, "assets", "app.js"), "console.log('runtime');");
  return dir;
}

describe("volvel dev draws an interface and a docs app from their files", () => {
  test("an interface: the runtime, its context and its definition from the file", async () => {
    const dev = await startDevServer(options(example("fernhill"), "performance", await runtime()));
    try {
      expect(dev.app.path).toBe("performance");
      const page = await fetch(dev.url);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-security-policy")).toBe(APP_POLICY);
      const html = await page.text();
      expect(html).toContain('id="vx-context"');
      expect(html).toContain('"interface":"screens/performance"');
      expect(html).toContain("./assets/app.js");
      expect(html).toContain("/_dev/reload.js");
      expect(html).toContain("/theme.css");
      // A screen of the app is the same page; a file is the runtime's own.
      expect((await fetch(`${dev.url}visits`)).status).toBe(200);
      expect(await (await fetch(`${dev.url}assets/app.js`)).text()).toContain("runtime");
      expect((await fetch(`${dev.url}assets/gone.js`)).status).toBe(404);
      // The definition is the file's; the tables are the instance's.
      const definition = (await (
        await fetch(`${dev.url}api/v1/tenants/t1/workspaces/w1/interfaces/screens/performance`)
      ).json()) as { body: { title: string }; tables: unknown };
      expect(definition.body.title).toBe("Clinic performance");
      expect(definition.tables).toEqual({ visits: { columns: [] } });
      // Any other call goes to the instance as the developer.
      await fetch(`${dev.url}api/v1/me`);
      expect(asked.at(-1)).toEqual({ path: "/api/v1/me", authorization: "Bearer key-1" });
    } finally {
      await dev.close();
    }
  }, 60_000);

  test("an interface without the screens files says what is missing", async () => {
    await expect(
      startDevServer(options(example("fernhill"), "performance", join(tmpdir(), "no-screens"))),
    ).rejects.toThrow(/SCREENS_DIR/);
  }, 60_000);

  test("a docs app: its page, its search, its own files and a notice of what is not here", async () => {
    const dev = await startDevServer(options(example("fernhill"), "handbook"));
    try {
      const home = await fetch(dev.url);
      expect(home.status).toBe(200);
      const html = await home.text();
      expect(html).toContain("Fernhill handbook");
      expect(html).toContain("from the files on this computer by volvel dev");
      expect(home.headers.get("content-security-policy")).toContain("script-src 'self'");
      const css = /href="(\/_platform\/docs\.[0-9a-f]{10}\.css)"/.exec(html)?.[1];
      expect(css).toBeDefined();
      expect((await fetch(`${dev.url}${css?.slice(1)}`)).status).toBe(200);
      const search = await fetch(`${dev.url}_search?q=handbook`);
      expect(search.status).toBe(200);
      const answer = (await (await fetch(`${dev.url}_search.json?q=handbook`)).json()) as {
        pages: unknown[];
      };
      expect(answer.pages.length).toBeGreaterThan(0);
      const missing = await fetch(`${dev.url}no/such/page`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain("There is no page here");
    } finally {
      await dev.close();
    }
  }, 60_000);

  test("a docs app is reloaded when a page changes, and says so when the pages do not build", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tenant-"));
    scratch.push(dir);
    await mkdir(join(dir, "src"));
    await mkdir(join(dir, "platform", "docs", "help"), { recursive: true });
    await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
    await symlink(
      join(example("acme"), "node_modules", "@volvel", "sdk"),
      join(dir, "node_modules", "@volvel", "sdk"),
    );
    await writeFile(join(dir, "package.json"), '{"type":"module"}');
    await writeFile(
      join(dir, "src", "index.ts"),
      'import { defineApp } from "@volvel/sdk";\nexport const help = defineApp({ path: "help", title: "Help", docs: "help" });\n',
    );
    const home = join(dir, "platform", "docs", "help", "index.md");
    await writeFile(home, "---\ntitle: Help\n---\n\nFirst words.\n");
    // The one app needs no name.
    const dev = await startDevServer(options(dir, undefined));
    try {
      expect(await (await fetch(dev.url)).text()).toContain("First words.");
      const events = await fetch(`${dev.url}_dev/events`);
      const reader = events.body?.getReader();
      await reader?.read();
      await writeFile(home, "---\ntitle: Help\n---\n\nSecond words.\n");
      const said = await reader?.read();
      expect(new TextDecoder().decode(said?.value)).toContain("reload");
      await reader?.cancel();
      expect(await (await fetch(dev.url)).text()).toContain("Second words.");
    } finally {
      await dev.close();
    }
  }, 60_000);

  test("an unknown app is refused with the apps there are, and no name with several asks for one", async () => {
    const unknown = await startDevServer(options(example("fernhill"), "nope")).catch((e) => e);
    expect(unknown).toBeInstanceOf(BuildError);
    expect((unknown as BuildError).problems.join(" ")).toMatch(
      /no app at "nope".*handbook \(docs\).*performance \(interface\)/s,
    );
    const several = await startDevServer(options(example("fernhill"), undefined)).catch((e) => e);
    expect((several as BuildError).problems.join(" ")).toContain("Say which app:");
  }, 60_000);

  test("the help says the kinds of app", async () => {
    const out: string[] = [];
    await run(["dev", "--help"], { out: (line) => out.push(line), err: () => {}, env: {} });
    const help = out.join("\n");
    expect(help).toContain("interface");
    expect(help).toContain("docs site");
    expect(help).toContain("app made of files");
  });
});
