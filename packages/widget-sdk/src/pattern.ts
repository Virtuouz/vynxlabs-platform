/**
 * The one check of a regular expression that comes from a tenant, and is run on text from a
 * caller by a thread other people share. It is used by the widget frame's payload check
 * (`schema.ts`), by the manifest's schema guard (`@volvel/manifest`, `pattern-guard.ts`) and, as
 * source text, by the flow expression worker (`kernel/flows/expressions.ts`). All three call this
 * function, so a change here is a change to all of them.
 *
 * It must stay one self-contained function, with nothing from outside its body: the expression
 * worker is built from `patternProblem.toString()`.
 *
 * A pattern is run by a backtracking engine. The ways that engine takes more than a moment are
 * a repeated group (`(a+)+`), a group with a repeat inside it made optional, a back reference,
 * look-around, a chain of optional atoms (`a?a?a?aaa`), a chain of alternations that share a
 * start (`(a|a)(a|a)...`), and repeats that can each take the same text (`a*a*a*b`: every way of
 * dividing the text between them is tried, one more power of its length for each pair). The first
 * four are refused whole. For the repeats, the rule is: two repeats that can take the same text,
 * with nothing between them that a text cannot pass (a letter that neither can take), are an
 * "overlapping pair"; at most one such pair is allowed, so the work is at most the square of the
 * length of the text, which the callers keep short (see their `MAX_PATTERN_INPUT`). What is left
 * is what a payload needs: `^[a-z0-9-]+$`, `^[A-Z]{2}\d{6}$`, `^[^@\s]+@[^@\s]+\.[^@\s]+$`.
 */
