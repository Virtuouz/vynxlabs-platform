// The pages of reference that are drawn from the code's own typed lists: widgets and their
// actions, the steps, starts, nodes and expressions of flows, connectors, keyboard shortcuts,
// the functions a query may use, the audit log's actions, the platform's events and the metrics
// an instance serves. Each page says what its list says, and nothing else.
//
// `listFiles()` gives every file as text, under the same names `generate()` uses, so that
// `docs:check` compares them as it does the rest. It needs the packages built.
import {
  AUDIT_ACTIONS,
  AUDIT_AREAS,
  actionSchema,
  actionValueSchema,
  actionWords,
  auditAreaOf,
  BUILTIN_CONNECTOR_LIST,
  CONDITION_TESTS,
  conditionSchema,
  EXPRESSION_FUNCTIONS,
  EXPRESSION_LIMITS,
  EXPRESSION_NAMES,
  EXPRESSION_OPERATORS,
  FLOW_STARTS,
  FLOW_STEPS,
  PLATFORM_EVENTS,
  stepSchema,
  widgetRulesSchema,
} from "@volvel/manifest";
import { SCOPES, SHORTCUTS } from "../../../apps/console/src/kit/shortcuts.ts";
import { FUNCTION_GROUPS } from "../../../apps/control-plane/dist/kernel/data/query/allowed.js";
import { METRIC_LIST } from "../../../apps/control-plane/dist/kernel/metric-list.js";
import { CORE_NODES } from "../../nodes/dist/index.js";
import { httpConnector, oauth2Connector, smtpConfigSchema } from "../../sdk/dist/index.js";
import { CATEGORY_TITLES, DATA_SHAPES, TAB_TITLES } from "../../widget-sdk/dist/index.js";
import { CORE_WIDGETS } from "../../widgets-core/dist/index.js";
import { cell, page, tablesOf, typeOf } from "./schema.mjs";

const sentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
const code = (text) => `\`${text}\``;
const table = (head, rows) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((one) => cell(one)).join(" | ")} |`),
  ].join("\n");
const short = (value) => {
  const text = JSON.stringify(value);
  return text !== undefined && text.length <= 80 ? text.replace(/^"|"$/g, "") : "";
};
const slug = (type) => type.split("/").at(-1);

// ---------------------------------------------------------------------------
// Widgets

const SOURCES_DEFAULT = "A table or a query; on a dashboard, SQL too.";

/** The fields of a widget's settings, every depth, with the words the inspector gives them. */
function settingFields(widget) {
  const tables = tablesOf({
    type: "object",
    properties: widget.config.properties,
    required: widget.config.required ?? [],
  });
  const seen = new Map();
  for (const one of tables)
    for (const field of one.fields) if (!seen.has(field.path)) seen.set(field.path, field);
  return [...seen.values()].map((field) => {
    const top = !field.path.includes(".") ? widget.config.properties[field.path] : undefined;
    const hint = top?.["x-volvel"];
    const choices = hint?.choices
      ? ` ${Object.entries(hint.choices)
          .map(
            ([value, label]) =>
              `${code(value)} is ${label.toLowerCase() === label ? label : `“${label}”`}`,
          )
          .join(", ")}.`
      : "";
    const said =
      widget.words?.[field.path] ?? (field.description || (hint?.help ? sentence(hint.help) : ""));
    return {
      ...field,
      label: hint?.label ?? "",
      where: hint ? [TAB_TITLES[hint.tab], hint.group].filter(Boolean).join(", ") : "",
      level: hint?.level === "more" ? "More options" : "",
      words: `${said}${choices}`.trim(),
      default: top ? short(widget.defaults?.[field.path] ?? top.default) : "",
    };
  });
}

function widgetPage(widget) {
  const fields = settingFields(widget);
  const data = Object.entries(widget.data);
  const events = Object.entries(widget.events);
  const layout = widget.layout;
  const size = (one) => `${one.w} by ${one.h}`;
  const out = [
    `The widget \`${widget.type}\`, version ${widget.version}. ${sentence(widget.description)} It is in the category ${CATEGORY_TITLES[widget.category]}, and may be put on ${widget.surfaces.map((one) => (one === "app" ? "an app's page" : "a dashboard")).join(" and ")}.`,
    "",
    widget.role === "container"
      ? "It holds other widgets, placed in it on a grid of twelve columns, one level deep."
      : widget.role === "filters"
        ? "Its filters are set by whoever reads the page, and narrow the widgets of the page."
        : "",
    "",
    "## What it reads",
    "",
    data.length === 0
      ? "It reads no data."
      : table(
          ["Input", "Shape", "Needed", "Comes from", "Notes"],
          data.map(([name, input]) => [
            code(name),
            `${input.shape}: ${DATA_SHAPE_WORDS[input.shape]}`,
            input.required === false ? "" : "Yes",
            input.sources ? input.sources.map(code).join(", ") : SOURCES_DEFAULT,
            [
              input.label ? `Called “${input.label}” in the editor.` : "",
              input.values ? `Works out ${input.values.min} to ${input.values.max} values.` : "",
              input.breakdowns
                ? `Broken down ${input.breakdowns.min} to ${input.breakdowns.max} ways.`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
          ]),
        ),
    "",
    "## What it does when used",
    "",
    events.length === 0
      ? "It raises no events, so there is nothing to attach an action to."
      : [
          "Each event may have an [action](action-steps) attached.",
          "",
          table(
            ["Event", "When", "What it gives the action"],
            events.map(([name, event]) => [
              code(name),
              event.label,
              EVENT_GIVES_WORDS[event.gives],
            ]),
          ),
        ].join("\n"),
    "",
    "## Size",
    "",
    table(
      ["", "Columns by rows"],
      [
        ["Smallest", size(layout.min)],
        ["When added", size(layout.default)],
        ...(layout.max ? [["Largest", size(layout.max)]] : []),
      ],
    ),
    "",
    `The grid has twelve columns, and a row is 40 pixels high. On a phone: ${PHONE_WORDS[layout.phone ?? "stack"]}.${layout.frame === "none" ? " It is drawn on the page as it is, without a card." : ""}`,
    "",
    "## Settings",
    "",
    fields.length === 0
      ? "It has no settings."
      : [
          "A field with `*` in its path is inside a list, or under a name of the author's choosing. A setting left out takes its default.",
          "",
          table(
            ["Setting", "Holds", "Default", "Where in the editor", "What it does"],
            fields.map((field) => [
              code(field.path),
              field.type,
              field.default,
              [field.label ? `“${field.label}”` : "", field.where, field.level]
                .filter(Boolean)
                .join(", "),
              `${field.words} ${field.limits ?? ""}`.trim(),
            ]),
          ),
        ].join("\n"),
  ];
  return page(
    { title: widget.title, description: `${sentence(widget.description)}` },
    out.join("\n"),
  );
}

const DATA_SHAPE_WORDS = {
  rows: "rows of a table or a query, a page at a time",
  summary: "rows gathered into groups with values worked out for each, or one line of values",
  record: "one row",
  approvals: "the steps of the workspace's flows that wait for a person's decision",
};
const EVENT_GIVES_WORDS = {
  record: "The row, by its ID.",
  group: "The values of the group's breakdown.",
  nothing: "Nothing.",
};
const PHONE_WORDS = {
  stack: "it takes the full width, in reading order",
  list: "it takes the full width and is drawn as a list, a table as rows of cards",
  hide: "it is not shown",
};

function widgetsIndex() {
  return page(
    {
      title: "Widgets",
      pages: ["action-steps", ...CORE_WIDGETS.map((one) => slug(one.type))],
      description: "The widgets an app's page or a dashboard is made of, and what each is set by.",
    },
    [
      "A page of an app and a dashboard are made of widgets. Each widget declares what it reads, what it does when used, how big it is and what can be set on it, and the editor, the checks and these pages are all drawn from that one declaration.",
      "",
      "- [Actions](action-steps): what a button or a clicked row does",
      "",
      table(
        ["Widget", "What it is for", "Category", "Where"],
        CORE_WIDGETS.map((widget) => [
          `[${widget.title}](${slug(widget.type)})`,
          sentence(widget.description),
          CATEGORY_TITLES[widget.category],
          widget.surfaces.map((one) => (one === "app" ? "App" : "Dashboard")).join(", "),
        ]),
      ),
      "",
      "## What a widget reads",
      "",
      table(
        ["Shape", "What it is"],
        DATA_SHAPES.map((shape) => [code(shape), sentence(DATA_SHAPE_WORDS[shape])]),
      ),
    ].join("\n"),
  );
}

