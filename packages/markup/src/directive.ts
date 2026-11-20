import type { MarkdownIt } from "markdown-it";

/**
 * One grammar for every component:
 *
 *   :name[words]{key=value}        in a line of text
 *   ::name[words]{key=value}       on a line of its own
 *   :::name[words]{key=value}      around other blocks, until a line of the
 *   ...                            same number of colons and nothing else
 *   :::
 *
 * A container may use any number of colons from three up. One inside another
 * uses a different number, or the same number, in which case each closing line
 * closes the nearest one still open.
 *
 * The plugin knows no component by name. What a name means, and whether it is
 * allowed, is for whoever reads the tree.
 */

export interface DirectiveMeta {
  [key: string]: unknown;
  name: string;
  props: Record<string, string>;
  label?: string;
  badProps?: true;
  /** Set on a container that no line closed. It runs to the end of what holds it. */
  unclosed?: true;
}

const NAME = /^[a-z][a-z0-9-]*/;
const COLON = 0x3a;
const OPEN_BRACKET = 0x5b;
const OPEN_BRACE = 0x7b;

/**
 * Reads `{key=value other="two words" flag}` starting at the brace. Gives what
 * it read and where it ended, or nothing when there is no closing brace on the
 * line. A value written wrongly is kept out, and `bad` says so.
 */
export function readProps(
  text: string,
  start: number,
): { props: Record<string, string>; end: number; bad: boolean } | undefined {
  if (text.charCodeAt(start) !== OPEN_BRACE) return undefined;
  const props: Record<string, string> = {};
  let bad = false;
  let at = start + 1;
  while (at < text.length) {
    const char = text[at] as string;
    if (char === "}") return { props, end: at + 1, bad };
    if (char === "\n") return undefined;
    if (char === " " || char === "\t") {
      at++;
      continue;
    }
    const key = /^[A-Za-z][A-Za-z0-9_-]*/.exec(text.slice(at));
    if (!key) {
      bad = true;
      at++;
      continue;
    }
    at += key[0].length;
    if (text[at] !== "=") {
      props[key[0]] = "true";
      continue;
    }
    at++;
    const quote = text[at];
    if (quote === '"' || quote === "'") {
      const close = text.indexOf(quote, at + 1);
      const line = text.indexOf("\n", at);
      if (close === -1 || (line !== -1 && line < close)) return undefined;
      props[key[0]] = text.slice(at + 1, close);
      at = close + 1;
      continue;
    }
    const bare = /^[^\s}"']*/.exec(text.slice(at));
    const value = bare ? bare[0] : "";
    if (value === "") bad = true;
    else props[key[0]] = value;
    at += value.length;
  }
  return undefined;
}

/** Reads `[words]` starting at the bracket, with brackets inside it balanced. */
function readLabel(text: string, start: number): { label: string; end: number } | undefined {
  if (text.charCodeAt(start) !== OPEN_BRACKET) return undefined;
  let depth = 0;
  for (let at = start; at < text.length; at++) {
    const char = text[at];
    if (char === "\\") {
      at++;
      continue;
    }
    if (char === "\n") return undefined;
    if (char === "[") depth++;
    if (char === "]") {
      depth--;
      if (depth === 0) return { label: text.slice(start + 1, at), end: at + 1 };
    }
  }
  return undefined;
}

/** Reads `name[label]{props}` from a line that is a leaf's or a container's opening. */
function readHead(text: string): DirectiveMeta | undefined {
  const name = NAME.exec(text);
  if (!name) return undefined;
  let at = name[0].length;
  const meta: DirectiveMeta = { name: name[0], props: {} };
  const label = readLabel(text, at);
  if (label) {
    meta.label = label.label;
    at = label.end;
  }
  const props = readProps(text, at);
  if (props) {
    meta.props = props.props;
    if (props.bad) meta.badProps = true;
    at = props.end;
  }
  const rest = text.slice(at).trim();
  if (rest !== "") {
    // Braces that were opened and never read, or words after the head.
    if (rest.startsWith("{")) meta.badProps = true;
    else return undefined;
  }
  return meta;
}

