import type { Form, NodeType } from "./tree.js";

/**
 * The components a page may use, and the profiles that say which of them, and
 * which Markdown, a kind of text may hold. This is the contract every renderer
 * draws and every author writes against.
 */

/** One value between a component's braces. Every value is written as text. */
export interface PropSchema {
  type: "string";
  description: string;
  enum?: readonly string[];
  maxLength?: number;
  pattern?: string;
}

/** What a component's braces may hold. It is JSON Schema, of the few keywords a text value needs. */
export interface PropsSchema {
  type: "object";
  properties: Record<string, PropSchema>;
  required?: readonly string[];
  additionalProperties: false;
}

export type ProfileName = "product" | "docs" | "description" | "short" | "result";

export interface ComponentSpec {
  name: string;
  form: Form;
  description: string;
  props: PropsSchema;
  /** For a leaf or a container: whether words in square brackets are needed, allowed or refused. */
  label: "required" | "optional" | "none";
  /** For a container: the only components it may hold directly. Left out, it holds any blocks. */
  holds?: readonly string[];
  /** The only component this one may sit directly inside. */
  within?: string;
  profiles: readonly ProfileName[];
  /** A check the schema cannot say. It gives what is wrong, or nothing. */
  check?: (props: Record<string, string>) => string | undefined;
  /** A few words on what it is for, for a menu that inserts it. */
  summary: string;
  /**
   * What an editor inserts for it. `$0` is where the cursor is left. A
   * container is written with three colons and one inside it with four: an
   * editor that inserts it inside another container adds colons to both.
   */
  insert: string;
}

const text = (description: string, more: Partial<PropSchema> = {}): PropSchema => ({
  type: "string",
  description,
  ...more,
});

const PATH = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";
const ID = "^[a-z0-9][a-z0-9_-]*$";

/** What a term can point at other than a glossary entry: a resource, by its kind and path. */
export const TERM_RESOURCES = ["table", "script", "flow", "app", "connection", "query"] as const;

const EVERYWHERE: readonly ProfileName[] = ["product", "docs"];

