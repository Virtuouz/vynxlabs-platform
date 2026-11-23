import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "scripts"'s pictures (packages/docs/shots/scripts.mjs), by the name a shot's `setup` gives. */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The "Greet someone" starter of the script editor, as it is made from it. */
const GREET = `import { type ScriptContext, z } from "@volvel/sdk";

/** What it takes. Saving reads it, so a run's input is checked against it, and forms ask for it. */
export const input = z.object({
  name: z.string().describe("Who to greet"),
});

/** What runs. */
export default async function (given: z.infer<typeof input>, ctx: ScriptContext) {
  ctx.log.info("Started", { by: ctx.run.trigger.type });
  return { hello: given.name };
}
`;
const CHECK = `import type { ScriptContext } from "@volvel/sdk";

export default async function (_given: unknown, ctx: ScriptContext) {
  ctx.log.info("Checked the shelves", { shelves: 14 });
  return { checked: 14, low: 2 };
}
`;
const LOOKUP = `import type { ScriptContext } from "@volvel/sdk";

export default async function (given: { order: string }, ctx: ScriptContext) {
  ctx.log.info("Looking the order up", { order: given.order });
  throw new Error("Supplier answered 404 for /orders/" + given.order + ": no such order");
}
`;

const script = (
  description: string,
  code: string,
  input: Record<string, unknown> = { type: "object" },
  timeoutSeconds = 60,
  retries = 0,
) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description,
    input,
    output: { type: "object" },
    timeoutSeconds,
    retries: { limit: retries, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});

const settled = async (given: Given, W: string, id: string) => {
  for (let tries = 0; tries < 60; tries += 1) {
    const run = await given.call("GET", `${W}/runs/${id}`);
    if (!["queued", "running"].includes(run.state ?? run.status)) return run;
    await sleep(500);
  }
  throw new Error(`The run ${id} did not settle.`);
};

/** A tenant and a Sandbox of their own: scripts made in the console, deployed, one of them with a draft. */
const make = async (given: Given, slug: string, everything: boolean) => {
  const tenant = await given.call("POST", "/tenants", {
    slug: `${slug}-${given.stamp}`,
    name: "Fernhill",
    addCreator: true,
  });
  const sandbox = await given.call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "sandbox",
    name: "Sandbox",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  // A list's description is shown the first time a member sees it and folded after: the
  // administrator has seen it, so that each look of the picture is the same however many came before.
  await given.call("PUT", "/me/preferences/seen:scripts", { value: true });
  await given.call("PATCH", W, { triggersPaused: false });
  await given.call("POST", `/tenants/${tenant.id}/service-accounts`, { name: "Front desk agent" });
  const put = (path: string, body: unknown) => given.call("PUT", `${W}/drafts/${path}`, body);
  await put("greet", {
    ...script("Takes a name and says hello. The smallest script there is.", GREET, {
      type: "object",
      properties: { name: { type: "string", description: "Who to greet" } },
      required: ["name"],
    }),
    create: true,
  });
  if (!everything) {
    await given.call("POST", `${W}/changes/deploy`, {});
    return { at: `/t/${tenant.id}/workspaces/${sandbox.id}` };
  }
  await put("visit-summary", {
    ...script("Writes up a visit in a line.", CHECK, { type: "object" }, 30, 0),
    create: true,
  });
  await put("orders/check", {
    ...script("Counts what is on the shelves.", CHECK),
    create: true,
  });
  await put("orders/lookup", {
    ...script("Looks one order up at the supplier.", LOOKUP, {
      type: "object",
      properties: { order: { type: "string" } },
    }),
    create: true,
  });
  await given.call("POST", `${W}/changes/deploy`, {});
  for (const [name, input] of [
    ["orders/check", {}],
    ["orders/lookup", { order: "A-1043" }],
  ] as const)
    await settled(given, W, (await given.call("POST", `${W}/runs`, { script: name, input })).id);
  // visit-summary has a draft: the settings it will have, not yet deployed.
  await put(
    "visit-summary",
    script("Writes up a visit in a line.", CHECK, { type: "object" }, 90, 2),
  );
  return { at: `/t/${tenant.id}/workspaces/${sandbox.id}` };
};

/** The scripts of a Sandbox, one with a draft, two of them run. */
const lab: Scene = (given) => make(given, "scripts", true);

/**
 * A Sandbox with the one script, in a tenant of its own: the picture of a test run is taken in it,
 * so that the run is not on the list of the others, where the script is "never run".
 */
const test: Scene = (given) => make(given, "scripts-test", false);

export const scenes: Record<string, Scene> = { "scripts-lab": lab, "scripts-test": test };
