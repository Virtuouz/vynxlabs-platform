// A small reader of declaration files (`.d.ts`), for the SDK's reference.
//
// Decision D58 asked for a docs-only TypeScript to read the declarations with. Nothing suitable
// is installed: the repository has TypeScript 7.0.2 only, which is native and has no compiler
// API a script can call, and neither typedoc nor api-extractor is present. So the reference is
// drawn by this reader. It reads what `tsc` writes, which is regular: one declaration to a
// statement, a comment of `/** ... */` just before what it describes, no decorators and no
// overloads of members. It is not a parser of TypeScript, and it says so by failing loudly on a
// statement it cannot place.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Statements of a file, each with the comment before it. */
export function statementsOf(text) {
  const out = [];
  let at = 0;
  let doc = "";
  const length = text.length;
  while (at < length) {
    const char = text[at];
    if (/\s/.test(char)) {
      at++;
      continue;
    }
    if (text.startsWith("/**", at)) {
      const end = text.indexOf("*/", at + 3);
      doc = text.slice(at, end + 2);
      at = end + 2;
      continue;
    }
    if (text.startsWith("/*", at)) {
      at = text.indexOf("*/", at + 2) + 2;
      continue;
    }
    if (text.startsWith("//", at)) {
      const end = text.indexOf("\n", at);
      at = end === -1 ? length : end + 1;
      continue;
    }
    const end = endOfStatement(text, at);
    out.push({ text: text.slice(at, end).trim(), doc });
    doc = "";
    at = end;
  }
  return out;
}

const BLOCK =
  /^(export\s+)?(default\s+)?(declare\s+)?(abstract\s+)?(interface|class|enum|namespace|module)\s/;

/** Where the statement that begins at `from` ends. */
function endOfStatement(text, from) {
  const head = text.slice(from, from + 80);
  const block = BLOCK.test(head);
  let depth = 0;
  let at = from;
  while (at < text.length) {
    const char = text[at];
    if (char === '"' || char === "'" || char === "`") {
      at = endOfString(text, at);
      continue;
    }
    if (text.startsWith("/*", at)) {
      at = text.indexOf("*/", at + 2) + 2;
      continue;
    }
    if (text.startsWith("//", at)) {
      const end = text.indexOf("\n", at);
      at = end === -1 ? text.length : end;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") depth++;
    else if (char === "}" || char === ")" || char === "]") {
      depth--;
      if (depth === 0 && char === "}" && block) return at + 1;
    } else if (char === ";" && depth === 0) return at + 1;
    at++;
  }
  return text.length;
}

function endOfString(text, from) {
  const quote = text[from];
  let at = from + 1;
  while (at < text.length) {
    if (text[at] === "\\") at += 2;
    else if (text[at] === quote) return at + 1;
    else at++;
  }
  return text.length;
}

/** The words of a doc comment, without its stars. */
export function docOf(comment) {
  if (!comment) return { text: "", tags: {} };
  const lines = comment
    .replace(/^\/\*\*+/, "")
    .replace(/\*+\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""));
  const body = [];
  const tags = {};
  let tag;
  for (const line of lines) {
    const found = /^@(\w+)\s*(.*)$/.exec(line);
    if (found) {
      tag = found[1];
      tags[tag] = [...(tags[tag] ?? []), found[2]];
    } else if (tag) tags[tag][tags[tag].length - 1] += `\n${line}`;
    else body.push(line);
  }
  return {
    text: body.join("\n").trim(),
    tags: Object.fromEntries(
      Object.entries(tags).map(([key, list]) => [key, list.map((one) => one.trim())]),
    ),
  };
}

