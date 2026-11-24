import type { Manifest, Marked, PageFile, PageHit } from "@volvel/docs-engine";
import { redirectedPath, resolveAsset, resolveLink, trailOf } from "@volvel/docs-engine";
import { splitCode } from "@volvel/markup";
import { Button, CheckboxField, Doc, Notice, Skeleton } from "@volvel/ui";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  House,
  Link2,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify } from "../ask.tsx";
import { Diagram } from "../diagrams/Diagram.tsx";
import { useBrand } from "../kit/brand.tsx";
import { useLook } from "../theme.ts";
import { around } from "./around.ts";
import { loadFields, loadManifest, loadPage, loadRedirects, searchHelp } from "./content.ts";
import { PageLinkTo, useUnderlineTerms, useWorkspaceTerms } from "./glossary.tsx";
import { closeHelp, openHelp, showPageHelp, useHelp } from "./store.ts";

/** An address inside the panel: it opens another page of the help where this one is. */
const INSIDE = "#help:";

type Loaded<T> =
  | { state: "loading" }
  | { state: "failed"; error: Error }
  | { state: "ready"; value: T };

function useLoaded<T>(load: (() => Promise<T>) | undefined, key: string): Loaded<T> | undefined {
  const [loaded, setLoaded] = useState<{ key: string; result: Loaded<T> }>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is made anew each render, and `key` says when it means something else.
  useEffect(() => {
    if (!load) return;
    let current = true;
    setLoaded({ key, result: { state: "loading" } });
    load().then(
      (value) => current && setLoaded({ key, result: { state: "ready", value } }),
      (error: Error) => current && setLoaded({ key, result: { state: "failed", error } }),
    );
    return () => {
      current = false;
    };
  }, [key]);
  if (!load) return undefined;
  return loaded?.key === key ? loaded.result : { state: "loading" };
}

/**
 * The page a topic's id or a page's path means, and the heading asked for. An address that is
 * neither is looked for among the pages that moved or went (`redirects`, with the manifest's own),
 * so a link saved before a page moved still opens it.
 */
export function pageFor(
  manifest: Manifest,
  target: string | undefined,
  redirects: Readonly<Record<string, string>> = {},
): { path: string; anchor?: string } | undefined {
  if (target === undefined) return undefined;
  const [ref = "", anchor] = target.split("#");
  const has = (path: string | undefined) =>
    path !== undefined && manifest.pages.some((page) => page.path === path);
  const moved = redirectedPath({ ...manifest.redirects, ...redirects }, ref);
  const path = manifest.topics[ref] ?? (has(ref) ? ref : has(moved) ? moved : undefined);
  if (path === undefined) return undefined;
  return anchor ? { path, anchor } : { path };
}

/**
 * What the help panel holds: the help for the screen behind it, or whatever
 * the reader followed from there. It is not a dialog. The screen stays in
 * use beside it.
 */
