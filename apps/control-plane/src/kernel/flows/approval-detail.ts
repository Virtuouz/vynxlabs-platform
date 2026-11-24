import { type Known, redact, redactText } from "../execution/redact.js";

/**
 * The detail of an approval as anyone is shown it: the queue, the widget, the mail, the page
 * its link opens, and the MCP tool all call this, so they cannot differ. Secret-looking
 * values are masked, and what is stored is never changed. `known` is what the flow run was
 * given (`flowKnown`): a detail written as a text from a secret field holds its characters, and
 * is masked by them like any text.
 */
export function approvalDetail(detail: unknown, known?: Known): unknown {
  return redact(detail ?? null, undefined, known);
}

/**
 * The title of an approval as anyone is shown it: in the queue, the widget, the mail's subject
 * and text, the page its link opens and the MCP tool. A title is written by the flow's author, and
 * may hold a value the run was given; it is masked by those values like any text.
 */
export function approvalTitle(title: unknown, known?: Known): string {
  return redactText(typeof title === "string" ? title : String(title ?? ""), known);
}
