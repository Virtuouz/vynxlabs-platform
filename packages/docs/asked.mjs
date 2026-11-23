// Finds the topics a source file asks the help for. Used by `pnpm docs:check`.
//
// A topic is asked for by `help: "…"`, `useHelpTopic(…)`, `<HelpTopic topic=…>` and
// `openHelp(…)`. The argument may be a string, a template (`reference/errors#${code}`: the
// topic is what comes before the `#`) or a choice between them (`open ? "a" : undefined`).
// An argument that holds no literal at all (a variable) cannot be checked, and is reported
// unless the line, or the one above, says `docs:dynamic` and why.

const TOPIC = /^[a-z0-9][a-z0-9/_-]*$/;

/** The text of an expression from `from`, up to the `)`, `}` or `,` that ends it at its own depth. */
function expressionAt(text, from) {
  let depth = 0;
  let quote = "";
  for (let at = from; at < text.length; at++) {
    const char = text[at];
    if (quote) {
      if (char === "\\") at++;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(" || char === "{" || char === "[") depth++;
    else if (char === ")" || char === "}" || char === "]") {
      if (depth === 0) return text.slice(from, at);
      depth--;
    } else if (char === "," && depth === 0) return text.slice(from, at);
  }
  return text.slice(from);
}

/** The string and template literals of an expression, outermost first. */
function literalsOf(expression) {
  const found = [];
  for (const match of expression.matchAll(
    /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g,
  )) {
    found.push({ text: match[1] ?? match[2] ?? match[3], template: match[3] !== undefined });
  }
  return found;
}

/**
 * Every topic `text` asks for, as `{ topic, line }`, and every argument that cannot be read
 * as one, as `{ problem, line }`.
 */
export function topicsAsked(text) {
  const topics = [];
  const problems = [];
  const lines = text.split("\n");
  const lineOf = (index) => text.slice(0, index).split("\n").length;
  const marked = (line) =>
    /docs:dynamic/.test(lines[line - 1] ?? "") || /docs:dynamic/.test(lines[line - 2] ?? "");
  const calls = [
    { pattern: /(?<!function\s)\buseHelpTopic\(/g, strict: true },
    { pattern: /(?<!function\s)\bopenHelp\(/g, strict: true },
    { pattern: /<HelpTopic\s+topic=\{/g, strict: true },
    { pattern: /<HelpTopic\s+topic=(?=["'])/g, strict: true },
    { pattern: /(?<![\w-])help:\s*/g, strict: false },
  ];
  for (const { pattern, strict } of calls) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[0].length;
      const line = lineOf(match.index);
      // `topic="x"`: the quoted text is the whole of it.
      const quoted = match[0].endsWith("=")
        ? literalsOf(text.slice(start, start + 200))[0]
        : undefined;
      const expression = match[0].endsWith("=")
        ? quoted
          ? JSON.stringify(quoted.text)
          : ""
        : expressionAt(text, start);
      const literals = literalsOf(expression);
      if (literals.length === 0) {
        // `openHelp()`, `openHelp(undefined)`: the screen's own help, which names no topic.
        if (
          strict &&
          expression.trim() !== "" &&
          expression.trim() !== "undefined" &&
          !marked(line)
        ) {
          problems.push({
            line,
            problem: `asks for the help by \`${expression.trim().slice(0, 40)}\`, which cannot be checked. Use a topic as text, or say why not with docs:dynamic.`,
          });
        }
        continue;
      }
      for (const literal of literals) {
        let topic = literal.text;
        if (literal.template && topic.includes("${")) {
          const prefix = topic.slice(0, topic.indexOf("${"));
          if (!prefix.includes("#")) {
            if (strict && !marked(line)) {
              problems.push({
                line,
                problem: `asks for a topic made at run time (\`${literal.text.slice(0, 40)}\`), which cannot be checked. Name the topic before the #, as in \`errors#\${code}\`.`,
              });
            }
            continue;
          }
          topic = prefix;
        }
        topic = topic.split("#")[0];
        if (TOPIC.test(topic)) topics.push({ topic, line });
        else if (strict && !marked(line)) {
          problems.push({
            line,
            problem: `asks for "${literal.text}", which is not a topic or a page path.`,
          });
        }
      }
    }
  }
  return { topics, problems };
}
