import { keepPreviousData, QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { grants, isErrorCode } from "@volvel/manifest";
import { useCallback, useContext } from "react";
import { sessionIsOpen, whenRenewed } from "./session.ts";

/** Whom to ask when a refusal names a permission and nobody who can give it. */
const ASK_FOR_ACCESS =
  "Ask a member who can give access in this tenant (an owner or administrator) to give you a role with it.";

/** The same, for the screens of the instance, where the ones to ask are its operators. */
const ASK_AN_OPERATOR = "Ask an operator of this instance to give you access.";

/** Whom to ask for access, by the screen the person is on. */
export const askForAccess = () =>
  location.pathname.startsWith("/instance/") ? ASK_AN_OPERATOR : ASK_FOR_ACCESS;

/**
 * A pattern refusal as the field would say it: the characters that are allowed, not the
 * expression. Anything else the server said is kept as it was.
 */
export function fieldWords(message: string): string {
  const length = /^must NOT have (fewer|more) than (\d+) characters?$/.exec(message);
  if (length) {
    const n = Number(length[2]);
    return `Use ${length[1] === "fewer" ? "at least" : "at most"} ${n} ${n === 1 ? "character" : "characters"}.`;
  }
  const found = /^must match pattern (.+)$/.exec(message);
  if (!found) return message;
  const pattern = found[1] as string;
  const allowed = [
    pattern.includes("a-z") ? "lowercase letters" : "",
    pattern.includes("A-Z") ? "capital letters" : "",
    pattern.includes("0-9") ? "digits" : "",
    /[-](?!z|9)|-\]|-/.test(pattern.replace(/[a-zA-Z0-9]-[a-zA-Z0-9]/g, "")) ? "hyphens" : "",
    pattern.includes("_") ? "underscores" : "",
    pattern.includes("\\.") ? "dots" : "",
  ].filter(Boolean);
  if (allowed.length === 0) return "Use the form that is allowed here: check the characters in it.";
  const list =
    allowed.length === 1
      ? (allowed[0] as string)
      : `${allowed.slice(0, -1).join(", ")} and ${allowed.at(-1)}`;
  return `Use only ${list}.`;
}

/**
 * The code of each refusal whose words were just made, so a notice of those words, wherever a
 * screen shows them, can lead to what the code means. Every `ApiError` records its own message;
 * a screen that joins more words to it records those with `withCode`. A short list: only what was
 * just shown can be asked about.
 */
const wordsOfCode = new Map<string, string>();

/** Says `words` for `error`, and remembers the error's code against them. Returns `words`. */
export function withCode(words: string, error: unknown): string {
  if (error instanceof ApiError && isErrorCode(error.code)) wordsOfCode.set(words, error.code);
  if (wordsOfCode.size > 60) wordsOfCode.delete(wordsOfCode.keys().next().value as string);
  return words;
}

/** The code the API gave for a refusal that was said in these words, if any. */
export function codeOfWords(words: string): string | undefined {
  return wordsOfCode.get(words);
}

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
    // An address that names something that cannot exist (a slug where an ID goes) is a place
    // that was not found, not a request whose "params" are not valid.
    const placeOnly =
      status === 400 &&
      problem.code === "validation_failed" &&
      (problem.errors ?? []).length > 0 &&
      (problem.errors ?? []).every((one) => one.path.startsWith("/params"));
    const said = placeOnly
      ? "That place was not found. Check the address, or go back."
      : (problem.detail ?? problem.title ?? `The request failed (${status}).`);
    // A refusal that names a permission is owed whom to ask, wherever it is shown.
    super(status === 403 && /permissions?\.$/.test(said) ? `${said} ${askForAccess()}` : said);
    this.status = status;
    this.code = problem.code ?? "error";
    this.fields = (problem.errors ?? []).map((one) => ({
      ...one,
      message: fieldWords(one.message),
    }));
    this.requestId = problem.requestId ?? requestId ?? undefined;
    withCode(this.message, this);
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

/**
 * Reads asked for before the screen that needs them was drawn: `index.html` starts the ones that
 * follow from the address alone while the scripts are still arriving (`window.__vxEarly`, by path).
 * A screen's own read of the same path takes the answer once; a read that failed, or that
 * answered 401 before anyone had signed in, is asked again.
 */
declare global {
  interface Window {
    __vxEarly?: Record<string, Promise<Response> | undefined>;
  }
}
function takeEarly(path: string): Promise<Response> | undefined {
  const kept = typeof window === "undefined" ? undefined : window.__vxEarly?.[path];
  if (!kept || !window.__vxEarly) return undefined;
  delete window.__vxEarly[path];
  return kept;
}

/**
 * Sends a request to the API. A 401 on a signed-in page means the session ended:
 * the request waits for the person to sign in again (see `session.ts`) and is sent
 * once more, so the page and what it holds are not lost. Sign-in itself, and a
 * page nobody signed in to, get the plain answer.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => fetch(`/api/v1${path}`, { credentials: "same-origin", ...init });
  const response = await send();
  if (response.status !== 401 || !sessionIsOpen() || path.startsWith("/auth/")) return response;
  await whenRenewed();
  return send();
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const early = method === "GET" ? takeEarly(path) : undefined;
  const response = await (
    early?.then((kept) => (kept.status === 401 ? undefined : kept)).catch(() => undefined) ??
    Promise.resolve(undefined)
  ).then(
    (kept) =>
      kept ??
      apiFetch(path, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      }),
  );
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

/** Forgets every read the page holds, so what one person read is never shown to the next. */
export function clearReads() {
  active?.clear();
  fallback?.clear();
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
    const response = await apiFetch(path, {
      method,
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
  /** What shows is the answer to an earlier path, kept while the new one loads. */
  stale?: boolean | undefined;
  /** Asks again. The promise settles once the answer is in (a failure is in `error`, not thrown). */
  reload: () => Promise<void>;
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
  const reload = useCallback(async () => {
    if (path !== null) await refetch();
  }, [path, refetch]);
  return {
    data: query.data,
    error: query.error ?? undefined,
    loading: query.isPending || query.isFetching,
    updatedAt: query.dataUpdatedAt || undefined,
    stale: query.isPlaceholderData,
    reload,
  };
}

/**
 * `useLoad` for a read that follows what is chosen (a table's columns, a column's values): what
 * was read for the choice before is never given as this one's, nor anything when nothing is asked.
 */
export function useLoadOf<T>(path: string | null): Loaded<T> {
  const found = useLoad<T>(path);
  return path === null || found.stale ? { ...found, data: undefined } : found;
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
  principal: {
    type: string;
    id: string;
    name: string | null;
    email: string | null;
    /** The identity provider whose directory sets this person's name, when one does. */
    nameFrom?: string | null;
  };
  instancePermissions: string[];
  tenants: { id: string; slug: string; name: string }[];
}

/**
 * Whether this person runs the instance: what an operator is given at the instance, however the
 * role says it (`tenant:*` or everything). The Instance area and the tenant list both ask this.
 */
export const isOperator = (me: Me) => grants(me.instancePermissions, "tenant:write");