function colonsAt(text: string, from: number, to: number): number {
  let at = from;
  while (at < to && text.charCodeAt(at) === COLON) at++;
  return at - from;
}

export function directives(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "directive", (state, silent) => {
    const { src, pos, posMax } = state;
    if (src.charCodeAt(pos) !== COLON) return false;
    // Not the middle of 12:30, a::b or https://.
    if (pos > 0 && /[A-Za-z0-9:]/.test(src[pos - 1] as string)) return false;
    const name = NAME.exec(src.slice(pos + 1, posMax));
    if (!name) return false;
    const labelStart = pos + 1 + name[0].length;
    if (src.charCodeAt(labelStart) !== OPEN_BRACKET) return false;
    const labelEnd = state.md.helpers.parseLinkLabel(state, labelStart);
    if (labelEnd < 0) return false;
    let end = labelEnd + 1;
    const meta: DirectiveMeta = { name: name[0], props: {} };
    const props = end < posMax ? readProps(src.slice(0, posMax), end) : undefined;
    if (props) {
      meta.props = props.props;
      if (props.bad) meta.badProps = true;
      end = props.end;
    }
    if (!silent) {
      const open = state.push("directive_inline_open", "span", 1);
      open.meta = meta;
      state.pos = labelStart + 1;
      state.posMax = labelEnd;
      state.md.inline.tokenize(state);
      state.push("directive_inline_close", "span", -1);
    }
    state.pos = end;
    state.posMax = posMax;
    return true;
  });

  md.block.ruler.before(
    "fence",
    "directive",
    (state, startLine, endLine, silent) => {
      if ((state.sCount[startLine] as number) - state.blkIndent >= 4) return false;
      const start = (state.bMarks[startLine] as number) + (state.tShift[startLine] as number);
      const max = state.eMarks[startLine] as number;
      const colons = colonsAt(state.src, start, max);
      if (colons < 2) return false;
      const meta = readHead(state.src.slice(start + colons, max));
      if (!meta) return false;

      if (colons === 2) {
        if (silent) return true;
        const token = state.push("directive_leaf", "div", 0);
        token.meta = meta;
        token.map = [startLine, startLine + 1];
        state.line = startLine + 1;
        return true;
      }

      // A container. Find the line that closes it.
      let depth = 0;
      let closeLine = -1;
      for (let line = startLine + 1; line < endLine; line++) {
        const from = (state.bMarks[line] as number) + (state.tShift[line] as number);
        const to = state.eMarks[line] as number;
        if ((state.sCount[line] as number) < state.blkIndent) break;
        if (colonsAt(state.src, from, to) !== colons) continue;
        const rest = state.src.slice(from + colons, to).trim();
        if (rest === "") {
          if (depth === 0) {
            closeLine = line;
            break;
          }
          depth--;
        } else if (NAME.test(rest)) {
          depth++;
        }
      }
      if (silent) return true;
      const last = closeLine === -1 ? endLine : closeLine;

      const open = state.push("directive_container_open", "div", 1);
      if (closeLine === -1) meta.unclosed = true;
      open.meta = meta;
      open.block = true;
      // Like markdown-it's own, the end is the line after the block: here, after the line that closes it.
      open.map = [startLine, closeLine === -1 ? last : last + 1];

      const oldParent = state.parentType;
      const oldLineMax = state.lineMax;
      // markdown-it's own name for "inside a block that holds blocks".
      state.parentType = "blockquote";
      state.lineMax = last;
      state.md.block.tokenize(state, startLine + 1, last);
      state.parentType = oldParent;
      state.lineMax = oldLineMax;

      const close = state.push("directive_container_close", "div", -1);
      close.block = true;
      state.line = closeLine === -1 ? last : last + 1;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
}
