import { expect, test } from "vitest";
import { AUDIT_ACTIONS, AUDIT_AREAS, actionWords, auditAreaOf } from "./audit.js";

test("every action is written area.verb, once, and has an area a log can narrow to", () => {
  expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  const areas = new Set(AUDIT_AREAS.map((one) => one.area));
  expect(areas.size).toBe(AUDIT_AREAS.length);
  for (const action of AUDIT_ACTIONS) {
    expect(action, action).toMatch(/^[a-z][a-z_]*\.[a-z][a-z0-9_.]*$/);
    expect(areas.has(auditAreaOf(action)), action).toBe(true);
  }
  for (const one of AUDIT_AREAS) expect(one.tenant ?? one.instance, one.area).toBeTruthy();
});

test("an action is read in plain words", () => {
  expect(actionWords("end_user.signed_in")).toBe("End user signed in");
  expect(actionWords("run.cancelled")).toBe("Run canceled");
  expect(actionWords("access.released")).toBe("Access change applied");
});
