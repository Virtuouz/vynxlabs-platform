// What a product page needs beside it: a fact-check record for every page, and a run log for a
// tutorial or how-to. Pages that have none today are in unchecked.json, which only gets shorter.

/** The pages of `written` (paths) with `types` that lack a record or a log, as problems. */
export function recordProblems({ written, types, has, unchecked }) {
  const problems = [];
  const missing = new Set();
  for (const path of [...written].sort()) {
    if (path === "index" || path.endsWith("/index")) continue;
    const need = [];
    if (!has(`factcheck/${path}.md`)) need.push(`packages/docs/records/factcheck/${path}.md`);
    if ((types[path] === "tutorial" || types[path] === "how-to") && !has(`runs/${path}.md`)) {
      need.push(`packages/docs/records/runs/${path}.md`);
    }
    if (need.length === 0) continue;
    missing.add(path);
    if (!unchecked.includes(path)) {
      problems.push(
        `${path}.md  has no ${need.join(" and no ")}. A page is not finished without them (see packages/docs/records/style-guide.md, "How a page is made").`,
      );
    }
  }
  for (const path of unchecked) {
    if (!missing.has(path)) {
      problems.push(
        `unchecked.json  "${path}" has what it needs now, or is no longer a page. Take it out.`,
      );
    }
  }
  return problems;
}
