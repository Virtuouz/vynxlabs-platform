// The reference to the packages a tenant's repository and a widget pack are written against:
// `@volvel/sdk` and `@volvel/widgets`, drawn from the declaration files `tsc` wrote for them,
// with the comments the source has. See dts.mjs for why a reader of our own does the reading.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportsOf } from "./dts.mjs";
import { cell, page } from "./schema.mjs";

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** The packages, with the folder each is in and what each is for. The entry points are read from `package.json`. */
const PACKAGE_LIST = [
  {
    name: "@volvel/sdk",
    folder: "sdk",
    about:
      "What a tenant's repository is written with: scripts, flows, tables, apps and the rest, defined in TypeScript, and the context a script is run with.",
  },
  {
    name: "@volvel/widgets",
    folder: "widget-sdk",
    about:
      "The widget contract: what a widget for pages and dashboards declares, what its view is given, and the types of a page's body and of an action.",
  },
  {
    name: "@volvel/widget-frame",
    folder: "widget-frame",
    about:
      "The frame side of a widget a tenant wrote: receive what the page gives, raise a declared event, ask for a height, and take the theme as CSS variables. It makes no network request.",
  },
];

const slugOf = (specifier) => specifier.replace(/^@volvel\//, "").replace(/\//g, "-");

/** Every entry point of the listed packages, with its declaration file. */
export function entryPoints() {
  return PACKAGE_LIST.flatMap((one) => {
    const manifest = JSON.parse(readFileSync(join(PACKAGES, one.folder, "package.json"), "utf8"));
    return Object.entries(manifest.exports)
      .filter(([, target]) => target.types)
      .map(([subpath, target]) => ({
        specifier: subpath === "." ? one.name : `${one.name}/${subpath.slice(2)}`,
        package: one.name,
        file: join(PACKAGES, one.folder, target.types),
      }));
  });
}

/** What an entry point exports, as `{ names, stars }` (see dts.mjs). */
export const exportsOfEntry = (entry) => exportsOf(entry.file);

const KIND_GROUPS = [
  ["Functions", ["function"]],
  ["Classes", ["class"]],
  ["Constants", ["const", "let", "var"]],
  ["Interfaces", ["interface"]],
  ["Types", ["type", "enum"]],
  ["Namespaces", ["namespace"]],
];

const squash = (text) => text.replace(/\s+/g, " ").trim();
const forTable = (text) =>
  cell(text)
    .replace(/\|/g, "\\|")
    .replace(/\\\\\|/g, "\\|");

function memberTable(members) {
  const rows = members.filter((one) => !/^\[?private/.test(one.signature));
  if (rows.length === 0) return "";
  return [
    "| Member | Type | What it is |",
    "| --- | --- | --- |",
    ...rows.map((one) => {
      const type = squash(one.signature.replace(/^(readonly|static|public)\s+/, "")).replace(
        /^(\[[^\]]*\]|"[^"]*"|[A-Za-z_$][\w$]*)\??/,
        "",
      );
      return `| \`${one.name}${one.optional ? "?" : ""}\` | \`${forTable(type.replace(/^:\s*/, ""))}\` | ${cell(one.doc.text)} |`;
    }),
    "",
  ].join("\n");
}

function entryText(entry) {
  const { names, stars } = exportsOfEntry(entry);
  const own = [...names.values()].filter((one) => one.kind !== "reexport");
  const passed = [...names.values()].filter((one) => one.kind === "reexport");
  const out = [`\`import { … } from "${entry.specifier}"\``, ""];
  for (const star of stars) {
    out.push(
      `Everything \`${star.package}\` exports is exported from here too. It is on the [page of ${star.package}](${slugOf(star.package)}).`,
      "",
    );
  }
  if (passed.length > 0) {
    out.push(
      `Passed on from other packages: ${passed.map((one) => `\`${one.name}\` (from \`${one.from}\`)`).join(", ")}.`,
      "",
    );
  }
  for (const [group, kinds] of KIND_GROUPS) {
    const some = own
      .filter((one) => kinds.includes(one.kind))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (some.length === 0) continue;
    out.push(`## ${group}`, "");
    for (const one of some) {
      out.push(`### ${one.name}`, "");
      if (one.doc.tags.deprecated) out.push(`**Deprecated.** ${one.doc.tags.deprecated[0]}`, "");
      out.push(one.doc.text || "", "");
      const body = one.kind === "interface" || one.kind === "class";
      if (!body || one.members.length === 0) {
        out.push("```ts", one.signature.replace(/;$/, ""), "```", "");
      } else {
        const head = one.signature.slice(0, one.signature.indexOf("{")).trim();
        out.push("```ts", squash(head), "```", "", memberTable(one.members));
      }
    }
  }
  return out.join("\n");
}

/** Every page of the SDK's reference, by its name under `generated/`. */
export function sdkFiles() {
  const files = new Map();
  const entries = entryPoints();
  for (const entry of entries) {
    files.set(
      `sdk/${slugOf(entry.specifier)}.md`,
      page(
        { title: entry.specifier, description: `Everything \`${entry.specifier}\` exports.` },
        entryText(entry),
      ),
    );
  }
  files.set(
    "sdk/index.md",
    page(
      {
        title: "The SDK",
        pages: entries.map((entry) => slugOf(entry.specifier)),
        description:
          "Every export of the packages a repository and a widget pack are written against.",
      },
      [
        "These pages are drawn from the declaration files each package ships, and from the comments in its source. What is not documented there is not documented here.",
        "",
        "| Import | What is in it |",
        "| --- | --- |",
        ...entries.map((entry) => {
          const own = PACKAGE_LIST.find((one) => one.name === entry.package);
          return `| [\`${entry.specifier}\`](${slugOf(entry.specifier)}) | ${cell(entry.specifier === entry.package ? own.about : `Part of ${entry.package}, imported by its own path.`)} |`;
        }),
      ].join("\n"),
    ),
  );
  return files;
}
