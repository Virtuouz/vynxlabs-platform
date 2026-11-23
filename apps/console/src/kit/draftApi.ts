import { ApiError, api } from "../api.ts";

/**
 * What every save of a draft says about the draft it is based on. The server holds each kind to
 * it: a save over a draft names the revision it saw, a first draft over a deployed resource
 * names none, a new resource says `create`, and anything else is refused as `draft_changed`
 * instead of replacing what someone else saved.
 */
export type DraftBase =
  /** The draft that was open, at this revision. */
  | { revision: number }
  /** Something new: refused when the path is held by a draft or a resource. */
  | { create: true }
  /** There was no draft: this makes the first one over what is deployed. */
  | { first: true };

/** A draft as the server holds it. */
export interface DraftRead<B = Record<string, unknown>> {
  path: string;
  kind: string;
  schemaVersion: number;
  revision: number;
  deleted: boolean;
  body: B;
  title?: string | null;
}

/** Whether the server refused a save because the draft is not the one the save was based on. */
export function isDraftClash(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "draft_changed";
}

/** The draft at a path as it is now, or nothing when there is none. */
export async function readDraft<B = Record<string, unknown>>(
  root: string,
  path: string,
): Promise<DraftRead<B> | undefined> {
  try {
    return await api.get<DraftRead<B>>(`${root}/drafts/${path}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

/** What goes in a save's body to say which draft it is based on. */
export const baseOf = (base: DraftBase) =>
  "revision" in base ? { revision: base.revision } : "create" in base ? { create: true } : {};

/**
 * The one way the console saves a draft: the same body the server takes, with the draft it is
 * based on. A conflict is thrown as an `ApiError` that `isDraftClash` knows.
 */
export function putDraft<R = DraftRead>(
  root: string,
  path: string,
  payload: {
    kind: string;
    schemaVersion: number;
    body: Record<string, unknown>;
    deleted?: boolean;
    path?: string;
    title?: string | null;
    renameDashboards?: boolean;
  },
  base: DraftBase,
): Promise<R> {
  return api.put<R>(`${root}/drafts/${path}`, { ...payload, ...baseOf(base) });
}

/**
 * For a button that acts on a resource once, without an editor holding its draft: it reads the
 * draft there is at that moment and bases the save on it, or on none. A draft that someone saves
 * between the read and the save is still a conflict.
 */
export async function putOnDraftNow<R = DraftRead>(
  root: string,
  path: string,
  payload: Parameters<typeof putDraft>[2],
): Promise<R> {
  const now = await readDraft(root, path);
  return putDraft<R>(root, path, payload, now ? { revision: now.revision } : { first: true });
}
