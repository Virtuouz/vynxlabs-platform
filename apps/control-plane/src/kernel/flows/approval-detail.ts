import { redact } from "../execution/redact.js";

/**
 * The detail of an approval as anyone is shown it: the queue, the widget, the mail, the page
 * its link opens, and the MCP tool all call this, so they cannot differ. Secret-looking
 * values are masked, and what is stored is never changed.
 */
export function approvalDetail(detail: unknown): unknown {
  return redact(detail ?? null);
}
