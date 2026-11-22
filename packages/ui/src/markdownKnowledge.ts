import { type FieldInfo, TERM_RESOURCES, type TermInfo } from "@volvel/markup";
import { createContext, useContext } from "react";

/**
 * What a page's Markdown can be told by the app around it: what a `:term[…]` means, and what a
 * `::field{…}` is. A host that knows (the console, a served app: they read the workspace's
 * `GET …/terms`) gives it with `MarkdownKnows`; a text drawn where nothing is given draws a
 * term as its word and a field as its path, which is right for someone who has no use for more.
 */
export interface MarkdownKnowledge {
  /** What a term means. `null` when it can't be found. Absent: the host knows nothing of terms. */
  term?: (props: Record<string, string>) => TermInfo | null;
  /** What a field is. `null` when it can't be found. Absent: the host knows nothing of fields. */
  field?: (path: string) => FieldInfo | null;
}

const NOTHING: MarkdownKnowledge = {};

const Knowledge = createContext<MarkdownKnowledge>(NOTHING);

/** Gives the Markdown drawn inside it what the host knows. */
export const MarkdownKnows = Knowledge.Provider;

export const useMarkdownKnowledge = () => useContext(Knowledge);

/** What `GET …/terms` says, as far as a text needs it. */
export interface WorkspaceWords {
  terms?: readonly {
    id: string;
    term: string;
    aliases?: readonly string[];
    short: string;
    page?: { url: string } | null;
  }[];
  resources?: readonly {
    kind: string;
    path: string;
    description: string | null;
    columns?: readonly { name: string; description: string }[];
  }[];
  /** What each field of each kind is, by `<kind>.<path>`. */
  fields?: Readonly<Record<string, string>> | undefined;
}

/**
 * The knowledge a host builds from the workspace's words: a term by its `id` (or the word
 * itself) from the glossary, a table, script, flow… by its path, and a column of a table, from
 * their descriptions; a field from the kinds' own descriptions of them.
 */
export function knowledgeFrom(words: WorkspaceWords): MarkdownKnowledge {
  const byId = new Map((words.terms ?? []).map((one) => [one.id, one] as const));
  return {
    term: (props) => {
      if (props.id !== undefined) {
        const found = byId.get(props.id);
        if (!found) return null;
        return { short: found.short, ...(found.page ? { href: found.page.url } : {}) };
      }
      const kind = TERM_RESOURCES.find((one) => props[one] !== undefined);
      if (!kind) return null;
      const resource = (words.resources ?? []).find(
        (one) => one.kind === kind && one.path === props[kind],
      );
      const said = props.column
        ? resource?.columns?.find((one) => one.name === props.column)?.description
        : resource?.description;
      return said ? { short: said } : null;
    },
    field: (path) => {
      const description = words.fields?.[path];
      return description ? { description } : null;
    },
  };
}