export function HelpPanel({
  tenantId,
  workspaceId,
}: {
  /** Where the reader is, for the notes their own team has added to the help. */
  tenantId?: string | undefined;
  workspaceId?: string | undefined;
} = {}) {
  const { topic, target } = useHelp();
  const brand = useBrand();
  const [underline, setUnderline] = useUnderlineTerms();
  const manifest = useLoaded(loadManifest, "manifest");
  const [query, setQuery] = useState("");
  const look = useLook();
  // What the kinds say of their fields, for a page that shows one with `::field`.
  const loadedFields = useLoaded(loadFields, "fields");
  const fields = loadedFields?.state === "ready" ? loadedFields.value : undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);

  // Where pages that went are led to: asked for with the manifest, and not waited on for a page that is there.
  const moves = useLoaded(loadRedirects, "redirects");
  const ready = manifest?.state === "ready" ? manifest.value : undefined;
  const shown = ready
    ? pageFor(ready, target ?? topic, moves?.state === "ready" ? moves.value : undefined)
    : undefined;
  // The screen's own page, for when what was asked for is not there.
  const ownPage = ready
    ? pageFor(ready, topic, moves?.state === "ready" ? moves.value : undefined)
    : undefined;
  // Set by whatever moves the reader to another page here, so that the page's heading takes focus
  // when it is shown. Another screen's help appearing behind the reader is not a move.
  const moved = useRef(false);
  const go = useCallback((to: string) => {
    moved.current = true;
    // docs:dynamic a page the reader chose in the panel, from the build's own manifest or a link it checked
    openHelp(to);
  }, []);
  const page = useLoaded<PageFile>(
    shown ? () => loadPage(shown.path) : undefined,
    shown?.path ?? "",
  );
  const hits = useLoaded<PageHit[]>(
    query.trim() === "" ? undefined : () => searchHelp(query),
    query.trim(),
  );

  // Another page: start at its top, or at the heading asked for.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the page drawn changes.
  useEffect(() => {
    if (page?.state !== "ready") return;
    const at = shown?.anchor
      ? body.current?.querySelector(`#${CSS.escape(shown.anchor)}`)
      : undefined;
    if (at) at.scrollIntoView({ block: "start" });
    else body.current?.scrollTo?.({ top: 0 });
    if (moved.current) {
      moved.current = false;
      heading.current?.focus({ preventScroll: true });
    }
  }, [page?.state, shown?.path, shown?.anchor]);

  // Opened: the heading takes focus, so the keyboard and a screen reader are in the panel.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const setting = useMemo(
    () => (ready && shown ? around(ready, shown.path, (path) => `${INSIDE}${path}`) : undefined),
    [ready, shown],
  );

  const options = useMemo(() => {
    if (!ready || !shown || !setting) return undefined;
    const set = {
      pages: new Map(ready.pages.map((one) => [one.path, one] as const)) as never,
      topics: ready.topics,
    };
    return {
      link: (href: string) => {
        if (/^(https?:|mailto:)/i.test(href)) return href;
        const found = resolveLink(set, shown.path, href);
        if ("missing" in found) return null;
        return `${INSIDE}${found.path}${found.anchor ? `#${found.anchor}` : ""}`;
      },
      // A picture kept beside the page is one of the build's files.
      image: (src: string) => {
        if (/^https?:/i.test(src)) return null;
        const file = resolveAsset(shown.path, src);
        return file ? `/help/assets/${file}` : null;
      },
      folder: setting.folder,
      glossary: setting.glossary,
      field: (path: string) => (fields?.[path] ? { description: fields[path] as string } : null),
      // A picture taken for this version, in the look the console has now, when there is one:
      // otherwise the page says what it shows.
      screenshot: (name: string) => {
        const looks = ready.screenshotFiles?.[name];
        const file = looks?.[look] ?? looks?.light;
        return file ? `/help/assets/screenshots/${file}` : null;
      },
      term: (props: Record<string, string>) => {
        const term = props.id ? ready.terms[props.id] : undefined;
        // On the page that explains it, "More about" would lead to where the reader is.
        if (!term) return null;
        return term.path === shown.path
          ? { short: term.short }
          : { short: term.short, href: `${INSIDE}${term.path}` };
      },
    };
  }, [ready, shown, setting, fields, look]);

  const title =
    page?.state === "ready"
      ? page.value.title
      : (ready?.pages.find((one) => one.path === shown?.path)?.title ?? "Help");

  // What the reader's own team has added to this topic of the help, from pages they may open.
  const team = useWorkspaceTerms(tenantId, workspaceId);
  const shownEntry = ready?.pages.find((one) => one.path === shown?.path);
  const shownTopic = shownEntry?.topic;
  const fromTeam = shownTopic ? team.extensions.filter((one) => one.topic === shownTopic) : [];

  const copyLink = async () => {
    const address = new URL(location.href);
    address.searchParams.set("help", target ?? topic ?? "index");
    try {
      await navigator.clipboard.writeText(address.toString());
      notify.success("A link to this help is copied.");
    } catch {
      notify.info(address.toString());
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-1 border-line border-b pr-2 pl-4">
        {target !== undefined && topic !== undefined ? (
          <button
            type="button"
            aria-label="Back to the help for this page"
            onClick={() => {
              moved.current = true;
              showPageHelp();
            }}
            className="-ml-2 flex size-7 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" size={16} />
          </button>
        ) : null}
        <h2
          ref={heading}
          tabIndex={-1}
          className="m-0 min-w-0 flex-1 truncate text-title outline-none"
        >
          {title}
        </h2>
        {shown && shown.path !== "index" ? (
          <button
            type="button"
            aria-label="Help home"
            onClick={() => go("index")}
            className="flex size-7 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
          >
            <House aria-hidden="true" size={16} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Copy a link to this help"
          onClick={copyLink}
          className="flex size-7 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <Link2 aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          aria-label="Close help"
          onClick={closeHelp}
          className="flex size-7 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="shrink-0 border-line border-b px-4 py-2">
        <label className="flex h-[30px] items-center gap-2 rounded-control border border-line px-3 text-ink-subtle focus-within:border-line-strong">
          <Search aria-hidden="true" size={14} />
          <input
            type="search"
            aria-label="Search the help"
            placeholder="Search the help"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-meta text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {manifest?.state === "failed" ? (
          <Notice tone="danger">The help could not be loaded. {manifest.error.message}</Notice>
        ) : query.trim() !== "" ? (
          <Results
            hits={hits}
            crumb={(path) =>
              ready
                ? trailOf(ready.nav, path)
                    .filter((folder) => folder.id !== "")
                    .map((folder) => folder.title)
                    .join(" › ")
                : ""
            }
            onOpen={(path) => {
              setQuery("");
              go(path);
            }}
          />
        ) : !ready || page?.state === "loading" || (!shown && moves?.state === "loading") ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : !shown || !page ? (
          <div className="flex flex-col items-start gap-3">
            {target !== undefined ? (
              // An address or an old link asked for a page this build does not have.
              <p className="m-0 text-ink-muted">
                The help has no page called “{target}”.
                {ownPage ? " The page for this screen is still there." : ""}
              </p>
            ) : (
              <p className="m-0 text-ink-muted">There is no help for this screen yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {target !== undefined && ownPage ? (
                <Button size="small" onClick={() => showPageHelp()}>
                  Help for this screen
                </Button>
              ) : null}
              <Button size="small" onClick={() => openHelp("index")}>
                Browse the help
              </Button>
            </div>
          </div>
        ) : page.state === "failed" ? (
          <Notice tone="danger">
            This page of the help could not be loaded. {page.error.message}
          </Notice>
        ) : (
          <>
            {setting && setting.trail.length > 1 ? (
              <nav aria-label="Where this page is" className="mb-3">
                <ol className="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-0.5 p-0 text-meta text-ink-muted">
                  {setting.trail.map((crumb, at) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a trail is a fixed run of one page
                    <li key={`${crumb.title}:${at}`} className="flex min-w-0 items-center gap-1">
                      {crumb.path ? (
                        <a
                          href={`?help=${encodeURIComponent(crumb.path)}`}
                          className="text-ink-muted underline-offset-2 hover:underline"
                          onClick={(event) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                            event.preventDefault();
                            go(crumb.path as string);
                          }}
                        >
                          {crumb.title}
                        </a>
                      ) : (
                        <span
                          {...(at === setting.trail.length - 1 ? { "aria-current": "page" } : {})}
                          className={at === setting.trail.length - 1 ? "text-ink" : undefined}
                        >
                          {crumb.title}
                        </span>
                      )}
                      {/* The separator stays with the crumb before it, so a line never begins with one. */}
                      {at < setting.trail.length - 1 ? (
                        <ChevronRight aria-hidden="true" size={14} className="shrink-0" />
                      ) : null}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
            {shownEntry?.docType ? (
              <p className="m-0 mb-1 text-label text-ink-subtle uppercase">
                {TYPE_NAME[shownEntry.docType] ?? shownEntry.docType}
              </p>
            ) : null}
            {shownEntry?.since ? (
              <p className="m-0 mb-3 text-meta text-ink-muted">New in version {shownEntry.since}</p>
            ) : null}
            <Doc
              tree={page.value.tree}
              profile="product"
              productName={brand.productName}
              headingTop={3}
              idPrefix="help"
              {...options}
              more={(href, word) => (
                <button
                  type="button"
                  className="border-0 bg-transparent p-0 text-action underline"
                  onClick={() => go(href.slice(INSIDE.length))}
                >
                  More about {word}
                </button>
              )}
              components={{
                code: ({ value, lang }) =>
                  lang === "mermaid" ? <Diagram source={value} /> : undefined,
                link: ({ href, external, children }) =>
                  href.startsWith(INSIDE) ? (
                    <a
                      href={`?help=${encodeURIComponent(href.slice(INSIDE.length))}`}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                        event.preventDefault();
                        go(href.slice(INSIDE.length));
                      }}
                    >
                      {children}
                    </a>
                  ) : (
                    <a
                      href={href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {children}
                    </a>
                  ),
              }}
            />
            {setting && (setting.before || setting.after) ? (
              <nav
                aria-label="Pages before and after"
                className="mt-6 grid grid-cols-2 gap-2 border-line border-t pt-4"
              >
                {setting.before ? (
                  <PagerLink to={setting.before} side="before" go={go} />
                ) : (
                  <span />
                )}
                {setting.after ? <PagerLink to={setting.after} side="after" go={go} /> : null}
              </nav>
            ) : null}
            {setting && setting.related.length > 0 ? (
              <section aria-label="Related" className="mt-6 border-line border-t pt-4">
                <h3 className="m-0 mb-2 text-label text-ink-subtle uppercase">Related</h3>
                {setting.related.map((group) => (
                  <div key={group.type} className="mb-2">
                    <h4 className="m-0 mb-1 font-medium text-ink-muted text-meta">{group.label}</h4>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {group.pages.map((one) => (
                        <li key={one.path}>
                          <a
                            href={`?help=${encodeURIComponent(one.path)}`}
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                              event.preventDefault();
                              go(one.path);
                            }}
                          >
                            {one.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}
            {fromTeam.length > 0 ? (
              <section aria-label="From your team" className="mt-6 border-line border-t pt-4">
                <h3 className="m-0 mb-2 text-label text-ink-subtle uppercase">From your team</h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {fromTeam.map((one) => (
                    <li key={`${one.page.app}:${one.page.path}`}>
                      <PageLinkTo page={one.page} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-line border-t px-4 py-2">
        {ready && shown ? (
          // The same page, read in full, on this instance. A plain link, so a new tab keeps the panel's place.
          <a
            href={`/docs/${shownEntry?.url ?? ""}${shown.anchor ? `#${shown.anchor}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-meta text-action"
          >
            Open in documentation
            <ExternalLink aria-hidden="true" size={14} />
          </a>
        ) : null}
        {brand.docsUrl && ready && shown ? (
          // The web's copy may be of a newer version. The one here is of the version that is running.
          <a
            href={`${brand.docsUrl}/docs/${ready.version}/${shown.path.replace(/(^|\/)index$/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-meta text-action"
          >
            Open this page online
            <ExternalLink aria-hidden="true" size={14} />
          </a>
        ) : null}
        <CheckboxField
          label="Underline my team's terms on screens"
          hint="Where a heading or a description uses a word your team's documentation defines."
          name="underline-terms"
          checked={underline}
          onChange={setUnderline}
        />
      </div>
    </div>
  );
}

const TYPE_NAME: Record<string, string> = {
  tutorial: "Tutorial",
  "how-to": "How-to guide",
  reference: "Reference",
  explanation: "Explanation",
};

/** The step before or after a page in its folder. */
function PagerLink({
  to,
  side,
  go,
}: {
  to: { path: string; title: string };
  side: "before" | "after";
  go: (path: string) => void;
}) {
  return (
    <a
      href={`?help=${encodeURIComponent(to.path)}`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        go(to.path);
      }}
      className={`flex min-w-0 flex-col gap-0.5 rounded-control border border-line px-3 py-2 no-underline hover:bg-sunken ${side === "after" ? "col-start-2 items-end text-right" : ""}`}
    >
      <small className="flex items-center gap-1 text-ink-muted">
        {side === "before" ? <ChevronLeft aria-hidden="true" size={14} /> : null}
        {side === "before" ? "Previous" : "Next"}
        {side === "after" ? <ChevronRight aria-hidden="true" size={14} /> : null}
      </small>
      <span className="max-w-full text-ink">{to.title}</span>
    </a>
  );
}

function Results({
  hits,
  crumb,
  onOpen,
}: {
  hits: Loaded<PageHit[]> | undefined;
  /** Where a page is: its collection and folders, so that pages of one name in two places differ. */
  crumb: (path: string) => string;
  /** A page's path, with `#heading` when a place on it was chosen. */
  onOpen: (path: string) => void;
}) {
  if (!hits || hits.state === "loading") {
    return (
      <p className="m-0 text-ink-muted" aria-busy="true">
        Searching…
      </p>
    );
  }
  if (hits.state === "failed") {
    return <Notice tone="danger">The help could not be searched. {hits.error.message}</Notice>;
  }
  if (hits.value.length === 0)
    return <p className="m-0 text-ink-muted">Nothing in the help matches.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Pages found">
      {hits.value.map((hit) => (
        <li key={hit.path}>
          <button
            type="button"
            onClick={() => onOpen(hit.path)}
            className="flex w-full flex-col gap-0.5 rounded-control border-0 bg-transparent px-2 py-1.5 text-left hover:bg-sunken"
          >
            <span className="font-medium">
              <Words words={hit.title} />
            </span>
            {crumb(hit.path) ? (
              <span className="text-label text-ink-subtle">{crumb(hit.path)}</span>
            ) : null}
            {hit.description ? (
              <span className="text-meta text-ink-muted">
                {splitCode(hit.description).map((part, at) =>
                  part.code ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the parts are a fixed run of one description
                    <code key={at} className="font-mono text-code-sm">
                      {part.text}
                    </code>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the parts are a fixed run of one description
                    <span key={at}>{part.text}</span>
                  ),
                )}
              </span>
            ) : null}
          </button>
          {hit.places.length > 0 ? (
            <ul
              className="m-0 mb-1 ml-4 flex list-none flex-col gap-0.5 border-line border-l p-0 pl-2"
              aria-label={`In ${plain(hit.title)}`}
            >
              {hit.places.map((place) => {
                const anchor = place.url.split("#")[1];
                return (
                  <li key={place.url + place.type}>
                    <button
                      type="button"
                      onClick={() => onOpen(anchor ? `${hit.path}#${anchor}` : hit.path)}
                      className="w-full rounded-control border-0 bg-transparent px-2 py-1 text-left text-meta text-ink-muted hover:bg-sunken"
                    >
                      <span className={place.type === "heading" ? "text-ink" : undefined}>
                        <Words words={place.words} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const plain = (words: Marked) => words.map((word) => word.text).join("");

/**
 * A passage from a table reads as its cells, apart by a dot: the pipes and the rule under the
 * header are the markup's, not the reader's.
 */
export function tidyWords(words: Marked): Marked {
  const cut = (text: string) =>
    text.replace(/\|\s*:?-{3,}:?\s*(?=\||$)/g, "").replace(/\s*\|\s*/g, " · ");
  return words
    .map((word, at) => {
      let text = cut(word.text);
      if (at === 0) text = text.replace(/^\s*·\s*/, "");
      if (at === words.length - 1) text = text.replace(/\s*·\s*$/, "");
      return { ...word, text };
    })
    .filter((word) => word.text !== "");
}

/** Words, with what was asked for set in bold. */
function Words({ words }: { words: Marked }) {
  return (
    <>
      {tidyWords(words).map((word, at) =>
        word.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the words are a fixed run of one answer
          <mark key={at} className="bg-transparent font-semibold text-ink">
            {word.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the words are a fixed run of one answer
          <span key={at}>{word.text}</span>
        ),
      )}
    </>
  );
}
