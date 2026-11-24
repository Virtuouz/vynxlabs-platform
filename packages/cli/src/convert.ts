import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  type BundleManifest,
  platformKinds,
  REPOSITORY_CONFIG,
  RESOURCE_FOLDER,
  renderResourceFiles,
} from "@volvel/manifest";
import { authoredDefinitions, buildRepository, placesOf } from "./build.js";
import { BuildError } from "./errors.js";

/*
 * `volvel convert`: the declarative `define*` exports of a repository become resource
 * files, and leave the TypeScript. What is written is the bundle's own manifest, by the
 * writer a pull and Git sync use, so the file says exactly what the code did. The
 * TypeScript is read here only to decide what can be taken out whole: a statement
 * `export const x = defineY({ ...literals })`, found by a small scanner (the TypeScript
 * package no longer has a syntax tree to use from JavaScript) and checked afterwards by
 * building again and comparing the two bundles.
 */

// ----- A scanner for the parts of TypeScript this needs -----

interface Token {
  type: "id" | "str" | "num" | "tpl" | "punct";
  text: string;
  start: number;
  end: number;
  /** A template that has `${…}` in it. */
  subst?: boolean;
}
interface Comment {
  start: number;
  end: number;
}

const ID_START = /[A-Za-z_$]/;
const ID_PART = /[A-Za-z0-9_$]/;

/** Skips a template literal from its opening backtick; returns where it ends and whether it has substitutions. */
function skipTemplate(text: string, from: number): { end: number; subst: boolean } {
  let index = from + 1;
  let subst = false;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\") index += 2;
    else if (char === "`") return { end: index + 1, subst };
    else if (char === "$" && text[index + 1] === "{") {
      subst = true;
      index += 2;
      let depth = 1;
      while (index < text.length && depth > 0) {
        const inner = text[index];
        if (inner === "`") index = skipTemplate(text, index).end;
        else if (inner === '"' || inner === "'") index = skipString(text, index);
        else {
          if (inner === "{") depth++;
          if (inner === "}") depth--;
          index++;
        }
      }
    } else index++;
  }
  return { end: index, subst };
}

function skipString(text: string, from: number): number {
  const quote = text[from];
  let index = from + 1;
  while (index < text.length && text[index] !== quote && text[index] !== "\n") {
    index += text[index] === "\\" ? 2 : 1;
  }
  return index + 1;
}

/** Tokens and comments of a TypeScript file. A regular expression is told from a division by what comes before it. */
export function scan(text: string): { tokens: Token[]; comments: Comment[] } {
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index] as string;
    if (/\s/.test(char)) {
      index++;
    } else if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      const stop = end === -1 ? text.length : end;
      comments.push({ start: index, end: stop });
      index = stop;
    } else if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      comments.push({ start: index, end: stop });
      index = stop;
    } else if (char === '"' || char === "'") {
      const end = skipString(text, index);
      tokens.push({ type: "str", text: text.slice(index, end), start: index, end });
      index = end;
    } else if (char === "`") {
      const { end, subst } = skipTemplate(text, index);
      tokens.push({ type: "tpl", text: text.slice(index, end), start: index, end, subst });
      index = end;
    } else if (ID_START.test(char)) {
      let end = index + 1;
      while (end < text.length && ID_PART.test(text[end] as string)) end++;
      tokens.push({ type: "id", text: text.slice(index, end), start: index, end });
      index = end;
    } else if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(text[index + 1] ?? ""))) {
      let end = index + 1;
      while (end < text.length && /[0-9a-zA-Z_.]/.test(text[end] as string)) end++;
      tokens.push({ type: "num", text: text.slice(index, end), start: index, end });
      index = end;
    } else if (char === "/") {
      const before = tokens.at(-1);
      const divides =
        before !== undefined &&
        (before.type === "id" || before.type === "num" || before.type === "str") &&
        !["return", "typeof", "case", "in", "of"].includes(before.text);
      const afterClose = before?.type === "punct" && [")", "]", "}"].includes(before.text);
      if (divides || afterClose) {
        tokens.push({ type: "punct", text: "/", start: index, end: index + 1 });
        index++;
      } else {
        // A regular expression: to the closing slash, not one inside a class.
        let end = index + 1;
        let inClass = false;
        while (end < text.length && text[end] !== "\n") {
          const c = text[end];
          if (c === "\\") end++;
          else if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
          else if (c === "/" && !inClass) break;
          end++;
        }
        end++;
        while (end < text.length && ID_PART.test(text[end] as string)) end++;
        tokens.push({ type: "str", text: text.slice(index, end), start: index, end });
        index = end;
      }
    } else if (char === "." && text.startsWith("...", index)) {
      tokens.push({ type: "punct", text: "...", start: index, end: index + 3 });
      index += 3;
    } else if (char === "=" && text[index + 1] === ">") {
      tokens.push({ type: "punct", text: "=>", start: index, end: index + 2 });
      index += 2;
    } else {
      tokens.push({ type: "punct", text: char, start: index, end: index + 1 });
      index++;
    }
  }
  return { tokens, comments };
}

