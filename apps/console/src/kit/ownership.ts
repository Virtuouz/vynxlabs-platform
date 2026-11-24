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

/**
 * What taking a resource over from code says, in one place, so that the places that offer it
 * say the same things: the console manages it as Files from then on. Its definition stays in the
 * code until it is removed there: `volvel pull` writes its file and names where, and a deploy
 * that still has both is refused as defined twice; one that has only the code, after the console
 * changed it, is refused too, until the pull or `--force`.
 */
export const takeOverConsequence = (noun: string): string =>
  `From then on the console manages this ${noun} as files, and you can change it here. Its definition stays in the code until you remove it there: volvel pull writes its file and says where it is defined, and a deploy that has both is refused as defined twice. A deploy of the code alone is refused too if you changed it here, until you pull, or deploy with --force, which takes it back.`;

const takesItBack =
  "Its definition stays in the code until you remove it there: volvel pull writes its file and says where, and a deploy that has both is refused as defined twice. A deploy of the code alone is refused if the console changed it, until volvel pull or --force, which takes it back.";

/**
 * The notice on a resource that is defined in code and can be taken over. `draft`: saving a
 * draft takes it over when the draft is deployed. `publish`: the person takes it over, and the
 * next publish does it. Every editor that offers a take-over says this, and only this.
 */
export const takeOverNotice = (noun: string, how: "draft" | "publish"): string =>
  `This ${noun} is defined in code, in the tenant's repository. ${
    how === "draft"
      ? "Saving a draft of it takes it over"
      : "Taking it over lets you change it here"
  }: it is then managed as files, which the console and the repository both edit. ${takesItBack}`;

/** The notice once the person has taken it over, before it is published. */
export const takingOverNotice = (noun: string): string =>
  `You are taking this ${noun} over from the repository. The next publish makes it managed as files, which the console and the repository both edit. ${takesItBack}`;
