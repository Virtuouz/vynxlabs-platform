import { type Drawn, el } from "./render.js";

/**
 * Code drawn as spans with classes, without a script and without a style. The
 * classes are those of highlight.js (`hljs-keyword`, `hljs-string`, ...), so a
 * fuller highlighter can take this one's place, through `RenderOptions.highlight`,
 * and the stylesheet stays as it is. Only the languages the documentation is
 * written in are known; for any other this gives nothing and the code is as written.
 */

type Rule = [pattern: RegExp, className: string | null];

const JS_KEYWORDS =
  "as async await break case catch class const continue declare default delete do else enum export extends finally for from function if implements import in instanceof interface let namespace new of private protected public readonly return static switch throw try type typeof var while yield";
const JS_LITERALS = "true false null undefined NaN Infinity this";
const JS_BUILT_INS =
  "console Promise Array Object Map Set JSON Math Date Error string number boolean unknown never any void";
const SQL_KEYWORDS =
  "select from where group by order having limit offset insert into values update set delete create table alter drop index join left right inner outer on as and or not in is like between union all distinct case when then else end with returning";

const words = (list: string, flags = "") =>
  new RegExp(`\\b(?:${list.replace(/ /g, "|")})\\b`, `y${flags}`);

const JS: Rule[] = [
  [/\/\/[^\n]*/y, "hljs-comment"],
  [/\/\*[\s\S]*?\*\//y, "hljs-comment"],
  [/`(?:\\[\s\S]|[^\\`])*`/y, "hljs-string"],
  [/"(?:\\.|[^\\"\n])*"/y, "hljs-string"],
  [/'(?:\\.|[^\\'\n])*'/y, "hljs-string"],
  [/\b0[xX][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b/y, "hljs-number"],
  [words(JS_LITERALS), "hljs-literal"],
  [words(JS_KEYWORDS), "hljs-keyword"],
  [words(JS_BUILT_INS), "hljs-built_in"],
];

const JSON_RULES: Rule[] = [
  [/"(?:\\.|[^\\"\n])*"(?=\s*:)/y, "hljs-attr"],
  [/"(?:\\.|[^\\"\n])*"/y, "hljs-string"],
  [/-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y, "hljs-number"],
  [words("true false null"), "hljs-literal"],
];

const YAML: Rule[] = [
  [/#[^\n]*/y, "hljs-comment"],
  [/[\w.-]+(?=\s*:(?:\s|$))/y, "hljs-attr"],
  [/"(?:\\.|[^\\"\n])*"/y, "hljs-string"],
  [/'(?:''|[^'\n])*'/y, "hljs-string"],
  [/-?\b\d+(?:\.\d+)?\b/y, "hljs-number"],
  [words("true false null yes no"), "hljs-literal"],
];

const SH: Rule[] = [
  [/(?:^|(?<=\s))#[^\n]*/y, "hljs-comment"],
  [/"(?:\\.|[^\\"])*"/y, "hljs-string"],
  [/'[^']*'/y, "hljs-string"],
  [/\$\{[^}\n]*\}|\$[A-Za-z_]\w*/y, "hljs-variable"],
  [words("if then else elif fi for while do done case esac function in export"), "hljs-keyword"],
];

const SQL: Rule[] = [
  [/--[^\n]*/y, "hljs-comment"],
  [/'(?:''|[^'])*'/y, "hljs-string"],
  [/\b\d+(?:\.\d+)?\b/y, "hljs-number"],
  [words(SQL_KEYWORDS, "i"), "hljs-keyword"],
  [words("true false null", "i"), "hljs-literal"],
];

const LANGUAGES: Record<string, Rule[]> = {
  js: JS,
  jsx: JS,
  javascript: JS,
  ts: JS,
  tsx: JS,
  typescript: JS,
  json: JSON_RULES,
  jsonc: JSON_RULES,
  yaml: YAML,
  yml: YAML,
  sh: SH,
  bash: SH,
  shell: SH,
  zsh: SH,
  sql: SQL,
};

/** More than this is left as written: a page that is mostly one block of code is not worth the time. */
const MOST = 20_000;

export function highlightCode(code: string, lang: string): Drawn[] | undefined {
  const rules = LANGUAGES[lang.toLowerCase()];
  if (!rules || code.length > MOST) return undefined;
  const out: Drawn[] = [];
  let plain = "";
  let at = 0;
  const flush = () => {
    if (plain !== "") out.push(plain);
    plain = "";
  };
  scan: while (at < code.length) {
    for (const [pattern, className] of rules) {
      pattern.lastIndex = at;
      const found = pattern.exec(code);
      if (!found || found[0] === "") continue;
      if (className) {
        flush();
        out.push(el("span", { class: className }, [found[0]]));
      } else plain += found[0];
      at += found[0].length;
      continue scan;
    }
    // A word with nothing to say goes whole, so that a keyword is not found inside another word.
    const word = /^[\w$]+/.exec(code.slice(at, at + 64))?.[0];
    const take = word ?? (code[at] as string);
    plain += take;
    at += take.length;
  }
  flush();
  return out;
}
