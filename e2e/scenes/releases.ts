import { GitServer } from "../git-server.ts";
import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "releases"'s pictures (packages/docs/shots/releases.mjs), by the name a shot's `setup` gives. */

const NOTE = `import type { ScriptContext } from "@volvel/sdk";

export default async function (_given: unknown, ctx: ScriptContext) {
  ctx.log.info("Recorded");
  return { recorded: true };
}
`;

const script = (description: string) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description,
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code: NOTE },
  },
});

const table = (description: string, extra: Record<string, unknown> = {}) => ({
  kind: "table",
  schemaVersion: 1,
  body: {
    description,
    columns: {
      number: { type: "text", required: true, description: "The number printed on it." },
      total: { type: "number", description: "What was charged." },
      ...extra,
    },
  },
});

/** A tenant of its own, so that what it lists is what the scene made and nothing another scene did. */
async function tenantOf(given: Given, slug: string) {
  const made = await given.call("POST", "/tenants", {
    slug: `${slug}-${given.stamp}`,
    name: "Fernhill",
    addCreator: true,
  });
  const workspace = (name: string, id: string, type: string) =>
    given.call("POST", `/tenants/${made.id}/workspaces`, { slug: id, name, type });
  return { id: made.id as string, workspace };
}

/** A dev workspace linked to a production one, with four drafts that are not deployed. */
const review: Scene = async (given) => {
  const tenant = await tenantOf(given, "rel-review");
  const prod = await tenant.workspace("Production", "main", "production");
  const dev = await tenant.workspace("Dev", "dev", "dev");
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await given.call("PATCH", W, { linkedWorkspaceId: prod.id });
  const put = (path: string, body: unknown) => given.call("PUT", `${W}/drafts/${path}`, body);
  await put("orders", { ...table("What customers bought."), create: true });
  await put("visits", { ...table("What the vet wrote down after a visit."), create: true });
  await given.call("POST", `${W}/changes/deploy`, {});
  await put("billing/late-fee", {
    kind: "variable",
    schemaVersion: 1,
    create: true,
    body: { description: "What a late payment costs, in cents.", default: "1500" },
  });
  await put("orders/check", { ...script("Counts what is on the shelves."), create: true });
  await put(
    "orders",
    table("What customers bought.", {
      status: { type: "text", description: "Where the order is in its life." },
    }),
  );
  // Renamed: the draft is saved under the path it has now, at the address of the one it was.
  await put("visits", {
    ...table("What the vet wrote down after a visit."),
    path: "visit-notes",
  });
  return { at: `/t/${tenant.id}/workspaces/${dev.id}` };
};

/** A dev workspace that follows a branch, with a file changed here and another there. */
const git: Scene = async (given) => {
  const server = new GitServer();
  await server.start();
  const tenant = await tenantOf(given, "rel-git");
  const dev = await tenant.workspace("Dev", "dev", "dev");
  const T = `/tenants/${tenant.id}`;
  const W = `${T}/workspaces/${dev.id}`;
  await given.call("PUT", `${T}/git-repository`, { url: server.url, token: server.token });
  await given.call("PUT", `${W}/git`, { branch: "console/dev" });
  const put = (path: string, description: string, create = true) =>
    given.call("PUT", `${W}/drafts/${path}`, {
      ...script(description),
      ...(create ? { create } : {}),
    });
  await put("orders/check", "Counts what is on the shelves.");
  await put("orders/lookup", "Looks one order up at the supplier.");
  await given.call("POST", `${W}/changes/deploy`, {});
  await given.call("POST", `${W}/git/push`, { message: "Deploy from the console" });
  // A developer rewords one file on the branch; one changes here, and one is new here.
  server.edit(
    "console/dev",
    "platform/orders/lookup.script.yaml",
    (text) =>
      text.replace(
        "Looks one order up at the supplier.",
        "Looks one order up, as a developer put it.",
      ),
    "Reword the lookup",
  );
  await put("orders/check", "Counts what is on the shelves, every clinic.", false);
  await put("orders/receive", "Books a delivery in.");
  await given.call("POST", `${W}/changes/deploy`, {});
  return { at: `/t/${tenant.id}/workspaces/${dev.id}` };
};

/** A tenant with a dev workspace that promotes to production, and a sandbox that does not. */
const tenantScene: Scene = async (given) => {
  const tenant = await tenantOf(given, "rel-tenant");
  const prod = await tenant.workspace("Production", "main", "production");
  const dev = await tenant.workspace("Dev", "dev", "dev");
  await tenant.workspace("Sandbox", "sandbox", "dev");
  await given.call("PATCH", `/tenants/${tenant.id}/workspaces/${dev.id}`, {
    linkedWorkspaceId: prod.id,
  });
  return { at: `/t/${tenant.id}/workspaces/${dev.id}` };
};

export const scenes: Record<string, Scene> = {
  "releases-review": review,
  "releases-git": git,
  "releases-tenant": tenantScene,
};
