import type { Scene } from "./scene.ts";

/** The scenes of the area "extensions"'s pictures (packages/docs/shots/extensions.mjs), by the name a shot's `setup` gives. */
export const scenes: Record<string, Scene> = {
  // A workspace of its own with a connector and a webhook trigger source, both deployed.
  "extensions-list": async ({ call, tenant }) => {
    const workspace = await call("POST", `/tenants/${tenant.id}/workspaces`, {
      slug: "extensions",
      name: "Extensions",
      type: "dev",
    });
    const W = `/tenants/${tenant.id}/workspaces/${workspace.id}`;
    await call("PUT", `${W}/drafts/connectors/shop`, {
      kind: "connector",
      schemaVersion: 1,
      create: true,
      body: {
        entry: "default",
        description: "A shop's API",
        configSchema: {
          type: "object",
          properties: { baseUrl: { type: "string", description: "Where the shop is." } },
          required: ["baseUrl"],
        },
        source: {
          language: "typescript",
          code: 'import { defineConnector } from "@volvel/sdk";\n\nexport default defineConnector({\n  name: "shop",\n  client: (config: { baseUrl: string }) => ({ baseUrl: config.baseUrl }),\n});\n',
        },
      },
    });
    await call("PUT", `${W}/drafts/sources/payments`, {
      kind: "trigger_source",
      schemaVersion: 1,
      create: true,
      body: {
        entry: "default",
        mode: "webhook",
        description: "Checks a payment's signature",
        source: {
          language: "typescript",
          code: "export default async function payments() {\n  return { start: false };\n}\n",
        },
      },
    });
    await call("POST", `${W}/changes/deploy`, {});
    return { at: `/t/${tenant.id}/workspaces/${workspace.id}` };
  },
};
