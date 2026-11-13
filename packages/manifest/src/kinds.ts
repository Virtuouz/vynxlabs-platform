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
              type: {
                enum: ["group", "service_account", "end_user_group"],
                description: "group is a group of members. end_user_group is a group of end users.",
              },
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

/** The most source one resource may carry, in characters. */
export const MAX_SOURCE_LENGTH = 256 * 1024;

/**
 * The source of a resource written in the console. It travels in the manifest,
 * so versions, bundles, promotion, clones and exports all carry it. Resources
 * from a repository have none: their code is in the bundle only.
 */
const sourceCode = {
  type: "object",
  description:
    "The TypeScript the resource was written as, for a resource managed in the console. Its default export is what runs.",
  properties: {
    language: { const: "typescript" },
    code: { type: "string", maxLength: MAX_SOURCE_LENGTH },
  },
  required: ["language", "code"],
  additionalProperties: false,
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
          connectionGroups: {
            type: "array",
            items: path,
            uniqueItems: true,
            description:
              "Connection groups the script may pick a member of at run time. Nothing has to be bound before a deploy.",
          },
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
      node: {
        type: "object",
        description:
          "Makes the script a step that can be picked in the flow editor, under this label.",
        properties: {
          label: { type: "string", minLength: 1, maxLength: 60 },
          icon: {
            type: "string",
            pattern: "^[a-z][a-z0-9-]*$",
            maxLength: 40,
            description: "The name of an icon from the interface's set.",
          },
          category: { type: "string", minLength: 1, maxLength: 40 },
        },
        required: ["label"],
        additionalProperties: false,
      },
      source: sourceCode,
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

/**
 * What a webhook trigger may say about the requests it takes. Used by a
 * trigger resource and by a webhook trigger node of a flow.
 */
const webhookOptions = {
  input: {
    enum: ["body", "request"],
    description:
      "What the script or flow is given. `body` is the parsed body alone, and the default. " +
      "`request` is `{ body, headers, rawBody, query, method }`, for a sender whose headers matter.",
  },
  verify: {
    type: "object",
    description:
      "Checks that a request was signed with a shared secret before anything starts. A request " +
      "that fails is answered 401. Covers senders that put an HMAC of the body in a header, " +
      "such as GitHub, Shopify and Slack.",
    properties: {
      scheme: { enum: ["hmac-sha256", "hmac-sha1"] },
      header: {
        type: "string",
        pattern: "^[A-Za-z0-9-]+$",
        maxLength: 100,
        description: "The header the signature is sent in.",
      },
      secret: {
        type: "string",
        pattern: SECRET_NAME_PATTERN,
        description: "The name of the workspace secret that holds the shared secret.",
      },
      encoding: {
        enum: ["hex", "base64"],
        description: "How the signature is written. Default hex.",
      },
      prefix: {
        type: "string",
        maxLength: 20,
        description: "Text before the signature in the header, such as `sha256=`.",
      },
      signed: {
        type: "string",
        maxLength: 100,
        description:
          "What was signed, with `{body}` for the raw body and `{timestamp}` for the timestamp " +
          "header. Default `{body}`. Slack signs `v0:{timestamp}:{body}`.",
      },
      timestampHeader: {
        type: "string",
        pattern: "^[A-Za-z0-9-]+$",
        maxLength: 100,
        description: "A header holding when the request was sent, in seconds since 1970.",
      },
      toleranceSeconds: {
        type: "integer",
        minimum: 1,
        maximum: 86400,
        description: "How old a request may be, by its timestamp header. Default 300.",
      },
    },
    required: ["scheme", "header", "secret"],
    additionalProperties: false,
  },
};

export const triggerKind: KindDefinition = {
  kind: "trigger",
  schemaVersion: 1,
  body: {
    oneOf: [
      {
        type: "object",
        properties: {
          type: { const: "webhook" },
          script: path,
          enabled: { type: "boolean" },
          ...webhookOptions,
        },
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

/** A flow chosen when the step runs, from a list written down beforehand. */
const flowFrom = {
  ...expression,
  description:
    "An expression that gives the path of the flow to start. It must give one of the paths in `allow`.",
};
const allowedFlows = {
  type: "array",
  items: path,
  minItems: 1,
  maxItems: 50,
  uniqueItems: true,
  description:
    "The flows `flowFrom` may choose. Each is checked like a flow named outright: it must exist, be startable, and not lead back here.",
};

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
                    node("webhook", webhookOptions),
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
                flowFrom,
                allow: allowedFlows,
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
            node("subflow", { flow: path, flowFrom, allow: allowedFlows, input: expression }),
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
      // Last, so that in a file the logic comes first and where things sit on the canvas after it.
      layout: {
        type: "object",
        description:
          "Where each node sits in the editor, for a flow drawn in the console. It changes nothing about how the flow runs.",
        propertyNames: { pattern: nodeId, maxLength: 63 },
        maxProperties: 200,
        additionalProperties: {
          type: "object",
          properties: { x: { type: "integer" }, y: { type: "integer" } },
          required: ["x", "y"],
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

export const connectionGroupKind: KindDefinition = {
  kind: "connection_group",
  schemaVersion: 1,
  body: {
    type: "object",
    description:
      "A set of connections of one kind, whose members are added per workspace in the console with no deploy. A script picks a member by key when it runs.",
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
  connectionGroupKind,
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
