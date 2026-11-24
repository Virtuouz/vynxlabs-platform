/**
 * The words for who owns a resource, in one place. A resource is owned as **Files**, which the
 * console and the repository both edit (the YAML files of a repository, and what is made in the
 * console), or as **Code**, a TypeScript definition that is changed in the repository only. The
 * docs use the same two words.
 */

export type Ownership = "ui" | "code";

/** What a "Managed in" label says. */
export const ownershipWord = (ownership: string): "Files" | "Code" =>
  ownership === "code" ? "Code" : "Files";

/** A sentence that follows a label, or a heading, when there is room for it. */
export const ownershipSentence = (ownership: string, past = false): string =>
  `${past ? "Was managed" : "Managed"} as ${ownership === "code" ? "code" : "files"}.`;

/** What each word means, for a place that can explain it. */
export const ownershipMeaning = (ownership: string): string =>
  ownership === "code"
    ? "Defined in TypeScript in the repository. Change it there and deploy."
    : "Files, edited in the console and in the repository. A deploy of the repository is refused if the console changed it since the last `volvel pull`.";
