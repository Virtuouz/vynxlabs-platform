import { PATH_PATTERN } from "./envelope.js";
import type { KindDefinition, KindRegistry } from "./registry.js";

export const PERMISSION_PATTERN = "^(\\*|[a-z][a-z0-9_]*):(\\*|read|write)$";
export const SECRET_NAME_PATTERN = "^[A-Za-z_][A-Za-z0-9_]*$";

const path = { type: "string", pattern: PATH_PATTERN, maxLength: 255 };
const jsonSchema = { type: "object", description: "A JSON Schema (draft 2020-12)." };

export const roleKind: KindDefinition = {
  kind: "role",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      name: { type: "string", pattern: "^[a-z][a-z0-9_]*$", maxLength: 63 },
      description: { type: "string", maxLength: 500 },
      permissions: {
        type: "array",
        items: { type: "string", pattern: PERMISSION_PATTERN },
        minItems: 1,
        uniqueItems: true,
      },
    },
    required: ["name", "permissions"],
    additionalProperties: false,
  },
};

export const bindingKind: KindDefinition = {
  kind: "binding",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      role: { type: "string", description: "The name of a role visible in this workspace." },
      principal: {
        oneOf: [
          {
            type: "object",
            properties: { type: { const: "member" }, email: { type: "string" } },
            required: ["type", "email"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { enum: ["group", "service_account"] },
              name: { type: "string" },
            },
            required: ["type", "name"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { type: { const: "anonymous" } },
            required: ["type"],
            additionalProperties: false,
          },
        ],
      },
      resource: {
        type: "string",
        description: "Path of one resource to bind at. Omit to bind at the workspace.",
      },
    },
    required: ["role", "principal"],
    additionalProperties: false,
  },
};

export const scriptKind: KindDefinition = {
  kind: "script",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      entry: {
        type: "string",
        description: "The name the script is exported under in the bundle.",
      },
      description: { type: "string", maxLength: 500 },
      input: jsonSchema,
      output: jsonSchema,
      timeoutSeconds: { type: "integer", minimum: 1, maximum: 3600 },
      retries: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 0, maximum: 10 },
          delaySeconds: { type: "integer", minimum: 0, maximum: 3600 },
          backoff: { type: "boolean" },
        },
        required: ["limit", "delaySeconds", "backoff"],
        additionalProperties: false,
      },
      concurrency: {
        type: "integer",
        minimum: 1,
        maximum: 64,
        description: "How many runs of this script may be in progress at once.",
      },
      uses: {
        type: "object",
        description:
          "Everything the script may read at run time. Each must be bound before a deploy.",
        properties: {
          connections: { type: "array", items: path, uniqueItems: true },
          secrets: {
            type: "array",
            items: { type: "string", pattern: SECRET_NAME_PATTERN },
            uniqueItems: true,
          },
          variables: { type: "array", items: path, uniqueItems: true },
        },
        required: ["connections", "secrets", "variables"],
        additionalProperties: false,
      },
      onFailure: {
        type: "object",
        description: "What to do when a run fails for the last time.",
        properties: {
          script: { ...path, description: "A script to start with the failed run as input." },
          notify: { ...path, description: "An HTTP connection to POST a summary to." },
        },
        additionalProperties: false,
      },
    },
    required: ["entry", "input", "output", "timeoutSeconds", "retries", "uses"],
    additionalProperties: false,
  },
};

export const scheduleKind: KindDefinition = {
  kind: "schedule",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      script: path,
      cron: { type: "string", maxLength: 120, description: "Five-field cron expression." },
      timezone: { type: "string", maxLength: 64, description: "IANA time zone. Default UTC." },
      input: { type: "object" },
      enabled: { type: "boolean" },
    },
    required: ["script", "cron"],
    additionalProperties: false,
  },
};

export const triggerKind: KindDefinition = {
  kind: "trigger",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      type: { const: "webhook" },
      script: path,
      enabled: { type: "boolean" },
    },
    required: ["type", "script"],
    additionalProperties: false,
  },
};

export const connectionKind: KindDefinition = {
  kind: "connection",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      connector: { type: "string", pattern: "^[a-z][a-z0-9_]*$", maxLength: 63 },
      description: { type: "string", maxLength: 500 },
    },
    required: ["connector"],
    additionalProperties: false,
  },
};

export const variableKind: KindDefinition = {
  kind: "variable",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      description: { type: "string", maxLength: 500 },
      default: { type: "string", maxLength: 65536 },
    },
    additionalProperties: false,
  },
};

/** Every kind the platform ships, in the order a deploy applies them. */
export const platformKinds: KindDefinition[] = [
  roleKind,
  connectionKind,
  variableKind,
  scriptKind,
  scheduleKind,
  triggerKind,
  bindingKind,
];

export function registerPlatformKinds(registry: KindRegistry): KindRegistry {
  for (const kind of platformKinds) registry.register(kind);
  return registry;
}
