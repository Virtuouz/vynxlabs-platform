import { Button } from "@volvel/ui";
import { useCallback, useEffect, useState } from "react";
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

  const [more, setMore] = useState<{ items: T[]; nextCursor: string | null }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<Error>();
  // A first page that came again (a new search, a reload) starts the list over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new first page resets
  useEffect(() => {
    setMore(undefined);
    setMoreError(undefined);
  }, [page.data]);

  const nextCursor = more ? more.nextCursor : (page.data?.nextCursor ?? null);
  const loadMore = useCallback(async () => {
    if (!first || !nextCursor) return;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const next = await api.get<Page<T>>(withQuery(first, { cursor: nextCursor }));
      setMore((current) => ({
        items: [...(current?.items ?? []), ...next.items],
        nextCursor: next.nextCursor,
      }));
    } catch (error) {
      setMoreError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoadingMore(false);
    }
  }, [first, nextCursor]);

  // Pages after the first may be stale after a change, so a reload starts over.
  const reload = useCallback(() => {
    setMore(undefined);
    page.reload();
  }, [page.reload]);

  return {
    /** Every row loaded so far, or nothing before the first page. */
    items: page.data ? [...page.data.items, ...(more?.items ?? [])] : undefined,
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
