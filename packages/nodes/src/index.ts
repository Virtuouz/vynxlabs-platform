/**
 * The core node pack: the steps most flows need, with nothing in them about
 * any one outside product. Each is a script like a tenant's own, with a label
 * that puts it in the flow editor. The platform adds the ones a workspace's
 * flows use to the workspace's bundle when it is composed, so a run is pinned
 * to the version of a node it was deployed with.
 *
 * A node is handed what it works on by the flow step that uses it: the step
 * names a connection, a table or an event, and the run may then reach that
 * one thing and nothing else.
 */

import { type BundleManifest, CORE_PREFIX, entryFor } from "@vynxlabs/manifest";

export { CORE_PREFIX };

export type Taken = "connection" | "table" | "event";

export interface CoreNode {
  path: string;
  label: string;
  /** The name of an icon from the interface's set. */
  icon: string;
  description: string;
  /** What a flow step may hand it. */
  takes: Taken[];
  /** JSON Schema for its input. `x-pick` on a field makes the editor offer what is in the workspace. */
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timeoutSeconds: number;
  /** TypeScript. Its default export is what runs. It may import the SDK and `node:` modules only. */
  code: string;
}

const text = (title: string, more: Record<string, unknown> = {}) => ({
  type: "string",
  title,
  ...more,
});
const pick = (title: string, kind: Taken, description: string) => ({
  type: "string",
  title,
  description,
  "x-pick": kind,
});
const anything = (title: string, description: string) => ({ title, description });

