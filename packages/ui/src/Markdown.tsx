import { linkKind, type ProfileName } from "@volvel/markup";
import { lazy, Suspense } from "react";
import { Skeleton } from "./Surfaces.tsx";

const Body = lazy(() => import("./MarkdownBody.tsx"));

/**
 * Markdown, drawn as a page of documentation is and by the same reader:
 * headings, lists, quotes, code, and links. Text is never read as HTML, so a
 * value cannot put markup or script on the page.
 *
 * `profile` says what the text may hold. The default, `result`, is what a
 * script gave back: tables too, links to http, https or mailto, and no
 * component. `page` is the text of a widget on a page: small headings, and the
 * documentation's alerts, steps, tabs, details, terms and keys.
 *
 * The reader is loaded when it is first needed, so an app that never shows
 * Markdown never downloads it. Until it arrives a result is shown as written; a
 * page's text, whose alerts and steps would read as code, is drawn as loading.
 */
export function Markdown({ text, profile = "result" }: { text: string; profile?: ProfileName }) {
  return (
    <Suspense
      fallback={
        profile === "page" ? (
          <Skeleton
            lines={Math.min(6, Math.max(2, text.split("\n").length))}
            label="Loading the text"
          />
        ) : (
          <pre className="m-0 whitespace-pre-wrap font-sans">{text}</pre>
        )
      }
    >
      <Body text={text} profile={profile} />
    </Suspense>
  );
}

/** Whether a link may be followed from the page: one to http, https or mailto. */
export function safeHref(href: string): string | undefined {
  const kind = linkKind(href);
  return kind === "http" || kind === "mailto" ? href.trim() : undefined;
}
