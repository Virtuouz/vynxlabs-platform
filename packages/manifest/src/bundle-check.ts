import type { DeployedWidget, WidgetDefinition, WidgetRegistry } from "@volvel/widgets";
import {
  assetPathProblem,
  type Bundle,
  type BundleManifest,
  keyOf,
  needsFormat4,
  RESERVED_TOOL_NAMES,
  toolNameOf,
} from "./bundle.js";
import { checkFlow, type FlowBody, flowExpressions, flowGrants, flowReferences } from "./flow.js";
import { checkForm, type FormTrigger } from "./form.js";
import { BUILTIN_CONNECTORS, isThemeValue, registerPlatformKinds } from "./kinds.js";
import {
  checkDashboard,
  checkInterface,
  type DashboardBody,
  type InterfaceBody,
  interfaceTables,
  widgetFlows,
  widgetTables,
  workspaceRegistry,
} from "./page.js";
import { BUILTIN_ROLE_NAMES } from "./permissions.js";
import { patternProblems, schemaCostProblems } from "./pattern-guard.js";
import { KindRegistry, validateJson } from "./registry.js";
import { checkTable, type TableBody } from "./table.js";
import { checkWidget, type WidgetBody } from "./widget.js";

/** Events the platform publishes itself. No repository declares them. */
export const PLATFORM_EVENT_PREFIX = "platform/";

/** One field of a platform event's payload. */
export interface PlatformEventField {
  name: string;
  type: "string" | "number" | "boolean";
  /** Left out of the payload on some occasions. */
  optional?: boolean;
  description: string;
}

/** One event the platform publishes: its name, what it says and what its payload holds. */
export interface PlatformEventDefinition {
  name: string;
  description: string;
  payload: readonly PlatformEventField[];
}

/**
 * The events the platform publishes, with what each says and what its payload holds: the one
 * list the editors offer a trigger and a flow to listen for. Nobody declares these in a
 * repository, so nothing else lists them.
 */
const EVENT_LIST = [
  {
    name: "platform/run-succeeded",
    description: "A script run ended well.",
    payload: [
      { name: "runId", type: "string", description: "The run." },
      { name: "script", type: "string", description: "The script's path." },
    ],
  },
  {
    name: "platform/run-failed",
    description: "A script run failed for the last time.",
    payload: [
      { name: "runId", type: "string", description: "The run." },
      { name: "script", type: "string", description: "The script's path." },
      { name: "error", type: "string", optional: true, description: "Why it failed." },
    ],
  },
  {
    name: "platform/run-finished",
    description: "A script run ended, however it ended, including a run that was canceled.",
    payload: [
      { name: "runId", type: "string", description: "The run." },
      { name: "script", type: "string", description: "The script's path." },
      { name: "status", type: "string", description: "succeeded, failed or `cancelled`." },
      { name: "error", type: "string", optional: true, description: "Why it failed." },
    ],
  },
  {
    name: "platform/flow-run-finished",
    description: "A flow run ended, however it ended, including a flow run that was canceled.",
    payload: [
      { name: "flowRunId", type: "string", description: "The flow run." },
      { name: "flow", type: "string", description: "The flow's path." },
      { name: "status", type: "string", description: "succeeded, failed or `cancelled`." },
    ],
  },
  {
    name: "platform/deployment-created",
    description: "A version was deployed to the workspace.",
    payload: [
      { name: "deploymentId", type: "string", description: "The deployment." },
      { name: "bundleVersion", type: "number", description: "The version deployed." },
    ],
  },
  {
    name: "platform/row-changed",
    description: "A row of a table was inserted, updated or deleted.",
    payload: [
      { name: "table", type: "string", description: "The table's path." },
      { name: "change", type: "string", description: "inserted, updated or deleted." },
      { name: "id", type: "string", description: "The row's ID." },
    ],
  },
] as const satisfies readonly PlatformEventDefinition[];

export const PLATFORM_EVENTS: readonly PlatformEventDefinition[] = EVENT_LIST;

/** What a platform event is called. A publisher names one of these and nothing else. */
export type PlatformEventName = (typeof EVENT_LIST)[number]["name"];

/**
 * Paths under this are the platform's own: the core nodes it adds to a bundle
 * whose flows use them. Nothing of a tenant's may live there.
 */
