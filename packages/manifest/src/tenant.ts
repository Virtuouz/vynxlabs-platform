import { parse, stringify } from "yaml";
import type { ResourceFile } from "./files.js";
import { PERMISSION_PATTERN } from "./kinds.js";
import { isGrantablePermission } from "./permissions.js";
import { validateJson } from "./registry.js";

/**
 * A tenant's access, as resources: who its groups and service accounts are,
 * what its own roles allow, and which of them holds which role. They belong to
 * the tenant, not to a workspace, and go live through a tenant release, never
 * through a workspace's bundle.
 *
 * Who is in a group is not here. People belong to the identity provider, and
 * membership stays state.
 */

/** The folder a repository keeps its tenant's access in, by default. */
export const TENANT_FOLDER = "tenant";

/** A key: one segment, as a path's is written. */
export const TENANT_KEY_PATTERN = "^[a-z0-9][a-z0-9_-]{0,62}$";
/** A role's key is its name, which is written without hyphens. */
export const ROLE_KEY_PATTERN = "^[a-z][a-z0-9_]{0,62}$";

/** One thing a tenant's access is made of. */
export interface TenantResource {
  kind: string;
  key: string;
  body: Record<string, unknown>;
}

const title = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  pattern: "^\\S(.*\\S)?$",
  description: "What people read. It can change: nothing refers to it.",
};
/** The most a description of a group, a role or a service account may say, whichever way it is made. */
export const ACCESS_DESCRIPTION_MAX = 500;
const description = { type: "string", maxLength: ACCESS_DESCRIPTION_MAX };

