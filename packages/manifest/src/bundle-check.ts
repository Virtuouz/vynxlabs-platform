import type { BundleManifest } from "./bundle.js";
import { checkFlow, type FlowBody, flowExpressions, flowReferences } from "./flow.js";
import { registerPlatformKinds } from "./kinds.js";
import { KindRegistry } from "./registry.js";

/** Events the platform publishes itself. No repository declares them. */
export const PLATFORM_EVENT_PREFIX = "platform/";

const registry = registerPlatformKinds(new KindRegistry());

interface ScriptUses {
  connections?: string[];
  variables?: string[];
  events?: string[];
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
        `${from.path} (${from.kind}): ${field} refers to "${path}", which is not ${kind === "event" ? "an" : "a"} ${kind} in this repository.`,
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
      for (const path of body.uses?.variables ?? [])
        expect(manifest, "variables", path, "variable");
      for (const path of body.uses?.events ?? []) expect(manifest, "events", path, "event");
      expect(manifest, "onFailure.script", body.onFailure?.script, "script");
      expect(manifest, "onFailure.notify", body.onFailure?.notify, "connection");
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
