/**
 * A manifest problem as a person reads it. The build and the control plane
 * name where a problem is by its address in the manifest ("/body/nodes/mail/with/to",
 * "/body/edges/2"); a person names a step, or a connection. One piece for the
 * refusal of a deploy, a promotion, and the flow editor's own list.
 */
export function inWords(message: string): string {
  const match = /^\/body\/([^\s]+)\s+(.*)$/s.exec(message);
  if (!match) return message;
  const [, address = "", rest = ""] = match;
  const [kind, id, ...field] = address.split("/");
  const said = rest.charAt(0).toUpperCase() + rest.slice(1);
  if (kind === "nodes" && id)
    return `${id}${field.length > 0 ? `, ${field.join(" ").replace(/_/g, " ")}` : ""}: ${rest}`;
  if (kind === "edges" && id && /^\d+$/.test(id))
    return `Connection ${Number(id) + 1}${field.length > 0 ? ` (${field.join(" ")})` : ""}: ${rest}`;
  return `${[kind, id, ...field].filter(Boolean).join(" ")}: ${said}`;
}
