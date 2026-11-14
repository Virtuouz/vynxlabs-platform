import { type FlowBody, flowGrants, flowReferences } from "@vynxlabs/manifest";
import type { Db } from "./audit.js";

/** Something a resource can depend on, by kind and name. */
export type TargetKind =
  | "connection"
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
}

interface ScriptLike {
  uses?: { connections?: string[]; secrets?: string[]; variables?: string[]; tables?: string[] };
  onFailure?: { notify?: string; script?: string };
}

/**
 * Who uses what in a workspace, worked out from what is deployed there: the
 * connections, secrets, variables and tables scripts declare, the scripts and
 * flows that flows and triggers start, the events flows listen for, and the
 * interfaces apps serve. Nothing is stored: it is read from the bodies each time.
 */
export async function workspaceReferences(db: Db, workspaceId: string): Promise<Reference[]> {
  const resources = await db
    .selectFrom("resource")
    .select(["kind", "path", "body"])
    .where("workspace_id", "=", workspaceId)
    .execute();
  const found: Reference[] = [];
  const add = (
    kind: TargetKind,
    name: string | undefined,
    by: { kind: string; path: string },
    how: string,
  ) => {
    if (name) found.push({ target: { kind, name }, by, how });
  };
  for (const resource of resources) {
    const by = { kind: resource.kind, path: resource.path };
    const body = resource.body as Record<string, unknown>;
    if (
      resource.kind === "script" ||
      resource.kind === "connector" ||
      resource.kind === "trigger_source"
    ) {
      const script = body as ScriptLike;
      for (const name of script.uses?.connections ?? []) add("connection", name, by, "calls it");
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
    if (resource.kind === "interface") {
      const pages = (body.pages ?? []) as { widgets?: { table?: string }[] }[];
      const tables = new Set(
        pages.flatMap((page) => (page.widgets ?? []).map((widget) => widget.table)),
      );
      for (const table of tables) add("table", table, by, "shows it");
    }
    if (resource.kind === "app") {
      const app = body as { interface?: string; reads?: string[] };
      add("interface", app.interface, by, "serves it");
      for (const table of app.reads ?? []) add("table", table, by, "reads it");
    }
  }
  return found;
}
