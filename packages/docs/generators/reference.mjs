// The pages of reference that are drawn from the code, and never written by
// hand: permissions, kinds, settings, commands, errors, and the syntax of
// documentation itself. Each is made from the one list the code runs on.
//
// `generate()` gives every file as text. It needs the packages built
// (`tsc -b`) and nothing else: no database and no network.
import { FRONTMATTER_SCHEMA } from "@volvel/docs-engine";
import {
  ERROR_CODES,
  fileSchemas,
  PERMISSION_KINDS,
  platformKinds,
  resourceFileName,
  TENANT_KINDS,
  tenantFileName,
} from "@volvel/manifest";
import { COMPONENTS, PROFILES } from "@volvel/markup";
import { CONFIG_VARS, WORKER_VARS } from "../../../apps/control-plane/dist/config-vars.js";
import { COMMAND_GROUPS, COMMAND_NAME, COMMAND_NOTES, COMMANDS } from "../../cli/dist/commands.js";
import { cell, fieldsOf, fieldTable, page, tablesOf } from "./schema.mjs";

const sentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
const titled = (kind) => kind.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

function permissions() {
  const groups = [...new Set(PERMISSION_KINDS.map((entry) => entry.group))];
  const body = [
    "A permission is written `kind:verb`, such as `table:read`. A role lists permissions, and may use `*` for either half. This page is drawn from the list the instance checks against.",
    "",
    ...groups.flatMap((group) => [
      `## ${group}`,
      "",
      "| Permission | Allows | Checked at |",
      "| --- | --- | --- |",
      ...PERMISSION_KINDS.filter((entry) => entry.group === group).flatMap((entry) =>
        Object.entries(entry.verbs).map(([verb, allows]) => {
          const notes = [
            entry.appFacing ? "An end user can hold it." : "",
            entry.explicit ? "Given only by its own name: `*` does not include it." : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `| \`${entry.kind}:${verb}\` | ${cell(allows)}${notes ? ` ${notes}` : ""} | ${entry.scope} |`;
        }),
      ),
      "",
    ]),
  ];
  return page(
    {
      title: "Permissions",
      description: "Every permission the instance checks, and what each allows.",
    },
    body.join("\n"),
  );
}

/** Every kind there is, with the fields its body may hold. */
function kindList() {
  const workspace = platformKinds.map((kind) => ({ ...kind, scope: "workspace" }));
  const tenant = (TENANT_KINDS ?? []).map((kind) => ({ ...kind, scope: "tenant" }));
  return [...workspace, ...tenant].map((kind) => ({
    kind: kind.kind,
    scope: kind.scope,
    schemaVersion: kind.schemaVersion,
    description: kind.body.description ?? "",
    fields: [...fieldsOf(kind.body).values()],
  }));
}

const article = (word) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** The file each kind is written to, from the names the manifest package writes with. */
function fileNameOf(kind) {
  if (kind.scope === "workspace") return resourceFileName(kind.kind, "<path>");
  const definition = TENANT_KINDS.find((one) => one.kind === kind.kind);
  return tenantFileName(definition, "<key>");
}

/** What a kind's file holds beside its body: the same for every kind of a scope. */
function envelope(scope) {
  const one = fileSchemas().find((entry) =>
    scope === "workspace"
      ? !TENANT_KINDS.some((tenant) => tenant.kind === entry.kind)
      : TENANT_KINDS.some((tenant) => tenant.kind === entry.kind),
  );
  const { body: _body, ...beside } = one.schema.properties;
  return tablesOf({
    properties: beside,
    required: one.schema.required.filter((name) => name !== "body"),
  })[0].fields.map((field) =>
    field.path === "schemaVersion"
      ? { ...field, type: "number", limits: "The version of the kind this file is written for." }
      : field,
  );
}

/** A kind's fields as tables: the ones that are always there, then one for each form of a union. */
function formTables(body) {
  const tables = tablesOf(body);
  if (tables.every((table) => table.fields.length === 0)) return [fieldTable([])];
  return tables
    .filter((table) => table.fields.length > 0)
    .map((table, index) => {
      const heading =
        index === 0
          ? ""
          : `### ${table.root === "" ? "The body" : `\`${table.root}\``} when ${table.form}\n\n${table.about ? `${table.about}\n\n` : ""}`;
      return `${heading}${fieldTable(table.fields)}`;
    });
}

function kinds(list) {
  const files = new Map();
  const slug = (kind) => kind.replace(/_/g, "-");
  const schemas = new Map(fileSchemas().map((entry) => [entry.kind, entry.schema]));
  const bodyOf = (kind) => schemas.get(kind.kind)?.properties?.body ?? kind.body;
  const section = (heading, rows) => [
    heading,
    "",
    "| Field | Holds | Needed | What it is |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (field) =>
        `| \`${field.path}\` | ${cell(field.type)} | ${field.required ? "Yes" : ""} | ${cell(`${field.description} ${field.limits ?? ""}`.trim())} |`,
    ),
    "",
  ];
  files.set(
    "kinds/index.md",
    page(
      {
        title: "Kinds of resource",
        description: "What a resource of each kind may say, field by field.",
      },
      [
        "Everything a workspace or a tenant holds is a resource of some kind. Each page here lists what a resource of that kind may say, as the instance checks it.",
        "",
        "## The file",
        "",
        "A resource is kept as one file, named for its kind: `<path>.<kind>.yaml` for a workspace, where `<path>` is the resource's path, and `<folder>/<key>.<kind>.yaml` for a tenant's access, where the folder is the kind's own. A page of documentation is the exception: a Markdown file, `docs/<path>.md`. A script, a connector or a trigger source keeps its code in a `.ts` file beside its own.",
        "",
        "What a resource says is its body. Around the body a file may say these things, the same for every kind.",
        "",
        ...section("### In a workspace", envelope("workspace")),
        ...section("### In a tenant", envelope("tenant")),
        "## In a workspace",
        "",
        ...list
          .filter((kind) => kind.scope === "workspace")
          .map((kind) => `- [${titled(kind.kind)}](${slug(kind.kind)})`),
        "",
        "## In a tenant",
        "",
        ...list
          .filter((kind) => kind.scope === "tenant")
          .map((kind) => `- [${titled(kind.kind)}](${slug(kind.kind)})`),
      ].join("\n"),
    ),
  );
  for (const kind of list) {
    const words = kind.kind.replace(/_/g, " ");
    const code = ["script", "connector", "trigger_source"].includes(kind.kind);
    files.set(
      `kinds/${slug(kind.kind)}.md`,
      page(
        {
          title: titled(kind.kind),
          description: `What ${article(words)} ${words} may say.`,
        },
        [
          `A resource of kind \`${kind.kind}\`, in ${article(kind.scope)} ${kind.scope}. Its file is named \`${fileNameOf(kind)}\`, written for version ${kind.schemaVersion} of the kind. What a file says around its body is on the [kinds page](index).${code ? ` Its code is in the \`.ts\` file beside it.` : ""}`,
          kind.description ? `\n${sentence(kind.description)}` : "",
          "",
          "A field with `*` in its path is inside a list, or under a name of the author's choosing. Where a field is of several forms, each form has a table of its own, and a field is needed only in the form whose table says so.",
          "",
          ...formTables(bodyOf(kind)).flatMap((table) => [table, ""]),
        ].join("\n"),
      ),
    );
  }
  return files;
}

function config() {
  const everything = { ...CONFIG_VARS, ...WORKER_VARS };
  const groups = [...new Set(Object.values(everything).map((entry) => entry.group))];
  return page(
    {
      title: "Settings",
      description: "Every environment variable the instance reads.",
    },
    [
      "An instance is set up by environment variables and by nothing else. It reads them once, when it starts, and says everything that is wrong with them at once.",
      "",
      ...groups.flatMap((group) => [
        `## ${group}`,
        "",
        "| Variable | When not set | What it is |",
        "| --- | --- | --- |",
        ...Object.entries(everything)
          .filter(([, entry]) => entry.group === group)
          .map(
            ([name, entry]) =>
              `| \`${name}\` | ${entry.required ? "**The instance does not start.**" : cell(entry.default ?? "")} | ${cell(entry.description)}${entry.secret ? " Keep it secret." : ""} |`,
          ),
        "",
      ]),
    ].join("\n"),
  );
}

