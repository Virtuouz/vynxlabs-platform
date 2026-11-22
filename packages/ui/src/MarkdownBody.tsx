import { type ProfileName, parse } from "@volvel/markup";
import { useMemo } from "react";
import { Doc } from "./Doc.tsx";
import { useMarkdownKnowledge } from "./markdownKnowledge.ts";

/** The part of `Markdown` that reads the text. It is loaded when there is Markdown to show. */
export default function MarkdownBody({
  text,
  profile = "result",
}: {
  text: string;
  profile?: ProfileName;
}) {
  const tree = useMemo(() => parse(text), [text]);
  // What the host around it knows: a term's meaning, a field's description.
  const { term, field } = useMarkdownKnowledge();
  // A page's text sits under its widget's title, so its level 2 is drawn as a level 3.
  // A result sits inside a page that has its own headings: its own start two levels down.
  return (
    <Doc
      tree={tree}
      profile={profile}
      headingShift={profile === "page" ? 1 : 2}
      {...(term ? { term } : {})}
      {...(field ? { field } : {})}
    />
  );
}