export const CORE_PREFIX = "core/";

const registry = registerPlatformKinds(new KindRegistry());

interface ScriptUses {
  connections?: string[];
  connectionGroups?: string[];
  variables?: string[];
  events?: string[];
  tables?: string[];
  sources?: string[];
}

/**
 * Everything wrong with a bundle's manifests that can be seen without running
 * anything: invalid bodies, a path used twice, references to things that are
 * not in the bundle, and flows whose graph does not hold together. Each
 * problem names the resource and the field.
 *
 * The build runs this, and so does the control plane on upload.
 */
/** "a" or "an", by how the kind's name is said. */
const article = (kind: string) => (/^[aeiou]/.test(kind) ? "an" : "a");

/**
 * The platform's widgets and those the bundle holds. A page of the bundle may place an older
 * version than the bundle's, one the workspace still has deployed; the control plane checks the
 * versions a page names against the workspace, so here only the type must be known.
 */
function bundleRegistry(manifests: readonly BundleManifest[]): WidgetRegistry {
  const widgets = workspaceRegistry();
  for (const manifest of manifests) {
    if (manifest.kind !== "widget" || !registry.validateManifest(manifest).ok) continue;
    const definition = manifest.body as unknown as WidgetDefinition;
    if (checkWidget(manifest.path, definition as WidgetBody).length > 0) continue;
    if (!widgets.get(definition.type)) widgets.add(definition);
  }
  return widgets;
}