/** The forms of a schema, each under a heading, with the words a form carries. */
function formsOf(schema, headingLevel = "###") {
  return tablesOf(schema)
    .filter((one) => one.fields.length > 0)
    .map((one) => {
      const heading =
        one.form === ""
          ? ""
          : `${headingLevel} ${one.form}\n\n${one.about ? `${one.about}\n\n` : ""}`;
      return `${heading}${fieldsTable(one.fields)}`;
    })
    .join("\n\n");
}

function fieldsTable(fields) {
  return table(
    ["Field", "Holds", "Needed", "What it is"],
    fields.map((field) => [
      code(field.path),
      field.type,
      field.required ? "Yes" : "",
      `${field.description} ${field.limits ?? ""}`.trim(),
    ]),
  );
}

/** A schema with what is drawn on its own page left out: lists of forms and maps of values become one line. */
function shallow(schema) {
  if (Array.isArray(schema)) return schema.map(shallow);
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "items" && (value.oneOf || value.anyOf)) out.items = { type: "object" };
    else if (key === "additionalProperties" && value && typeof value === "object" && value.oneOf)
      out.additionalProperties = true;
    else out[key] = shallow(value);
  }
  return out;
}

/** The table of a one-level schema, under a heading with what it says. */
function oneForm(form, level) {
  const [first] = tablesOf(shallow({ ...form, oneOf: undefined }));
  return `${fieldsTable(first.fields)}`.replace(/^$/, level);
}