export function patternProblem(pattern: string, maxLength = 200): string | undefined {
  if (pattern.length > maxLength) return `is longer than ${maxLength} characters`;
  if (/\\(?:[1-9]|k<)/.test(pattern)) return "refers back to a group, which is not run";
  // What is left once escapes and character classes are out of the way, and the markers that
  // open a group without being a repeat (`(?:`, `(?<name>`) are plain parentheses.
  const bare = pattern
    .replace(/\\./gsu, "_")
    .replace(/\[(?:[^\]\\]|\\.)*\]/gsu, "_")
    .replace(/\(\?(?::|<[A-Za-z_][A-Za-z0-9_]*>)/g, "(");
  if (/\((?:\?<?[=!])/.test(bare)) return "looks ahead or behind, which is not run";
  if (/\)\s*(?:[*+]|\{)/.test(bare)) return "repeats a group, which is not run";
  // A group made optional is fine on its own; with a repeat inside it, it is not shown safe.
  // A group holding a choice (`|`) is counted: each is a fork, and forks multiply.
  const opened: number[] = [];
  let forks = 0;
  for (const [at, char] of [...bare].entries()) {
    if (char === "(") opened.push(at);
    else if (char === ")") {
      const from = opened.pop();
      if (from === undefined) continue;
      const inside = bare.slice(from + 1, at);
      if (bare[at + 1] === "?" && /[*+?]|\{\d+,/.test(inside))
        return "makes a group with a repeat in it optional, which is not run";
      if (inside.includes("|")) forks++;
    }
  }
  if (forks > 2 || (bare.match(/\|/g)?.length ?? 0) > 6)
    return "has too many choices to be run on text from a caller";
  // A lazy mark (`+?`, `{2,3}?`) is not another repeat.
  const quantifiers = bare.replace(/([*+?}])\?/g, "$1");
  if ((quantifiers.match(/\?/g)?.length ?? 0) > 4)
    return "has too many optional parts to be run on text from a caller";

  // The atoms of the pattern, each with how often it may repeat.
  interface Atom {
    source: string;
    min: number;
    many: boolean;
    set?: Uint8Array;
  }
  const atoms: Atom[] = [];
  const groups: { from: number; choice: boolean }[] = [];
  const top = { choice: false };
  const text = pattern;
  let at = 0;
  while (at < text.length) {
    const char = text[at] as string;
    let source: string;
    if (char === "\\") {
      const rest = text.slice(at + 1);
      const long =
        /^(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[pP]\{[^}]*\}|c[A-Za-z])/.exec(rest);
      source = `\\${long ? long[0] : rest.slice(0, 1)}`;
      at += source.length;
      if (source === "\\b" || source === "\\B") continue;
    } else if (char === "[") {
      let end = at + 1;
      if (text[end] === "^") end++;
      if (text[end] === "]") end++;
      while (end < text.length && text[end] !== "]") end += text[end] === "\\" ? 2 : 1;
      source = text.slice(at, end + 1);
      at = end + 1;
    } else if (char === "(") {
      groups.push({ from: atoms.length, choice: false });
      at += 1;
      if (text[at] === "?") {
        const marker = /^\?(?::|<[A-Za-z_][A-Za-z0-9_]*>)/.exec(text.slice(at));
        at += marker ? marker[0].length : 1;
      }
      continue;
    } else if (char === ")") {
      // What a group with a choice, or one made optional, holds is not always there: it cannot
      // be counted on to keep two repeats apart.
      const group = groups.pop();
      at += 1;
      const optional = /^(?:[*?]|\{0)/.test(text.slice(at));
      if (group && (group.choice || optional))
        for (const atom of atoms.slice(group.from)) atom.min = 0;
      continue;
    } else if (char === "|") {
      const group = groups[groups.length - 1];
      if (group) group.choice = true;
      else top.choice = true;
      at += 1;
      continue;
    } else if (char === "^" || char === "$") {
      at += 1;
      continue;
    } else {
      source = char;
      at += 1;
    }
    let min = 1;
    let many = false;
    const quantifier = /^(?:([*+?])|\{(\d+)(?:(,)(\d*))?\})\??/.exec(text.slice(at));
    if (quantifier) {
      at += quantifier[0].length;
      if (quantifier[1] === "*") [min, many] = [0, true];
      else if (quantifier[1] === "+") [min, many] = [1, true];
      else if (quantifier[1] === "?") min = 0;
      else {
        min = Number(quantifier[2]);
        const max =
          quantifier[3] === undefined
            ? min
            : quantifier[4] === ""
              ? Infinity
              : Number(quantifier[4]);
        many = max > 1 && max > min;
        if (max === 0) min = 0;
      }
    }
    atoms.push({ source, min, many });
  }

  if (top.choice) for (const atom of atoms) atom.min = 0;

  // For each atom that repeats, the characters it can take, from a spread of probes: every
  // code up to U+017F, then every 17th one up to U+FFFF, and one beyond.
  const probes: number[] = [];
  for (let code = 0; code < 0x180; code++) probes.push(code);
  for (let code = 0x180; code < 0x10000; code += 17) probes.push(code, code + 1);
  probes.push(0x1f600);
  const setOf = (atom: Atom): Uint8Array => {
    if (atom.set) return atom.set;
    let test: RegExp | undefined;
    for (const flags of ["su", "s"]) {
      try {
        test = new RegExp(`^(?:${atom.source})$`, flags);
        break;
      } catch {
        // Try the next form.
      }
    }
    atom.set = new Uint8Array(probes.length);
    for (const [index, code] of probes.entries())
      atom.set[index] = !test || test.test(String.fromCodePoint(code)) ? 1 : 0;
    return atom.set;
  };

  // A pattern that is not anchored at the start is tried from every place in the text: that is a
  // repeat of its own, in front.
  if (!pattern.startsWith("^")) atoms.unshift({ source: ".", min: 0, many: true });
  const repeats = atoms.flatMap((atom, index) => (atom.many ? [index] : []));
  if (repeats.length > 8) return "repeats too freely to be run on text from a caller";
  let overlapping = 0;
  for (const [second, later] of repeats.entries()) {
    for (const earlier of repeats.slice(0, second)) {
      // What can sit in both, and in every atom that must be passed between them.
      const shared = Uint8Array.from(setOf(atoms[later] as Atom));
      const mix = (atom: Atom) => {
        const other = setOf(atom);
        for (let i = 0; i < shared.length; i++)
          shared[i] = (shared[i] as number) & (other[i] as number);
      };
      mix(atoms[earlier] as Atom);
      for (const between of atoms.slice(earlier + 1, later)) if (between.min > 0) mix(between);
      if (shared.some(Boolean)) overlapping++;
    }
  }
  if (overlapping > 1) return "repeats too freely to be run on text from a caller";
  return undefined;
}
