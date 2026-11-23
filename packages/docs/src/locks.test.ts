import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { topicsAsked } from "../asked.mjs";
import { loadDocs } from "../load.mjs";
import { nameLines, nameProblems, pathProblems, readLock } from "../locks.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONSOLE = join(HERE, "../../apps/console/src");

test("the topics the console asks for are seen however they are written", () => {
  const { topics, problems } = topicsAsked(
    [
      'useHelpTopic("a-topic");',
      "openHelp(`reference/errors#${code}`);",
      "useHelpTopic(editing ? 'ternary-topic' : undefined);",
      '<HelpTopic topic="jsx-topic" />',
      '<HelpTopic topic={"braced-topic"} />',
      'const x = { help: "object-topic", other: 1 };',
      "openHelp();",
      "openHelp(undefined);",
      "export function openHelp(target?: HelpTarget) {}",
      "key: `page-help:${page.id}`,",
    ].join("\n"),
  );
  expect(topics.map((one) => one.topic).sort()).toEqual([
    "a-topic",
    "braced-topic",
    "jsx-topic",
    "object-topic",
    "reference/errors",
    "ternary-topic",
  ]);
  expect(problems).toEqual([]);
});

test("a topic that is made at run time is said, unless its line says why", () => {
  const { problems } = topicsAsked(
    [
      "openHelp(`area-${name}`);",
      "openHelp(pick);",
      "// docs:dynamic from a link\nopenHelp(pick);",
    ].join("\n"),
  );
  expect(problems.map((one) => one.line)).toEqual([1, 2]);
});

test("the error toast of the console asks for the topic errors, which the build has", () => {
  const { topics } = topicsAsked(readFileSync(join(CONSOLE, "ask.tsx"), "utf8"));
  expect(topics.map((one) => one.topic)).toContain("errors");
  expect(loadDocs().set.topics.errors).toBeDefined();
});

test("a released path that is neither a page nor redirected is said (paths.lock)", () => {
  const pages = new Set(["a", "b/c"]);
  expect(pathProblems({ released: ["a", "b/c", "old"], pages, redirects: {} })).toHaveLength(1);
  expect(pathProblems({ released: ["a", "old"], pages, redirects: { old: "a" } })).toEqual([]);
});

test("a released name that vanished, and a new one that does not start volvel-, are said (names.lock)", () => {
  const locked = nameLines(["gone", "kept"], ["term-a"]);
  const problems = nameProblems({
    locked,
    topics: ["kept", "fresh", "volvel-fresh"],
    terms: ["term-a"],
    prefix: "volvel-",
  });
  expect(problems).toHaveLength(2);
  expect(problems[0]).toContain('topic "gone"');
  expect(problems[1]).toContain('"fresh" is new');
});

test("every path and name released so far is still there", () => {
  const { set, redirects } = loadDocs();
  expect(readLock(join(HERE, "paths.lock")).length).toBeGreaterThan(90);
  expect(
    pathProblems({ released: readLock(join(HERE, "paths.lock")), pages: set.pages, redirects }),
  ).toEqual([]);
  expect(
    nameProblems({
      locked: readLock(join(HERE, "names.lock")),
      topics: Object.keys(set.topics),
      terms: Object.keys(set.terms),
      prefix: "volvel-",
    }),
  ).toEqual([]);
});