// ----- Reading a file's top level -----

/** What the SDK helpers a definition may call are called on: they give plain values. */
const HELPERS = new Set(["column", "z", "step", "trigger"]);

interface Statement {
  name: string;
  fn: string;
  /** From `export` to the end of the call and its `;`. */
  start: number;
  end: number;
  /** The tokens of the call's argument, when it is one value. */
  argument: Token[];
  /** Why this statement cannot be taken out, when it cannot. */
  problem?: string;
  /** Why its argument cannot be written as a file, when it cannot. */
  notLiteral?: string | undefined;
}

/** Why a run of tokens is not a literal value, or undefined when it is one. */
function notLiteral(tokens: Token[]): string | undefined {
  let at = 0;
  const fail = (reason: string): string => reason;
  const value = (): string | undefined => {
    const token = tokens[at];
    if (!token) return fail("ends in the middle of a value");
    if (token.type === "str" || token.type === "num") {
      at++;
      return undefined;
    }
    if (token.type === "tpl") {
      at++;
      return token.subst ? fail("has a template string with a computed part") : undefined;
    }
    if (token.type === "punct" && token.text === "-" && tokens[at + 1]?.type === "num") {
      at += 2;
      return undefined;
    }
    if (token.type === "punct" && token.text === "{") return object();
    if (token.type === "punct" && token.text === "[") return array();
    if (token.type === "id") {
      if (["true", "false", "null"].includes(token.text)) {
        at++;
        return undefined;
      }
      if (token.text === "undefined") return fail("has `undefined`");
      if (HELPERS.has(token.text) && tokens[at + 1]?.text === ".") return helper(token.text);
      return fail(`uses \`${token.text}\`, a value computed in code`);
    }
    if (token.text === "...") return fail("has a spread (`...`) of shared values");
    return fail(`has \`${token.text}\`, which is not a plain value`);
  };
  /** `column.text({ … })`, `z.string().optional()`: calls on a helper, with plain values for arguments. */
  const helper = (root: string): string | undefined => {
    at++;
    while (tokens[at]?.text === "." && tokens[at + 1]?.type === "id") {
      at += 2;
      if (tokens[at]?.text === "<") return fail(`calls ${root} with type arguments`);
      if (tokens[at]?.text !== "(") continue;
      at++;
      while (tokens[at] && tokens[at]?.text !== ")") {
        const problem = value();
        if (problem) return problem;
        if (tokens[at]?.text === ",") at++;
        else if (tokens[at]?.text !== ")") return fail("has an argument that is not a plain value");
      }
      if (tokens[at]?.text !== ")") return fail("ends in the middle of a call");
      at++;
    }
    return undefined;
  };
  const object = (): string | undefined => {
    at++;
    while (tokens[at] && tokens[at]?.text !== "}") {
      const key = tokens[at] as Token;
      if (key.text === "...") return fail("has a spread (`...`) of shared values");
      if (key.type === "punct" && key.text === "[") return fail("has a computed key");
      if (key.type !== "id" && key.type !== "str" && key.type !== "num") {
        return fail(`has \`${key.text}\` where a key should be`);
      }
      at++;
      if (tokens[at]?.text !== ":") {
        return key.type === "id" && (tokens[at]?.text === "," || tokens[at]?.text === "}")
          ? fail(`uses \`${key.text}\`, a value computed in code`)
          : fail(`has a method or accessor named ${key.text}`);
      }
      at++;
      const problem = value();
      if (problem) return problem;
      if (tokens[at]?.text === ",") at++;
      else if (tokens[at]?.text !== "}") return fail("is not a plain value");
    }
    if (tokens[at]?.text !== "}") return fail("ends in the middle of an object");
    at++;
    return undefined;
  };
  const array = (): string | undefined => {
    at++;
    while (tokens[at] && tokens[at]?.text !== "]") {
      const problem = value();
      if (problem) return problem;
      if (tokens[at]?.text === ",") at++;
      else if (tokens[at]?.text !== "]") return fail("is not a plain value");
    }
    if (tokens[at]?.text !== "]") return fail("ends in the middle of a list");
    at++;
    return undefined;
  };
  const problem = value();
  if (problem) return problem;
  return at === tokens.length ? undefined : "is more than one plain value";
}

