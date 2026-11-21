import { linkKind } from "@volvel/markup";
import { lazy, Suspense } from "react";

const Body = lazy(() => import("./MarkdownBody.tsx"));

/**
 * Markdown a script gave back, drawn as a page of documentation is and by the
 * same reader: headings, lists, quotes, tables, code, and links to http,
 * https or mailto. Text is never read as HTML, so a value cannot put markup
 * or script on the page, and no component can be used in it.
 *
 * The reader is loaded when it is first needed, so an app that never shows
 * Markdown never downloads it. Until it arrives the text is shown as written.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<pre className="m-0 whitespace-pre-wrap font-sans">{text}</pre>}>
      <Body text={text} />
    </Suspense>
  );
}

/** Whether a link may be followed from the page: one to http, https or mailto. */
export function safeHref(href: string): string | undefined {
  const kind = linkKind(href);
  return kind === "http" || kind === "mailto" ? href.trim() : undefined;
}
