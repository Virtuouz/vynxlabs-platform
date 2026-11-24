import { fileSchemas, platformKinds, validateJson } from "@volvel/manifest";
import {
  column,
  defineApp,
  defineBinding,
  defineConnection,
  defineConnectionGroup,
  defineConnector,
  defineDashboard,
  defineDataSource,
  defineEvent,
  defineEventTrigger,
  defineFlow,
  defineForm,
  defineInterface,
  defineQuery,
  defineRole,
  defineSchedule,
  defineScript,
  defineTable,
  defineTheme,
  defineTriggerSource,
  defineVariable,
  defineWebhook,
  type ResourceDefinition,
  trigger,
  z,
} from "@volvel/sdk";
import { describe, expect, test } from "vitest";

/**
 * A definition for every kind that has a `define*`, with every field of the kind's file said that the
 * `define*` takes. Each is turned into a manifest and checked against the kind's schema, the one
 * `schemas/` holds. The types of the same fields are checked by `define-parity.types.ts`.
 */
const script = defineScript({
  path: "orders/sync",
  description: "Syncs.",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
  timeoutSeconds: 60,
  memoryMb: 256,
  retries: { limit: 2, delaySeconds: 10, backoff: false },
  concurrency: { key: "input.id", limit: 1 },
  worker: "office",
  connections: ["shop"],
  connectionGroups: ["shops"],
  secrets: ["API_KEY"],
  variables: ["region"],
  events: ["orders/placed"],
  tables: ["orders"],
  sources: ["crm"],
  onFailure: { script: "alerts/failed", notify: "hooks/slack" },
  node: { label: "Sync", icon: "refresh", category: "Orders", takes: ["table"] },
  run: () => ({ ok: true }),
});

const examples: Record<string, ResourceDefinition[]> = {
  app: [
    defineApp({
      path: "orders",
      title: "Orders",
      description: "x",
      source: "apps/orders",
      entry: "index.html",
      fallback: false,
      reads: ["orders"],
    }),
    defineApp({
      path: "wiki",
      title: "Wiki",
      docs: "handbook",
      feedback: { table: "fb" },
      published: false,
    }),
    defineApp({ path: "screens", title: "Screens", interface: "screens/main" }),
  ],
  binding: [
    defineBinding({
      path: "bindings/a",
      description: "why",
      role: "viewer",
      principal: { type: "group", key: "desk" },
      resource: "orders",
    }),
  ],
  connection: [defineConnection({ path: "shop", connector: "smtp", description: "x" })],
  connection_group: [defineConnectionGroup({ path: "shops", connector: "http", description: "x" })],
  connector: [
    defineConnector({
      path: "connectors/shop",
      description: "x",
      configSchema: { type: "object" },
      create: () => ({}),
    }),
  ],
  data_source: [defineDataSource({ path: "crm", description: "x" })],
  event: [
    defineEvent({ path: "orders/placed", description: "x", payload: z.object({ id: z.string() }) }),
  ],
  flow: [
    defineFlow({
      path: "flows/a",
      description: "x",
      nodes: { start: trigger.manual({}) },
      edges: [],
      layout: { start: { x: 1, y: 2 } },
    }),
  ],
  dashboard: [
    defineDashboard({
      path: "boards/a",
      title: "A",
      description: "x",
      refresh: 60,
      widgets: [],
    }),
  ],
  interface: [
    defineInterface({
      path: "screens/a",
      title: "A",
      description: "x",
      pages: [{ id: "home", title: "Home", widgets: [] }],
    }),
  ],
  query: [
    defineQuery({
      path: "reports/a",
      description: "x",
      sql: "select 1 where $1 = $1",
      parameters: [{ name: "a", type: "text", label: "A", default: "x", required: true }],
    }),
  ],
  role: [defineRole({ path: "roles/a", name: "a", description: "x", permissions: ["data:read"] })],
  schedule: [
    defineSchedule({
      path: "schedules/a",
      description: "x",
      script,
      cron: "0 6 * * *",
      timezone: "UTC",
      input: { a: 1 },
      enabled: false,
      source: "sources/a",
      overlap: "skip",
      tags: ["'a'"],
    }),
    defineSchedule({ path: "schedules/b", flow: "flows/a", cron: "0 6 * * *" }),
  ],
  script: [script],
  table: [
    defineTable({
      path: "orders",
      description: "x",
      columns: { name: column.text(), owner: column.text() },
      display: "name",
      policy: { owner: "owner" },
      indexes: [["name"]],
      renamedFrom: "old",
    }),
    defineTable({
      path: "orders2",
      columns: { name: column.text() },
      policy: { rules: [{ allow: "read", when: { everyone: true } }] },
    }),
  ],
  theme: [defineTheme({ description: "x", tokens: { canvas: "#fff" }, dark: { canvas: "#000" } })],
  trigger: [
    defineWebhook({
      path: "hooks/a",
      description: "x",
      script,
      enabled: false,
      input: "request",
      verify: {
        scheme: "hmac-sha256",
        header: "X-Sig",
        secret: "S",
        encoding: "hex",
        prefix: "sha256=",
        signed: "{body}",
        timestampHeader: "X-T",
        toleranceSeconds: 60,
      },
      source: "sources/a",
      tags: ["'a'"],
    }),
    defineEventTrigger({
      path: "triggers/a",
      description: "x",
      event: "orders/placed",
      script,
      filter: "true",
      enabled: false,
      tags: ["'a'"],
    }),
    defineForm({
      path: "forms/a",
      script,
      enabled: false,
      title: "A",
      description: "x",
      fields: [
        { name: "a", label: "A", type: "select", required: true, help: "h", options: ["x"] },
      ],
      submitLabel: "Go",
      success: "Thanks",
      access: "signed_in",
    }),
  ],
  trigger_source: [
    defineTriggerSource({
      path: "sources/a",
      description: "x",
      mode: "poll",
      timeoutSeconds: 30,
      worker: "office",
      connections: ["shop"],
      secrets: ["S"],
      variables: ["region"],
      run: () => ({ items: [] }),
    }),
  ],
  variable: [defineVariable({ path: "region", description: "x", default: "eu" })],
};

