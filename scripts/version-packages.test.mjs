import { expect, test } from "vitest";
import { changelogSection, insertSection, sectionFor } from "./version-packages.mjs";

const changesets = [
  {
    id: "one",
    summary:
      "### For tenant developers\n\n- **`volvel run` takes `--json`.** It prints the run as JSON.",
  },
  { id: "two", summary: "- **A typo in the sign-in page.** It reads right now." },
  {
    id: "three",
    summary:
      "### For operators\n\n- **A waiting run says why.**\n\n### For tenant developers\n\n- **A table can be renamed in the console.**",
  },
];

test("a section groups what the changesets say by audience, operators first and the rest last", () => {
  const section = changelogSection(changesets, "0.6.0", "2026-12-01");
  const expected = [
    "## 0.6.0 (2026-12-01)",
    "### For operators",
    "- **A waiting run says why.**",
    "### For tenant developers",
    "- **`volvel run` takes `--json`.** It prints the run as JSON.\n\n- **A table can be renamed in the console.**",
    "### Changes",
    "- **A typo in the sign-in page.** It reads right now.",
  ];
  expect(section).toBe(`${expected.join("\n\n")}\n`);
});

test("a heading no changeset uses is not written", () => {
  const section = changelogSection([changesets[1]], "0.6.1", "2026-12-02");
  expect(section).not.toContain("For operators");
  expect(section).toContain("### Changes");
});

test("the section goes above the newest version, under the changelog's opening words", () => {
  const changelog = "# Changelog\n\nWhat this is.\n\n## Unreleased: phase 31\n\nOld words.\n";
  const result = insertSection(changelog, "## 0.6.0 (2026-12-01)\n\nNew words.\n");
  expect(result).toBe(
    "# Changelog\n\nWhat this is.\n\n## 0.6.0 (2026-12-01)\n\nNew words.\n\n## Unreleased: phase 31\n\nOld words.\n",
  );
});

test("a version's notes are its section without the heading, and not the next version's", () => {
  const changelog =
    "# Changelog\n\n## 0.6.1 (2026-12-02)\n\n### Changes\n\n- one\n\n## 0.6.0 (2026-12-01)\n\n- two\n";
  expect(sectionFor(changelog, "0.6.1")).toBe("### Changes\n\n- one");
  expect(sectionFor(changelog, "0.6.0")).toBe("- two");
  expect(sectionFor(changelog, "0.6")).toBeUndefined();
});