/** How a group is filled by the identity provider people sign in through. */
const membership = {
  type: "object",
  description:
    "Who is in the group, when that is not managed by hand. Membership itself is never in a repository.",
  properties: {
    sso: {
      type: "object",
      description:
        "Whoever signs in with one of these values in the provider's groups claim is in the group.",
      properties: {
        values: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 200 },
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
        },
      },
      required: ["values"],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const group = {
  type: "object",
  properties: { title, description, membership },
  required: ["title"],
  additionalProperties: false,
};

/** The kinds a tenant release carries, in the order they are applied. */
export const TENANT_KINDS: { kind: string; schemaVersion: number; folder: string; body: object }[] =
  [
    {
      kind: "tenant_role",
      schemaVersion: 1,
      folder: "roles",
      body: {
        type: "object",
        properties: {
          description,
          permissions: {
            type: "array",
            items: { type: "string", pattern: PERMISSION_PATTERN },
            maxItems: 200,
            uniqueItems: true,
          },
        },
        required: ["permissions"],
        additionalProperties: false,
      },
    },
    { kind: "group", schemaVersion: 1, folder: "groups", body: group },
    { kind: "end_user_group", schemaVersion: 1, folder: "end-user-groups", body: group },
    {
      kind: "service_account",
      schemaVersion: 1,
      folder: "service-accounts",
      body: {
        type: "object",
        properties: { title, description },
        required: ["title"],
        additionalProperties: false,
      },
    },
    {
      kind: "tenant_binding",
      schemaVersion: 1,
      folder: "bindings",
      body: {
        type: "object",
        properties: {
          role: {
            type: "string",
            pattern: ROLE_KEY_PATTERN,
            description: "A role of the tenant's own, or one every tenant has, by name.",
          },
          principal: {
            type: "object",
            description:
              "Who is given the role: a group or a service account, by key. A person is never named here.",
            properties: {
              type: { enum: ["group", "service_account", "end_user_group"] },
              key: { type: "string", pattern: TENANT_KEY_PATTERN },
            },
            required: ["type", "key"],
            additionalProperties: false,
          },
          workspace: {
            type: "string",
            pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
            description: "The workspace's slug. Without it the role is held in the whole tenant.",
          },
        },
        required: ["role", "principal"],
        additionalProperties: false,
      },
    },
  ];

const ORDER = new Map(TENANT_KINDS.map((kind, index) => [kind.kind, index]));

export const isTenantKind = (kind: string): boolean => ORDER.has(kind);

/** In the order they are applied: what others refer to first, then by key. */
export const tenantOrder = (a: TenantResource, b: TenantResource): number =>
  (ORDER.get(a.kind) ?? 99) - (ORDER.get(b.kind) ?? 99) ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** A resource's name in a message: `group tech-desk`. */
export const tenantName = (resource: { kind: string; key: string }): string =>
  `${resource.kind.replaceAll("_", " ")} ${resource.key}`;

/**
 * Everything wrong with a set of tenant resources that can be seen without the
 * tenant: bodies, keys used twice, and bindings to what is not in the set.
 * `known` names what the tenant has beside the set, for a set that is one change.
 * `held` is what the tenant has now: a role keeps a permission it holds even if retired.
 */
export function checkTenantResources(
  resources: readonly TenantResource[],
  known: readonly { kind: string; key: string }[] = [],
  held: readonly TenantResource[] = [],
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const there = new Set([...resources, ...known].map((one) => `${one.kind} ${one.key}`));
  for (const resource of resources) {
    const name = tenantName(resource);
    const definition = TENANT_KINDS.find((kind) => kind.kind === resource.kind);
    if (!definition) {
      problems.push(`${name}: "${resource.kind}" is not a kind a tenant's access is made of.`);
      continue;
    }
    const pattern = resource.kind === "tenant_role" ? ROLE_KEY_PATTERN : TENANT_KEY_PATTERN;
    if (!new RegExp(pattern).test(resource.key)) {
      problems.push(
        resource.kind === "tenant_role"
          ? `${name}: a role's key is its name: lowercase letters, digits and underscores, starting with a letter.`
          : `${name}: a key is lowercase letters, digits, hyphens and underscores, starting with a letter or a digit.`,
      );
    }
    if (seen.has(`${resource.kind} ${resource.key}`)) {
      problems.push(
        `${name}: is defined twice. A key belongs to one ${resource.kind.replaceAll("_", " ")}.`,
      );
    }
    seen.add(`${resource.kind} ${resource.key}`);
    for (const issue of validateJson(definition.body, resource.body, "/body")) {
      problems.push(`${name}: ${issue.path} ${issue.message}`);
    }
    if (resource.kind === "tenant_role") {
      // A permission the role already holds stays, even once it is retired: only what is added is checked.
      const kept = new Set(
        (held.find((one) => one.kind === "tenant_role" && one.key === resource.key)?.body
          .permissions as string[] | undefined) ?? [],
      );
      for (const permission of (resource.body.permissions as string[] | undefined) ?? []) {
        if (
          typeof permission === "string" &&
          !kept.has(permission) &&
          !isGrantablePermission(permission)
        ) {
          problems.push(
            `${name}: /body/permissions "${permission}" is not a permission a role can give.`,
          );
        }
      }
    }
    if (resource.kind === "tenant_binding") {
      const principal = resource.body.principal as { type?: string; key?: string } | undefined;
      if (principal?.type && principal.key && !there.has(`${principal.type} ${principal.key}`)) {
        problems.push(
          `${name}: /body/principal names the ${principal.type.replaceAll("_", " ")} "${principal.key}", which is not defined.`,
        );
      }
    }
  }
  return problems;
}

const FILE_NAME = /^(?:.*\/)?([^/]+)\.([a-z][a-z0-9_]*)\.yaml$/;
const YAML_OPTIONS = { lineWidth: 0, version: "1.2" } as const;

/** Whether a file's name says it is one of a tenant's access resources. */
export const isTenantFile = (path: string): boolean => {
  const match = FILE_NAME.exec(path);
  return match !== null && isTenantKind(match[2] as string);
};

/** The name of a tenant resource's file, relative to the tenant folder: `<folder>/<key>.<kind>.yaml`. */
export function tenantFileName(definition: { kind: string; folder: string }, key: string): string {
  return `${definition.folder}/${key}.${definition.kind}.yaml`;
}

/**
 * Writes tenant resources as files, one each: `<folder>/<key>.<kind>.yaml`,
 * relative to the tenant folder. The title is written beside the body, as every
 * resource file has it. Files come back sorted by path.
 */
export function renderTenantFiles(resources: readonly TenantResource[]): ResourceFile[] {
  return [...resources]
    .sort(tenantOrder)
    .map((resource) => {
      const definition = TENANT_KINDS.find((kind) => kind.kind === resource.kind);
      const { title: said, ...rest } = resource.body as { title?: string };
      const order = Object.keys((definition?.body as { properties?: object })?.properties ?? {});
      const body = Object.fromEntries(
        Object.entries(rest).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)),
      );
      return {
        path: tenantFileName(
          { kind: resource.kind, folder: definition?.folder ?? resource.kind },
          resource.key,
        ),
        content: stringify(
          { ...(said !== undefined ? { title: said } : {}), schemaVersion: 1, body },
          YAML_OPTIONS,
        ),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Reads files back into tenant resources. A file's kind is in its name, and its
 * key is its name before the kind unless it says `key:`. Where it is kept is up
 * to the repository. Only files named for a tenant kind are read: the rest are
 * somebody else's.
 */
export function parseTenantFiles(files: readonly ResourceFile[]): {
  resources: TenantResource[];
  problems: string[];
} {
  const resources: TenantResource[] = [];
  const problems: string[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const match = FILE_NAME.exec(file.path);
    if (!match || !isTenantKind(match[2] as string)) continue;
    const [, stem = "", kind = ""] = match;
    let document: unknown;
    try {
      document = parse(file.content, { version: "1.2" });
    } catch (error) {
      problems.push(`${file.path}: is not valid YAML. ${(error as Error).message.split("\n")[0]}`);
      continue;
    }
    const {
      key,
      title: said,
      schemaVersion,
      body,
      ...unknown
    } = (document ?? {}) as {
      key?: unknown;
      title?: unknown;
      schemaVersion?: unknown;
      body?: unknown;
    };
    if (schemaVersion !== 1) {
      problems.push(`${file.path}: needs schemaVersion: 1.`);
      continue;
    }
    if (Object.keys(unknown).length > 0) {
      problems.push(
        `${file.path}: has keys other than key, title, schemaVersion and body: ${Object.keys(unknown).join(", ")}.`,
      );
      continue;
    }
    if (body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body))) {
      problems.push(`${file.path}: its body must be a set of fields.`);
      continue;
    }
    if (key !== undefined && typeof key !== "string") {
      problems.push(`${file.path}: its key must be text.`);
      continue;
    }
    resources.push({
      kind,
      key: (key as string | undefined) ?? stem,
      body: {
        ...(said !== undefined ? { title: said } : {}),
        ...((body as Record<string, unknown> | undefined) ?? {}),
      },
    });
  }
  return { resources: resources.sort(tenantOrder), problems };
}
