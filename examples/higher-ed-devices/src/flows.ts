import { defineFlow, defineSchedule, step, trigger, z } from "@vynxlabs/sdk";
import { AUTO_APPROVED, requestSubmitted } from "./model.ts";
import { decideRequest, markOverdue } from "./scripts.ts";

/**
 * Every request is reviewed: a calculator or a charger is approved at once; a
 * laptop, a hotspot or an iPad waits for someone on the Tech Desk. A rejection,
 * or nobody deciding within three days, denies the request.
 */
export const review = defineFlow({
  path: "requests/review",
  description:
    "Approves small things at once and asks the Tech Desk about the rest. Approving sets a device aside or waitlists the request.",
  nodes: {
    submitted: trigger.event(requestSubmitted),
    by_hand: trigger.manual({
      input: z.object({
        request: z.string().describe("The request's number, such as REQ-7KQ2M."),
        kind: z.string(),
        student: z.string(),
      }),
    }),
    route: step.branch({
      small: `trigger.kind in ${JSON.stringify(AUTO_APPROVED).replaceAll('"', "'")}`,
    }),
    ask: step.approval("Lend a device", {
      detail: "{'request': trigger.request, 'kind': trigger.kind, 'student': trigger.student}",
      timeoutSeconds: 3 * 24 * 3600,
      approvers: { groups: ["tech-desk"] },
    }),
    approve: step.script(decideRequest, {
      input: "{'request': trigger.request, 'decision': 'approve'}",
    }),
    deny: step.script(decideRequest, {
      input:
        "{'request': trigger.request, 'decision': 'deny', 'note': 'The Tech Desk did not approve this request.'}",
    }),
  },
  edges: [
    ["submitted", "route"],
    ["by_hand", "route"],
    ["route", "approve", { when: "small" }],
    ["route", "ask", { when: "otherwise" }],
    ["ask", "approve"],
    ["ask", "deny", { error: true }],
  ],
});

/** Each weekday morning, before the desk opens. */
export const overdueEachMorning = defineSchedule({
  path: "loans/overdue-each-morning",
  script: markOverdue,
  cron: "0 7 * * 1-5",
  timezone: "America/Chicago",
});
