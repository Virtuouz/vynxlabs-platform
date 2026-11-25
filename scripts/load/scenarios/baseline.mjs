import { API, tenantPath, wsPath } from "./_lib.mjs";

export default {
  name: "baseline",
  description: "Health, readiness, the instance, and the tenant and workspace summaries.",
  actions: [
    { name: "healthz", weight: 3, run: (ctx, user) => ctx.call(user, "GET", `${API}/healthz`) },
    { name: "readyz", weight: 2, run: (ctx, user) => ctx.call(user, "GET", `${API}/readyz`) },
    { name: "instance", weight: 2, run: (ctx, user) => ctx.call(user, "GET", `${API}/instance`) },
    {
      name: "tenant summary",
      weight: 3,
      run: (ctx, user) => ctx.call(user, "GET", `${tenantPath(user)}/summary`),
    },
    {
      name: "workspace summary",
      weight: 3,
      run: (ctx, user) => ctx.call(user, "GET", `${wsPath(user)}/summary`),
    },
  ],
};
