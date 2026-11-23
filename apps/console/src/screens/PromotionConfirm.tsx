import { Button, Notice } from "@volvel/ui";
import { ask } from "../ask.tsx";
import type { PromotionPreview } from "./Release.tsx";

/** A message from the API starts in lower case, to follow a path. Alone, it is a sentence. */
export const sentence = (message: string) =>
  `${message.charAt(0).toUpperCase()}${message.slice(1)}`;

/**
 * What a promotion changes that something outside calls. Only production has
 * agents that were told a name and cannot be told another at once, and only
 * there does the server ask for the confirmation.
 */
export const breakingOf = (data: PromotionPreview | undefined) =>
  data?.target.type === "production" ? (data.summary?.breaking ?? []) : [];

/** The sentence that follows a promotion's question, naming what an agent will find changed. */
export const breakingText = (data: PromotionPreview | undefined) => {
  const breaking = breakingOf(data);
  return breaking.length > 0
    ? ` It also changes what an agent calls: ${breaking.map((one) => sentence(one.message)).join(" ")}`
    : "";
};

/**
 * Asks whether to delete what the server took for a rename done wrong: the paths it named,
 * in the workspace they would go from. The same words for a promotion, a pull and an activation.
 */
export const askToDelete = (paths: string[], where: string) =>
  ask.confirm({
    title: `Delete ${paths.join(", ")} in ${where}?`,
    text: "What each one holds there is cut off from whatever is created in its place. If one of them was renamed, give the new one its key in the repository instead, and nothing is lost.",
    action: "Delete them and look again",
    danger: true,
  });

/**
 * The two things a promotion may need said before it goes: a deletion the
 * server took for a rename ("Delete them anyway"), and names that something
 * outside calls. The Promote step and the review of a request both show it,
 * and both send what it asked: `confirmBreaking` when `breakingOf` is not
 * empty, and `allowDelete` with what `onAllow` was given.
 */
export function PromotionConfirm({
  data,
  targetName,
  allowed,
  onAllow,
}: {
  data: PromotionPreview;
  targetName: string;
  /** Paths already said to be deletable. */
  allowed: string[];
  onAllow: (paths: string[]) => void;
}) {
  const breaking = breakingOf(data);
  return (
    <>
      {data.refusal?.code === "rename_suspected" && data.canPromote !== false ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="danger"
            onClick={async () => {
              const paths = data.refusal?.errors.map((one) => one.path) ?? [];
              const sure = await askToDelete(paths, targetName);
              if (sure) onAllow([...allowed, ...paths]);
            }}
          >
            Delete them anyway
          </Button>
        </div>
      ) : null}
      {breaking.length > 0 ? (
        <Notice tone="attention">
          <strong>
            This changes {breaking.length === 1 ? "a name" : "names"} that something outside calls.
          </strong>
          <ul className="mt-2 mb-0 pl-5">
            {breaking.map((one) => (
              <li key={`${one.path} ${one.message}`}>{sentence(one.message)}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </>
  );
}
