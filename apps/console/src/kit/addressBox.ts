import { useEffect, useRef, useState } from "react";

/**
 * A box whose text reaches the address, and what loads from it, once typing pauses, and which
 * follows the address when something else changes it: a saved view, a link, Back. One piece for
 * every filter or search box tied to the address, so that none writes its old text back over
 * what the address was just given.
 *
 * `decode` reads the box's value from the address's text; `encode` gives the text for the
 * address, or nothing when the box is empty.
 */
export function useAddressBox<T>(
  address: string | undefined,
  decode: (address: string | undefined) => T,
  encode: (typed: T) => string | undefined,
  write: (next: string | undefined) => void,
  delay = 300,
): [T, (next: T | ((current: T) => T)) => void] {
  const [typed, setTyped] = useState(() => decode(address));
  // What this box last put in the address. Anything else there came from elsewhere.
  const written = useRef(address);
  const latest = useRef({ decode, encode, write });
  latest.current = { decode, encode, write };
  useEffect(() => {
    if (address === written.current) return;
    written.current = address;
    setTyped(latest.current.decode(address));
  }, [address]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = latest.current.encode(typed);
      if (next === address) return;
      written.current = next;
      latest.current.write(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [typed, address, delay]);
  return [typed, setTyped];
}
