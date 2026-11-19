import { keepPreviousData, QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { useCallback, useContext } from "react";

/** A failed API call, carrying the problem document the server sent. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: { path: string; message: string }[];
  /** The server's ID for the request, for a report to whoever runs the instance. */
  readonly requestId: string | undefined;

  constructor(
    status: number,
    problem: {
      code?: string;
      detail?: string;
      title?: string;
      errors?: { path: string; message: string }[];
      requestId?: string;
    },
    requestId?: string | null,
  ) {
    super(problem.detail ?? problem.title ?? `The request failed (${status}).`);
    this.status = status;
    this.code = problem.code ?? "error";
    this.fields = problem.errors ?? [];
    this.requestId = problem.requestId ?? requestId ?? undefined;
  }
}

/**
 * Reads an answer. Something between the console and the server, such as a
 * proxy with its own error page, can answer with HTML: that is an `ApiError`
 * that says so, not a parse failure.
 */
async function read<T>(response: Response): Promise<T> {
  const text = await response.text();
  const requestId = response.headers.get("x-request-id");
  let parsed: unknown = null;
  if (text !== "") {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(
        response.status,
        {
          code: "unreadable_response",
          title: response.ok
            ? "The server's answer could not be read."
            : `The server could not be reached (${response.status}${response.statusText ? ` ${response.statusText}` : ""}). Try again in a moment.`,
        },
        requestId,
      );
    }
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      (parsed ?? {}) as ConstructorParameters<typeof ApiError>[1],
      requestId,
    );
  }
  // A change to a tenant's access that waits for a second person changed nothing. Whoever
  // asked for it is told so where a failure would be told, in the server's words.
  if (response.status === 202 && (parsed as { waiting?: unknown } | null)?.waiting === true) {
    throw new ApiError(
      202,
      {
        code: "awaiting_approval",
        detail:
          (parsed as { detail?: string }).detail ??
          "It waits for a second person. Nothing changed yet.",
      },
      requestId,
    );
  }
  return parsed as T;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const parsed = await read<T>(response);
  if (method !== "GET") afterWrite(path);
  return parsed;
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
    return read<T>(response);
  },
};

export interface Loaded<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  /** When the data shown was read, for "Updated 14:02" while nothing is live. */
  updatedAt?: number | undefined;
  reload: () => void;
}

/**
 * Loads a GET route and reloads when the path changes or `reload` is called.
 * Reads are kept in the page's cache by path: two screens asking for the same
 * path share one request, and a write, or an event from the server, has them
 * asked again. While a new path loads, what the last one gave stays shown.
 */
export function useLoad<T>(
  path: string | null,
  /**
   * `every`: asked again this often, in milliseconds, while it is on show and
   * the tab is in view. What it last gave stays shown while it asks.
   */
  options: { every?: number | undefined } = {},
): Loaded<T> {
  const client = useContext(QueryClientContext) ?? fallbackClient();
  const query = useQuery<T, ApiError>(
    {
      queryKey: [path],
      queryFn: () => api.get<T>(path as string),
      enabled: path !== null,
      placeholderData: keepPreviousData,
      ...(options.every ? { refetchInterval: options.every } : {}),
    },
    client,
  );
  const { refetch } = query;
  // A query with no path is switched off; asking it again would request `/api/v1null`.
  const reload = useCallback(() => {
    if (path !== null) void refetch();
  }, [path, refetch]);
  return {
    data: query.data,
    error: query.error ?? undefined,
    loading: query.isPending || query.isFetching,
    updatedAt: query.dataUpdatedAt || undefined,
    reload,
  };
}

/**
 * Changes what a read holds on screen at once, before the server answers, and
 * gives back a way to undo that when it refuses. The write's own refresh then
 * brings what the server says.
 */
export function useCacheEdit() {
  const client = useContext(QueryClientContext) ?? fallbackClient();
  return useCallback(
    <T>(path: string, edit: (data: T) => T): (() => void) => {
      const before = client.getQueryData<T>([path]);
      if (before !== undefined) client.setQueryData<T>([path], edit(before));
      return () => client.setQueryData<T>([path], before);
    },
    [client],
  );
}

export interface Me {
  principal: { type: string; id: string; name: string | null; email: string | null };
  instancePermissions: string[];
  tenants: { id: string; slug: string; name: string }[];
}

export const isOperator = (me: Me) => me.instancePermissions.includes("tenant:*");
