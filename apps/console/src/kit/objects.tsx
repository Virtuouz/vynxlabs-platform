import type { ReactNode } from "react";
import { Link } from "../router.tsx";

/** The console address of a workspace from its API address: `/tenants/t/workspaces/w` → `/t/t/workspaces/w`. */
export const consoleLink = (root: string) => root.replace(/^\/tenants\//, "/t/");

/**
 * Where a thing lives in the console, by its kind and path: the page that is
 * its home. Every path, name and version shown anywhere links here.
 */
export function objectHref(link: string, kind: string, path: string): string {
  const at = encodeURI(path);
  switch (kind) {
    case "script":
      return `${link}/scripts/${at}`;
    case "flow":
      return `${link}/flows/${at}`;
    case "connection":
      return `${link}/connections/${at}`;
    case "variable":
      return `${link}/variables/${at}`;
    case "secret":
      return `${link}/secrets/${at}`;
    case "event":
      return `${link}/events/${at}`;
    case "table":
      return `${link}/tables/${at}`;
    case "interface":
      return `${link}/screens/${at}`;
    case "app":
      return `${link}/apps`;
    case "trigger":
    case "schedule":
      return `${link}/triggers?trigger=${encodeURIComponent(path)}`;
    case "connector":
    case "trigger_source":
      return `${link}/extensions/${kind}/edit/${at}`;
    default:
      return `${link}/resources/edit/${kind}/${at}`;
  }
}

/** A thing's name, as a link to its home. */
export function ObjectLink({
  link,
  kind,
  path,
  children,
  className = "font-mono text-telemetry",
}: {
  link: string;
  kind: string;
  path: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link to={objectHref(link, kind, path)} className={className}>
      {children ?? path}
    </Link>
  );
}

/** "Script", "Flow", "Schedule" … for a kind's name in a list. */
export const kindName = (kind: string) =>
  `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1).replaceAll("_", " ")}`;
