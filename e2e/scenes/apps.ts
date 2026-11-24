import { createHash } from "node:crypto";
import { bundleDigest } from "../../packages/manifest/dist/bundle.js";
import type { Scene } from "./scene.ts";

const HOME = "<!doctype html><title>Desk</title><h1>Desk</h1>\n";

/** The scenes of the area "apps"'s pictures (packages/docs/shots/apps.mjs), by the name a shot's `setup` gives. */
export const scenes: Record<string, Scene> = {
  // A workspace of its own with three apps: Desk (files from the repository, reads the table
  // visits), Board (made in the App Builder) and Guide (a site of documentation). Desk and Board
  // are shared with the end-user group Front desk.
  "apps-shared": async ({ call, page, tenant }) => {
    const workspace = await call("POST", `/tenants/${tenant.id}/workspaces`, {
      slug: "apps",
      name: "Apps",
      type: "dev",
    });
    const W = `/tenants/${tenant.id}/workspaces/${workspace.id}`;
    // Desk is the repository's: files in a bundle, as `platform deploy` sends them.
    const sha256 = createHash("sha256").update(HOME).digest("hex");
    const uploaded = await page.evaluate(
      async ([path, text]) =>
        (
          await fetch(`/api/v1${path}`, {
            method: "PUT",
            headers: { "content-type": "text/html" },
            body: text,
          })
        ).status,
      [`${W}/bundle-assets/${sha256}`, HOME] as const,
    );
    if (uploaded >= 300) throw new Error(`The file of Desk was refused: ${uploaded}`);
    const unsigned = {
      formatVersion: 4 as const,
      sdkVersion: "0.5.0",
      core: { min: "0.0.0", below: "99.0.0" },
      manifests: [
        {
          kind: "app",
          path: "desk",
          schemaVersion: 1,
          ownership: "code",
          body: {
            title: "Desk",
            description: "The front desk's screens.",
            entry: "index.html",
            reads: ["visits"],
          },
        },
      ],
      code: "export {};",
      assets: [
        {
          app: "desk",
          path: "index.html",
          sha256,
          size: Buffer.byteLength(HOME),
          contentType: "text/html",
        },
      ],
    };
    const stored = await call("POST", `${W}/bundles`, {
      ...unsigned,
      digest: bundleDigest(unsigned as never),
    });
    await call("POST", `${W}/deployments`, { bundleId: stored.id });
    await call("PUT", `${W}/resources/visits`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      create: true,
      body: {
        description: "What happened at each visit.",
        columns: { pet: { type: "text", required: true }, minutes: { type: "integer" } },
      },
    });
    await call("PUT", `${W}/drafts/screens/board`, {
      kind: "interface",
      schemaVersion: 2,
      create: true,
      body: {
        title: "Board",
        pages: [
          {
            id: "main",
            title: "Board",
            widgets: [
              {
                id: "list",
                type: "core/table",
                title: "Visits",
                at: { x: 0, y: 0, w: 12, h: 6 },
                data: { rows: { source: { visual: { table: "visits" } } } },
                config: { columns: [{ column: "pet" }, { column: "minutes" }] },
              },
            ],
          },
        ],
      },
    });
    await call("PUT", `${W}/drafts/guide/index`, {
      kind: "doc",
      schemaVersion: 1,
      create: true,
      body: { source: "---\ntitle: Guide\n---\n\nHow the front desk works.\n" },
    });
    await call("PUT", `${W}/drafts/board`, {
      kind: "app",
      schemaVersion: 1,
      create: true,
      body: { title: "Board", interface: "screens/board" },
    });
    await call("PUT", `${W}/drafts/guide`, {
      kind: "app",
      schemaVersion: 1,
      create: true,
      body: { title: "Guide", docs: "guide" },
    });
    await call("POST", `${W}/changes/deploy`, {});

    const group = await call("POST", `/tenants/${tenant.id}/end-user-groups`, {
      name: "Front desk",
      description: "The people at the front desks.",
    });
    const roles = (await call("GET", `/tenants/${tenant.id}/roles?limit=200`)).items as {
      id: string;
      name: string;
    }[];
    const role = (name: string) => roles.find((one) => one.name === name)?.id;
    const resources = (await call("GET", `${W}/resources`)).items as {
      id: string;
      kind: string;
      path: string;
    }[];
    const resource = (kind: string, path: string) =>
      resources.find((one) => one.kind === kind && one.path === path)?.id;
    const share = (resourceId: string | undefined, roleId: string | undefined) =>
      call("POST", `/tenants/${tenant.id}/bindings`, {
        workspaceId: workspace.id,
        resourceId,
        principalType: "end_user_group",
        principalId: group.id,
        roleId,
      });
    // Desk: the app and the table it reads, to read and change. Board: to read.
    await share(resource("app", "desk"), role("portal_user"));
    await share(resource("table", "visits"), role("portal_user"));
    await share(resource("app", "board"), role("portal_reader"));
    return { at: `/t/${tenant.id}/workspaces/${workspace.id}` };
  },
};