function cli() {
  return page(
    {
      title: "The volvel command",
      description: "Every command of the CLI, as `volvel --help` lists them.",
    },
    [
      `\`${COMMAND_NAME}\` builds a tenant's repository and deploys it, runs scripts, and moves tenants between instances. This page is drawn from the same list as \`${COMMAND_NAME} --help\`.`,
      "",
      ...COMMAND_GROUPS.flatMap((group) => [
        `## ${group}`,
        "",
        ...COMMANDS.filter((command) => command.group === group).flatMap((command) => [
          "```sh",
          `${COMMAND_NAME} ${command.usage}`,
          "```",
          "",
          sentence(command.summary),
          "",
        ]),
      ]),
      "## Everywhere",
      "",
      ...COMMAND_NOTES.map((note) => `- ${note}`),
    ].join("\n"),
  );
}

function errors() {
  const entries = Object.entries(ERROR_CODES).sort(([a], [b]) => a.localeCompare(b));
  return page(
    {
      title: "Error codes",
      topic: "errors",
      description: "Every code the API answers a failure with, and what to do about each.",
    },
    [
      "A request that fails is answered with a problem: a status, a `code` from this list, a `detail` in words, and the `requestId` an operator can find it by. A code keeps its meaning for as long as it is listed, and one that is retired is never given another.",
      "",
      "A sign-in that fails carries the sign-in library's own code, which is not listed here.",
      "",
      ...entries.flatMap(([code, entry]) => [
        `## ${code}`,
        "",
        `**${sentence(entry.title)}** Sent with status ${entry.status}.`,
        "",
        entry.help,
        "",
      ]),
    ].join("\n"),
  );
}

