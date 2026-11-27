import { expect, test } from "vitest";
import { recordProblems } from "../records.mjs";
import { wordProblems } from "../words.mjs";

test("avoided words and British spellings are found in prose, with their line", () => {
  const found = wordProblems(
    "Open the Workflow.\nNo problem here.\nThe access release is Published apps.\nPress Activate this version.\nIt was cancelled in colour.",
  );
  expect(found.map((one) => `${one.line}:${one.word}`)).toEqual([
    "1:Workflow",
    "3:access release",
    "3:Published apps",
    "4:Activate this version",
    "5:cancelled",
  ]);
});

test("a code span or a fence may hold them", () => {
  expect(
    wordProblems(
      "The field `cancelled` and ``workflow``.\n\n```yaml\nworkflow: a\ncolour: b\n```\n\n~~~\nWorkflow\n~~~\nA flow.",
    ),
  ).toEqual([]);
  // A fence that is not closed hides the rest, and a page after it is read afresh.
  expect(wordProblems("```\nx\n```\nworkflow")).toHaveLength(1);
});

const has =
  (...files: string[]) =>
  (path: string) =>
    files.includes(path);

test("a page with no fact-check record is refused, and a tutorial or how-to also needs a run log", () => {
  const types = { "a/how-to/x": "how-to", "a/ref/y": "reference" };
  const written = ["a/index", "a/how-to/x", "a/ref/y"];
  const out = recordProblems({ written, types, has: has(), unchecked: [] });
  expect(out).toHaveLength(2);
  expect(out[0]).toContain(
    "factcheck/a/how-to/x.md and no packages/docs/records/runs/a/how-to/x.md",
  );
  expect(out[1]).toContain("factcheck/a/ref/y.md");
  expect(out[1]).not.toContain("runs/");
  expect(
    recordProblems({
      written,
      types,
      has: has("factcheck/a/how-to/x.md", "factcheck/a/ref/y.md"),
      unchecked: [],
    }),
  ).toHaveLength(1);
  expect(
    recordProblems({
      written,
      types,
      has: has("factcheck/a/how-to/x.md", "runs/a/how-to/x.md", "factcheck/a/ref/y.md"),
      unchecked: [],
    }),
  ).toEqual([]);
});

test("the ratchet lets listed pages be, and refuses a new page and a stale entry", () => {
  const types = { "a/old": "reference", "a/new": "reference" };
  expect(recordProblems({ written: ["a/old"], types, has: has(), unchecked: ["a/old"] })).toEqual(
    [],
  );
  const fresh = recordProblems({
    written: ["a/old", "a/new"],
    types,
    has: has(),
    unchecked: ["a/old"],
  });
  expect(fresh).toHaveLength(1);
  expect(fresh[0]).toContain("a/new.md");
  const stale = recordProblems({
    written: ["a/old"],
    types,
    has: has("factcheck/a/old.md"),
    unchecked: ["a/old", "a/gone"],
  });
  expect(stale).toHaveLength(2);
  expect(stale.join("\n")).toContain('"a/old"');
  expect(stale.join("\n")).toContain('"a/gone"');
});
