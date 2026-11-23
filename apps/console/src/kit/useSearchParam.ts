import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A search box whose text and address agree. What is typed reaches the address once typing
 * pauses; an address that changes from outside (a saved view, Back, a link) is written into
 * the box, and is not written back over as if it had been typed.
 */
export function useSearchParam(
  address: string | undefined,
  commit: (next: string | undefined) => void,
  delay = 300,
): [string, (text: string) => void] {
  const [typed, setTypedText] = useState(address ?? "");
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const setTyped = useCallback(
    (text: string) => {
      setTypedText(text);
      clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = undefined;
        commitRef.current(text.trim() || undefined);
      }, delay);
    },
    [delay],
  );

  // Whatever the address becomes, the box says, unless the reader is in the middle of typing.
  useEffect(() => {
    if (pending.current !== undefined) return;
    setTypedText((now) => (now.trim() === (address ?? "") ? now : (address ?? "")));
  }, [address]);
  useEffect(() => () => clearTimeout(pending.current), []);
  return [typed, setTyped];
}