export const COMPONENTS: readonly ComponentSpec[] = [
  {
    name: "alert",
    summary: "A note, tip or warning",
    insert: ":::alert[Title]{type=info}\n$0\n:::",
    form: "container",
    description: "A note set apart from the text around it.",
    label: "optional",
    props: {
      type: "object",
      properties: {
        type: text("How much it matters. `info` when left out.", {
          enum: ["info", "success", "warning", "danger"],
        }),
      },
      additionalProperties: false,
    },
    profiles: ["product", "docs", "description"],
  },
  {
    name: "term",
    summary: "Link a glossary term or column",
    insert: ":term[$0]{id=}",
    form: "inline",
    description:
      "A word with a definition behind it: a glossary term by its `id`, or a resource by its kind and path.",
    label: "none",
    props: {
      type: "object",
      properties: {
        id: text("The glossary term.", { pattern: ID, maxLength: 80 }),
        table: text("A table, by its path.", { pattern: PATH }),
        column: text("A column of the table named.", { pattern: "^[a-z][a-z0-9_]*$" }),
        script: text("A script, by its path.", { pattern: PATH }),
        flow: text("A flow, by its path.", { pattern: PATH }),
        app: text("An app, by its path.", { pattern: PATH }),
        connection: text("A connection, by its path.", { pattern: PATH }),
        query: text("A query, by its path.", { pattern: PATH }),
      },
      additionalProperties: false,
    },
    profiles: ["product", "docs", "description"],
    check(props) {
      const resources = TERM_RESOURCES.filter((kind) => props[kind] !== undefined);
      if (props.id !== undefined && resources.length > 0) {
        return "names a glossary term and a resource. Say one.";
      }
      if (props.id === undefined && resources.length !== 1) {
        return resources.length === 0
          ? "says neither a glossary term (id=…) nor a resource (table=…, script=…)."
          : "names more than one resource. Say one.";
      }
      if (props.column !== undefined && props.table === undefined) {
        return "names a column and no table.";
      }
      return undefined;
    },
  },
  {
    name: "field",
    summary: "A field, with what it is for",
    insert: "::field{path=$0}",
    form: "leaf",
    description: "What a field of a resource means, taken from the kind's own description of it.",
    label: "none",
    props: {
      type: "object",
      properties: {
        path: text(
          "The kind, then the way to the field, with `*` for any one: `table.columns.*.type`.",
          {
            pattern: "^[a-z_]+(\\.([A-Za-z0-9_]+|\\*))+$",
          },
        ),
      },
      required: ["path"],
      additionalProperties: false,
    },
    profiles: EVERYWHERE,
  },
  {
    name: "steps",
    summary: "A numbered procedure",
    insert: ":::steps\n1. $0\n2. \n:::",
    form: "container",
    description: "A numbered list drawn as steps to follow in order.",
    label: "none",
    props: { type: "object", properties: {}, additionalProperties: false },
    profiles: EVERYWHERE,
  },
  {
    name: "tabs",
    summary: "Alternatives side by side",
    insert: ":::tabs\n::::tab{label=One}\n$0\n::::\n::::tab{label=Two}\n\n::::\n:::",
    form: "container",
    description: "Several ways to do one thing, one shown at a time.",
    label: "none",
    holds: ["tab"],
    props: { type: "object", properties: {}, additionalProperties: false },
    profiles: EVERYWHERE,
  },
  {
    name: "tab",
    summary: "One more way, inside tabs",
    insert: ":::tab{label=$0}\n\n:::",
    form: "container",
    description: "One of the ways inside `tabs`.",
    label: "none",
    within: "tabs",
    props: {
      type: "object",
      properties: { label: text("What the tab is called.", { maxLength: 60 }) },
      required: ["label"],
      additionalProperties: false,
    },
    profiles: EVERYWHERE,
  },
  {
    name: "details",
    summary: "Collapsible section",
    insert: ':::details{summary="$0"}\n\n:::',
    form: "container",
    description: "A section that stays folded until it is opened.",
    label: "none",
    props: {
      type: "object",
      properties: { summary: text("What is shown while it is folded.", { maxLength: 120 }) },
      required: ["summary"],
      additionalProperties: false,
    },
    profiles: EVERYWHERE,
  },
  {
    name: "kbd",
    summary: "A keyboard key",
    insert: ":kbd[$0]",
    form: "inline",
    description: "Keys to press.",
    label: "none",
    props: { type: "object", properties: {}, additionalProperties: false },
    profiles: EVERYWHERE,
  },
  {
    name: "product",
    summary: "The product's name",
    insert: ":product[]$0",
    form: "inline",
    description: "The product's name, as the instance shows it.",
    label: "none",
    props: { type: "object", properties: {}, additionalProperties: false },
    profiles: ["product"],
  },
  {
    name: "screenshot",
    summary: "A picture of the console",
    insert: '::screenshot{name=$0 alt=""}',
    form: "leaf",
    description: "A picture of the console, taken when a version is released.",
    label: "none",
    props: {
      type: "object",
      properties: {
        name: text("The picture's name.", { pattern: PATH }),
        alt: text("What the picture shows, for someone who cannot see it.", { maxLength: 300 }),
      },
      required: ["name", "alt"],
      additionalProperties: false,
    },
    profiles: ["product"],
  },
  {
    name: "code-tabs",
    summary: "One snippet, several languages",
    insert: ":::code-tabs\n```js title=JavaScript\n$0\n```\n```py title=Python\n\n```\n:::",
    form: "container",
    description:
      "The same code in several languages, one shown at a time. It holds only code blocks.",
    label: "none",
    props: { type: "object", properties: {}, additionalProperties: false },
    profiles: EVERYWHERE,
  },
  {
    name: "file-tree",
    summary: "Folders and files",
    insert: ":::file-tree\n- folder/\n  - $0file.md\n:::",
    form: "container",
    description: "Files and folders, written as a list inside lists.",
    label: "none",
    props: { type: "object", properties: {}, additionalProperties: false },
    profiles: EVERYWHERE,
  },
  {
    name: "glossary",
    summary: "Every term this collection defines",
    insert: "::glossary$0",
    form: "leaf",
    description:
      "Every term defined by the pages of the collection this page is in, from A to Z, with what each means and the page that defines it. `scope=site` gives every term of the site.",
    label: "none",
    props: {
      type: "object",
      properties: {
        scope: text("Whose terms: the collection's, or the whole site's.", {
          enum: ["collection", "site"],
        }),
      },
      additionalProperties: false,
    },
    profiles: ["docs"],
  },
  {
    name: "pages",
    summary: "What is in this folder",
    insert: "::pages$0",
    form: "leaf",
    description:
      "The pages and folders of the folder this page is in, each with what it is for. A folder's own page with nothing written in it shows this.",
    label: "none",
    props: { type: "object", properties: {}, additionalProperties: false },
    profiles: ["docs"],
  },
];

