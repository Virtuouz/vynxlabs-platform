import { API, discoverOnce, itemsOf, pick, query, tenantPath, wsPath } from "./_lib.mjs";

const get = (build) => (ctx, user) => ctx.call(user, "GET", build(user));

export default {
  name: "console-read",
  description: "The reads a console user makes while looking around a workspace.",
  async setup(ctx) {
    await discoverOnce(ctx, async (user) => {
      const scripts = itemsOf(await ctx.call(user, "GET", `${wsPath(user)}/scripts`));
      return { words: scripts.map((s) => String(s.path ?? s.name ?? "")).filter(Boolean) };
    });
  },
  actions: [
    { name: "tenant list", weight: 2, run: get(() => `${API}/tenants${query({ limit: 50 })}`) },
    { name: "tenant summary", weight: 3, run: get((u) => `${tenantPath(u)}/summary`) },
    { name: "workspace summary", weight: 3, run: get((u) => `${wsPath(u)}/summary`) },
    { name: "runs list", weight: 5, run: get((u) => `${wsPath(u)}/runs${query({ limit: 50 })}`) },
    {
      name: "activity",
      weight: 3,
      run: get((u) => `${wsPath(u)}/activity${query({ limit: 50 })}`),
    },
    {
      name: "run stats",
      weight: 3,
      run: get((u) => `${wsPath(u)}/run-stats${query({ hours: 24 })}`),
    },
    { name: "scripts", weight: 3, run: get((u) => `${wsPath(u)}/scripts`) },
    { name: "flows", weight: 2, run: get((u) => `${wsPath(u)}/flows`) },
    { name: "triggers", weight: 2, run: get((u) => `${wsPath(u)}/triggers`) },
    { name: "connections", weight: 1, run: get((u) => `${wsPath(u)}/connection-bindings`) },
    { name: "audit", weight: 2, run: get((u) => `${tenantPath(u)}/audit${query({ limit: 50 })}`) },
    {
      name: "search",
      weight: 3,
      run(ctx, user) {
        const words = user.state.found?.words ?? [];
        const q = words.length ? `#${pick(words).slice(0, 4)}` : "a";
        return ctx.call(
          user,
          "GET",
          `${tenantPath(user)}/search${query({ q, workspace: user.workspace, limit: 20 })}`,
        );
      },
    },
  ],
};
