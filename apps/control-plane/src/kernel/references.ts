import {
  type DashboardBody,
  type FlowBody,
  flowGrants,
  flowReferences,
  type InterfaceBody,
  widgetFlows,
  widgetTables,
} from "@volvel/manifest";
import type { Db } from "./audit.js";

/** Something a resource can depend on, by kind and name. */
export type TargetKind =
  | "connection"
  | "connection_group"
  | "secret"
  | "variable"
  | "table"
  | "script"
  | "flow"
  | "event"
  | "interface";

export interface Reference {
  target: { kind: TargetKind; name: string };
  /** The resource that uses it. */
  by: { kind: string; path: string };
  /** How, in a few words: "reads it", "starts it", "is given it in step send". */
  how: string;
  /** Set when the use is in a draft, not yet deployed. */
  draft?: boolean;
}

interface ScriptLike {
  uses?: {
    connections?: string[];
    connectionGroups?: string[];
    secrets?: string[];
    variables?: string[];
    tables?: string[];
  };
  onFailure?: { notify?: string; script?: string };
}

/**
 * Who uses what in a workspace, worked out from what is deployed there: the
 * connections, secrets, variables and tables scripts declare, the scripts and
 * flows that flows and triggers start, the events flows listen for, and the
 * interfaces apps serve. Nothing is stored: it is read from the bodies each time.
 */
export async function workspaceReferences(
  db: Db,
  workspaceId: string,
  options: { drafts?: boolean } = {},
): Promise<Reference[]> {
  const deployed = await db
    .selectFrom("resource")
    .select(["kind", "path", "body"])
    .where("workspace_id", "=", workspaceId)
    .execute();
  // With drafts, a draft speaks for its path in place of what is deployed there, and a
  // draft that deletes a resource takes its uses away.
  const drafts = options.drafts
    ? await db
        .selectFrom("resource_draft")
        .select(["kind", "path", "body", "deleted"])
        .where("workspace_id", "=", workspaceId)
        .execute()
    : [];
  const drafted = new Set(drafts.map((draft) => draft.path));
  const resources = [
    ...deployed
      .filter((resource) => !drafted.has(resource.path))
      .map((one) => ({ ...one, draft: false })),
    ...drafts.filter((draft) => !draft.deleted).map((one) => ({ ...one, draft: true })),
  ];
  const found: Reference[] = [];
  let fromDraft = false;
  const add = (
    kind: TargetKind,
    name: string | undefined,
    by: { kind: string; path: string },
    how: string,
  ) => {
    if (name)
      found.push({ target: { kind, name }, by, how, ...(fromDraft ? { draft: true } : {}) });
  };
  for (const resource of resources) {
    fromDraft = resource.draft;
    const by = { kind: resource.kind, path: resource.path };
    const body = resource.body as Record<string, unknown>;
    if (
      resource.kind === "script" ||
      resource.kind === "connector" ||
      resource.kind === "trigger_source"
    ) {
      const script = body as ScriptLike;
      for (const name of script.uses?.connections ?? []) add("connection", name, by, "calls it");
      for (const name of script.uses?.connectionGroups ?? [])
        add("connection_group", name, by, "picks a member of it");
      for (const name of script.uses?.secrets ?? []) add("secret", name, by, "reads it");
      for (const name of script.uses?.variables ?? []) add("variable", name, by, "reads it");
      for (const name of script.uses?.tables ?? []) add("table", name, by, "reads and writes it");
      add("connection", script.onFailure?.notify, by, "sends its failures through it");
      add("script", script.onFailure?.script, by, "starts it when it fails");
    }
    if (resource.kind === "flow") {
      const flow = body as unknown as FlowBody;
      for (const reference of flowReferences(flow)) {
        const step = reference.path.split("/")[3] ?? "";
        add(
          reference.kind,
          reference.target,
          by,
          reference.kind === "event" ? `listens for it in ${step}` : `starts it in step ${step}`,
        );
      }
      for (const grant of flowGrants(flow)) {
        const step = grant.path.split("/")[3] ?? "";
        add(grant.kind, grant.target, by, `gives it to ${grant.script} in step ${step}`);
      }
      for (const [id, node] of Object.entries(flow.nodes ?? {})) {
        if (node.type === "trigger") {
          const trigger = node.trigger as {
            type: string;
            event?: string;
            verify?: { secret?: string };
          };
          add("event", trigger.event, by, `starts on it (${id})`);
          add("secret", trigger.verify?.secret, by, `checks signatures with it (${id})`);
        }
      }
    }
    if (resource.kind === "trigger" || resource.kind === "schedule") {
      const trigger = body as {
        script?: string;
        flow?: string;
        verify?: { secret?: string };
        event?: string;
      };
      add(
        "script",
        trigger.script,
        by,
        resource.kind === "schedule" ? "runs it on a schedule" : "starts it",
      );
      add("flow", trigger.flow, by, "starts it");
      add("secret", trigger.verify?.secret, by, "checks signatures with it");
      add("event", trigger.event, by, "listens for it");
    }
    if (resource.kind === "interface" || resource.kind === "dashboard") {
      const widgets =
        resource.kind === "interface"
          ? ((body as unknown as InterfaceBody).pages ?? []).flatMap((page) => page.widgets ?? [])
          : ((body as unknown as DashboardBody).widgets ?? []);
      for (const table of widgetTables(widgets)) add("table", table, by, "shows it");
      for (const path of widgetFlows(widgets)) add("flow", path, by, "asks for its approvals");
    }
    if (resource.kind === "app") {
      const app = body as { interface?: string; reads?: string[] };
      add("interface", app.interface, by, "serves it");
      for (const table of app.reads ?? []) add("table", table, by, "reads it");
    }
  }
  // The workspace's own default alert uses what it names, and is no resource.
  const workspace = await db
    .selectFrom("workspace")
    .select("failure_alert")
    .where("id", "=", workspaceId)
    .executeTakeFirst();
  const settings = { kind: "workspace", path: "settings" };
  const alert = workspace?.failure_alert;
  if (alert?.notify)
    found.push({
      target: { kind: "connection", name: alert.notify },
      by: settings,
      how: "sends its failures through it",
    });
  if (alert?.script)
    found.push({
      target: { kind: "script", name: alert.script },
      by: settings,
      how: "starts it when a run fails",
    });
  return found;
}
