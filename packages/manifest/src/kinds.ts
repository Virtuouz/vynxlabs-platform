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
            properties: { type: { const: "end_user" }, email: { type: "string" } },
            required: ["type", "email"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: {
                enum: ["anonymous", "end_users"],
                description:
                  "anonymous is anyone, signed in or not. end_users is every signed-in end user of the tenant.",
              },
            },
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
      worker: {
        type: "string",
        pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
        maxLength: 40,
        description:
          "The worker pool this script runs on, for a script that must run in a particular place, such as inside a client's network. Without it, any worker of the default pool runs it.",
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
          events: {
            type: "array",
            items: path,
            uniqueItems: true,
            description: "Events the script may publish.",
          },
          tables: {
            type: "array",
            items: path,
            uniqueItems: true,
            description: "Custom tables the script reads or writes.",
          },
          sources: {
            type: "array",
            items: path,
            uniqueItems: true,
            description: "External data sources the script reads or writes.",
          },
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

const expression = {
  type: "string",
  minLength: 1,
  maxLength: 2000,
  description: "A CEL expression.",
};

export const triggerKind: KindDefinition = {
  kind: "trigger",
  schemaVersion: 1,
  body: {
    oneOf: [
      {
        type: "object",
        properties: { type: { const: "webhook" }, script: path, enabled: { type: "boolean" } },
        required: ["type", "script"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          type: { const: "event" },
          script: path,
          event: { ...path, description: "The event to listen for." },
          filter: {
            ...expression,
            description: "CEL over `event`. The script runs only when it is true.",
          },
          enabled: { type: "boolean" },
        },
        required: ["type", "script", "event"],
        additionalProperties: false,
      },
    ],
  },
};

export const eventKind: KindDefinition = {
  kind: "event",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      description: { type: "string", maxLength: 500 },
      payload: { ...jsonSchema, description: "A JSON Schema every published payload must match." },
    },
    required: ["payload"],
    additionalProperties: false,
  },
};

const nodeId = "^[a-z][a-z0-9_]*$";
const node = (type: string, properties: Record<string, object>, required: string[] = []) => ({
  type: "object",
  properties: { type: { const: type }, ...properties },
  required: ["type", ...required],
  additionalProperties: false,
});

export const flowKind: KindDefinition = {
  kind: "flow",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      description: { type: "string", maxLength: 500 },
      nodes: {
        type: "object",
        propertyNames: { pattern: nodeId, maxLength: 63 },
        minProperties: 1,
        maxProperties: 200,
        additionalProperties: {
          oneOf: [
            node(
              "trigger",
              {
                trigger: {
                  oneOf: [
                    node("manual", {}),
                    node("webhook", {}),
                    node(
                      "schedule",
                      {
                        cron: { type: "string", maxLength: 120 },
                        timezone: { type: "string", maxLength: 64 },
                      },
                      ["cron"],
                    ),
                    node("event", { event: path, filter: expression }, ["event"]),
                  ],
                },
              },
              ["trigger"],
            ),
            node("script", { script: path, input: expression }, ["script"]),
            node(
              "set",
              {
                values: {
                  type: "object",
                  additionalProperties: expression,
                  minProperties: 1,
                  maxProperties: 50,
                },
              },
              ["values"],
            ),
            node(
              "branch",
              {
                cases: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", pattern: nodeId, maxLength: 63 },
                      when: expression,
                    },
                    required: ["name", "when"],
                    additionalProperties: false,
                  },
                },
              },
              ["cases"],
            ),
            node(
              "foreach",
              {
                items: expression,
                script: path,
                flow: path,
                input: expression,
                concurrency: { type: "integer", minimum: 1, maximum: 20 },
              },
              ["items"],
            ),
            node("join", {}),
            node("delay", { seconds: { type: "integer", minimum: 1, maximum: 2592000 } }, [
              "seconds",
            ]),
            node(
              "approval",
              {
                title: { type: "string", minLength: 1, maxLength: 200 },
                detail: expression,
                timeoutSeconds: { type: "integer", minimum: 1, maximum: 2592000 },
              },
              ["title"],
            ),
            node("subflow", { flow: path, input: expression }, ["flow"]),
            node("fail", { message: expression }, ["message"]),
          ],
        },
      },
      edges: {
        type: "array",
        maxItems: 1000,
        items: {
          type: "object",
          properties: {
            from: { type: "string", pattern: nodeId },
            to: { type: "string", pattern: nodeId },
            output: { type: "string", pattern: nodeId },
            error: { type: "boolean" },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
      },
    },
    required: ["nodes", "edges"],
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

export const COLUMN_TYPES = [
  "text",
  "integer",
  "number",
  "boolean",
  "timestamp",
  "date",
  "json",
  "uuid",
  "reference",
  "file",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Columns every table has. A definition cannot declare them. */
export const SYSTEM_COLUMNS = ["id", "created_at", "updated_at"] as const;

const columnName = "^[a-z][a-z0-9_]*$";

export const tableKind: KindDefinition = {
  kind: "table",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      description: { type: "string", maxLength: 500 },
      columns: {
        type: "object",
        propertyNames: { pattern: columnName, maxLength: 55 },
        minProperties: 1,
        maxProperties: 200,
        additionalProperties: {
          type: "object",
          properties: {
            type: { enum: [...COLUMN_TYPES] },
            required: { type: "boolean" },
            unique: { type: "boolean" },
            default: {
              description:
                "Used for a row that gives no value, and for existing rows when the column is added.",
            },
            references: { ...path, description: "For a reference: the table it points to." },
            renamedFrom: {
              type: "string",
              pattern: columnName,
              description: "The column's previous name. Its data is kept.",
            },
          },
          required: ["type"],
          additionalProperties: false,
        },
      },
      policy: {
        oneOf: [
          {
            type: "object",
            properties: { type: { const: "open" } },
            required: ["type"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { const: "owner" },
              column: {
                type: "string",
                pattern: columnName,
                description: "The column holding each row's owner.",
              },
            },
            required: ["type", "column"],
            additionalProperties: false,
          },
        ],
      },
      indexes: {
        type: "array",
        maxItems: 20,
        items: {
          type: "array",
          items: { type: "string", pattern: columnName },
          minItems: 1,
          maxItems: 5,
        },
      },
      renamedFrom: { ...path, description: "The table's previous path. Its data is kept." },
    },
    required: ["columns"],
    additionalProperties: false,
  },
};

