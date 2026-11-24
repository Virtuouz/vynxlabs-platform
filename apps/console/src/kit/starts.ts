import type { FlowTrigger } from "@volvel/manifest";

/**
 * What started a run, in words. One map for the flow list, a flow's runs, and the run
 * pages, so a kind of start is never shown as the raw word it is stored as.
 */
export const STARTED_BY: Record<string, string> = {
  manual: "By hand",
  schedule: "Schedule",
  webhook: "Webhook",
  event: "Event",
  form: "Form",
  flow: "Another flow",
  alert: "Failure handler",
  rerun: "Re-run",
  retry: "Retry",
};

/** The same, as the end of a sentence: "Started 3 minutes ago by a webhook". */
export const STARTED_ON: Record<string, string> = {
  manual: "by hand",
  schedule: "by its schedule",
  webhook: "by a webhook",
  event: "by an event",
  form: "by a form",
  flow: "by another flow",
  alert: "by a failure handler",
  rerun: "as a re-run",
  retry: "as a retry",
};

/** Every kind of start a flow may have, for a test to say that each has words. */
export const FLOW_START_TYPES: readonly FlowTrigger["type"][] = [
  "manual",
  "schedule",
  "webhook",
  "event",
  "form",
];
