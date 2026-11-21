// Writes the API's page of reference, and its description as a file, from the
// app itself: it is started on a throwaway database, asked to describe itself,
// and stopped. So it needs Postgres, where the other generators need nothing:
// the development stack's, or the one `TEST_DATABASE_URL` names.
//
// Run by `pnpm docs:generate`. The build leaves what this wrote where it is.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startTestApp } from "@volvel/control-plane/testing";
import { cell, page } from "./schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../generated");
const VERSION = JSON.parse(readFileSync(join(HERE, "../package.json"), "utf8")).version;

/** What a route needs, in words. */
function needs(access) {
  if (!access) return "";
  switch (access.kind) {
    case "public":
      return "Anyone";
    case "signed-in":
      return "Anyone signed in";
    case "custom":
      return "Decided by what is asked for";
    case "worker":
      return "A worker's credential";
    case "worker-host":
      return "The worker host's token";
    case "scim":
      return "An identity provider's token";
    default:
      return `\`${access.permission}\`, at the ${access.scope.replace(/-/g, " ")}`;
  }
}

const METHODS = ["get", "post", "put", "patch", "delete"];

export function apiPage(description) {
  const byTag = new Map();
  for (const [path, item] of Object.entries(description.paths).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? (path.includes("/auth/") ? "sign-in" : "other");
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push({ path, method, operation });
    }
  }
  const routes = [...byTag.values()].reduce((sum, list) => sum + list.length, 0);
  return page(
    {
      title: "The API",
      description: "Every route of the API, what it does and what it needs.",
    },
    [
      `Everything the console does, it does through this API, and so can anything else. This page lists its ${routes} routes as version ${description.info.version} describes itself. The whole description, with every request and response, is served by each instance at \`/api/v1/openapi.json\`.`,
      "",
      "Send `Authorization: Bearer <api key>`, or sign in for a session cookie. A request that fails is answered with one of the [error codes](errors).",
      "",
      ...[...byTag.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([tag, list]) => [
          `## ${tag.replace(/^./, (letter) => letter.toUpperCase())}`,
          "",
          "| Route | What it does | Needs |",
          "| --- | --- | --- |",
          ...list.map(
            ({ path, method, operation }) =>
              `| \`${method.toUpperCase()} ${path.replace(/^\/api\/v1/, "")}\` | ${cell(operation.summary ?? "")} | ${needs(operation["x-access"])} |`,
          ),
          "",
        ]),
    ].join("\n"),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await startTestApp({ version: VERSION });
  try {
    const response = await app.app.inject({ url: "/api/v1/openapi.json" });
    if (response.statusCode !== 200) throw new Error(`The app answered ${response.statusCode}.`);
    const description = response.json();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "openapi.json"), `${JSON.stringify(description, null, 2)}\n`);
    writeFileSync(join(OUT, "api.md"), apiPage(description));
    console.log(
      `Wrote the API's page and its description: ${Object.keys(description.paths).length} addresses.`,
    );
  } finally {
    await app.stop();
  }
  // The reference's first page lists the API's once it is there.
  const { write } = await import("../generate.mjs");
  write();
}
