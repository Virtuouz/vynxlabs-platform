import { expect, test } from "vitest";
import { ERROR_CODES } from "./errors.js";
import { PERMISSION_KINDS } from "./permissions.js";

const words = (entry: { title: string; help: string }) => `${entry.title} ${entry.help}`;

test("VOC-52, VOC-57: only the access codes keep the word release, and they say access change", () => {
  for (const [name, entry] of Object.entries(ERROR_CODES)) {
    expect(words(entry), name).not.toMatch(/\breleas/i);
  }
  expect(words(ERROR_CODES.release_stale)).toContain("access change");
});

test("VOC-52: the access permission is named access changes", () => {
  const access = PERMISSION_KINDS.find((entry) => entry.kind === "access");
  expect(access?.label).toBe("Access changes");
  expect(`${access?.verbs.read} ${access?.verbs.write}`).not.toMatch(/\breleas/i);
});

test("the help for validation_failed names the field the response uses: errors", () => {
  expect(ERROR_CODES.validation_failed.help).toContain("under `errors`");
  expect(ERROR_CODES.validation_failed.help).not.toContain("issues");
});