function actionsPage() {
  const tests = {
    is: "The field equals the value.",
    is_not: "The field does not equal the value.",
    gt: "The field is more than the value.",
    gte: "The field is at least the value.",
    lt: "The field is less than the value.",
    lte: "The field is at most the value.",
    contains: "The field contains the value, or is one of the values given.",
    is_empty: "The field has nothing in it. No value is given.",
    is_not_empty: "The field has something in it. No value is given.",
  };
  /** Each form of a union under a heading of its own, with what the form says and its fields. */
  const eachForm = (union, name) =>
    union.oneOf
      .map((form) => {
        const tell = Object.entries(form.properties).find(
          ([, one]) => one.const !== undefined && name === "do",
        );
        const heading = tell
          ? `### \`${tell[1].const}\``
          : `### With ${form.required.map(code).join(" and ")}`;
        return [heading, "", form.description ?? "", "", oneForm(form)].join("\n");
      })
      .join("\n\n");
  return page(
    {
      title: "Actions",
      description: "What a widget does when someone presses it or clicks a row.",
    },
    [
      "An action is a short list of steps, written in the page and run from the deployed page. Steps that change data or start work run on the server, in the order written; steps that move the reader, such as opening a page or saying something, run in the browser after.",
      "",
      "An action is its own grant: whoever may open the app may run it, unless `runBy` narrows that. It changes only the fields it names, to the values it names, on rows the person may read, and its conditions are checked again on the server. Nothing in an action is an expression: every value is one of the kinds below.",
      "",
      "## An action",
      "",
      oneForm(actionSchema),
      "",
      "## Steps",
      "",
      "A step is written with `do`, and each kind takes its own fields.",
      "",
      eachForm(stepSchema, "do"),
      "",
      "## Values",
      "",
      "A step that sets a field, or gives a script or a flow its input, gives each value as one of these.",
      "",
      eachForm(actionValueSchema, "value"),
      "",
      "## Conditions",
      "",
      "A condition is a sentence, such as “Status is Unpaid”. When more than one is given, all must hold.",
      "",
      eachForm(conditionSchema, "condition"),
      "",
      table(
        ["Test", "It holds when"],
        CONDITION_TESTS.map((test) => [code(test), tests[test]]),
      ),
      "",
      "## Who sees a widget",
      "",
      "A widget may be shown only when its conditions hold, or only to members of some groups. This only changes what is drawn: it is never what keeps data from someone, which a table's row rules do.",
      "",
      oneForm(widgetRulesSchema),
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Flows

function flowsIndex() {
  return page(
    {
      title: "Flows",
      pages: ["steps", "starts", "nodes", "expressions"],
      description:
        "What a flow is made of: its steps, its starts, the nodes it comes with and the expressions it works out.",
    },
    [
      "A flow is steps joined by edges. The page for [the flow kind](../kinds/flow) lists every field of its file; these pages say what each part does.",
      "",
      "- [Steps](steps): what each kind of step does",
      "- [Starts](starts): the ways a flow begins",
      "- [Nodes](nodes): the steps that come with the platform",
      "- [Expressions](expressions): what a step may read, and the functions it may call",
    ].join("\n"),
  );
}

function stepsPage() {
  return page(
    {
      title: "Flow steps",
      description: "What each kind of step of a flow does, and what it gives.",
    },
    [
      "A step is written under `nodes` in a flow, with its `type`. Edges join steps, and a step that can fail may have an edge marked `error`, which is taken when it fails. A step that fails with none is the end of the run, as failed.",
      "",
      table(
        ["Type", "Called", "What it does", "What it gives"],
        Object.entries(FLOW_STEPS).map(([type, step]) => [
          code(type),
          step.label,
          step.description,
          step.output,
        ]),
      ),
      "",
      "The fields of each are on the [flow kind's page](../kinds/flow).",
    ].join("\n"),
  );
}

function startsPage() {
  return page(
    { title: "Flow starts", description: "The ways a flow begins, and what each hands the flow." },
    [
      "A start is a step of type `trigger`, and its `trigger.type` is one of these. A flow may have several, and a run begins at the one that fired.",
      "",
      table(
        ["Type", "Called", "When it fires", "What `trigger` holds"],
        Object.entries(FLOW_STARTS).map(([type, start]) => [
          code(type),
          start.label,
          start.description,
          start.gives,
        ]),
      ),
      "",
      "The fields of each are on the [flow kind's page](../kinds/flow).",
    ].join("\n"),
  );
}

function nodesPage() {
  return page(
    {
      title: "Core nodes",
      description: "The steps that come with the platform, and what each takes and gives.",
    },
    [
      "A node is a script the platform adds to a workspace's bundle when one of its flows uses it, so that a run is pinned to the version of a node it was deployed with. A flow runs one with a script step that names its path. The step names the one connection, table or event the node works on, and the run may reach that and nothing else.",
      "",
      ...CORE_NODES.flatMap((node) => {
        const input = tablesOf(node.input);
        const fields = input[0]?.fields ?? [];
        return [
          `## ${node.label}`,
          "",
          `${code(node.path)}. ${sentence(node.description)} It works on ${node.takes.length === 0 ? "nothing outside itself" : node.takes.map((one) => `a ${one}`).join(" and ")}, and is stopped after ${node.timeoutSeconds} seconds.`,
          "",
          "### Takes",
          "",
          table(
            ["Field", "Holds", "Needed", "What it is"],
            fields.map((field) => {
              const own = node.input.properties[field.path];
              return [
                code(field.path),
                field.type,
                field.required ? "Yes" : "",
                `${field.description || (own?.title ? `${own.title}.` : "")} ${field.limits ?? ""}`.trim(),
              ];
            }),
          ),
          "",
          "### Gives",
          "",
          table(
            ["Field", "Holds"],
            Object.entries(node.output.properties ?? {}).map(([name, schema]) => [
              code(name),
              typeOf(schema),
            ]),
          ),
          "",
        ];
      }),
    ].join("\n"),
  );
}

function expressionsPage() {
  const groups = [...new Set(EXPRESSION_FUNCTIONS.map((one) => one.group))];
  return page(
    {
      title: "Expressions",
      description:
        "What an expression in a flow may read, and the operators and functions it may use.",
    },
    [
      "Where a step takes an expression, it is written in CEL, the Common Expression Language. An expression is worked out when its step is reached, in a thread of its own with a time limit and a memory limit, and it can read only the names below.",
      "",
      "## What it may read",
      "",
      table(
        ["Name", "What it holds", "Where"],
        EXPRESSION_NAMES.map((one) => [code(one.name), one.description, one.where]),
      ),
      "",
      "Numbers that come from a step or a request are decimals. A whole number is not added to one: write `1.0`, or convert with `int(...)`. `now` is a timestamp, and `string(now)` is it as ISO 8601 in UTC.",
      "",
      "## Operators",
      "",
      table(
        ["Written", "What it does"],
        EXPRESSION_OPERATORS.map((one) => [code(one.operator), one.description]),
      ),
      "",
      "## Functions",
      "",
      'Each example is worked out when the documentation is built, with `trigger` set to `{"name": "Ada", "n": 3, "tags": ["a", "b"]}` and `now` the fifth of March 2026 at half past ten, UTC.',
      "",
      ...groups.flatMap((group) => [
        `### ${group}`,
        "",
        table(
          ["Written", "What it does", "Example", "Gives"],
          EXPRESSION_FUNCTIONS.filter((one) => one.group === group).map((one) => [
            code(one.signature),
            one.description,
            code(one.example),
            code(JSON.stringify(one.gives)),
          ]),
        ),
        "",
      ]),
      "## Limits",
      "",
      table(
        ["Limit", "Value"],
        EXPRESSION_LIMITS.map((one) => [one.limit, one.value]),
      ),
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Connectors

function connectorsPage() {
  const schemas = {
    http: httpConnector.configSchema,
    smtp: smtpConfigSchema,
    oauth2: oauth2Connector.configSchema,
  };
  return page(
    {
      title: "Connectors",
      description: "The connectors every worker has, and what a connection to each holds.",
    },
    [
      "A connector is an adapter for one kind of outside system. A connection is a resource that names a connector, holds its configuration and, as its secret, the credential. These connectors are part of every worker, and a bundle carries none of them. To reach anything else, write a connector of your own: it is a resource of kind [connector](kinds/connector).",
      "",
      ...BUILTIN_CONNECTOR_LIST.flatMap((one) => [
        `## ${one.label}`,
        "",
        `The connector ${code(one.name)}. ${sentence(one.description)} A script is given ${one.client}`,
        "",
        formsOf(schemas[one.name], "###"),
        "",
      ]),
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Shortcuts

const KEY_WORDS = { Mod: "Ctrl or Cmd", " ": "Space", ArrowDown: "Down", ArrowUp: "Up" };
const keyWords = (keys) =>
  keys
    .split("+")
    .map((key) => KEY_WORDS[key] ?? key)
    .join(" + ");

function shortcutsPage() {
  return page(
    { title: "Keyboard shortcuts", description: "Every shortcut of the console." },
    [
      "`g` followed by a letter is two presses, one after the other. `Ctrl or Cmd` is Ctrl on Windows and Linux and Cmd on a Mac. Press `?` anywhere in the console to see this list there. A shortcut is ignored while you are typing in a field, unless it says otherwise.",
      "",
      ...SCOPES.flatMap((scope) => [
        `## ${scope}`,
        "",
        table(
          ["Keys", "What it does"],
          Object.values(SHORTCUTS)
            .filter((one) => one.scope === scope)
            .map((one) => [one.keys.map((keys) => code(keyWords(keys))).join(" or "), one.label]),
        ),
        "",
      ]),
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// SQL functions

function sqlFunctionsPage() {
  return page(
    {
      title: "SQL functions",
      description: "The functions a query may name, and what is refused.",
    },
    [
      "A query is checked before it runs, and anything that is not listed here is refused. A function is listed when it only works on the values it is given: it reads no setting, no file, no catalog and no other session, changes nothing and cannot be made to wait. That keeps out `set_config`, `pg_sleep`, `pg_read_file`, `dblink` and whatever a later version of the database adds.",
      "",
      ...FUNCTION_GROUPS.flatMap((group) => [
        `## ${group.name}`,
        "",
        sentence(group.description),
        "",
        group.functions.map(code).join(", "),
        "",
      ]),
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Audit actions, platform events, metrics

function auditPage() {
  const areas = AUDIT_AREAS.map((one) => ({
    ...one,
    logs: [one.tenant ? "A tenant's log" : "", one.instance ? "The instance's log" : ""]
      .filter(Boolean)
      .join(" and "),
  }));
  return page(
    {
      title: "Audit actions",
      description:
        "Every action the audit log records, by area, in the words the console reads it in.",
    },
    [
      "Every change is recorded, in the same transaction as the change, as an entry with an action written `area.verb`, such as `end_user.signed_in`. The area is the word before the dot, and a log can be narrowed to one. The words are how the console reads the action.",
      "",
      ...areas.flatMap((area) => [
        `## ${area.tenant ?? area.instance}`,
        "",
        `The area ${code(area.area)}, in ${area.logs}${area.tenant && area.instance && area.tenant !== area.instance ? `, where the instance's log calls it “${area.instance}”` : ""}.`,
        "",
        table(
          ["Action", "Read as"],
          AUDIT_ACTIONS.filter((action) => auditAreaOf(action) === area.area).map((action) => [
            code(action),
            actionWords(action),
          ]),
        ),
        "",
      ]),
    ].join("\n"),
  );
}

function eventsPage() {
  return page(
    {
      title: "Platform events",
      description: "The events the platform publishes itself, and what each carries.",
    },
    [
      "A trigger or a flow may listen for an event the platform publishes, as it does for an event of the workspace. Nobody declares these in a repository, and only the platform publishes them. An event's payload is what the script or the flow is started with.",
      "",
      ...PLATFORM_EVENTS.flatMap((event) => [
        `## ${event.name}`,
        "",
        sentence(event.description),
        "",
        table(
          ["Payload", "Holds", "What it is"],
          event.payload.map((field) => [
            code(field.name),
            field.type,
            `${field.description}${field.optional ? " Left out when there is none." : ""}`,
          ]),
        ),
        "",
      ]),
    ].join("\n"),
  );
}

function metricsPage() {
  return page(
    {
      title: "Metrics",
      description: "Every series an instance serves at /metrics.",
    },
    [
      "An instance serves its metrics in the Prometheus text format, at `/metrics`, to an operator who may read them. Each replica counts what it saw, and a Prometheus server adds the replicas up. What must agree across replicas, such as how many runs wait, is read from the database each time it is scraped. Every name begins `volvel_`.",
      "",
      "A series with `workspace` among its labels names the workspace by its slug, with `tenant` beside it. An instance may keep workspaces out of its labels, and then the series are added together.",
      "",
      table(
        ["Series", "Type", "Labels", "What it is"],
        METRIC_LIST.map((metric) => [
          code(metric.name),
          metric.type,
          metric.labels.length === 0 ? "None" : metric.labels.map(code).join(", "),
          `${sentence(metric.help)}${metric.when ? ` Only when: ${metric.when}` : ""}`,
        ]),
      ),
    ].join("\n"),
  );
}

/** Every page made from a typed list, by its name under `generated/`. */
/** The settings of a widget that have no words yet, by path: nothing the generator can say of them. */
export function wordlessSettings(widget) {
  return settingFields(widget)
    .filter((field) => field.words === "")
    .map((field) => field.path);
}

/** The paths a widget gives words for that are not in its settings. */
export function strayWords(widget) {
  const have = new Set(settingFields(widget).map((field) => field.path));
  return Object.keys(widget.words ?? {}).filter((path) => !have.has(path));
}

export function listFiles() {
  const files = new Map();
  files.set("widgets/index.md", widgetsIndex());
  files.set("widgets/action-steps.md", actionsPage());
  for (const widget of CORE_WIDGETS)
    files.set(`widgets/${slug(widget.type)}.md`, widgetPage(widget));
  files.set("flows/index.md", flowsIndex());
  files.set("flows/steps.md", stepsPage());
  files.set("flows/starts.md", startsPage());
  files.set("flows/nodes.md", nodesPage());
  files.set("flows/expressions.md", expressionsPage());
  files.set("connectors.md", connectorsPage());
  files.set("shortcuts.md", shortcutsPage());
  files.set("sql-functions.md", sqlFunctionsPage());
  files.set("audit-actions.md", auditPage());
  files.set("platform-events.md", eventsPage());
  files.set("metrics.md", metricsPage());
  return files;
}

/** The links the reference's first page carries to these pages. */
export const LIST_LINKS = [
  "- [Widgets](widgets/index): what each is set by, and what a button does",
  "- [Flows](flows/index): steps, starts, nodes and expressions",
  "- [Connectors](connectors): what a connection to each holds",
  "- [Keyboard shortcuts](shortcuts)",
  "- [SQL functions](sql-functions): what a query may call",
  "- [Audit actions](../../administer/reference/audit-actions): what the log records",
  "- [Platform events](platform-events): what the platform publishes",
  "- [Metrics](../../self-host/reference/metrics): every series an instance serves",
  "- [The SDK](sdk/index): every export of the packages a repository is written against",
];
export const LIST_PAGES = [
  "widgets",
  "flows",
  "connectors",
  "shortcuts",
  "sql-functions",
  "platform-events",
  "sdk",
];
