import { useCallback, useEffect, useState } from "react";

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
  return parsed as T;
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

/** Loads a GET route and reloads when the path changes or `reload` is called. */
export function useLoad<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({
    loading: true,
  });
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is what `reload` changes to ask again
  useEffect(() => {
    if (path === null) return;
    let current = true;
    setState((previous) => ({ ...previous, loading: true }));
    api.get<T>(path).then(
      (data) => current && setState({ data, loading: false }),
      (error) => current && setState({ error: error as ApiError, loading: false }),
    );
    return () => {
      current = false;
    };
  }, [path, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export interface Me {
  principal: { type: string; id: string; name: string | null; email: string | null };
  instancePermissions: string[];
  tenants: { id: string; slug: string; name: string }[];
}

export const isOperator = (me: Me) => me.instancePermissions.includes("tenant:*");