const DECLARATION =
  /^(export\s+)?(default\s+)?(declare\s+)?(abstract\s+)?(const|let|var|function|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

/** The members of an interface, a class or an enum, each with its comment. */
export function membersOf(statement) {
  const open = statement.indexOf("{");
  const close = statement.lastIndexOf("}");
  if (open === -1 || close === -1) return [];
  // An `extends` list or generics before the brace are not members.
  const body = statement.slice(open + 1, close);
  const members = [];
  for (const part of statementsLike(body)) {
    const text = part.text.replace(/[;,]$/, "").trim();
    if (text === "") continue;
    const found =
      /^((?:readonly|static|private|protected|public|abstract|declare|get|set)\s+)*(\[[^\]]*\]|"[^"]*"|'[^']*'|[A-Za-z_$][\w$]*)(\??)\s*(?=[(:<=,]|$)/.exec(
        text,
      );
    if (!found) continue;
    if (/^(private|#)/.test(text) || text.startsWith("#")) continue;
    members.push({
      name: found[2].replace(/^["']|["']$/g, ""),
      optional: found[3] === "?",
      signature: text,
      doc: docOf(part.doc),
    });
  }
  return members;
}

/** The statements of a body: `;` or `,` at depth 0 ends one, and a closing brace of a method too. */
function statementsLike(body) {
  const out = [];
  let at = 0;
  let doc = "";
  while (at < body.length) {
    if (/\s/.test(body[at])) {
      at++;
      continue;
    }
    if (body.startsWith("/**", at)) {
      const end = body.indexOf("*/", at + 3);
      doc = body.slice(at, end + 2);
      at = end + 2;
      continue;
    }
    if (body.startsWith("/*", at)) {
      at = body.indexOf("*/", at + 2) + 2;
      continue;
    }
    if (body.startsWith("//", at)) {
      const end = body.indexOf("\n", at);
      at = end === -1 ? body.length : end + 1;
      continue;
    }
    let depth = 0;
    let end = at;
    while (end < body.length) {
      const char = body[end];
      if (char === '"' || char === "'" || char === "`") {
        end = endOfString(body, end);
        continue;
      }
      if (body.startsWith("/*", end)) {
        end = body.indexOf("*/", end + 2) + 2;
        continue;
      }
      if (char === "{" || char === "(" || char === "[") depth++;
      else if (char === "}" || char === ")" || char === "]") depth--;
      else if ((char === ";" || char === ",") && depth === 0) {
        end++;
        break;
      }
      end++;
    }
    out.push({ text: body.slice(at, end).trim(), doc });
    doc = "";
    at = end;
  }
  return out;
}

/** `{ a, type B, c as d }` as `[{ name, as, type }]`. */
function namesIn(list) {
  return list
    .replace(/^\{|\}$/g, "")
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean)
    .map((one) => {
      const type = /^type\s+/.test(one);
      const [name, as] = one.replace(/^type\s+/, "").split(/\s+as\s+/);
      return { name: name.trim(), as: (as ?? name).trim(), type };
    });
}

/** What a declaration file declares, and what it exports from elsewhere. */
export function readModule(file, seen = new Set()) {
  const key = resolve(file);
  if (seen.has(key)) return { declared: new Map(), exported: [], stars: [] };
  seen.add(key);
  const statements = statementsOf(readFileSync(file, "utf8"));
  const declared = new Map();
  const imports = new Map();
  const exported = [];
  const stars = [];
  for (const { text, doc } of statements) {
    const importing = /^import\s+(type\s+)?(.*?)\s+from\s+["']([^"']+)["']/s.exec(text);
    if (importing) {
      for (const name of importing[2].match(/[A-Za-z_$][\w$]*/g) ?? []) {
        if (name !== "type" && name !== "as") imports.set(name, importing[3]);
      }
      continue;
    }
    const star = /^export\s+\*\s+from\s+["']([^"']+)["']/.exec(text);
    if (star) {
      stars.push(star[1]);
      continue;
    }
    const reexport = /^export\s+(type\s+)?(\{[^}]*\})\s*(?:from\s+["']([^"']+)["'])?\s*;?$/s.exec(
      text,
    );
    if (reexport) {
      for (const one of namesIn(reexport[2])) {
        exported.push({ ...one, type: one.type || Boolean(reexport[1]), from: reexport[3] });
      }
      continue;
    }
    const found = DECLARATION.exec(text);
    if (!found) continue;
    const [, isExport, , , , kind, name] = found;
    const entry = {
      name,
      kind,
      doc: docOf(doc),
      signature: text.replace(/^export\s+/, "").replace(/^declare\s+/, ""),
      exported: Boolean(isExport),
      members: ["interface", "class", "enum", "namespace"].includes(kind) ? membersOf(text) : [],
    };
    // `declare function f(): void;` twice is two overloads of one name.
    const earlier = declared.get(name);
    if (earlier && kind === "function") {
      earlier.signature += `\n${entry.signature}`;
      if (!earlier.doc.text) earlier.doc = entry.doc;
    } else if (earlier && earlier.kind === "interface" && kind === "interface") {
      earlier.members.push(...entry.members);
    } else declared.set(name, entry);
  }
  return { declared, exported, stars, imports };
}

const packageOf = (specifier) =>
  specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];

/**
 * Everything an entry point exports, by name, with where its words are: a declaration with its
 * comment, or `from` for what it passes on from another package.
 */
export function exportsOf(entry) {
  const module = readModule(entry);
  const out = new Map();
  for (const entryOf of module.declared.values()) {
    if (entryOf.exported) out.set(entryOf.name, entryOf);
  }
  for (const one of module.exported) {
    if (one.from?.startsWith(".")) {
      const file = resolveRelative(entry, one.from);
      const inner = exportsOf(file).names.get(one.name);
      if (inner) out.set(one.as, { ...inner, name: one.as });
      else out.set(one.as, missing(one));
    } else if (one.from) {
      out.set(one.as, { name: one.as, kind: "reexport", from: one.from, doc: docOf("") });
    } else {
      const local = module.declared.get(one.name);
      if (local) out.set(one.as, { ...local, name: one.as });
      else {
        const from = module.imports?.get(one.name);
        out.set(
          one.as,
          from && !from.startsWith(".")
            ? { name: one.as, kind: "reexport", from, doc: docOf("") }
            : missing(one),
        );
      }
    }
  }
  const outside = [];
  for (const from of module.stars) {
    if (from.startsWith(".")) {
      for (const [name, one] of exportsOf(resolveRelative(entry, from)).names) {
        if (!out.has(name)) out.set(name, one);
      }
    } else outside.push({ from, package: packageOf(from) });
  }
  return { names: out, stars: outside };
}

const missing = (one) => ({
  name: one.as,
  kind: "unknown",
  doc: docOf(""),
  signature: "",
  members: [],
});

function resolveRelative(from, specifier) {
  const base = join(dirname(from), specifier.replace(/\.js$/, ""));
  for (const candidate of [`${base}.d.ts`, join(base, "index.d.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`${from} exports from ${specifier}, and no declaration file is there.`);
}
