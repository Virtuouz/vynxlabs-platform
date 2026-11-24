import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WIDGET_POLICY } from "@volvel/manifest";
import { afterAll, describe, expect, test } from "vitest";
import { run } from "./cli.js";
import { PREVIEW_POLICY, sampleData, startWidgetServer } from "./dev-widgets.js";

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true }))));

async function repository() {
  const dir = await mkdtemp(join(tmpdir(), "widget-dev-"));
  scratch.push(dir);
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(dir, "node_modules", "@volvel", "sdk"),
  );
  const frame = fileURLToPath(new URL("../../widget-frame", import.meta.url));
  await symlink(frame, join(dir, "node_modules", "@volvel", "widget-frame"));
  for (const name of ["react", "react-dom"]) {
    await symlink(join(frame, "node_modules", name), join(dir, "node_modules", name));
  }
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await run(["widget", "new", "gauge", "--dir", dir], { out: () => {}, err: () => {}, env: {} });
  return dir;
}

const open: { close(): Promise<void> }[] = [];
afterAll(() => Promise.all(open.map((one) => one.close())));
async function serve(dir: string) {
  const server = await startWidgetServer({ directory: dir, port: 0 });
  open.push(server);
  return { ...server, base: new URL(server.url).origin };
}

describe("volvel dev previews a widget", () => {
  test("lists the widgets and serves the preview page under its own policy", async () => {
    const { base } = await serve(await repository());
    const list = await fetch(`${base}/_dev/widgets`);
    expect(list.headers.get("content-security-policy")).toBe(PREVIEW_POLICY);
    expect(await list.text()).toContain("/_dev/widgets/x/gauge");
    const page = await fetch(`${base}/_dev/widgets/x/gauge`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("/_dev/widgets/host.js");
    expect((await fetch(`${base}/_dev/widgets/x/nope`)).status).toBe(404);
    // The host script is the platform host's checks, built for the page.
    const script = await (await fetch(`${base}/_dev/widgets/host.js`)).text();
    expect(script).toContain("volvel-widget/1");
  });

  test("serves the frame page and the view under the policy of a deploy", async () => {
    const { base } = await serve(await repository());
    const info = (await (await fetch(`${base}/_dev/widgets/data/gauge.json`)).json()) as {
      frame: string;
      built: string;
      problems: string[];
      config: Record<string, unknown>;
      data: Record<string, unknown>;
      sampled: boolean;
    };
    expect(info.problems).toEqual([]);
    expect(info.frame).toBe("/_widgets/dev/x/gauge@0.1.0/frame.html");
    const frame = await fetch(`${base}${info.frame}`);
    expect(frame.headers.get("content-security-policy")).toBe(WIDGET_POLICY);
    expect(frame.headers.get("set-cookie")).toBeNull();
    const frameHtml = await frame.text();
    const script = /src="\.\/(view-[0-9a-f]{8}\.js)"/.exec(frameHtml)?.[1] as string;
    const view = await fetch(`${base}/_widgets/dev/x/gauge@0.1.0/${script}`);
    expect(view.headers.get("content-security-policy")).toBe(WIDGET_POLICY);
    // From the config's defaults and the fixture the scaffold wrote.
    expect(info.config).toEqual({ label: "Gauge" });
    expect(info.sampled).toBe(false);
    expect(info.data).toMatchObject({ value: { shape: "summary" } });
  });

  test("makes sample rows from the declared inputs when there is no fixture", () => {
    const made = sampleData({
      one: { shape: "summary", values: { min: 2 } },
      two: { shape: "rows" },
      three: { shape: "record" },
    }) as Record<string, { shape: string; values?: string[]; rows?: unknown[] }>;
    expect(made.one?.values).toEqual(["total", "total_2"]);
    expect(made.one?.rows?.length).toBeGreaterThan(0);
    expect(made.two?.shape).toBe("rows");
    expect(made.three?.shape).toBe("record");
  });

  test("rebuilds on a saved change, and says what is wrong when it does not build", async () => {
    const dir = await repository();
    const { base } = await serve(dir);
    const before = (await (await fetch(`${base}/_dev/widgets/data/gauge.json`)).json()) as {
      built: string;
    };

    const events = await fetch(`${base}/_dev/events`);
    const reader = (events.body as ReadableStream<Uint8Array>).getReader();
    const reloaded = async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        if (new TextDecoder().decode(value).includes("event: reload")) return;
      }
    };
    await writeFile(
      join(dir, "src/widgets/gauge/view.tsx"),
      (await readFile(join(dir, "src/widgets/gauge/view.tsx"), "utf8")).replace("rows", "lines"),
    );
    await reloaded();
    const after = (await (await fetch(`${base}/_dev/widgets/data/gauge.json`)).json()) as {
      built: string;
      problems: string[];
    };
    expect(after.problems).toEqual([]);
    expect(after.built).not.toBe(before.built);

    await writeFile(join(dir, "src/widgets/gauge/view.tsx"), "const = ;\n");
    await reloaded();
    const broken = (await (await fetch(`${base}/_dev/widgets/data/gauge.json`)).json()) as {
      problems: string[];
    };
    expect(broken.problems.join("\n")).toContain("x/gauge (widget)");
    expect(broken.problems.join("\n")).toContain("view.tsx");
    await reader.cancel();
  });
});
