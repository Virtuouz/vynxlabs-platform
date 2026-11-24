import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./test.ts";

/**
 * Phase 34, B5: `volvel dev` previews a widget. It needs no instance: a scratch repository, a
 * widget made with `volvel widget new`, and the CLI. The widget runs in the production frame;
 * a click in it is an event the host let through and says so in the log; a saved change
 * rebuilds it and keeps the settings the developer made; a view that does not build is
 * described on the page.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "packages/cli/dist/bin.js");
let dir = "";
let server: ChildProcess | undefined;
let base = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  dir = await mkdtemp(join(tmpdir(), "widget-dev-e2e-"));
  await mkdir(join(dir, "node_modules/@volvel"), { recursive: true });
  const link = (target: string, name: string) => symlink(target, join(dir, "node_modules", name));
  await link(join(root, "examples/acme/node_modules/@volvel/sdk"), "@volvel/sdk");
  await link(join(root, "packages/widget-frame"), "@volvel/widget-frame");
  for (const name of ["react", "react-dom"]) {
    await link(join(root, "packages/widget-frame/node_modules", name), name);
  }
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  execFileSync("node", [cli, "widget", "new", "gauge", "--dir", dir]);
  server = spawn(
    "node",
    [cli, "dev", "--dir", dir, "--port", String(5300 + Math.floor(Math.random() * 400))],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  base = await new Promise<string>((done, failed) => {
    server?.once("exit", () => failed(new Error("volvel dev stopped")));
    server?.stdout?.on("data", (chunk: Buffer) => {
      const found = /(http:\/\/localhost:\d+)\/_dev\/widgets/.exec(chunk.toString());
      if (found) done(found[1] as string);
    });
  });
});
test.afterAll(async () => {
  server?.kill("SIGTERM");
  await rm(dir, { recursive: true, force: true });
});

test("a widget is previewed in its frame, its events are logged, and a save rebuilds it @builder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/_dev/widgets`);
  await page.getByRole("link", { name: /Gauge/ }).click();
  const view = page.frameLocator("iframe");
  await expect(view.getByRole("button")).toContainText("Gauge: 2 rows");
  await page.getByLabel("Label").fill("Load");
  await expect(view.getByRole("button")).toContainText("Load: 2 rows");

  await view.getByRole("button").click();
  await expect(page.getByRole("log", { name: "Events" })).toContainText("clicked");
  await expect(page.getByRole("log", { name: "Events" })).toContainText("passed the host's checks");

  const path = join(dir, "src/widgets/gauge/view.tsx");
  const source = await readFile(path, "utf8");
  await writeFile(
    path,
    source.replace("rows</button>", "lines</button>").replace("} rows", "} lines"),
  );
  // The frame reloads with the settings the developer made.
  await expect(view.getByRole("button")).toContainText("Load: 2 lines");

  await writeFile(path, "const x = ;\n");
  await expect(page.getByRole("alert").first()).toContainText("This widget does not build");
  await expect(page.getByRole("alert").first()).toContainText("view.tsx");
  await page.reload();
  await expect(page.getByLabel("Label")).toHaveValue("Load");
});
