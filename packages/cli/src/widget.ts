import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readRepositoryConfig } from "./build.js";
import { CliError, type Io } from "./cli.js";

const NAME = /^[a-z][a-z0-9-]{0,40}$/;

/** `daily-goal` as `dailyGoal`: what the definition is exported as. */
const camel = (name: string) =>
  name.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
/** `daily-goal` as `Daily goal`. */
const words = (name: string) => {
  const text = name.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The three files of a new widget, by name under its folder. */
export function widgetFiles(name: string, entry: string): Record<string, string> {
  const exported = camel(name);
  return {
    "widget.ts": `import { defineWidget } from "@volvel/sdk";

// What "Add to page" and the inspector are drawn from. The view (view.tsx) runs in a frame with
// no network: it is given only what is declared here, read for the viewer by the platform.
export const ${exported} = defineWidget({
  type: "x/${name}",
  version: "0.1.0",
  title: "${words(name)}",
  description: "Describe what ${words(name).toLowerCase()} shows, in one line.",
  category: "understand",
  icon: "puzzle",
  surfaces: ["app", "dashboard"],
  // What it reads. The builder chooses the table or query; the view is given the result.
  data: { value: { shape: "summary" } },
  // Its settings: a JSON Schema, with an x-volvel hint on each saying how the inspector draws it.
  config: {
    type: "object",
    properties: {
      label: {
        type: "string",
        default: "${words(name)}",
        "x-volvel": { tab: "display", control: "text", label: "Label" },
      },
    },
  },
  // What can happen that an action may be attached to. The payload is checked by the page.
  events: { clicked: { gives: "nothing", label: "When it is clicked" } },
  layout: { min: { w: 2, h: 2 }, default: { w: 4, h: 3 } },
  entry: "${entry}/view.tsx",
});
`,
    "view.tsx": `import { createFrame } from "@volvel/widget-frame";
import { useWidgetProps } from "@volvel/widget-frame/react";
import { createRoot } from "react-dom/client";

// The events the definition declares: only these can be raised.
const frame = createFrame<{ label: string }>({ events: ["clicked"] });

function View() {
  const props = useWidgetProps(frame);
  if (!props) return null;
  const { config, data, state } = props;
  if (state.status !== "ready") return <p>{state.status === "loading" ? "Loading" : "Nothing to show"}</p>;
  const summary = data.value?.shape === "summary" ? data.value : undefined;
  return (
    <button
      type="button"
      onClick={() => frame.emit("clicked", {})}
      style={{ font: "inherit", color: "var(--volvel-foreground)", background: "var(--volvel-card)" }}
    >
      {config.label}: {summary?.rows.length ?? 0} rows
    </button>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<View />);
`,
    "fixture.json": `${JSON.stringify(
      {
        config: { label: words(name) },
        data: {
          value: {
            shape: "summary",
            columns: [
              { name: "status", label: "Status", type: "text" },
              { name: "total", label: "Total", type: "integer" },
            ],
            breakdowns: ["status"],
            values: ["total"],
            rows: [
              { status: "Open", total: 12 },
              { status: "Closed", total: 30 },
            ],
          },
        },
        state: { status: "ready" },
        size: { w: 4, h: 3, narrow: false },
        theme: { scheme: "light", tokens: {} },
      },
      null,
      2,
    )}\n`,
  };
}

/**
 * `volvel widget new <name>`: a widget in the repository, with its definition, a view and a
 * fixture of sample data, exported from the repository's entry so that the next build finds it.
 */
export async function widgetCommand(args: string[], io: Io) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { dir: { type: "string" }, entry: { type: "string" } },
  });
  const [verb, name] = positionals;
  if (verb !== "new" || name === undefined) {
    throw new CliError("Usage: volvel widget new <name> [--dir <path>]");
  }
  if (!NAME.test(name)) {
    throw new CliError(
      `"${name}" is not a name for a widget: use small letters, digits and "-", starting with a letter (daily-goal).`,
    );
  }
  const directory = resolve(values.dir ?? ".");
  const config = await readRepositoryConfig(directory);
  const entryFile = values.entry ?? config.entry ?? "src/index.ts";
  const folder = posix.join(posix.dirname(entryFile), "widgets", name);
  const target = join(directory, folder);
  if (
    await stat(target).then(
      () => true,
      () => false,
    )
  ) {
    throw new CliError(`${folder} is already there. Choose another name, or remove it first.`);
  }
  const files = widgetFiles(name, folder);
  await mkdir(target, { recursive: true });
  for (const [file, contents] of Object.entries(files))
    await writeFile(join(target, file), contents);

  // The build reads what the entry exports.
  const entryPath = join(directory, entryFile);
  const line = `export * from "./widgets/${name}/widget.js";\n`;
  const before = await readFile(entryPath, "utf8").catch(() => undefined);
  await mkdir(dirname(entryPath), { recursive: true });
  await writeFile(
    entryPath,
    before === undefined ? line : `${before}${before.endsWith("\n") ? "" : "\n"}${line}`,
  );

  io.out(`Created the widget x/${name} in ${folder}: widget.ts, view.tsx and fixture.json.`);
  io.out(`${entryFile} now exports it.`);
  io.out("Next:");
  io.out("  1. Install what its view uses: npm install @volvel/widget-frame react react-dom");
  io.out(
    "  2. Say what it is in widget.ts, and draw it in view.tsx. fixture.json is sample data to try it with.",
  );
  io.out("  3. Check it: volvel build");
}