const OPEN = new Set(["(", "[", "{"]);
const CLOSE = new Set([")", "]", "}"]);

/** The index of the token that closes the bracket at `open`, or -1. */
function closing(tokens: Token[], open: number): number {
  let depth = 0;
  for (let index = open; index < tokens.length; index++) {
    const text = (tokens[index] as Token).text;
    const punct = (tokens[index] as Token).type === "punct";
    if (punct && OPEN.has(text)) depth++;
    if (punct && CLOSE.has(text)) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Every top-level `export const name = defineX(…)` of a file. */
function statementsOf(text: string, tokens: Token[]): Statement[] {
  const found: Statement[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as Token;
    if (token.type === "punct" && OPEN.has(token.text)) depth++;
    else if (token.type === "punct" && CLOSE.has(token.text)) depth--;
    if (depth !== 0 || token.text !== "export" || tokens[index + 1]?.text !== "const") continue;
    const name = tokens[index + 2];
    const fn = tokens[index + 4];
    if (
      name?.type !== "id" ||
      tokens[index + 3]?.text !== "=" ||
      fn?.type !== "id" ||
      !/^define[A-Z]/.test(fn.text)
    ) {
      continue;
    }
    const open = index + 5;
    if (tokens[open]?.text !== "(") {
      found.push({
        name: name.text,
        fn: fn.text,
        start: token.start,
        end: fn.end,
        argument: [],
        problem: `${fn.text} is called with type arguments`,
      });
      continue;
    }
    const close = closing(tokens, open);
    if (close === -1) continue;
    let end = (tokens[close] as Token).end;
    const after = tokens[close + 1];
    let problem: string | undefined;
    if (after?.text === ";") end = after.end;
    else if (after !== undefined && /^[^\n]*$/.test(text.slice(end, after.start))) {
      problem = "more follows the call on its line";
    }
    const argument = tokens.slice(open + 1, close);
    found.push({
      name: name.text,
      fn: fn.text,
      start: token.start,
      end,
      argument,
      ...(problem ? { problem } : {}),
      ...(argument.length === 0 ? { notLiteral: "has no argument" } : {}),
      ...(argument.length > 0 && !problem ? { notLiteral: notLiteral(argument) } : {}),
    });
  }
  return found;
}

// ----- The repository's TypeScript -----

const SKIPPED_FOLDERS = new Set(["node_modules", "dist", "build", "coverage"]);

async function typescriptFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (folder: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith(".") || SKIPPED_FOLDERS.has(entry.name)) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
        files.push(path);
    }
  };
  await walk(directory);
  return files.sort();
}

interface Source {
  path: string;
  text: string;
  tokens: Token[];
  comments: Comment[];
  statements: Statement[];
}

