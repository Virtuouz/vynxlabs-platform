import { Notice } from "@volvel/ui";
import type { ReactNode } from "react";
import { useLoad } from "../api.ts";
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
    case "connection_group":
      return `${link}/connections`;
    // The workspace's own settings are where its default alert is set.
    case "workspace":
      return `${link}/alerts`;
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

/**
 * A trigger as the Triggers screen and runs name it: its path, and the node
 * for one inside a flow (`path#node`). A link to one carries this, so that
 * Triggers opens with it chosen.
 */
export const triggerKey = (trigger: { path: string; node?: string | null }) =>
  trigger.node ? `${trigger.path}#${trigger.node}` : trigger.path;

/** A thing's name, as a link to its home. */
export function ObjectLink({
  link,
  kind,
  path,
  children,
  className = "font-mono text-code",
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

interface WorkspaceRef {
  id: string;
  name: string;
  type: "dev" | "production";
  linkedWorkspaceId?: string | null;
}

/**
 * Where code for this workspace is written: itself when it is a dev workspace,
 * or the dev workspace that promotes to it. Its console address and name.
 */
export function useDevWorkspace(
  root: string,
): { id: string; name: string; link: string; here: boolean } | undefined {
  const tenantRoot = root.split("/workspaces/")[0] as string;
  const here = useLoad<WorkspaceRef>(root);
  const all = useLoad<{ items: WorkspaceRef[] }>(
    here.data && here.data.type !== "dev" ? `${tenantRoot}/workspaces` : null,
  );
  const dev =
    here.data?.type === "dev"
      ? here.data
      : all.data?.items.find(
          (one) => one.type === "dev" && one.linkedWorkspaceId === here.data?.id,
        );
  if (!here.data || !dev) return undefined;
  return {
    id: dev.id,
    name: dev.name,
    link: `${consoleLink(tenantRoot)}/workspaces/${dev.id}`,
    here: dev.id === here.data.id,
  };
}

/**
 * Said on a production workspace's editor: what is shown is changed in dev and
 * reaches here by promotion. Links to the same thing in the dev workspace.
 */
export function ProductionNotice({
  root,
  noun,
  edit,
}: {
  root: string;
  /** "Code", "Flows", "Resources". */
  noun: string;
  /** The same thing's address inside a workspace: `scripts/edit/orders/sync`. */
  edit?: string | undefined;
}) {
  const dev = useDevWorkspace(root);
  return (
    <Notice
      tone="attention"
      action={
        dev && !dev.here ? (
          <Link to={`${dev.link}/${edit ?? ""}`} className="text-meta font-medium">
            {edit ? `Edit it in ${dev.name}` : `Go to ${dev.name}`}
          </Link>
        ) : undefined
      }
    >
      This is a production workspace. {noun} {noun.endsWith("s") ? "are" : "is"} changed in{" "}
      {dev && !dev.here ? dev.name : "a dev workspace"} and reach
      {noun.endsWith("s") ? "" : "es"} production by promotion.
    </Notice>
  );
}