export const dataSourceKind: KindDefinition = {
  kind: "data_source",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      connector: { const: "postgres" },
      description: { type: "string", maxLength: 500 },
    },
    required: ["connector"],
    additionalProperties: false,
  },
};

/**
 * The theme tokens a tenant or a workspace may set. The component kit's
 * stylesheet defines the same names, each as a CSS variable `--vx-<name>`.
 */
export const THEME_TOKENS = [
  "canvas",
  "surface",
  "sunken",
  "line",
  "ink",
  "ink-muted",
  "action",
  "action-ink",
  "action-soft",
  "attention",
  "attention-soft",
  "danger",
  "danger-soft",
  "success",
  "success-soft",
  "radius-control",
  "radius-panel",
  "font",
  "font-code",
] as const;

/**
 * What a token's value may be made of: enough for a colour, a length or a list
 * of fonts, and nothing that could end the declaration it is written into or
 * make a browser fetch something.
 */
export const THEME_VALUE_PATTERN = "^[A-Za-z0-9#(),.%\"' -]{1,200}$";
const FORBIDDEN_IN_THEME_VALUE = /url|image|expression|var\(|env\(|attr\(/i;

/** Whether a string is acceptable as a theme token's value. */
export function isThemeValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    new RegExp(THEME_VALUE_PATTERN).test(value) &&
    !FORBIDDEN_IN_THEME_VALUE.test(value)
  );
}

const themeValues = {
  type: "object",
  properties: Object.fromEntries(
    THEME_TOKENS.map((token) => [token, { type: "string", pattern: THEME_VALUE_PATTERN }]),
  ),
  additionalProperties: false,
};

export const themeKind: KindDefinition = {
  kind: "theme",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      description: { type: "string", maxLength: 500 },
      tokens: { ...themeValues, description: "Values that replace the tenant's, by token name." },
      dark: { ...themeValues, description: "The same, for when the viewer prefers a dark scheme." },
    },
    additionalProperties: false,
  },
};

export const appKind: KindDefinition = {
  kind: "app",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 500 },
      entry: {
        type: "string",
        maxLength: 500,
        description: "The file, among the app's files in the bundle, that is the page itself.",
      },
      fallback: {
        type: "boolean",
        description:
          "Whether an address under the app that names no file answers with the entry page, " +
          "for apps that route in the browser. Default true.",
      },
    },
    required: ["title", "entry"],
    additionalProperties: false,
  },
};

/** Every kind the platform ships, in the order a deploy applies them. */
export const platformKinds: KindDefinition[] = [
  roleKind,
  connectionKind,
  variableKind,
  tableKind,
  dataSourceKind,
  eventKind,
  scriptKind,
  scheduleKind,
  triggerKind,
  flowKind,
  themeKind,
  appKind,
  bindingKind,
];

export function registerPlatformKinds(registry: KindRegistry): KindRegistry {
  for (const kind of platformKinds) registry.register(kind);
  return registry;
}