function docsSyntax() {
  const frontmatter = [...fieldsOf(FRONTMATTER_SCHEMA).values()];
  const files = new Map();
  files.set(
    "docs/index.md",
    page(
      {
        title: "Writing documentation",
        pages: ["frontmatter", "components"],
        description: "What a page of documentation is made of.",
      },
      [
        "A page is a Markdown file with a few lines about itself at its top. Folders give pages their place, to any depth. A folder's own page, `index.md`, may list the order of what is in it with `pages:`, and what it does not list comes after, by title.",
        "",
        "- [What the top of a page says](frontmatter)",
        "- [Components](components), for what Markdown alone cannot say",
      ].join("\n"),
    ),
  );
  files.set(
    "docs/frontmatter.md",
    page(
      {
        title: "The top of a page",
        description: "The fields between the two lines of `---` that begin a page.",
      },
      [
        "A page begins with its title, and whatever else it says about itself, between two lines of `---`:",
        "",
        "```md",
        "---",
        "title: Refund an order",
        "description: How support issues a full or partial refund.",
        "---",
        "```",
        "",
        fieldTable(frontmatter),
      ].join("\n"),
    ),
  );
  const forms = {
    inline: (name) => `:${name}[words]{…}`,
    leaf: (name) => `::${name}{…}`,
    container: (name) => `:::${name}{…}\n…\n:::`,
  };
  files.set(
    "docs/components.md",
    page(
      {
        title: "Components",
        description: "The components a page may use, and what each takes.",
      },
      [
        "A component is written one way, whichever it is: in a line of text as `:name[words]{…}`, on a line of its own as `::name{…}`, or around other blocks between `:::name` and `:::`. What goes between the braces is written `name=value`, with quotes around a value of more than one word.",
        "",
        "## Where each may be used",
        "",
        "| Kind of text | What it is | Components |",
        "| --- | --- | --- |",
        ...Object.values(PROFILES).map(
          (profile) =>
            `| \`${profile.name}\` | ${cell(profile.description)} | ${
              COMPONENTS.filter((one) => one.profiles.includes(profile.name))
                .map((one) => `\`${one.name}\``)
                .join(", ") || "None"
            } |`,
        ),
        "",
        ...COMPONENTS.flatMap((one) => {
          const props = Object.entries(one.props.properties);
          return [
            `## ${one.name}`,
            "",
            one.description,
            "",
            "```md",
            forms[one.form](one.name),
            "```",
            "",
            props.length === 0
              ? "It takes nothing between braces."
              : [
                  "| Takes | Needed | What it is |",
                  "| --- | --- | --- |",
                  ...props.map(
                    ([name, prop]) =>
                      `| \`${name}\` | ${(one.props.required ?? []).includes(name) ? "Yes" : ""} | ${cell(prop.description)}${prop.enum ? ` One of ${prop.enum.map((value) => `\`${value}\``).join(", ")}.` : ""} |`,
                  ),
                ].join("\n"),
            "",
          ];
        }),
      ].join("\n"),
    ),
  );
  return files;
}

/** How much of what the kinds' schemas hold says what it is: fields with a description, of all fields. */
export function coverage(list = kindList()) {
  const fields = list.flatMap((kind) => kind.fields);
  const described = fields.filter((field) => field.description !== "").length;
  return {
    described,
    fields: fields.length,
    share: fields.length === 0 ? 1 : described / fields.length,
  };
}

/** What each field of each kind is, by `<kind>.<path>`, for `::field` and for the console's forms. */
export function fieldDescriptions(list = kindList()) {
  const out = {};
  for (const kind of list) {
    for (const field of kind.fields) {
      if (field.description) out[`${kind.kind}.${field.path}`] = field.description;
    }
  }
  return out;
}

/** Every generated page, by its name under `generated/`. */
export function generate() {
  const list = kindList();
  const files = new Map();
  files.set("permissions.md", permissions());
  for (const [name, text] of kinds(list)) files.set(name, text);
  files.set("settings.md", config());
  files.set("cli.md", cli());
  files.set("errors.md", errors());
  for (const [name, text] of docsSyntax()) files.set(name, text);
  return files;
}

/** The reference's own first page. `more` are pages made by something else, such as the API's. */
export function referenceIndex(more = [], morePages = []) {
  return page(
    {
      title: "Reference",
      icon: "book-open",
      type: "reference",
      pages: ["kinds", "cli", "errors", "docs", "api", ...morePages],
      description: "Lists drawn from the code itself: what it checks, reads and answers with.",
    },
    [
      "These pages are not written. Each is drawn from the list the code itself runs on, when a version is built, so it says what this version does.",
      "",
      "- [Permissions](../../administer/reference/permissions): what each allows",
      "- [Kinds of resource](kinds/index): what each may say",
      "- [Settings](../../self-host/reference/settings): every environment variable",
      "- [The volvel command](cli)",
      "- [Error codes](errors): what each means and what to do",
      "- [Writing documentation](docs/index): the top of a page, and components",
      ...more,
    ].join("\n"),
  );
}
