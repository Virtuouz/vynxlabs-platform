import Prism from "./prism.js";
import { type Drawn, el } from "./render.js";

/**
 * Code drawn as spans with classes (`token keyword`, `token string`, ...), by Prism, at the time the page is
 * drawn: no script on a served page, no style, so a page's policy needs no change. The tokens are walked into the
 * tree, not turned into HTML and read back, so what a person wrote cannot become markup. For a language this does
 * not know, it gives nothing and the code is as written.
 *
 * A fence may say more than the language, in the way the 11ty syntax-highlight plugin does:
 * - `diff-ts`: a diff whose added and removed lines are drawn in TypeScript;
 * - `ts/1,3-5`: lines 1, 3, 4 and 5 are marked (`<mark class="vd-line vd-line-mark">`). The plugin's second
 *   form, `lang/added/removed`, is not read: `diff-` says what it says.
 */

/** The languages imported in `prism.ts`. */
export const LANGUAGE_NAMES = [
  "markup",
  "css",
  "clike",
  "javascript",
  "jsx",
  "typescript",
  "tsx",
  "json",
  "yaml",
  "bash",
  "sql",
  "diff",
  "markdown",
] as const;

/**
 * Names that stand for one of them. The first block is `alias` in prismjs/components.json for these languages (a
 * test reads the file and checks it); the second is what the plugin hard-codes and what people write.
 */
const ALIASES: Record<string, string> = {
  html: "markup",
  xml: "markup",
  svg: "markup",
  mathml: "markup",
  ssml: "markup",
  atom: "markup",
  rss: "markup",
  js: "javascript",
  ts: "typescript",
  webmanifest: "json",
  yml: "yaml",
  sh: "bash",
  shell: "bash",
  md: "markdown",
  jsonc: "json",
  json5: "json",
  zsh: "bash",
};

/** The language a name stands for, or undefined when it is not one of those imported. */
export function resolveLanguage(name: string): string | undefined {
  const lower = name.toLowerCase();
  const found = ALIASES[lower] ?? lower;
  return (LANGUAGE_NAMES as readonly string[]).includes(found) ? found : undefined;
}

/** More than this is left as written: a page that is mostly one block of code is not worth the time. */
const MOST = 20_000;

type Token = string | { type: string; alias?: string | string[]; content: Token | Token[] };

function draw(tokens: Token | Token[]): Drawn[] {
  const out: Drawn[] = [];
  for (const token of Array.isArray(tokens) ? tokens : [tokens]) {
    if (typeof token === "string") {
      if (token !== "") out.push(token);
      continue;
    }
    const classes = ["token", token.type, ...[token.alias ?? []].flat()].join(" ");
    out.push(el("span", { class: classes }, draw(token.content)));
  }
  return out;
}

/** The text of the code drawn in a language, as it is for one line or for all. */
function drawIn(code: string, language: string | undefined): Drawn[] {
  const grammar = language ? Prism.languages[language] : undefined;
  return grammar ? draw(Prism.tokenize(code, grammar) as Token[]) : code === "" ? [] : [code];
}

/** The tree cut at its line ends: a span that holds several lines is closed and opened again on each. */
function lines(tree: Drawn[]): Drawn[][] {
  const out: Drawn[][] = [[]];
  for (const node of tree) {
    if (typeof node === "string") {
      node.split("\n").forEach((part, i) => {
        if (i > 0) out.push([]);
        if (part !== "") (out[out.length - 1] as Drawn[]).push(part);
      });
      continue;
    }
    lines(node.children).forEach((inner, i) => {
      if (i > 0) out.push([]);
      if (inner.length > 0) (out[out.length - 1] as Drawn[]).push(el(node.tag, node.attrs, inner));
    });
  }
  return out;
}

/** `1,3-5` as the numbers it names; nothing when it says anything else. */
function marksOf(spec: string | undefined): Set<number> | undefined {
  if (!spec || !/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(spec)) return undefined;
  const set = new Set<number>();
  for (const part of spec.split(",")) {
    const [from, to = from] = part.split("-").map(Number) as [number, number?];
    for (let n = from; n <= Math.min(to ?? from, from + 10_000); n++) set.add(n);
  }
  return set;
}

export function highlightCode(code: string, lang: string, marks?: string): Drawn[] | undefined {
  if (code.length > MOST) return undefined;
  const name = lang.toLowerCase();
  const isDiff = name.startsWith("diff-");
  const language = resolveLanguage(isDiff ? name.slice(5) : name);
  const marked = marksOf(marks);
  if (!language && name !== "text") return undefined;
  if (name === "text" && !marked) return undefined;
  if (!isDiff && !marked) return drawIn(code, language);

  let rows: Drawn[][];
  if (isDiff) {
    rows = code.split("\n").map((row) => {
      const sign = row[0];
      const header = /^(?:\+\+\+|---) /.test(row);
      if (header || (sign !== "+" && sign !== "-" && sign !== " ")) return drawIn(row, "diff");
      const inner: Drawn[] = [sign, ...drawIn(row.slice(1), language)];
      if (sign === " ") return inner;
      return [el("span", { class: `token ${sign === "+" ? "inserted" : "deleted"}` }, inner)];
    });
  } else rows = lines(drawIn(code, language));
  if (rows.length > 1 && rows[rows.length - 1]?.length === 0) rows.pop();

  const out: Drawn[] = [];
  rows.forEach((row, i) => {
    if (i > 0) out.push("\n");
    if (marked?.has(i + 1)) out.push(el("mark", { class: "vd-line vd-line-mark" }, row));
    else out.push(...row);
  });
  return out;
}