export const CORE_NODES: readonly CoreNode[] = [
  {
    path: "core/http-request",
    label: "HTTP request",
    icon: "globe",
    description:
      "Calls an HTTP API: through a connection, which carries the address and the credential, or at an address given in full.",
    takes: ["connection"],
    timeoutSeconds: 60,
    input: {
      type: "object",
      properties: {
        connection: pick(
          "Connection",
          "connection",
          "An HTTP connection to call through. Leave empty to call an address given in full.",
        ),
        method: {
          type: "string",
          title: "Method",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          default: "GET",
        },
        url: text("Address", {
          description:
            "With a connection, the path under its address, such as /orders. Without one, the whole address.",
        }),
        query: { type: "object", title: "Query", description: "Added to the address." },
        headers: { type: "object", title: "Headers" },
        body: anything("Body", "Sent as JSON. Text is sent as it is."),
        failOnError: {
          type: "boolean",
          title: "Fail on an error status",
          description: "Fails the step when the answer is 400 or above. On unless turned off.",
          default: true,
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    output: {
      type: "object",
      properties: { status: { type: "integer" }, headers: { type: "object" }, body: {} },
    },
    code: `import type { HttpClient, ScriptContext } from "@vynxlabs/sdk";

interface Input {
  connection?: string;
  method?: string;
  url: string;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  body?: unknown;
  failOnError?: boolean;
}

/** JSON when the answer says it is JSON and is, and the text otherwise. */
const read = (type: string | undefined, text: string): unknown => {
  if (!(type ?? "").includes("json") || text === "") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export default async (input: Input, ctx: ScriptContext) => {
  const method = (input.method ?? "GET").toUpperCase();
  const fail = input.failOnError !== false;
  const sends = input.body !== undefined && method !== "GET";
  const asText = typeof input.body === "string";
  if (input.connection) {
    const client = await ctx.connection<HttpClient>(input.connection);
    const answer = await client.request(input.url, {
      method,
      ...(input.query ? { query: input.query } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
      ...(sends ? (asText ? { body: input.body as string } : { json: input.body }) : {}),
      allowFailure: true,
    });
    if (fail && !answer.ok) throw new Error(method + " " + input.url + " answered " + answer.status + ".");
    return {
      status: answer.status,
      headers: answer.headers,
      body: read(answer.headers["content-type"], answer.text),
    };
  }
  const url = new URL(input.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The address must begin with https:// or http://.");
  }
  for (const [name, value] of Object.entries(input.query ?? {})) url.searchParams.set(name, String(value));
  const answer = await fetch(url, {
    method,
    signal: ctx.signal,
    headers: { ...(sends && !asText ? { "content-type": "application/json" } : {}), ...input.headers },
    ...(sends ? { body: asText ? (input.body as string) : JSON.stringify(input.body) } : {}),
  });
  const body = await answer.text();
  if (fail && !answer.ok) throw new Error(method + " " + url.origin + url.pathname + " answered " + answer.status + ".");
  const headers = Object.fromEntries(answer.headers);
  return { status: answer.status, headers, body: read(headers["content-type"], body) };
};
`,
  },
  {
    path: "core/send-email",
    label: "Send email",
    icon: "mail",
    description: "Sends a message through an SMTP connection: the tenant's own mail server.",
    takes: ["connection"],
    timeoutSeconds: 60,
    input: {
      type: "object",
      properties: {
        connection: pick("Mail connection", "connection", "An SMTP connection to send through."),
        to: anything("To", "One address, several separated by commas, or a list."),
        cc: anything("Cc", "As for To."),
        replyTo: text("Reply to"),
        subject: text("Subject"),
        text: text("Message", { description: "As plain text." }),
        html: text("Message as HTML", {
          description: "Sent beside the plain text, or in place of it.",
        }),
      },
      required: ["connection", "to", "subject"],
      additionalProperties: false,
    },
    output: { type: "object", properties: { messageId: { type: "string" } } },
    code: `import type { ScriptContext, SmtpClient } from "@vynxlabs/sdk";

interface Input {
  connection: string;
  to: string | string[];
  cc?: string | string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}

const addresses = (given: string | string[]) =>
  (Array.isArray(given) ? given : String(given).split(","))
    .map((address) => String(address).trim())
    .filter(Boolean);

export default async (input: Input, ctx: ScriptContext) => {
  const to = addresses(input.to);
  if (to.length === 0) throw new Error("There is nobody to send to.");
  const mail = await ctx.connection<SmtpClient>(input.connection);
  return mail.send({
    to,
    ...(input.cc ? { cc: addresses(input.cc) } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    subject: input.subject,
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.html !== undefined ? { html: input.html } : {}),
  });
};
`,
  },
  {
    path: "core/table-read",
    label: "Read rows",
    icon: "table-2",
    description: "Reads rows of a table of the workspace, or one row by its ID.",
    takes: ["table"],
    timeoutSeconds: 60,
    input: {
      type: "object",
      properties: {
        table: pick("Table", "table", "The table to read."),
        id: text("Row ID", { description: "Reads this one row. Leave empty to read several." }),
        filter: {
          type: "object",
          title: "Filter",
          description: 'A condition, such as {"column": "status", "op": "eq", "value": "open"}.',
        },
        sort: anything(
          "Sort",
          "Column names, as a list or separated by commas. A leading minus sorts downwards.",
        ),
        limit: { type: "integer", title: "At most", minimum: 1, maximum: 1000, default: 50 },
      },
      required: ["table"],
      additionalProperties: false,
    },
    output: {
      type: "object",
      properties: { rows: { type: "array" }, count: { type: "integer" }, row: {} },
    },
    code: `import type { ScriptContext } from "@vynxlabs/sdk";

interface Input {
  table: string;
  id?: string;
  filter?: Record<string, unknown>;
  sort?: string | string[];
  limit?: number;
}

export default async (input: Input, ctx: ScriptContext) => {
  const table = ctx.table(input.table);
  if (input.id) {
    const row = await table.get(input.id);
    return { rows: row ? [row] : [], count: row ? 1 : 0, row };
  }
  const sort = Array.isArray(input.sort)
    ? input.sort
    : String(input.sort ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const rows = await table.find({
    ...(input.filter ? { filter: input.filter as never } : {}),
    ...(sort.length > 0 ? { sort } : {}),
    limit: input.limit ?? 50,
  });
  return { rows, count: rows.length, row: rows[0] ?? null };
};
`,
  },
  {
    path: "core/table-write",
    label: "Write a row",
    icon: "table-2",
    description: "Adds a row to a table of the workspace, changes one, or deletes one.",
    takes: ["table"],
    timeoutSeconds: 60,
    input: {
      type: "object",
      properties: {
        table: pick("Table", "table", "The table to write."),
        operation: {
          type: "string",
          title: "What to do",
          enum: ["insert", "update", "delete"],
          default: "insert",
        },
        id: text("Row ID", { description: "The row to change or delete." }),
        values: { type: "object", title: "Values", description: "By column name." },
      },
      required: ["table"],
      additionalProperties: false,
    },
    output: { type: "object", properties: { row: {}, deleted: { type: "boolean" } } },
    code: `import type { ScriptContext } from "@vynxlabs/sdk";

interface Input {
  table: string;
  operation?: "insert" | "update" | "delete";
  id?: string;
  values?: Record<string, unknown>;
}

export default async (input: Input, ctx: ScriptContext) => {
  const table = ctx.table(input.table);
  const operation = input.operation ?? "insert";
  if (operation === "insert") return { row: await table.insert(input.values ?? {}) };
  if (!input.id) throw new Error("Say which row: give its ID.");
  if (operation === "update") return { row: await table.update(input.id, input.values ?? {}) };
  await table.delete(input.id);
  return { row: null, deleted: true };
};
`,
  },
  {
    path: "core/publish-event",
    label: "Publish an event",
    icon: "radio",
    description: "Publishes an event of the workspace. Whatever listens for it is started.",
    takes: ["event"],
    timeoutSeconds: 30,
    input: {
      type: "object",
      properties: {
        event: pick("Event", "event", "The event to publish."),
        payload: { type: "object", title: "Payload", description: "What the event carries." },
      },
      required: ["event"],
      additionalProperties: false,
    },
    output: { type: "object", properties: { published: { type: "boolean" } } },
    code: `import type { ScriptContext } from "@vynxlabs/sdk";

export default async (
  input: { event: string; payload?: Record<string, unknown> },
  ctx: ScriptContext,
) => {
  await ctx.events.publish(input.event, input.payload ?? {});
  return { published: true };
};
`,
  },
];

/** A core node as the manifest of a script the platform manages. */
export function coreManifest(node: CoreNode): BundleManifest {
  return {
    kind: "script",
    schemaVersion: 1,
    path: node.path,
    ownership: "ui",
    body: {
      entry: entryFor("script", node.path),
      description: node.description,
      input: node.input,
      output: node.output,
      timeoutSeconds: node.timeoutSeconds,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      node: { label: node.label, icon: node.icon, category: "Core", takes: node.takes },
      source: { language: "typescript", code: node.code },
    },
  };
}
