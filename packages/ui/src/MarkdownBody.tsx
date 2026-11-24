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
  // The text sits under its widget's title, or inside a page that has headings of its own: the
  // highest heading it uses is drawn as a level 3.
  return (
    <Doc
      tree={tree}
      profile={profile}
      headingTop={3}
      {...(term ? { term } : {})}
      {...(field ? { field } : {})}
    />
  );
}
