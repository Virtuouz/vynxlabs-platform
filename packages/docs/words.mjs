// The words the documentation style guide avoids, in one place. The console's enforce test reads
// the British spellings from here, and `pnpm docs:check` reads all of it for the product's pages.

/** British spellings of the words the product writes in American. */
export const BRITISH =
  /\b(cancell(?:ed|ing|ation)|colour\w*|greys?|greyed|greying|centred|centre|behaviours?|organis\w+|customis\w+|initialis\w+|synchronis\w+|licence|catalogue|analys(?:e|ed|es|ing)|normalis\w+|recognis\w+|authoris\w+|summaris\w+|visualis\w+|optimis\w+|artefacts?|neighbours?|labelled|labelling|honour\w*|whilst|amongst)\b/i;

/** The terms of the style guide's table that a page does not use, and what to write. */
export const AVOIDED = [
  { pattern: /\bworkflows?\b/i, say: "flow" },
  { pattern: /\baccess releases?\b/i, say: "access change" },
  { pattern: /\bPublished apps\b/, say: "Apps" },
  { pattern: /\bActivate this version\b/i, say: "Deploy this version" },
];

/** The text with fenced blocks and code spans blanked, keeping every line where it was. */
export function outsideCode(text) {
  const lines = text.split("\n");
  let fence = null;
  return lines.map((line) => {
    const opened = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (opened && opened[1][0] === fence[0] && opened[1].length >= fence.length) fence = null;
      return "";
    }
    if (opened) {
      fence = opened[1];
      return "";
    }
    return line.replace(/(`+)[^`]*?\1/g, " ");
  });
}

/** Every use of an avoided word or a British spelling in prose: `{ line, word, say }`. */
export function wordProblems(text) {
  const found = [];
  outsideCode(text).forEach((line, index) => {
    for (const { pattern, say } of AVOIDED) {
      const hit = line.match(pattern);
      if (hit) found.push({ line: index + 1, word: hit[0], say });
    }
    const british = line.match(BRITISH);
    if (british) found.push({ line: index + 1, word: british[0], say: "the American spelling" });
  });
  return found;
}