describe("each define* makes what its kind's schema accepts", () => {
  for (const [kind, definitions] of Object.entries(examples)) {
    test(kind, () => {
      const kinds = platformKinds.filter((one) => one.kind === kind);
      expect(kinds.length).toBeGreaterThan(0);
      for (const definition of definitions) {
        const manifest = definition.toManifest("example");
        const schema = kinds.find((one) => one.schemaVersion === manifest.schemaVersion);
        expect(schema, `${kind} version ${manifest.schemaVersion}`).toBeDefined();
        expect(validateJson(schema?.body ?? {}, manifest.body)).toEqual([]);
      }
    });
  }
});

/** What a kind's file says that its `define*` does not, and why. */
const SAID_ELSEWHERE: Record<string, string[]> = {
  // The build reads these from the script's own `input` and `output` exports.
  script: ["schemaSource"],
};

describe("every field of a kind's file reaches the manifest of its define*", () => {
  const files = new Map(fileSchemas().map((one) => [one.kind, one.schema]));
  for (const [kind, definitions] of Object.entries(examples)) {
    test(kind, () => {
      const file = files.get(kind) as { properties: { body: object } } | undefined;
      const schema = file?.properties.body as
        | {
            properties?: Record<string, unknown>;
            oneOf?: { properties?: Record<string, unknown> }[];
          }
        | undefined;
      const fields = new Set([
        ...Object.keys(schema?.properties ?? {}),
        ...(schema?.oneOf ?? []).flatMap((one) => Object.keys(one.properties ?? {})),
      ]);
      const said = new Set(
        definitions.flatMap((one) => Object.keys(one.toManifest("example").body)),
      );
      const left = [...fields].filter(
        (name) => !said.has(name) && !(SAID_ELSEWHERE[kind] ?? []).includes(name),
      );
      expect(left).toEqual([]);
    });
  }

  test("every kind that is not covered here has no define*", () => {
    const covered = new Set(Object.keys(examples));
    const without = [...files.keys()].filter((kind) => !covered.has(kind));
    // Kinds made in the console, or by the tenant's access.
    expect(without.sort()).toEqual([
      "end_user_group",
      "group",
      "service_account",
      "tenant_binding",
      "tenant_role",
    ]);
  });
});