export type LinkKind = "http" | "mailto" | "relative";

export interface Profile {
  name: ProfileName;
  description: string;
  /** The Markdown it may hold. */
  nodes: ReadonlySet<NodeType>;
  /** The shallowest heading it may hold: 3 refuses `#` and `##`. */
  minHeading: number;
  links: ReadonlySet<LinkKind>;
  /** Where a picture may come from: a file beside the page, or an https address. */
  images: ReadonlySet<"relative" | "https">;
  /** The most characters its words may come to. */
  maxLength?: number;
}

const INLINE: NodeType[] = [
  "root",
  "paragraph",
  "text",
  "strong",
  "emphasis",
  "delete",
  "inlineCode",
  "break",
];
const BLOCKS: NodeType[] = [
  ...INLINE,
  "heading",
  "list",
  "listItem",
  "blockquote",
  "rule",
  "code",
  "link",
];
const ALL: NodeType[] = [...BLOCKS, "image", "table", "tableRow", "tableCell", "component"];

export const PROFILES: Record<ProfileName, Profile> = {
  product: {
    name: "product",
    description: "The product's own documentation.",
    nodes: new Set(ALL),
    minHeading: 1,
    links: new Set<LinkKind>(["http", "mailto", "relative"]),
    images: new Set<"relative" | "https">(["relative"]),
  },
  docs: {
    name: "docs",
    description: "A page of a tenant's documentation.",
    nodes: new Set(ALL),
    minHeading: 1,
    links: new Set<LinkKind>(["http", "mailto", "relative"]),
    images: new Set<"relative" | "https">(["relative", "https"]),
  },
  description: {
    name: "description",
    description: "The longer description of a resource or a column.",
    nodes: new Set<NodeType>([
      ...INLINE,
      "heading",
      "list",
      "listItem",
      "link",
      "code",
      "component",
    ]),
    minHeading: 3,
    links: new Set<LinkKind>(["http", "mailto", "relative"]),
    images: new Set(),
  },
  short: {
    name: "short",
    description: "The few words behind a term or beside a field. Plain text.",
    nodes: new Set<NodeType>(["root", "paragraph", "text", "break"]),
    minHeading: 7,
    links: new Set(),
    images: new Set(),
    maxLength: 500,
  },
  result: {
    name: "result",
    description: "Markdown a script gives back as its result.",
    nodes: new Set<NodeType>([...BLOCKS, "table", "tableRow", "tableCell"]),
    minHeading: 1,
    links: new Set<LinkKind>(["http", "mailto"]),
    images: new Set(),
  },
};

export interface Registry {
  components: ReadonlyMap<string, ComponentSpec>;
}

export function registry(components: readonly ComponentSpec[] = COMPONENTS): Registry {
  return { components: new Map(components.map((one) => [one.name, one])) };
}

export const REGISTRY = registry();
