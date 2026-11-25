import {
  API,
  discoverOnce,
  encodePath,
  itemsOf,
  pick,
  query,
  tenantPath,
  wsPath,
} from "./_lib.mjs";

const MAX_WIDGETS = 60;
const MAX_DOC_LINKS = 20;

const widgetsOfPage = (page) => (Array.isArray(page?.widgets) ? page.widgets : []);

/** JSON-RPC over the workspace's MCP address: no session, each request alone. */
const rpc = (ctx, user, method, params) =>
  ctx.call(
    user,
    "POST",
    `${wsPath(user)}/mcp`,
    { jsonrpc: "2.0", id: Math.floor(Math.random() * 1e9), method, params },
    { headers: { accept: "application/json, text/event-stream" } },
  );

export default {
  name: "new-surfaces",
  description: "Widget data, dashboards, documentation, search, MCP, and the pages of apps.",
  async setup(ctx) {
    await discoverOnce(ctx, async (user) => {
      const widgets = [];
      const dashboards = itemsOf(await ctx.call(user, "GET", `${wsPath(user)}/dashboards`));
      for (const d of dashboards) {
        const one = await ctx.call(user, "GET", `${wsPath(user)}/dashboards/${d.id}`);
        for (const w of one.json?.body?.widgets ?? []) {
          if (w?.id) widgets.push({ of: "dashboard", path: d.id, widget: w.id });
        }
      }
      const interfaces = itemsOf(await ctx.call(user, "GET", `${wsPath(user)}/interfaces`));
      for (const i of interfaces.filter((x) => x.deployed !== false)) {
        const one = await ctx.call(user, "GET", `${wsPath(user)}/interfaces/${encodePath(i.path)}`);
        for (const page of one.json?.body?.pages ?? []) {
          for (const w of widgetsOfPage(page)) {
            if (w?.id) {
              widgets.push({ of: "interface", path: i.path, page: page.id, widget: w.id });
            }
          }
        }
      }
      const docs = await ctx.call(user, "GET", `${wsPath(user)}/docs`);
      const docPages = (docs.json?.pages ?? []).map((p) => p.path).filter(Boolean);
      const apps = itemsOf(await ctx.call(user, "GET", `${wsPath(user)}/apps`));
      const appPaths = apps
        .map((a) => {
          try {
            return new URL(a.url, ctx.url).pathname;
          } catch {
            return undefined;
          }
        })
        .filter(Boolean);
      // The product's own documentation is public: take the pages its front page links to.
      const front = await ctx.call(user, "GET", "/docs/");
      const links = [...front.text.matchAll(/href="(\/docs\/[^"#?]*)"/g)].map((m) => m[1]);
      return {
        widgets: widgets.slice(0, MAX_WIDGETS),
        dashboards: dashboards.map((d) => d.id),
        docPages,
        appPaths,
        productDocs: [...new Set(links)].slice(0, MAX_DOC_LINKS),
        runIds: itemsOf(
          await ctx.call(user, "GET", `${wsPath(user)}/runs${query({ limit: 20 })}`),
        ).map((r) => r.id),
      };
    });
    const counts = ctx.users.map((u) => `${u.label}: ${u.state.found.widgets.length} widgets`);
    ctx.log(`new-surfaces found ${counts.join(", ")}.`);
  },
  actions: [
    {
      name: "widget data",
      weight: 6,
      run(ctx, user) {
        const list = user.state.found?.widgets ?? [];
        if (!list.length) return [];
        const w = pick(list);
        return ctx.call(user, "GET", `${wsPath(user)}/widget-data${query(w)}`);
      },
    },
    {
      name: "dashboards list",
      weight: 2,
      run: (ctx, user) => ctx.call(user, "GET", `${wsPath(user)}/dashboards`),
    },
    {
      name: "dashboard get",
      weight: 2,
      run(ctx, user) {
        const list = user.state.found?.dashboards ?? [];
        return list.length ? ctx.call(user, "GET", `${wsPath(user)}/dashboards/${pick(list)}`) : [];
      },
    },
    {
      name: "product docs",
      weight: 3,
      run(ctx, user) {
        const list = ["/docs/", ...(user.state.found?.productDocs ?? [])];
        return ctx.call(user, "GET", pick(list));
      },
    },
    {
      name: "workspace docs list",
      weight: 1,
      run: (ctx, user) => ctx.call(user, "GET", `${wsPath(user)}/docs`),
    },
    {
      name: "workspace docs page",
      weight: 1,
      run(ctx, user) {
        const list = user.state.found?.docPages ?? [];
        return list.length
          ? ctx.call(user, "GET", `${wsPath(user)}/docs/page/${encodePath(pick(list))}`)
          : [];
      },
    },
    {
      name: "search",
      weight: 2,
      run: (ctx, user) =>
        ctx.call(
          user,
          "GET",
          `${tenantPath(user)}/search${query({ q: pick(["a", "run", "e", "#a"]), workspace: user.workspace })}`,
        ),
    },
    {
      name: "mcp tools/list",
      weight: 2,
      run: (ctx, user) => rpc(ctx, user, "tools/list", {}),
    },
    {
      name: "mcp get_run",
      weight: 2,
      run(ctx, user) {
        const ids = user.state.found?.runIds ?? [];
        return ids.length
          ? rpc(ctx, user, "tools/call", { name: "get_run", arguments: { runId: pick(ids) } })
          : [];
      },
    },
    {
      name: "app page",
      weight: 3,
      run(ctx, user) {
        const paths = user.state.found?.appPaths ?? [];
        return paths.length ? ctx.call(user, "GET", pick(paths)) : [];
      },
    },
    { name: "instance", weight: 1, run: (ctx, user) => ctx.call(user, "GET", `${API}/instance`) },
  ],
};
