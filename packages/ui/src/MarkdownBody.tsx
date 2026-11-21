import { parse } from "@volvel/markup";
import { useMemo } from "react";
import { Doc } from "./Doc.tsx";

/** The part of `Markdown` that reads the text. It is loaded when there is Markdown to show. */
export default function MarkdownBody({ text }: { text: string }) {
  const tree = useMemo(() => parse(text), [text]);
  // A result sits inside a page that has its own headings: its own start two levels down.
  return <Doc tree={tree} profile="result" headingShift={2} />;
}
