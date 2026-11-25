import { discoverOnce, encodePath, itemsOf, pick, query, wsPath } from "./_lib.mjs";

/** How many tables, largest first, the scenario reads. */
const TABLES = 3;
const FILTERABLE = new Set(["text", "string", "integer", "int", "number", "boolean", "bool"]);

/** A table of the discovered ones, or undefined when there is none. */
const anyTable = (user, wanting) => {
  const tables = (user.state.found?.tables ?? []).filter(wanting ?? (() => true));
  return tables.length ? pick(tables) : undefined;
};

export default {
  name: "table-read",
  description:
    "Row reads on the workspace's largest tables: paging, sorting, a filter, and totals.",
  async setup(ctx) {
    await discoverOnce(ctx, async (user) => {
      const listed = itemsOf(await ctx.call(user, "GET", `${wsPath(user)}/tables`))
        .sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0))
        .slice(0, TABLES);
      const tables = [];
      for (const table of listed) {
        const path = encodePath(table.name);
        const detail = await ctx.call(user, "GET", `${wsPath(user)}/tables/${path}`);
        const columns = detail.json?.columns ?? [];
        const sample = await ctx.call(
          user,
          "GET",
          `${wsPath(user)}/rows/${path}${query({ limit: 1 })}`,
        );
        const row = itemsOf(sample)[0] ?? {};
        const filterColumn = columns.find(
          (c) => FILTERABLE.has(c.type) && row[c.name] !== undefined && row[c.name] !== null,
        );
        const groupColumn = columns.find((c) => c.type === "text" || c.type === "string");
        tables.push({
          name: table.name,
          path,
          rowCount: table.rowCount ?? 0,
          sort: (columns.find((c) => c.name !== "id") ?? columns[0])?.name,
          filter: filterColumn
            ? { column: filterColumn.name, op: "eq", value: row[filterColumn.name] }
            : undefined,
          group: groupColumn?.name,
        });
      }
      if (tables.length === 0) ctx.log(`table-read: ${user.label} found no tables.`);
      return { tables };
    });
  },
  actions: [
    {
      name: "first page",
      weight: 4,
      run(ctx, user) {
        const t = anyTable(user);
        if (!t) return [];
        return ctx.call(user, "GET", `${wsPath(user)}/rows/${t.path}${query({ limit: 50 })}`);
      },
    },
    {
      name: "page through",
      weight: 3,
      async run(ctx, user) {
        const t = anyTable(user);
        if (!t) return [];
        const out = [];
        let cursor;
        for (let page = 0; page < 4; page++) {
          const r = await ctx.call(
            user,
            "GET",
            `${wsPath(user)}/rows/${t.path}${query({ limit: 100, cursor })}`,
          );
          out.push(r);
          cursor = r.json?.nextCursor;
          if (!cursor) break;
        }
        return out;
      },
    },
    {
      name: "sorted",
      weight: 3,
      run(ctx, user) {
        const t = anyTable(user, (x) => x.sort);
        if (!t) return [];
        const sort = Math.random() < 0.5 ? t.sort : `-${t.sort}`;
        return ctx.call(user, "GET", `${wsPath(user)}/rows/${t.path}${query({ limit: 50, sort })}`);
      },
    },
    {
      name: "filtered",
      weight: 3,
      run(ctx, user) {
        const t = anyTable(user, (x) => x.filter);
        if (!t) return [];
        const filter = JSON.stringify(t.filter);
        return ctx.call(
          user,
          "GET",
          `${wsPath(user)}/rows/${t.path}${query({ limit: 50, filter })}`,
        );
      },
    },
    {
      name: "count",
      weight: 2,
      run(ctx, user) {
        const t = anyTable(user);
        if (!t) return [];
        return ctx.call(
          user,
          "GET",
          `${wsPath(user)}/aggregate/${t.path}${query({ measure: "count" })}`,
        );
      },
    },
    {
      name: "grouped totals",
      weight: 2,
      run(ctx, user) {
        const t = anyTable(user, (x) => x.group);
        if (!t) return [];
        return ctx.call(
          user,
          "GET",
          `${wsPath(user)}/aggregate/${t.path}${query({ group: t.group, measure: "count", limit: 50 })}`,
        );
      },
    },
  ],
};
