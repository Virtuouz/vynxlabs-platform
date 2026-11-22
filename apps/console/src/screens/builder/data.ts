import type { InterfaceBody } from "@volvel/manifest";

/** An interface as the list of them says. */
export interface Listed {
  path: string;
  title: string;
  deployed: boolean;
  draft: boolean;
  removing: boolean;
  /** `code` when the repository manages it: it is changed and removed there. */
  ownership?: string;
  app: string | null;
  pages?: number;
  version?: number | null;
  tables?: string[];
  editedAt?: string | null;
}

/** What a draft save answers: the revision it made, and what stops the draft being published. */
export interface DraftAnswer {
  revision: number;
  body: InterfaceBody;
  problems?: { path: string; message: string }[];
}

/** A name for a page or a resource, made from what a person called it. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * The same, as it is typed into an address field: a dash typed at the end stays, or "x-y" could
 * never be written. It is made a whole `slug` when the field is submitted.
 */
export const slugTyping = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);
