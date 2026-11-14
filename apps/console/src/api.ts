import { keepPreviousData, QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { useCallback, useContext } from "react";

/** A failed API call, carrying the problem document the server sent. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: { path: string; message: string }[];

  constructor(
    status: number,
    problem: {
      code?: string;
      detail?: string;
      title?: string;
      errors?: { path: string; message: string }[];
    },
  ) {
    super(problem.detail ?? problem.title ?? `The request failed (${status}).`);
    this.status = status;
    this.code = problem.code ?? "error";
    this.fields = problem.errors ?? [];
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed = text === "" ? null : JSON.parse(text);
  if (!response.ok) throw new ApiError(response.status, parsed ?? {});
  if (method !== "GET") afterWrite(path);
  return parsed as T;
}

/** A cache for the console's reads. One is made for each page, and for each test. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A failure is shown at once, as before; the stream and writes keep things fresh.
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 0,
      },
    },
  });
}

/** The cache the page is using, so that a write can mark what it changed. */
let active: QueryClient | undefined;
/**
 * Used when a screen is drawn with no cache around it, as some tests do. It
 * forgets a read as soon as nothing on screen uses it, so one screen never
 * sees what another was given.
 */
let fallback: QueryClient | undefined;
function fallbackClient(): QueryClient {
  if (!fallback) {
    fallback = makeQueryClient();
    fallback.setDefaultOptions({
      queries: { ...fallback.getDefaultOptions().queries, gcTime: 0 },
    });
  }
  return fallback;
}

export function setActiveClient(client: QueryClient) {
  active = client;
}

/**
 * Marks what a write may have changed: every read under the same tenant; for a
 * person's own settings, their own reads; for anything else, every read. What
 * is on screen is asked again; the rest is asked again when it is next shown.
 */
export function afterWrite(path: string) {
  const tenant = path.match(/^\/tenants\/[^/?]+/)?.[0];
  if (tenant) invalidatePrefix(tenant);
  // Remembering where someone is, or their own keys, changes nothing anyone else shows.
  else if (path === "/me" || path.startsWith("/me/")) invalidatePrefix("/me");
  else invalidatePrefix("");
}

/** Marks every read whose path is `prefix`, or under it, as out of date. */
export function invalidatePrefix(prefix: string) {
  if (!active) return;
  void active.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return (
        typeof key === "string" &&
        (prefix === "" ||
          key === prefix ||
          key.startsWith(`${prefix}/`) ||
          key.startsWith(`${prefix}?`))
      );
    },
  });
}

export const api = {
  get: <T>(path: string) => call<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => call<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => call<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => call<T>("PATCH", path, body),
  delete: <T>(path: string) => call<T>("DELETE", path),
  /** Sends a file's bytes as they are. */
  upload: async <T>(path: string, file: File, method: "POST" | "PUT" = "POST"): Promise<T> => {
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    const text = await response.text();
    const parsed = text === "" ? null : JSON.parse(text);
    if (!response.ok) throw new ApiError(response.status, parsed ?? {});
    return parsed as T;
  },
};

export interface Loaded<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads a GET route and reloads when the path changes or `reload` is called.
 * Reads are kept in the page's cache by path: two screens asking for the same
 * path share one request, and a write, or an event from the server, has them
 * asked again. While a new path loads, what the last one gave stays shown.
 */
export function useLoad<T>(path: string | null): Loaded<T> {
  const client = useContext(QueryClientContext) ?? fallbackClient();
  const query = useQuery<T, ApiError>(
    {
      queryKey: [path],
      queryFn: () => api.get<T>(path as string),
      enabled: path !== null,
      placeholderData: keepPreviousData,
    },
    client,
  );
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);
  return {
    data: query.data,
    error: query.error ?? undefined,
    loading: query.isPending || query.isFetching,
    reload,
  };
}

export interface Me {
  principal: { type: string; id: string; name: string | null; email: string | null };
  instancePermissions: string[];
  tenants: { id: string; slug: string; name: string }[];
}

export const isOperator = (me: Me) => me.instancePermissions.includes("tenant:*");
