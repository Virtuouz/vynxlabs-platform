import { Button } from "@volvel/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useLoad } from "../api.ts";

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** The route with the query added to it, whether or not it has a query already. */
const withQuery = (path: string, query: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const text = params.toString();
  if (!text) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${text}`;
};

/**
 * A list the server pages and searches: the first page, the pages after it on
 * `loadMore`, and the search sent to the server as `?search=`, so that what is
 * past the first page can still be found. A new search or route starts again at
 * the first page. The shape End users, members, tenants and the pickers share.
 */
export function usePagedList<T>(
  path: string | null,
  {
    search = "",
    limit = 50,
    debounce = 250,
  }: {
    search?: string;
    /** How many to a page. 0 asks for none, for a route that does not page. */
    limit?: number;
    debounce?: number;
  } = {},
) {
  // What is typed is sent a moment after the last key, not with each one.
  const [sent, setSent] = useState(search.trim());
  useEffect(() => {
    const wanted = search.trim();
    if (wanted === sent) return;
    if (debounce <= 0) return setSent(wanted);
    const timer = setTimeout(() => setSent(wanted), debounce);
    return () => clearTimeout(timer);
  }, [search, sent, debounce]);

  const first =
    path === null
      ? null
      : withQuery(path, { limit: limit > 0 ? String(limit) : undefined, search: sent });
  const page = useLoad<Page<T>>(first);

  // What the reader has loaded past the first page, and which first page it follows.
  const [view, setView] = useState<{
    first: string;
    head: T[];
    rest: T[];
    nextCursor: string | null;
  }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<Error>();
  const [again, setAgain] = useState(0);
  const held = view && view.first === first ? view : undefined;
  const loaded = useRef<{ count: number; last: unknown }>({ count: 0, last: undefined });
  loaded.current = { count: held?.rest.length ?? 0, last: held?.rest.at(-1) };
  // A first page that came again for the same list (a change, a reload) is read again together with
  // as many pages after it as were on screen, so the reader keeps their place and misses nothing a
  // new row pushed down. A new search or route starts again at the first page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new first page or a reload reads again
  useEffect(() => {
    const head = page.data;
    if (!head || !first) return;
    const { count: want, last } = loaded.current;
    if (want === 0) {
      setView(undefined);
      setMoreError(undefined);
      return;
    }
    let live = true;
    (async () => {
      const rest: T[] = [];
      let cursor = head.nextCursor;
      // Far enough that the last row the reader had is on screen again, wherever new rows moved it;
      // a row with no ID is followed by count.
      const id = (row: unknown) =>
        typeof row === "object" && row !== null ? (row as { id?: unknown }).id : undefined;
      const reached = () =>
        id(last) !== undefined
          ? [...head.items, ...rest].some((row) => id(row) === id(last))
          : rest.length >= want;
      for (let pages = 0; cursor && !reached() && pages < 100; pages++) {
        const next = await api.get<Page<T>>(withQuery(first, { cursor }));
        rest.push(...next.items);
        cursor = next.nextCursor;
      }
      if (live) {
        setView({ first, head: head.items, rest, nextCursor: cursor });
        setMoreError(undefined);
      }
    })().catch((error) => {
      if (live) setMoreError(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      live = false;
    };
  }, [page.data, again]);

  const nextCursor = held ? held.nextCursor : (page.data?.nextCursor ?? null);
  const loadMore = useCallback(async () => {
    if (!first || !nextCursor || !page.data) return;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const next = await api.get<Page<T>>(withQuery(first, { cursor: nextCursor }));
      setView((current) => {
        const own = current && current.first === first ? current : undefined;
        return {
          first,
          head: own?.head ?? (page.data as Page<T>).items,
          rest: [...(own?.rest ?? []), ...next.items],
          nextCursor: next.nextCursor,
        };
      });
    } catch (error) {
      setMoreError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoadingMore(false);
    }
  }, [first, nextCursor, page.data]);

  // What follows a change is read again, as far as the reader had read.
  const reload = useCallback(() => {
    setAgain((one) => one + 1);
    page.reload();
  }, [page.reload]);

  return {
    /** Every row loaded so far, or nothing before the first page. */
    items: page.data ? [...(held?.head ?? page.data.items), ...(held?.rest ?? [])] : undefined,
    error: page.error,
    moreError,
    /** The first page is coming, or a search just typed has not been answered. */
    loading: page.loading || search.trim() !== sent,
    hasMore: nextCursor !== null,
    loadMore,
    loadingMore,
    reload,
    /** What is being searched for, as the server was told. */
    searched: sent,
  };
}

/** What follows a list that pages: how many are shown, and the button for more. */
export function LoadMore({
  shown,
  hasMore,
  loading,
  error,
  noun,
  onMore,
}: {
  shown: number;
  hasMore: boolean;
  loading: boolean;
  error?: Error | undefined;
  /** What the rows are, in the plural: "members". */
  noun: string;
  onMore: () => void;
}) {
  if (!hasMore && !error) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-meta text-ink-muted">
      <span>{hasMore ? `Showing the first ${shown} ${noun}.` : `Showing ${shown} ${noun}.`}</span>
      {error ? (
        <span className="text-danger">The next page did not load: {error.message}</span>
      ) : null}
      {hasMore ? (
        <Button size="small" loading={loading} onClick={onMore}>
          {error ? "Try again" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
