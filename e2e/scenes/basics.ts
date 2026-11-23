import type { Scene } from "./scene.ts";

/** The scenes of the area "basics"'s pictures (packages/docs/shots/basics.mjs), by the name a shot's `setup` gives. */
export const scenes: Record<string, Scene> = {
  // Fernhill's own Sandbox, as the seed leaves it: nothing is added or changed.
  "basics-fernhill": async ({ fernhill }) => {
    if (!fernhill) throw new Error("basics-fernhill needs Fernhill, seeded");
    return { at: `/t/${fernhill.id}/workspaces/${fernhill.workspaces.sandbox}` };
  },
};
