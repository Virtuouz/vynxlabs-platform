import { walk } from "@volvel/markup";
import type { DocEntry, DocIssue } from "./page.js";

/**
 * The four kinds of page, by what the reader is doing (Diátaxis). A page's
 * type is its own `type:`, or else the `type:` of the nearest folder index
 * above it. A folder's index is a landing page: it labels what is under it
 * and has no type itself. A site that says none of this has no types, and is
 * drawn as it always was.
 */
export const DOC_TYPES = ["tutorial", "how-to", "reference", "explanation"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** The words a reader meets for each type. */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  tutorial: "Tutorial",
  "how-to": "How-to guide",
  reference: "Reference",
  explanation: "Explanation",
};

/** The types as a group of pages is headed: on a collection's cards and in the Related block. */
export const DOC_TYPE_PLURALS: Record<DocType, string> = {
  tutorial: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanations",
};

/** What each type is for, in a line: shown on a collection's landing page. */
export const DOC_TYPE_SUMMARIES: Record<DocType, string> = {
  tutorial: "Learn by building something, one step at a time.",
  "how-to": "Get one task done.",
  reference: "Look up how something is, exactly.",
  explanation: "Understand how it works and why.",
};

export const isDocType = (value: unknown): value is DocType =>
  typeof value === "string" && (DOC_TYPES as readonly string[]).includes(value);

/** The most subjects of a page that count. */
export const MAX_SUBJECTS = 5;

const isIndex = (path: string) => path === "index" || path.endsWith("/index");

/**
 * The type of a page: its own, and for a page that is not a folder's index,
 * else the nearest index above it that says one. `own` reads what a page
 * says for itself. An index has no type of its own, so is `undefined`.
 */
export function effectiveType(path: string, own: (path: string) => unknown): DocType | undefined {
  if (isIndex(path)) return undefined;
  const mine = own(path);
  if (isDocType(mine)) return mine;
  return folderType(path, own);
}

/** What a folder's index says is under it: the nearest, going up. */
export function folderType(path: string, own: (path: string) => unknown): DocType | undefined {
  // `a/b/page` asks `a/b/index`, `a/index` and `index`; `a/b/index` asks from `a`.
  let parts = path.split("/").slice(0, -1);
  if (isIndex(path)) parts = parts.slice(0, -1);
  for (;;) {
    const found = own(parts.length === 0 ? "index" : `${parts.join("/")}/index`);
    if (isDocType(found)) return found;
    if (parts.length === 0) return undefined;
    parts = parts.slice(0, -1);
  }
}

/** The lints of the typed pages. Each is a warning: a deploy is never refused for one. */
export const DIATAXIS_CODES = [
  "type_unknown",
  "subjects_many",
  "subject_once",
  "type_folder",
  "type_steps_missing",
  "type_steps_present",
  "type_title",
  "type_goal_missing",
] as const;

/** Whether a page has a numbered list or a `steps` block. */
function hasSteps(entry: DocEntry): boolean {
  for (const { node } of walk(entry.tree)) {
    if (node.type === "list" && node.ordered) return true;
    if (node.type === "component" && node.name === "steps") return true;
  }
  return false;
}

const NOT_A_TASK = /^(about|overview|introduction|understanding|reference|guide to|what is|why)\b/i;

export interface DiataxisContext {
  /** The page's type, as `effectiveType` works it out. */
  type: DocType | undefined;
  /** Whether a folder above the page says a type. Left out, that is not asked. */
  folderTyped?: boolean;
  /** How many pages have each subject. Left out, a subject used once is not said. */
  subjectUses?: (subject: string) => number;
}

/**
 * What is not as it should be about a page's type and subjects. A page with
 * none of them says nothing, so a site that does not use types is never told
 * anything. A folder's index is a landing page, so only what it says for
 * itself is read.
 */
export function diataxisIssues(entry: DocEntry, context: DiataxisContext): DocIssue[] {
  const issues: DocIssue[] = [];
  const warn = (code: string, message: string) => {
    issues.push({
      path: entry.path,
      line: 1,
      column: 1,
      code,
      message,
      severity: "warning",
    });
  };
  const { type: written, subjects } = entry.frontmatter;
  if (written !== undefined && !isDocType(written)) {
    warn(
      "type_unknown",
      `The type "${written}" is none of ${DOC_TYPES.join(", ")}. The page is treated as having no type.`,
    );
  }
  if (subjects && subjects.length > MAX_SUBJECTS) {
    warn(
      "subjects_many",
      `This page names ${subjects.length} subjects, and the first ${MAX_SUBJECTS} are used. Keep the ones a reader would look for.`,
    );
  }
  if (isIndex(entry.path)) return issues;
  for (const subject of (subjects ?? []).slice(0, MAX_SUBJECTS)) {
    if (context.subjectUses && context.subjectUses(subject) === 1) {
      warn(
        "subject_once",
        `The subject "${subject}" is on no other page, so it relates this page to nothing. Use it on a page of another type, or take it out.`,
      );
    }
  }
  const { type } = context;
  if (type === undefined) return issues;
  if (isDocType(written) && context.folderTyped === false) {
    warn(
      "type_folder",
      `This page says it is a ${type}, in a folder whose index says no type. Put type: ${type} on the folder's index.md so that every page in it has it.`,
    );
  }
  const steps = hasSteps(entry);
  if ((type === "tutorial" || type === "how-to") && !steps) {
    warn(
      "type_steps_missing",
      `A ${type} is followed in order, and this page has no numbered steps. Write them as a numbered list or a :::steps block.`,
    );
  }
  if ((type === "reference" || type === "explanation") && steps) {
    warn(
      "type_steps_present",
      `A ${type} is read, not followed, and this page has numbered steps. Move the steps to a how-to and link to it.`,
    );
  }
  const title = entry.frontmatter.title;
  if (
    (type === "tutorial" || type === "how-to") &&
    (NOT_A_TASK.test(title) || title.endsWith("?"))
  ) {
    warn(
      "type_title",
      `A ${type}'s title says what the reader will do ("Connect a table to a flow"), and "${title}" does not.`,
    );
  }
  if (type === "how-to") {
    const headed = [...walk(entry.tree)].some(({ node }) => node.type === "heading");
    if (!headed) {
      warn(
        "type_goal_missing",
        "A how-to opens with a heading that says its goal, then gives the steps. This page has no heading.",
      );
    }
  }
  return issues;
}

/** The source a new page of each type starts from, under its frontmatter. */
export const DOC_TEMPLATES: Record<DocType, string> = {
  tutorial:
    "In this tutorial you will build something small, and it works at the end. It takes about ten minutes.\n\n## Before you start\n\nWhat the reader needs: an account, a table, ten minutes.\n\n:::steps\n1. The first thing to do, and what they see when it works.\n2. The next thing.\n:::\n\n## What you built\n\nWhat now exists, and where to go next.\n",
  "how-to":
    "## Do the thing\n\nOne sentence on what the reader will have done at the end.\n\n## Before you start\n\nWhat the reader needs, and who can give it.\n\n:::steps\n1. The first step.\n2. The next step.\n:::\n\n## The result\n\nWhat the reader now sees.\n\n## If it does not work\n\nThe one or two things that go wrong, and what to do.\n",
  reference:
    "What this is, in a sentence. Then the facts, in tables and lists, in a fixed order.\n\n## Fields\n\n| Name | What it is |\n| --- | --- |\n| | |\n",
  explanation:
    "Why this is the way it is, in prose, with the ideas in order.\n\n## The idea\n\nWhat it is for.\n\n## How it fits\n\nWhat it works with, and what it leaves to others.\n",
};