/** The file a relative module name stands for, among the repository's files. */
function resolveModule(from: string, name: string, files: ReadonlySet<string>): string | undefined {
  if (!name.startsWith(".")) return undefined;
  const base = resolve(dirname(from), name);
  const bare = base.replace(/\.(m?js|m?ts|tsx|jsx)$/, "");
  for (const candidate of [
    base,
    `${bare}.ts`,
    `${bare}.tsx`,
    `${bare}.mts`,
    join(base, "index.ts"),
  ]) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

const unquote = (token: Token | undefined) => (token ? token.text.slice(1, -1) : "");

interface ModuleLink {
  /** The module named after `from`. */
  module: string;
  /** `import`, or `export … from`. */
  kind: "import" | "export";
  /** The names taken by name; undefined for `*`, a namespace, or a side-effect import. */
  names?: string[];
  /** From the keyword to the end of the statement. */
  start: number;
  end: number;
}

/** The imports and the re-exports of a file, at its top level. */
function linksOf(tokens: Token[]): ModuleLink[] {
  const links: ModuleLink[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as Token;
    if (token.type === "punct" && OPEN.has(token.text)) depth++;
    else if (token.type === "punct" && CLOSE.has(token.text)) depth--;
    if (depth !== 0 || (token.text !== "import" && token.text !== "export")) continue;
    const next = tokens[index + 1];
    if (token.text === "export" && !["*", "{", "type"].includes(next?.text ?? "")) continue;
    if (token.text === "import" && (next === undefined || next.text === "(" || next.text === "."))
      continue;
    let at = index + 1;
    const names: string[] = [];
    let named = true;
    let module: string | undefined;
    while (at < tokens.length) {
      const here = tokens[at] as Token;
      if (here.text === "from" && tokens[at + 1]?.type === "str") {
        module = unquote(tokens[at + 1]);
        at += 2;
        break;
      }
      if (here.type === "str" && at === index + 1) {
        module = unquote(here);
        named = false;
        at++;
        break;
      }
      if (here.text === ";") break;
      if (here.text === "*") named = false;
      if (here.text === "{") {
        const end = closing(tokens, at);
        if (end === -1) break;
        let part = at + 1;
        while (part < end) {
          // `type X`, `X as Y`: the name taken is the first one.
          let first = tokens[part] as Token;
          if (
            first.text === "type" &&
            tokens[part + 1]?.type === "id" &&
            tokens[part + 1]?.text !== "as"
          ) {
            part++;
            first = tokens[part] as Token;
          }
          names.push(first.text);
          while (part < end && tokens[part]?.text !== ",") part++;
          part++;
        }
        at = end;
        if (tokens[at + 1]?.text !== "from") break;
      }
      at++;
    }
    if (module === undefined) continue;
    let end = (tokens[at - 1] as Token).end;
    if (tokens[at]?.text === ";") end = (tokens[at] as Token).end;
    const link: ModuleLink = {
      module,
      kind: token.text as "import" | "export",
      start: token.start,
      end,
    };
    if (named) link.names = names;
    links.push(link);
  }
  return links;
}

// ----- The plan -----

export interface ConvertOptions {
  directory: string;
  entry?: string;
  resources?: string;
  /** Only these kinds. */
  only?: string[];
  /** Say what would change and change nothing. */
  dryRun?: boolean;
  /** More to hold the rebuilt bundle to, which refuses the change by its answer. For tests. */
  verify?: (manifests: readonly BundleManifest[]) => string[];
}

export interface Converted {
  kind: string;
  path: string;
  /** The export removed, and the file it was in, from the repository's root. */
  export: string;
  from: string;
  /** Where its resource file is, from the repository's root. */
  file: string;
}

export interface Left {
  kind: string;
  path: string;
  export: string;
  reason: string;
}

export interface ConvertResult {
  converted: Converted[];
  left: Left[];
  /** What else was written: a `volvel.yaml`, files removed, files emptied. */
  notes: string[];
  /** The comments above the removed exports, which a resource file cannot hold. */
  droppedComments: number;
  dryRun: boolean;
}

/** A kind that is code, or that no `volvel.yaml` can say: never converted. */
const NOT_DECLARATIVE: Record<string, string> = {
  script: "a script is code",
  connector: "a connector is code",
  trigger_source: "a trigger source is code",
  widget: "a widget is code",
  doc: "a page is written as Markdown",
};

/** How code reaches a resource by its path, once the generated types know it. */
const USE_BY_NAME: Record<string, string> = {
  table: 'ctx.table("path")',
  variable: 'ctx.variable("path")',
  connection: 'ctx.connection("path")',
  event: 'ctx.events.publish("path", …)',
};

/** Takes the names a removed statement used out of the imports that no longer need them. */
function dropUnusedImports(text: string, names: ReadonlySet<string>): string {
  let result = text;
  for (;;) {
    const { tokens } = scan(result);
    const links = linksOf(tokens).filter((link) => link.kind === "import");
    let changed = false;
    for (const link of links) {
      const slice = result.slice(link.start, link.end);
      const open = slice.indexOf("{");
      const close = slice.indexOf("}");
      if (open === -1 || close === -1) continue;
      const inner = slice.slice(open + 1, close);
      const parts = inner
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      const local = (part: string) => {
        const bare = part.replace(/^type\s+/, "");
        return (bare.split(/\s+as\s+/).at(-1) ?? bare).trim();
      };
      const used = (name: string) => {
        const outside = tokens.filter(
          (token) =>
            token.type === "id" &&
            token.text === name &&
            (token.end <= link.start || token.start >= link.end),
        );
        return outside.length > 0;
      };
      const kept = parts.filter((part) => !names.has(local(part)) || used(local(part)));
      if (kept.length === parts.length) continue;
      const before = slice.slice(0, open);
      const defaultImport = /^import\s+(?:type\s+)?[A-Za-z_$][\w$]*\s*,/.test(before);
      let replacement: string;
      if (kept.length === 0 && !defaultImport) replacement = "";
      else if (inner.includes("\n")) {
        replacement = `${slice.slice(0, open + 1)}\n${kept.map((part) => `  ${part},`).join("\n")}\n${slice.slice(close)}`;
      } else replacement = `${slice.slice(0, open + 1)} ${kept.join(", ")} ${slice.slice(close)}`;
      let end = link.end;
      if (replacement === "" && result[end] === "\n") end++;
      result = result.slice(0, link.start) + replacement + result.slice(end);
      changed = true;
      break;
    }
    if (!changed) return result;
  }
}

/** Removes a statement, with the comments written for it, from a file's text. */
function removeRanges(
  text: string,
  comments: Comment[],
  ranges: { start: number; end: number }[],
): { text: string; dropped: number } {
  let dropped = 0;
  const widened = ranges.map((range) => {
    let start = range.start;
    // The comments directly above, with no blank line between, are about this export.
    for (;;) {
      const comment = [...comments].reverse().find((one) => one.end <= start);
      if (!comment) break;
      const between = text.slice(comment.end, start);
      const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
      if (
        !/^[ \t]*\n?[ \t]*$/.test(between) ||
        !/^[ \t]*$/.test(text.slice(lineStart, comment.start))
      )
        break;
      start = lineStart;
      dropped++;
    }
    let end = range.end;
    // A comment after it on the same line.
    const rest = /^[ \t]*(\/\/[^\n]*)?/.exec(text.slice(end));
    if (rest?.[1]) dropped++;
    end += rest?.[0].length ?? 0;
    if (text[end] === "\n") end++;
    return { start, end };
  });
  let result = text;
  for (const range of widened.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }
  return { text: result.replace(/\n{3,}/g, "\n\n").replace(/^\s*\n/, ""), dropped };
}

/** Works out what converts and what is left, and what each file of code becomes. Writes nothing. */
async function plan(options: ConvertOptions) {
  const directory = resolve(options.directory);
  const { config, entry, resources } = await placesOf(options);
  const built = await buildRepository({ ...options, withoutAppSources: true });
  const authored = await authoredDefinitions({ ...options, entry, resources });
  const paths = await typescriptFiles(directory);
  const fileSet = new Set(paths);
  const sources = new Map<string, Source>();
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    const { tokens, comments } = scan(text);
    sources.set(path, { path, text, tokens, comments, statements: statementsOf(text, tokens) });
  }
  const entryPath = resolve(directory, entry);
  const nameOf = (path: string) => relative(directory, path).split(sep).join("/");

  // Which files re-export which: an import of a name from one can be a use of a name made in another.
  const reexports = new Map<string, Set<string>>();
  const importsOf = new Map<string, { module: string; link: ModuleLink }[]>();
  for (const source of sources.values()) {
    const sends = new Set<string>();
    const takes: { module: string; link: ModuleLink }[] = [];
    for (const link of linksOf(source.tokens)) {
      const module = resolveModule(source.path, link.module, fileSet);
      if (!module) continue;
      if (link.kind === "export") sends.add(module);
      else takes.push({ module, link });
    }
    reexports.set(source.path, sends);
    importsOf.set(source.path, takes);
  }
  /** Every file whose exports include what `file` exports. */
  const providers = (file: string) => {
    const found = new Set([file]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const [other, sends] of reexports) {
        if (!found.has(other) && [...sends].some((one) => found.has(one))) {
          found.add(other);
          grew = true;
        }
      }
    }
    return found;
  };

  const only = options.only?.length ? new Set(options.only) : undefined;
  const sameName = new Map<string, number>();
  for (const source of sources.values()) {
    for (const statement of source.statements) {
      sameName.set(statement.name, (sameName.get(statement.name) ?? 0) + 1);
    }
  }

  const converted: Converted[] = [];
  const left: Left[] = [];
  const removals = new Map<string, { start: number; end: number; names: string[] }[]>();
  const bundleManifests = new Map(
    built.bundle.manifests.map((manifest) => [`${manifest.kind} ${manifest.path}`, manifest]),
  );
  const toWrite: BundleManifest[] = [];

  for (const definition of authored) {
    const { kind, path, name } = definition;
    if (only && !only.has(kind)) continue;
    const say = (reason: string) => left.push({ kind, path, export: name, reason });
    if (NOT_DECLARATIVE[kind]) {
      say(`${NOT_DECLARATIVE[kind]}, and stays in the repository`);
      continue;
    }
    if (kind === "app" && typeof definition.source === "string") {
      say("an app made of files has its source in the repository");
      continue;
    }
    const manifest = bundleManifests.get(`${kind} ${path}`);
    const candidates = [...sources.values()].flatMap((source) =>
      source.statements
        .filter((one) => one.name === name)
        .map((statement) => ({ source, statement })),
    );
    if (!manifest) {
      say("it is not in the built bundle");
      continue;
    }
    if (candidates.length === 0) {
      say(`${name} is not written as a top-level \`export const ${name} = define…({ … })\``);
      continue;
    }
    if (candidates.length > 1 || (sameName.get(name) ?? 0) > 1) {
      say(`${name} is exported by more than one file`);
      continue;
    }
    const { source, statement } = candidates[0] as (typeof candidates)[number];
    if (statement.problem) {
      say(statement.problem);
      continue;
    }
    if (statement.notLiteral) {
      say(statement.notLiteral);
      continue;
    }
    // Used by other code as a value?
    const here = source.tokens.filter(
      (token, index) =>
        token.type === "id" &&
        token.text === name &&
        (token.end <= statement.start || token.start >= statement.end) &&
        source.tokens[index - 1]?.text !== "." &&
        !(
          source.tokens[index + 1]?.text === ":" &&
          [",", "{"].includes(source.tokens[index - 1]?.text ?? "")
        ),
    );
    if (here.length > 0) {
      say(`${nameOf(source.path)} uses \`${name}\` again, as a value`);
      continue;
    }
    const providing = providers(source.path);
    const users = [...importsOf].flatMap(([file, takes]) =>
      takes
        .filter(
          ({ module, link }) =>
            providing.has(module) && (link.names === undefined || link.names.includes(name)),
        )
        .map(() => file),
    );
    // A bare `import "./x"` or a namespace import is a use of everything. A named import of
    // another name is not.
    if (users.length > 0) {
      const instead = USE_BY_NAME[kind];
      say(
        `${[...new Set(users)].map(nameOf).join(", ")} import${users.length === 1 ? "s" : ""} it${
          instead
            ? `; scripts import it, and with generated types (.platform/volvel-env.d.ts) they can use ${instead} instead`
            : ""
        }`,
      );
      continue;
    }
    converted.push({
      kind,
      path,
      export: name,
      from: nameOf(source.path),
      file: "",
    });
    toWrite.push(manifest);
    const list = removals.get(source.path) ?? [];
    list.push({
      start: statement.start,
      end: statement.end,
      names: [
        statement.fn,
        ...statement.argument
          .filter((one) => one.type === "id" && HELPERS.has(one.text))
          .map((one) => one.text),
      ],
    });
    removals.set(source.path, list);
  }

  // Where the resources are kept, and whether volvel.yaml has to be made.
  const notes: string[] = [];
  const hasConfig = existsSync(join(directory, REPOSITORY_CONFIG));
  let folder = resources;
  let newConfig: string | undefined;
  if (!hasConfig && options.resources === undefined) {
    if (existsSync(join(directory, RESOURCE_FOLDER))) {
      folder = RESOURCE_FOLDER;
      notes.push(`Resources go to ${folder}/, which this repository already has.`);
    } else {
      folder = "resources";
      newConfig = "resources: resources\n";
      notes.push(
        `Wrote ${REPOSITORY_CONFIG} with \`resources: resources\`, the folder the files go to.`,
      );
    }
  }

  const rendered = renderResourceFiles(toWrite, platformKinds);
  const files: { path: string; content: string }[] = rendered.map((file) => ({
    path: `${folder}/${file.path}`,
    content: file.content,
  }));
  for (const item of converted) {
    item.file = `${folder}/${item.path}.${item.kind}.yaml`;
  }
  for (const file of files) {
    if (existsSync(join(directory, file.path))) {
      throw new BuildError([`${file.path} exists already. Nothing was changed.`]);
    }
  }

  // The new text of each file of code.
  const edits = new Map<string, string | null>();
  let droppedComments = 0;
  for (const [path, ranges] of removals) {
    const source = sources.get(path) as Source;
    const cut = removeRanges(source.text, source.comments, ranges);
    droppedComments += cut.dropped;
    edits.set(path, dropUnusedImports(cut.text, new Set(ranges.flatMap((range) => range.names))));
  }
  // A file left with nothing goes, and what re-exported it stops; that can empty another.
  for (let again = true; again; ) {
    again = false;
    for (const [path, text] of edits) {
      if (text === null || scan(text).tokens.length > 0) continue;
      if (path === entryPath) {
        edits.set(path, "export {};\n");
        continue;
      }
      edits.set(path, null);
      notes.push(`${nameOf(path)} is left empty, and removed.`);
      again = true;
      for (const other of sources.values()) {
        if (other.path === path || edits.get(other.path) === null) continue;
        const current = edits.get(other.path) ?? other.text;
        const links = linksOf(scan(current).tokens).filter(
          (link) =>
            link.kind === "export" &&
            link.names === undefined &&
            resolveModule(other.path, link.module, fileSet) === path,
        );
        if (links.length === 0) continue;
        let next = current;
        for (const link of links.sort((a, b) => b.start - a.start)) {
          const end = next[link.end] === "\n" ? link.end + 1 : link.end;
          next = next.slice(0, link.start) + next.slice(end);
        }
        edits.set(other.path, next.replace(/\n{3,}/g, "\n\n"));
      }
    }
  }

  return {
    directory,
    files,
    edits,
    newConfig,
    converted,
    left,
    notes,
    droppedComments,
    built,
    config,
  };
}

