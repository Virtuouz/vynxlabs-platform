// The API's pages of reference, drawn from the description the app gives of itself:
// one page for each tag, and a first page that lists them. The app is only built and
// asked, as `describeApi()` does, so there is no database to start and nothing to stop.
//
// `apiFiles()` gives the pages and the description as text. `generate.mjs` writes them
// beside the other generated pages, and `docs:check` compares them as it does those.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describeApi } from "@volvel/control-plane/testing";
import { accessSentence } from "../../../apps/control-plane/dist/api-description.js";
import { cell, fieldTable, page, tablesOf } from "./schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(HERE, "../package.json"), "utf8")).version;
const METHODS = ["get", "post", "put", "patch", "delete"];

/** Tags that are not for people, and are listed apart on the first page. */
const PROGRAMS = new Set(["worker protocol", "worker host", "SCIM"]);
/** The sign-in library's routes are one tag, said to be the library's. */
const LIBRARY = "sign-in";

export const tagSlug = (tag) => tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const titleOf = (tag) =>
  tag === tag.toUpperCase() ? tag : tag.replace(/^./, (c) => c.toUpperCase());

/** A schema with every `$ref` read in, except the problem body and a loop, which are named. */
export function dereference(node, schemas, stack = []) {
  if (Array.isArray(node)) return node.map((one) => dereference(one, schemas, stack));
  if (!node || typeof node !== "object") return node;
  if (typeof node.$ref === "string") {
    const name = node.$ref.replace(/^#\/components\/schemas\//, "");
    if (name === "Problem" || stack.includes(name) || !schemas[name])
      return { type: "object", description: `See \`${name}\`.` };
    return dereference(schemas[name], schemas, [...stack, name]);
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, dereference(value, schemas, stack)]),
  );
}

const noun = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function parametersTable(parameters) {
  return [
    "| Name | In | Needed | Holds | What it is |",
    "| --- | --- | --- | --- | --- |",
    ...parameters.map((one) => {
      const schema = one.schema ?? {};
      const type = tablesOf({ properties: { x: schema } })[0].fields[0];
      return `| \`${one.name}\` | ${one.in} | ${one.required ? "Yes" : ""} | ${cell(type?.type ?? "anything")} | ${cell(`${one.description ?? schema.description ?? ""} ${type?.limits ?? ""}`.trim())} |`;
    }),
  ].join("\n");
}

/** A schema as the tables of its fields, one for each form of a union. */
function schemaTables(schema) {
  const tables = tablesOf(schema).filter((table) => table.fields.length > 0);
  if (tables.length === 0) return [];
  return tables.map((table, index) => {
    const heading =
      index === 0
        ? ""
        : `*${table.root === "" ? "The body" : `\`${table.root}\``} when ${table.form}:*\n\n`;
    return `${heading}${fieldTable(table.fields)}`;
  });
}

/** What the description of a route says, without the sentence about access that is added to it. */
function withoutAccess(description, access) {
  if (!description) return "";
  const sentence = access ? accessSentence(access) : "";
  return description.endsWith(sentence)
    ? description.slice(0, -sentence.length).trim()
    : description;
}

function operationSection(path, method, operation, schemas) {
  const access = operation["x-access"];
  const out = [`## \`${method.toUpperCase()} ${path.replace(/^\/api\/v1/, "")}\``, ""];
  if (operation.summary) out.push(`${operation.summary}.`, "");
  if (operation.deprecated) out.push("Deprecated: it is to be removed.", "");
  const said = withoutAccess(operation.description, access);
  if (said) out.push(said, "");
  if (access) out.push(`**Needs:** ${accessSentence(access).replace(/^Needs /, "")}`, "");
  const parameters = dereference(operation.parameters ?? [], schemas);
  if (parameters.length > 0) out.push("**Parameters**", "", parametersTable(parameters), "");
  const content = dereference(operation.requestBody?.content ?? {}, schemas);
  for (const [type, entry] of Object.entries(content)) {
    out.push(
      `**Request body**, \`${type}\`${operation.requestBody.required ? ", needed" : ""}`,
      "",
      ...(entry.schema ? schemaTables(entry.schema).flatMap((table) => [table, ""]) : []),
    );
    if (!entry.schema || schemaTables(entry.schema).length === 0)
      out.push("It has no fields of its own.", "");
  }
  const responses = Object.entries(operation.responses ?? {});
  if (responses.length > 0) {
    out.push("**Responses**", "", "| Status | What it means |", "| --- | --- |");
    for (const [status, response] of responses)
      out.push(`| ${status} | ${cell(response.description ?? "")} |`);
    out.push("");
    for (const [status, response] of responses) {
      if (!status.startsWith("2")) continue;
      for (const [type, entry] of Object.entries(dereference(response.content ?? {}, schemas))) {
        const tables = entry.schema ? schemaTables(entry.schema) : [];
        out.push(`**${status} answer**, \`${type}\``, "");
        out.push(
          ...(tables.length > 0 ? tables.flatMap((table) => [table, ""]) : ["No fields.", ""]),
        );
      }
    }
  }
  return out.join("\n");
}

/** Every operation of the description, by tag, in the order of the address. */
export function operationsByTag(description) {
  const byTag = new Map();
  for (const [path, item] of Object.entries(description.paths).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? "other";
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push({ path, method, operation });
    }
  }
  return byTag;
}

