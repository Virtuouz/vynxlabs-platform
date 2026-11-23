import { expect, test } from "vitest";
import { grants, PERMISSION_KINDS, setEveryone, setPermission } from "./permissions.js";

const kinds = PERMISSION_KINDS.map((entry) => ({
  kind: entry.kind,
  scope: entry.scope,
  explicit: entry.explicit === true,
  verbs: Object.keys(entry.verbs),
}));
const explicit = PERMISSION_KINDS.filter((entry) => entry.explicit).flatMap((entry) =>
  Object.keys(entry.verbs).map((verb) => `${entry.kind}:${verb}`),
);

test("unticking a box under a wildcard writes out only what the wildcard gave", () => {
  expect(explicit.length).toBeGreaterThan(0);
  for (const wildcard of [["*:*"], ["*:read"]]) {
    const next = setPermission(wildcard, kinds, "secret", "write", false);
    // Nothing the wildcard never gave is named by it now.
    expect(next.filter((one) => explicit.includes(one))).toEqual([]);
    expect(next).not.toContain("secret:write");
    expect(grants(next, "data:read")).toBe(true);
  }
});

test("an explicit permission is not shown as given by a wildcard, and ticking it names it", () => {
  const [first] = explicit as [string];
  const [kind, verb] = first.split(":") as [string, string];
  expect(grants(["*:*"], first)).toBe(false);
  expect(setPermission(["*:*"], kinds, kind, verb, true)).toEqual(["*:*", first]);
});

test("everything for one verb touches only its own wildcard, and keeps what is named explicit", () => {
  const [first] = explicit.filter((one) => one.endsWith(":read")) as [string];
  expect(setEveryone([first, "run:*"], kinds, "read", true).sort()).toEqual(
    [first, "run:*", "*:read"].sort(),
  );
  expect(setEveryone(["*:read", first, "run:*"], kinds, "read", false).sort()).toEqual(
    [first, "run:write"].sort(),
  );
  expect(setEveryone(["*:*"], kinds, "read", false)).toEqual(["*:write"]);
});

test("trigger:write says it pauses and resumes, as the routes it guards do (OPS-40)", () => {
  const trigger = PERMISSION_KINDS.find((entry) => entry.kind === "trigger");
  expect(trigger?.verbs.write).toMatch(/Pause and resume/);
});