/** The bundle's manifests as what a deploy would compare: all but how each is owned. */
function comparable(manifests: readonly BundleManifest[]): Map<string, string> {
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .filter(([, item]) => item !== undefined)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([key, item]) => [key, sort(item)]),
          )
        : value;
  return new Map(
    manifests.map((manifest) => {
      const { ownership: _ownership, ...rest } = manifest as BundleManifest & {
        ownership?: string;
      };
      return [`${manifest.kind} ${manifest.path}`, JSON.stringify(sort(rest))];
    }),
  );
}

/** Converts a repository's declarative definitions to files, or says what it would. */
export async function convertRepository(options: ConvertOptions): Promise<ConvertResult> {
  const made = await plan(options);
  const result: ConvertResult = {
    converted: made.converted,
    left: made.left,
    notes: made.notes,
    droppedComments: made.droppedComments,
    dryRun: options.dryRun === true,
  };
  if (options.dryRun || made.converted.length === 0) return result;

  const { directory } = made;
  const originals = new Map<string, string>();
  for (const path of made.edits.keys()) originals.set(path, await readFile(path, "utf8"));
  const created: string[] = [];
  const configFile = join(directory, REPOSITORY_CONFIG);
  const undo = async () => {
    for (const [path, text] of originals) await writeFile(path, text);
    for (const path of created.reverse()) {
      await unlink(path).catch(() => {});
      let folder = dirname(path);
      while (folder.startsWith(directory) && folder !== directory) {
        if (
          await rmdir(folder).then(
            () => false,
            () => true,
          )
        )
          break;
        folder = dirname(folder);
      }
    }
  };
  try {
    if (made.newConfig !== undefined) {
      await writeFile(configFile, made.newConfig);
      created.push(configFile);
    }
    for (const file of made.files) {
      const path = join(directory, file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.content);
      created.push(path);
    }
    for (const [path, text] of made.edits) {
      if (text === null) await unlink(path);
      else await writeFile(path, text);
    }
    const after = await buildRepository({ ...options, withoutAppSources: true });
    const was = comparable(made.built.bundle.manifests);
    const now = comparable(after.bundle.manifests);
    const problems: string[] = [];
    for (const [key, body] of was) {
      if (!now.has(key)) problems.push(`${key} is gone from the build`);
      else if (now.get(key) !== body) problems.push(`${key} builds differently from its file`);
    }
    for (const key of now.keys()) if (!was.has(key)) problems.push(`${key} is new in the build`);
    const owned = after.bundle.manifests.filter(
      (manifest) =>
        made.converted.some((one) => one.kind === manifest.kind && one.path === manifest.path) &&
        manifest.ownership !== "ui",
    );
    for (const manifest of owned)
      problems.push(`${manifest.kind} ${manifest.path} is still owned by the code`);
    problems.push(...(options.verify?.(after.bundle.manifests) ?? []));
    if (problems.length > 0) throw new BuildError(problems);
  } catch (error) {
    // Nothing is left half done.
    for (const [path, text] of made.edits)
      if (text === null) await writeFile(path, originals.get(path) ?? "");
    await undo();
    const problems = error instanceof BuildError ? error.problems : [(error as Error).message];
    throw new BuildError([
      "The repository built differently after converting, so nothing was changed:",
      ...problems,
    ]);
  }
  return result;
}

/** The lines `volvel convert` prints. */
export function describeConvert(result: ConvertResult): string[] {
  const lines: string[] = [];
  const verb = result.dryRun ? "Would convert" : "Converted";
  lines.push(
    `${verb} ${result.converted.length} definition${result.converted.length === 1 ? "" : "s"} to files.`,
  );
  for (const item of result.converted) {
    lines.push(
      `  ${item.kind.padEnd(10)} ${item.path}  ${item.from} (${item.export}) -> ${item.file}`,
    );
  }
  if (result.left.length > 0) {
    lines.push(`Left in the code (${result.left.length}):`);
    for (const item of result.left) {
      lines.push(`  ${item.kind.padEnd(10)} ${item.path}  ${item.export}: ${item.reason}`);
    }
  }
  for (const note of result.notes) lines.push(note);
  if (result.droppedComments > 0) {
    lines.push(
      `${result.droppedComments} comment${result.droppedComments === 1 ? "" : "s"} written above the converted exports ${result.dryRun ? "would not" : "did not"} move to the files: a resource file holds no comments.`,
    );
  }
  if (result.dryRun) lines.push("Dry run: nothing was written.");
  return lines;
}
