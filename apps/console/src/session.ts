import { useSyncExternalStore } from "react";

/**
 * Whether the person's session still stands, noticed in one place. The console
 * learns who is signed in from `/me` (`beginSession`). When the server then
 * answers any request with 401, the session has ended: that request waits here
 * (`whenRenewed`) instead of failing, the page stays as it is with its unsaved
 * work, and a sheet offers to sign in again. Once the same person has signed in,
 * the waiting requests are sent again.
 */
let who: string | undefined;
let ended = false;
let release: (() => void) | undefined;
let renewal: Promise<void> | undefined;
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of listeners) listener();
};

/** `/me` named the person: from now on a 401 means the session ended. */
export function beginSession(id: string) {
  who = id;
}

/** Signed out, or never signed in: a 401 is the plain answer it always was. */
export function endSession() {
  who = undefined;
  renewed();
}

/** The person whose session this page holds. */
export const sessionHolder = () => who;

export const sessionIsOpen = () => who !== undefined;

/** Called when the server says 401. Resolves once the person has signed in again. */
export function whenRenewed(): Promise<void> {
  if (!ended) {
    ended = true;
    renewal = new Promise<void>((resolve) => {
      release = resolve;
    });
    tell();
  }
  return renewal as Promise<void>;
}

/** The same person is signed in again: what waited is sent again. */
export function renewed() {
  const wasEnded = ended;
  ended = false;
  const done = release;
  release = undefined;
  renewal = undefined;
  done?.();
  if (wasEnded) tell();
}

export function useSessionEnded(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ended,
    () => false,
  );
}