/** The first page, and one page for each tag. */
export function apiPages(description) {
  const byTag = operationsByTag(description);
  const schemas = description.components?.schemas ?? {};
  const described = new Map((description.tags ?? []).map((tag) => [tag.name, tag.description]));
  const tags = [...byTag.keys()].sort((a, b) => a.localeCompare(b));
  const pages = new Map();
  for (const tag of tags) {
    const list = byTag.get(tag);
    const intro = [
      `${described.get(tag) ?? ""}`.trim(),
      tag === LIBRARY
        ? "These routes are served by the sign-in library the instance is built on, and each is one the instance has switched on: a route for signing up, for social providers or for changing an address is not here because members are made by an admin."
        : "",
      PROGRAMS.has(tag)
        ? "These routes are for programs and not for people: the console and the command line do not call them."
        : "",
      `It has ${noun(list.length, "route", "routes")}. A request that fails is answered with one of the [error codes](../errors).`,
    ]
      .filter(Boolean)
      .join("\n\n");
    pages.set(
      `api/${tagSlug(tag)}.md`,
      page(
        {
          title: titleOf(tag),
          description: described.get(tag) ?? `The routes tagged ${tag}.`,
        },
        [
          intro,
          "",
          ...list.map(({ path, method, operation }) =>
            operationSection(path, method, operation, schemas),
          ),
        ].join("\n"),
      ),
    );
  }
  const total = [...byTag.values()].reduce((sum, list) => sum + list.length, 0);
  const row = (tag) =>
    `| [${titleOf(tag)}](${tagSlug(tag)}) | ${cell(described.get(tag) ?? "")} | ${byTag.get(tag).length} |`;
  const table = (list) => [
    "| Tag | What it groups | Routes |",
    "| --- | --- | --- |",
    ...list.map(row),
    "",
  ];
  const notJson = [];
  for (const [tag, list] of byTag) {
    for (const { path, method, operation } of list) {
      const types = new Set([
        ...Object.keys(operation.requestBody?.content ?? {}),
        ...Object.values(operation.responses ?? {}).flatMap((response) =>
          Object.keys(response.content ?? {}),
        ),
      ]);
      const other = [...types].filter((type) => !/json/.test(type));
      if (other.length > 0)
        notJson.push(
          `| \`${method.toUpperCase()} ${path.replace(/^\/api\/v1/, "")}\` | [${titleOf(tag)}](${tagSlug(tag)}) | ${other.map((type) => `\`${type}\``).join(", ")} |`,
        );
    }
  }
  pages.set(
    "api/index.md",
    page(
      {
        title: "The API",
        description: "Every route of the API, what it does, what it needs and what it answers.",
        // Until 0.5 the API was one page, here; it grew a page for each group.
        moved_from: ["reference/api"],
      },
      [
        `Everything the console does, it does through this API, and so can anything else. It has ${noun(total, "route", "routes")} in ${noun(tags.length, "group", "groups")}, as version ${description.info.version} describes itself. Each instance serves the whole description, with every request and response, at \`/api/v1/openapi.json\`.`,
        "",
        "Send `Authorization: Bearer <api key>`, or sign in for a session cookie. A request that fails is answered with one of the [error codes](../errors).",
        "",
        "## For people and programs that act as a member",
        "",
        ...table(tags.filter((tag) => !PROGRAMS.has(tag) && tag !== LIBRARY)),
        "## For programs that talk to the instance",
        "",
        ...table(tags.filter((tag) => PROGRAMS.has(tag))),
        "## Signing in",
        "",
        ...table(tags.filter((tag) => tag === LIBRARY)),
        "## Routes that do not carry JSON",
        "",
        "These take or give a file, a stream or a form, so their bodies are not described field by field. The Model Context Protocol route and the stream of events are in the groups above, and what they speak is the protocol's own.",
        "",
        "| Route | Group | Content |",
        "| --- | --- | --- |",
        ...notJson,
      ].join("\n"),
    ),
  );
  return pages;
}

/** The API's pages and its description, as text, by name under `generated/`. */
export async function apiFiles() {
  const description = await describeApi(VERSION);
  const files = apiPages(description);
  files.set("openapi.json", `${JSON.stringify(description, null, 2)}\n`);
  return files;
}
