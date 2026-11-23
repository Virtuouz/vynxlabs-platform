import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { isDraftClash } from "./draftApi.ts";

/**
 * One way for an editor to save a draft. The editor keeps its own state for what is on the
 * screen and tells this hook each time it changes (`edit`); the hook sends a snapshot of the
 * newest value, so a save never carries what was typed before the last key.
 *
 * - It clears `dirty` only if nothing changed since the snapshot was taken.
 * - If something changed while a save was in flight, it saves again right after, with the
 *   revision the first save returned.
 * - What the server answers is given to `applied` with whether it is still the newest. An
 *   answer that is not must not replace what the person has typed since.
 * - The newest revision it has been given is the one it sends.
 * - A save the server refuses because someone else saved the draft first is not tried again and
 *   not reported to `failed`: `clashed` is true, for the editor to show `DraftClash`, until the
 *   editor loads their version (`reset`).
 */
export function useDraftSave<T, A extends { revision: number }>(options: {
  /** Sends one snapshot. A refusal is thrown. */
  send: (value: T, revision: number | undefined) => Promise<A>;
  /** After a save went through. `current` is false when the value changed while it was sent. */
  applied?: (answer: A, sent: T, current: boolean) => void;
  /** After a save was refused. The draft stays unsaved. */
  failed?: (error: unknown) => void;
}) {
  const latest = useRef<T>(undefined);
  const version = useRef(0);
  const saved = useRef(0);
  const revision = useRef<number>(undefined);
  const flight = useRef<Promise<boolean>>(undefined);
  const clash = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<number>();
  const [clashed, setClashed] = useState(false);
  const hooks = useRef(options);
  useLayoutEffect(() => {
    hooks.current = options;
  });

  /** The value on screen has changed. */
  const edit = useCallback((value: T) => {
    latest.current = value;
    version.current += 1;
    setDirty(true);
  }, []);

  /** A value loaded, or one given up for what is saved: nothing is unsaved. */
  const reset = useCallback((value: T, at?: number) => {
    latest.current = value;
    version.current += 1;
    saved.current = version.current;
    revision.current = at;
    setShown(revision.current);
    setDirty(false);
    clash.current = false;
    setClashed(false);
  }, []);

  /** What the server made of the value just saved, taken as the value without making it unsaved. */
  const adopt = useCallback((value: T) => {
    latest.current = value;
  }, []);

  /** A revision learned some other way, such as from a deploy. An older one is ignored. */
  const know = useCallback((at: number | undefined) => {
    if (at !== undefined && revision.current !== undefined && at < revision.current) return;
    revision.current = at;
    setShown(at);
  }, []);

  /**
   * Saves what is there now, and what is typed during the save after it. Resolves to whether
   * everything is saved. `force` saves a draft that has not changed (a new one).
   */
  const save = useCallback((force = false): Promise<boolean> => {
    if (flight.current) return flight.current;
    // Someone else's draft stands in the way: nothing is sent until their version is loaded.
    if (clash.current) return Promise.resolve(false);
    if (!force && version.current === saved.current) return Promise.resolve(true);
    const run = async () => {
      setSaving(true);
      let first = true;
      try {
        while (first || version.current !== saved.current) {
          first = false;
          const sent = latest.current as T;
          const at = version.current;
          let answer: A;
          try {
            answer = await hooks.current.send(sent, revision.current);
          } catch (error) {
            if (isDraftClash(error)) {
              clash.current = true;
              setClashed(true);
            } else hooks.current.failed?.(error);
            return false;
          }
          if (revision.current === undefined || answer.revision >= revision.current) {
            revision.current = answer.revision;
            setShown(answer.revision);
          }
          const current = version.current === at;
          if (current) {
            saved.current = at;
            setDirty(false);
          }
          hooks.current.applied?.(answer, sent, current);
        }
        return true;
      } finally {
        flight.current = undefined;
        setSaving(false);
      }
    };
    flight.current = run();
    return flight.current;
  }, []);

  return {
    edit,
    reset,
    know,
    adopt,
    save,
    dirty,
    saving,
    /** Someone else saved the draft first: show `DraftClash`, and `reset` with their version. */
    clashed,
    /** The revision to show or to send with something else. */
    revision: shown,
    /** Read at the moment of a key press: the render may not have happened yet. */
    isDirty: () => version.current !== saved.current,
    /** The newest value, or none before one was loaded or edited. */
    value: (): T | undefined => latest.current,
    /** The revision the next save sends. */
    known: () => revision.current,
    sending: () => flight.current !== undefined,
  };
}