export function checkBundleManifests(
  manifests: BundleManifest[],
  /**
   * `tenantRoles`: the names of the roles the tenant has made, which a bundle's bindings may name
   * too. A caller that does not know them leaves it out, and a name that may be one is let through.
   */
  known: { tenantRoles?: readonly string[] } = {},
): string[] {
  const problems: string[] = [];
  const byPath = new Map<string, BundleManifest>();
  let bundleWidgets: WidgetRegistry | undefined;
  /** Paths used twice. That is reported once; references to them are not reported again. */
  const twice = new Set<string>();

  const byKey = new Map<string, BundleManifest>();
  for (const manifest of manifests) {
    // A key is one resource's. Two manifests at one path are reported as that, below.
    const sameKey = byKey.get(keyOf(manifest));
    if (sameKey && sameKey.path !== manifest.path) {
      problems.push(
        `${manifest.path} (${manifest.kind}): its key "${keyOf(manifest)}" is also the key of ${sameKey.path}. A key belongs to one resource: give one of them a key of its own.`,
      );
    }
    byKey.set(keyOf(manifest), manifest);
    const existing = byPath.get(manifest.path);
    if (existing) {
      twice.add(manifest.path);
      problems.push(
        `${manifest.path}: used by both ${article(existing.kind)} ${existing.kind} and ${article(manifest.kind)} ${manifest.kind}. Paths must be unique.`,
      );
    }
    byPath.set(manifest.path, manifest);
    if (
      manifest.path.startsWith(CORE_PREFIX) &&
      !(manifest.kind === "script" && manifest.ownership === "ui")
    ) {
      problems.push(
        `${manifest.path} (${manifest.kind}): paths under ${CORE_PREFIX} are kept for Volvel's own nodes.`,
      );
    }
    // `default` is what the queue of scripts that name no pool is shown as. A pool cannot be
    // made with that name, so a script naming it would wait where no pool is.
    if (
      (manifest.kind === "script" || manifest.kind === "trigger_source") &&
      (manifest.body as { worker?: unknown } | undefined)?.worker === "default"
    ) {
      problems.push(
        `${manifest.path} (${manifest.kind}): /body/worker names a pool called default. That is the queue of ${manifest.kind === "script" ? "scripts" : "sources"} that name no pool: leave worker out to use it, or name a pool you have made.`,
      );
    }
    const result = registry.validateManifest(manifest);
    if (!result.ok) {
      for (const issue of result.issues) {
        problems.push(`${manifest.path} (${manifest.kind}): ${issue.path} ${issue.message}`);
      }
    }
  }

  // A tool's name is what an agent was told to call. One chosen by an author is one tool's.
  const tools = new Map<string, BundleManifest>();
  for (const manifest of manifests) {
    if (manifest.mcp === undefined) continue;
    if (manifest.kind !== "script" && manifest.kind !== "flow") {
      problems.push(
        `${manifest.path} (${manifest.kind}): /mcp only a script or a flow is offered to an agent as a tool.`,
      );
      continue;
    }
    if (RESERVED_TOOL_NAMES.includes(manifest.mcp.name)) {
      problems.push(
        `${manifest.path} (${manifest.kind}): /mcp/name "${manifest.mcp.name}" is the name of a tool every agent has. Choose another.`,
      );
    }
  }
  for (const manifest of manifests) {
    const name = toolNameOf(manifest);
    if (name === undefined) continue;
    const other = tools.get(name);
    // Two paths can make one name: "-" and "_" are written alike, and a long name is cut
    // short. An agent would then be offered one tool, and never reach the other.
    if (other) {
      problems.push(
        manifest.mcp === undefined && other.mcp === undefined
          ? `${manifest.path} (${manifest.kind}): its tool would be called "${name}", as the tool for ${other.path} is: a tool's name is made from the path, with "-" written as "_" and cut at 64 characters. Give one of them an mcp.name, or another path.`
          : `${manifest.path} (${manifest.kind}): its tool would be called "${name}", which is the name of the tool for ${other.path}. Give one of them another mcp.name.`,
      );
    }
    if (!other) tools.set(name, manifest);
  }

  const expect = (from: BundleManifest, field: string, path: unknown, kind: string) => {
    if (typeof path !== "string") return;
    if (kind === "event" && path.startsWith(PLATFORM_EVENT_PREFIX)) return;
    if (twice.has(path)) return;
    if (byPath.get(path)?.kind !== kind) {
      problems.push(
        `${from.path} (${from.kind}): ${field} refers to "${path}", which is not ${article(kind)} ${kind} in this repository.`,
      );
    }
  };

  /** A binding names a role by its name: a built-in one, one of the repository, or the tenant's. */
  const roleNames = new Map(
    manifests
      .filter((one) => one.kind === "role")
      .map((one) => [(one.body as { name?: string }).name, one.path] as const),
  );
  const checkRole = (binding: BundleManifest) => {
    const name = (binding.body as { role?: unknown }).role;
    if (typeof name !== "string") return;
    const field = `${binding.path} (binding): /body/role refers to "${name}"`;
    const defined = byPath.get(name);
    const named = (defined?.body as { name?: string } | undefined)?.name;
    if (defined?.kind === "role" && named !== name) {
      problems.push(
        `${field}, which is a role's path. A binding names a role by its name: "${named}".`,
      );
      return;
    }
    if (BUILTIN_ROLE_NAMES.includes(name) || roleNames.has(name)) return;
    if (known.tenantRoles?.includes(name)) return;
    if (known.tenantRoles === undefined) return;
    problems.push(
      `${field}, which is not a role in this repository, a built-in role or one of the tenant's.`,
    );
  };

  for (const manifest of manifests) {
    if (!registry.validateManifest(manifest).ok) continue;
    const body = manifest.body as {
      type?: string;
      script?: string;
      event?: string;
      uses?: ScriptUses;
      onFailure?: { script?: string; notify?: string };
    };
    if (manifest.kind === "widget") {
      for (const problem of checkWidget(manifest.path, manifest.body as unknown as WidgetBody)) {
        problems.push(`${manifest.path} (widget): ${problem.replace(`${manifest.path}: `, "")}`);
      }
    }
    if (manifest.kind === "schedule" || manifest.kind === "trigger") {
      expect(manifest, "script", body.script, "script");
    }
    if (manifest.kind === "schedule") {
      expect(manifest, "flow", (manifest.body as { flow?: unknown }).flow, "flow");
    }
    // A trigger hands its requests, or its ticks, to a source of the kind that takes them.
    const sourced: [string, string | undefined, "webhook" | "poll"][] = [];
    if (manifest.kind === "schedule") {
      sourced.push(["source", (manifest.body as { source?: string }).source, "poll"]);
    }
    if (manifest.kind === "trigger" && body.type === "webhook") {
      sourced.push(["source", (manifest.body as { source?: string }).source, "webhook"]);
    }
    if (manifest.kind === "flow") {
      const nodes = (manifest.body as unknown as FlowBody).nodes ?? {};
      for (const [id, node] of Object.entries(nodes)) {
        if (node.type !== "trigger") continue;
        if (node.trigger.type === "schedule" || node.trigger.type === "webhook") {
          sourced.push([
            `/body/nodes/${id}/trigger/source`,
            node.trigger.source,
            node.trigger.type === "schedule" ? "poll" : "webhook",
          ]);
        }
      }
    }
    for (const [field, source, mode] of sourced) {
      if (source === undefined) continue;
      expect(manifest, field, source, "trigger_source");
      const found = byPath.get(source);
      const has = (found?.body as { mode?: string } | undefined)?.mode;
      if (found?.kind === "trigger_source" && has !== mode) {
        problems.push(
          `${manifest.path} (${manifest.kind}): ${field} names "${source}", which is a source for ${has === "poll" ? "a schedule" : "a webhook"}, not for ${mode === "poll" ? "a schedule" : "a webhook"}.`,
        );
      }
    }
    if (manifest.kind === "trigger" && body.type === "form") {
      for (const issue of checkForm(manifest.body as unknown as FormTrigger, "/body")) {
        problems.push(`${manifest.path} (trigger): ${issue.path} ${issue.message}`);
      }
    }
    if (manifest.kind === "trigger" && body.type === "event") {
      expect(manifest, "event", body.event, "event");
    }
    if (manifest.kind === "trigger_source") {
      // A source reads what it names as a script does, and fails on every request or tick without it.
      for (const path of body.uses?.connections ?? [])
        expect(manifest, "connections", path, "connection");
      for (const path of body.uses?.variables ?? [])
        expect(manifest, "variables", path, "variable");
    }
    if (manifest.kind === "script") {
      for (const path of body.uses?.connections ?? [])
        expect(manifest, "connections", path, "connection");
      for (const path of body.uses?.connectionGroups ?? [])
        expect(manifest, "connectionGroups", path, "connection_group");
      for (const path of body.uses?.variables ?? [])
        expect(manifest, "variables", path, "variable");
      for (const path of body.uses?.events ?? []) expect(manifest, "events", path, "event");
      for (const path of body.uses?.tables ?? []) expect(manifest, "tables", path, "table");
      for (const path of body.uses?.sources ?? []) expect(manifest, "sources", path, "data_source");
      expect(manifest, "onFailure.script", body.onFailure?.script, "script");
      expect(manifest, "onFailure.notify", body.onFailure?.notify, "connection");
      // A failure is posted over HTTP: another kind of connection would fail only when a run does.
      const notified = byPath.get(body.onFailure?.notify ?? "");
      const connector = (notified?.body as { connector?: string } | undefined)?.connector;
      if (notified?.kind === "connection" && connector !== undefined && connector !== "http") {
        problems.push(
          `${manifest.path} (script): onFailure.notify names "${notified.path}", which is a ${connector} connection. A failure is posted to an HTTP connection.`,
        );
      }
      const keyed = (body as { concurrency?: unknown }).concurrency;
      if (typeof keyed === "object" && keyed !== null && "key" in keyed) {
        const missing = keyMissing(
          (body as { input?: unknown }).input,
          String((keyed as { key: string }).key),
        );
        if (missing) {
          problems.push(
            `${manifest.path} (script): /body/concurrency/key reads ${missing}, which the script's input does not have.`,
          );
        }
      }
    }
    if (manifest.kind === "connection" || manifest.kind === "connection_group") {
      const connector = (manifest.body as { connector?: string }).connector;
      if (connector !== undefined && !BUILTIN_CONNECTORS.includes(connector)) {
        expect(manifest, "connector", connector, "connector");
      }
      // Each member of a group would need someone to authorize it in a browser.
      if (manifest.kind === "connection_group" && connector === "oauth2") {
        problems.push(
          `${manifest.path} (connection_group): /body/connector is oauth2, which a group cannot use yet. Declare a connection for each account.`,
        );
      }
    }
    // A pattern that can backtrack without end would hold the control plane's one thread when a
    // caller's input is checked against it. Script, connector and flow bodies hold such schemas.
    if (manifest.kind === "script" || manifest.kind === "connector" || manifest.kind === "flow") {
      for (const problem of [
        ...patternProblems(manifest.body, "/body"),
        ...schemaCostProblems(manifest.body, "/body"),
      ]) {
        problems.push(`${manifest.path} (${manifest.kind}): ${problem}`);
      }
    }
    if (manifest.kind === "connector") {
      // A schema that cannot be compiled would fail every binding later, with no word of why.
      try {
        validateJson((manifest.body as { configSchema: object }).configSchema, {});
      } catch (error) {
        problems.push(
          `${manifest.path} (connector): /body/configSchema is not a JSON Schema: ${(error as Error).message}`,
        );
      }
    }
    if (manifest.kind === "connector" && BUILTIN_CONNECTORS.includes(manifest.path)) {
      problems.push(
        `${manifest.path} (connector): "${manifest.path}" is the name of a connector every worker has. Give this one another path.`,
      );
    }
    if (manifest.kind === "table") {
      const table = manifest.body as unknown as TableBody;
      for (const issue of checkTable(table)) {
        problems.push(`${manifest.path} (table): ${issue.path} ${issue.message}`);
      }
      for (const [name, column] of Object.entries(table.columns)) {
        expect(manifest, `/body/columns/${name}/references`, column.references, "table");
      }
      if (table.renamedFrom !== undefined && byPath.has(table.renamedFrom)) {
        problems.push(
          `${manifest.path} (table): /body/renamedFrom "${table.renamedFrom}" is still declared, so it cannot also be this table's old path.`,
        );
      }
    }
    if (manifest.kind === "interface" || manifest.kind === "dashboard") {
      const widgets = () => (bundleWidgets ??= bundleRegistry(manifests));
      const isInterface = manifest.kind === "interface";
      const body = manifest.body as unknown as InterfaceBody | DashboardBody;
      // A table made in the console is in no bundle, so a table that is not here is not
      // an error. A path that is here and is something else is.
      const tables = isInterface
        ? interfaceTables(body as InterfaceBody)
        : widgetTables((body as DashboardBody).widgets);
      // The flows an approvals widget asks of: where the bundle has the path, it is a flow.
      const widgetsOf = isInterface
        ? (body as InterfaceBody).pages.flatMap((page) => page.widgets)
        : (body as DashboardBody).widgets;
      for (const path of widgetFlows(widgetsOf)) {
        const found = byPath.get(path);
        if (found && found.kind !== "flow") {
          problems.push(
            `${manifest.path} (${manifest.kind}): asks the approvals of "${path}", which is ${/^[aeiou]/.test(found.kind) ? "an" : "a"} ${found.kind}, not a flow.`,
          );
        }
      }
      for (const table of tables) {
        const found = byPath.get(table);
        if (found && found.kind !== "table") {
          problems.push(
            `${manifest.path} (${manifest.kind}): shows "${table}", which is ${/^[aeiou]/.test(found.kind) ? "an" : "a"} ${found.kind}, not a table.`,
          );
        }
      }
      const tableOf = (path: string) => {
        const found = byPath.get(path);
        return found?.kind === "table" ? (found.body as unknown as TableBody) : undefined;
      };
      const issues = isInterface
        ? checkInterface(body as InterfaceBody, tableOf, widgets(), (path) => {
            const found = byPath.get(path);
            return found?.kind === "flow"
              ? { nodes: Object.values((found.body as unknown as FlowBody).nodes ?? {}) }
              : undefined;
          })
        : checkDashboard(body as DashboardBody, tableOf, widgets());
      for (const issue of issues) {
        // A widget of the workspace's own that this bundle does not carry may be one the workspace
        // still has deployed for pages that place it: the control plane says whether it is.
        if (issue.message.startsWith('there is no widget called "x/')) continue;
        problems.push(`${manifest.path} (${manifest.kind}): ${issue.path} ${issue.message}`);
      }
    }
    if (manifest.kind === "binding") checkRole(manifest);
    if (manifest.kind === "app") {
      expect(
        manifest,
        "interface",
        (manifest.body as { interface?: unknown }).interface,
        "interface",
      );
    }
    if (manifest.kind === "flow") {
      const flow = manifest.body as unknown as FlowBody;
      for (const issue of checkFlow(flow)) {
        problems.push(`${manifest.path} (flow): ${issue.path} ${issue.message}`);
      }
      for (const reference of flowReferences(flow)) {
        expect(manifest, reference.path, reference.target, reference.kind);
        // A flow used as a step is started from its manual trigger.
        if (reference.kind === "flow") {
          const target = byPath.get(reference.target);
          const nodes = (target?.body as unknown as FlowBody | undefined)?.nodes ?? {};
          const manual = Object.values(nodes).some(
            (node) => node.type === "trigger" && node.trigger.type === "manual",
          );
          if (target?.kind === "flow" && !manual) {
            problems.push(
              `${manifest.path} (flow): ${reference.path} uses the flow "${reference.target}", which has no manual trigger to start it from.`,
            );
          }
        }
      }
      // What a step hands a script must exist, and the script must say it takes such a thing.
      for (const grant of flowGrants(flow)) {
        expect(manifest, grant.path, grant.target, grant.kind);
        const script = byPath.get(grant.script);
        const takes = (script?.body as { node?: { takes?: string[] } } | undefined)?.node?.takes;
        if (script?.kind === "script" && !takes?.includes(grant.kind)) {
          problems.push(
            `${manifest.path} (flow): ${grant.path} hands ${grant.kind === "event" ? "an" : "a"} ${grant.kind} to the script "${grant.script}", which does not take one. A script says what it takes with \`node.takes\`.`,
          );
        }
      }
    }
  }

  // A workspace has one look. Two themes would leave it to chance which one applies.
  const themes = manifests.filter((manifest) => manifest.kind === "theme");
  for (const extra of themes.slice(1)) {
    problems.push(
      `${extra.path} (theme): a workspace can have one theme, and "${themes[0]?.path}" is already one.`,
    );
  }
  for (const theme of themes) {
    const body = theme.body as { tokens?: Record<string, unknown>; dark?: Record<string, unknown> };
    for (const [set, values] of [
      ["tokens", body.tokens],
      ["dark", body.dark],
    ] as const) {
      for (const [token, value] of Object.entries(values ?? {})) {
        if (typeof value === "string" && !isThemeValue(value)) {
          problems.push(
            `${theme.path} (theme): /body/${set}/${token} must be a plain color, length or font list.`,
          );
        }
      }
    }
  }

  // Flows that use each other in a circle would never finish.
  const uses = new Map<string, string[]>();
  for (const manifest of manifests) {
    if (manifest.kind !== "flow" || !registry.validateManifest(manifest).ok) continue;
    uses.set(
      manifest.path,
      flowReferences(manifest.body as unknown as FlowBody)
        .filter((reference) => reference.kind === "flow")
        .map((reference) => reference.target),
    );
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (path: string, trail: string[]) => {
    if (done.has(path)) return;
    if (visiting.has(path)) {
      problems.push(
        `${path} (flow): flows use each other in a circle: ${[...trail.slice(trail.indexOf(path)), path].join(" -> ")}.`,
      );
      return;
    }
    visiting.add(path);
    for (const next of uses.get(path) ?? []) visit(next, [...trail, path]);
    visiting.delete(path);
    done.add(path);
  };
  for (const path of uses.keys()) visit(path, []);

  return problems;
}

/** The page a widget's frame is opened at: a widget's files are this and one script. */
export const WIDGET_FRAME_FILE = "frame.html";

/** Paths inside an app that the platform keeps for its own pages. */
const RESERVED_ASSET_PREFIX = "_/";

/**
 * Everything wrong with the files a bundle lists for its apps: a file for an
 * app that is not in the bundle, an app whose page is not among its files, or
 * the same file listed twice.
 */
export function checkBundleAssets(
  bundle: Pick<Bundle, "formatVersion" | "manifests" | "assets">,
): string[] {
  const problems: string[] = [];
  const assets = bundle.assets ?? [];
  const apps = bundle.manifests.filter((manifest) => manifest.kind === "app");
  const widgets = bundle.manifests.filter((manifest) => manifest.kind === "widget");
  if (bundle.formatVersion < 4) {
    for (const manifest of bundle.manifests.filter(needsFormat4)) {
      problems.push(
        `${manifest.path} (${manifest.kind}): a key, a title, a tool name and a source need bundle format 4. Build with a current SDK and CLI.`,
      );
    }
  }
  if (bundle.formatVersion === 1) {
    if (bundle.assets !== undefined) problems.push("assets: a format 1 bundle carries no files.");
    for (const app of apps) {
      problems.push(
        `${app.path} (app): apps need bundle format 2. Build with a current SDK and CLI.`,
      );
    }
    return problems;
  }
  const seen = new Set<string>();
  for (const asset of assets) {
    const key = `${asset.app}\n${asset.path}`;
    if (seen.has(key)) problems.push(`${asset.app} (app): the file ${asset.path} is listed twice.`);
    seen.add(key);
    const owner = [...apps, ...widgets].find((one) => one.path === asset.app);
    if (!owner) {
      problems.push(
        `assets: ${asset.path} belongs to "${asset.app}", which is not an app or a widget in this bundle.`,
      );
    }
    const unnamed = assetPathProblem(asset.path);
    if (unnamed) problems.push(`${asset.app} (app): ${unnamed}`);
    if (asset.path.startsWith(RESERVED_ASSET_PREFIX) || asset.path === "_") {
      problems.push(
        `${asset.app} (app): ${asset.path} is under "_", which Volvel keeps for its own pages.`,
      );
    }
  }
  for (const app of apps) {
    const entry = (app.body as { entry?: unknown }).entry;
    if (typeof entry === "string" && !seen.has(`${app.path}\n${entry}`)) {
      problems.push(`${app.path} (app): its entry ${entry} is not among the app's files.`);
    }
  }
  // A widget is its frame page and the one script that page loads: both are built with it.
  for (const widget of widgets) {
    const files = assets.filter((asset) => asset.app === widget.path).map((asset) => asset.path);
    if (!files.includes(WIDGET_FRAME_FILE)) {
      problems.push(
        `${widget.path} (widget): its frame page ${WIDGET_FRAME_FILE} is not among its files.`,
      );
    }
    if (!files.some((file) => /^view-[0-9a-f]{8}\.js$/.test(file))) {
      problems.push(`${widget.path} (widget): its script is not among its files.`);
    }
    if (files.length !== 2) {
      problems.push(
        `${widget.path} (widget): a widget is its frame page and one script, and has ${files.length} files.`,
      );
    }
  }
  return problems;
}

/** Every expression in a bundle, with a label saying where it is written. */
export function bundleExpressions(
  manifests: BundleManifest[],
): { where: string; expression: string }[] {
  const found: { where: string; expression: string }[] = [];
  for (const manifest of manifests) {
    if (!registry.validateManifest(manifest).ok) continue;
    if (manifest.kind === "trigger" && typeof manifest.body.filter === "string") {
      found.push({
        where: `${manifest.path} (trigger): /body/filter`,
        expression: manifest.body.filter,
      });
    }
    // The tags a start gives each run: one that does not parse is left out at run time, so
    // it is said here, where it can still be fixed.
    if (manifest.kind === "trigger" || manifest.kind === "schedule") {
      const tags = (manifest.body as { tags?: unknown }).tags;
      for (const [index, tag] of (Array.isArray(tags) ? tags : []).entries()) {
        if (typeof tag === "string")
          found.push({
            where: `${manifest.path} (${manifest.kind}): /body/tags/${index}`,
            expression: tag,
          });
      }
    }
    if (manifest.kind === "flow") {
      for (const { path, expression } of flowExpressions(manifest.body as unknown as FlowBody)) {
        found.push({ where: `${manifest.path} (flow): ${path}`, expression });
      }
    }
  }
  return found;
}

/**
 * The first field of a concurrency key that an input schema does not list,
 * where it lists its fields: almost always a misspelling, found at deploy
 * rather than as every run sharing the empty lane. A schema that lists none,
 * or says outright that it takes more (`additionalProperties`), is taken at
 * its word.
 */
export function keyMissing(schema: unknown, key: string): string | undefined {
  let at = schema as Record<string, unknown> | undefined;
  let walked = "input";
  for (const field of key.split(".").slice(1)) {
    walked += `.${field}`;
    if (!at || typeof at !== "object") return undefined;
    const properties = at.properties as Record<string, unknown> | undefined;
    if (!properties || typeof properties !== "object") return undefined;
    if (!(field in properties)) {
      const more = at.additionalProperties;
      return more === undefined || more === false ? walked : undefined;
    }
    at = properties[field] as Record<string, unknown> | undefined;
  }
  return undefined;
}
