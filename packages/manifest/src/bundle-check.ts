import type { Bundle, BundleManifest } from "./bundle.js";
import { checkFlow, type FlowBody, flowExpressions, flowReferences } from "./flow.js";
import { checkInterface, type InterfaceBody, interfaceTables } from "./interface.js";
import { BUILTIN_CONNECTORS, isThemeValue, registerPlatformKinds } from "./kinds.js";
import { KindRegistry, validateJson } from "./registry.js";
import { checkTable, type TableBody } from "./table.js";

/** Events the platform publishes itself. No repository declares them. */
export const PLATFORM_EVENT_PREFIX = "platform/";

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
export function checkBundleManifests(manifests: BundleManifest[]): string[] {
  const problems: string[] = [];
  const byPath = new Map<string, BundleManifest>();

  for (const manifest of manifests) {
    const existing = byPath.get(manifest.path);
    if (existing) {
      problems.push(
        `${manifest.path}: used by both a ${existing.kind} and a ${manifest.kind}. Paths must be unique.`,
      );
    }
    byPath.set(manifest.path, manifest);
    const result = registry.validateManifest(manifest);
    if (!result.ok) {
      for (const issue of result.issues) {
        problems.push(`${manifest.path} (${manifest.kind}): ${issue.path} ${issue.message}`);
      }
    }
  }

  const expect = (from: BundleManifest, field: string, path: unknown, kind: string) => {
    if (typeof path !== "string") return;
    if (kind === "event" && path.startsWith(PLATFORM_EVENT_PREFIX)) return;
    if (byPath.get(path)?.kind !== kind) {
      problems.push(
        `${from.path} (${from.kind}): ${field} refers to "${path}", which is not ${kind === "event" || kind === "interface" ? "an" : "a"} ${kind} in this repository.`,
      );
    }
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
    if (manifest.kind === "schedule" || manifest.kind === "trigger") {
      expect(manifest, "script", body.script, "script");
    }
    if (manifest.kind === "trigger" && body.type === "event") {
      expect(manifest, "event", body.event, "event");
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
    }
    if (manifest.kind === "connection" || manifest.kind === "connection_group") {
      const connector = (manifest.body as { connector?: string }).connector;
      if (connector !== undefined && !BUILTIN_CONNECTORS.includes(connector)) {
        expect(manifest, "connector", connector, "connector");
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
    if (manifest.kind === "interface") {
      const body = manifest.body as unknown as InterfaceBody;
      // A table made in the console is in no bundle, so a table that is not here is not
      // an error. A path that is here and is something else is.
      for (const table of interfaceTables(body)) {
        const found = byPath.get(table);
        if (found && found.kind !== "table") {
          problems.push(
            `${manifest.path} (interface): shows "${table}", which is ${/^[aeiou]/.test(found.kind) ? "an" : "a"} ${found.kind}, not a table.`,
          );
        }
      }
      const tableOf = (path: string) => {
        const found = byPath.get(path);
        return found?.kind === "table" ? (found.body as unknown as TableBody) : undefined;
      };
      for (const issue of checkInterface(body, tableOf)) {
        problems.push(`${manifest.path} (interface): ${issue.path} ${issue.message}`);
      }
    }
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
            `${theme.path} (theme): /body/${set}/${token} must be a plain colour, length or font list.`,
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
    if (!apps.some((app) => app.path === asset.app)) {
      problems.push(
        `assets: ${asset.path} belongs to "${asset.app}", which is not an app in this bundle.`,
      );
    }
    if (asset.path.startsWith(RESERVED_ASSET_PREFIX) || asset.path === "_") {
      problems.push(
        `${asset.app} (app): ${asset.path} is under "_", which the platform keeps for its own pages.`,
      );
    }
  }
  for (const app of apps) {
    const entry = (app.body as { entry?: unknown }).entry;
    if (typeof entry === "string" && !seen.has(`${app.path}\n${entry}`)) {
      problems.push(`${app.path} (app): its entry ${entry} is not among the app's files.`);
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
    if (manifest.kind === "flow") {
      for (const { path, expression } of flowExpressions(manifest.body as unknown as FlowBody)) {
        found.push({ where: `${manifest.path} (flow): ${path}`, expression });
      }
    }
  }
  return found;
}
