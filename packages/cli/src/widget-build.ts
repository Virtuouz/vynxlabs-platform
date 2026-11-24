import { createHash } from "node:crypto";
import { join } from "node:path";
import { type BundleManifest, WIDGET_FRAME_FILE } from "@volvel/manifest";
import { build as esbuild } from "esbuild";
import { type BuiltApps, contentTypeOf } from "./apps.js";

/** The most a widget's script may be, React and the frame package included. */
export const MAX_WIDGET_SCRIPT_BYTES = 512 * 1024;

const sha = (content: Buffer | string) => createHash("sha256").update(content).digest("hex");

/** The page a frame is: one element to draw in, and the widget's one script beside it. */
export const frameHtml = (type: string, script: string) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<title>${type.replace(/[<>&"]/g, "")}</title>` +
  `<style>html,body{margin:0;padding:0}</style></head>` +
  `<body><div id="root"></div><script src="./${script}"></script></body></html>\n`;

interface BuildFailure {
  text: string;
  location?: { file: string; line: number } | null;
}

/**
 * Bundles one widget's view into a single script: React and the frame package go in, and
 * nothing is fetched when it runs. A module from a URL, and an `import()` of anything, are
 * refused, as is a script over `MAX_WIDGET_SCRIPT_BYTES`. Each problem names the widget.
 */
async function buildScript(directory: string, type: string, entry: string): Promise<Buffer> {
  const refuse = (message: string): never => {
    throw new WidgetBuildFailure([`${type} (widget): ${message}`]);
  };
  let text: string;
  try {
    const result = await esbuild({
      absWorkingDir: directory,
      entryPoints: [entry],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      minify: true,
      write: false,
      logLevel: "silent",
      jsx: "automatic",
      legalComments: "none",
      define: { "process.env.NODE_ENV": '"production"' },
      outfile: "view.js",
      plugins: [
        {
          name: "no-network",
          setup(build) {
            build.onResolve({ filter: /^(https?:)?\/\//i }, (args) => ({
              errors: [
                {
                  text: `"${args.path}" is loaded from the network, and a widget runs with none. Install it as a dependency so that it is bundled.`,
                },
              ],
            }));
            build.onResolve({ filter: /.*/ }, (args) =>
              args.kind === "dynamic-import"
                ? {
                    errors: [
                      {
                        text: `import("${args.path}") loads code when it runs. A widget is one script: import it at the top instead.`,
                      },
                    ],
                  }
                : undefined,
            );
          },
        },
      ],
    });
    text = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";
  } catch (error) {
    const failures = (error as { errors?: BuildFailure[] }).errors;
    if (!failures) throw error;
    throw new WidgetBuildFailure(
      failures.map(
        (failure) =>
          `${type} (widget): ${failure.location ? `${failure.location.file}:${failure.location.line}: ` : ""}${failure.text}`,
      ),
    );
  }
  // An `import(x)` of something only known at run time is not one esbuild can see.
  if (/(^|[^.\w$])import\s*\(/.test(text)) {
    refuse(
      "the view loads code when it runs (an import() call, in it or in a dependency). A widget is one script.",
    );
  }
  const script = Buffer.from(text);
  if (script.length > MAX_WIDGET_SCRIPT_BYTES) {
    refuse(
      `the view builds to ${(script.length / 1024).toFixed(0)} KB, and a widget's script is at most ${MAX_WIDGET_SCRIPT_BYTES / 1024} KB. Import less, or move what is large out of the view.`,
    );
  }
  return script;
}

/** What a widget's build says is wrong, as sentences for the build's own error. */
export class WidgetBuildFailure extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

/**
 * The files of every widget in a repository: its script, named by its checksum like an app's
 * files, and the frame page that loads it. They are carried as the widget's assets, under the
 * widget's type.
 */
export async function buildWidgets(
  directory: string,
  manifests: readonly BundleManifest[],
): Promise<BuiltApps> {
  const found: BuiltApps = { assets: [], files: new Map() };
  const problems: string[] = [];
  for (const manifest of manifests) {
    if (manifest.kind !== "widget") continue;
    const entry = (manifest.body as { entry: string }).entry;
    let script: Buffer;
    try {
      script = await buildScript(directory, manifest.path, join(directory, entry));
    } catch (error) {
      if (error instanceof WidgetBuildFailure) {
        problems.push(...error.problems);
        continue;
      }
      throw error;
    }
    const scriptName = `view-${sha(script).slice(0, 8)}.js`;
    const page = Buffer.from(frameHtml(manifest.path, scriptName));
    for (const [path, content] of [
      [scriptName, script],
      [WIDGET_FRAME_FILE, page],
    ] as const) {
      const sha256 = sha(content);
      found.assets.push({
        app: manifest.path,
        path,
        sha256,
        size: content.length,
        contentType: contentTypeOf(path),
      });
      found.files.set(sha256, content);
    }
  }
  if (problems.length > 0) throw new WidgetBuildFailure(problems);
  return found;
}
