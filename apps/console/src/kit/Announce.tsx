import { useEffect, useRef, useState } from "react";
import { type State, stateLabel } from "./status.tsx";

/**
 * Says a run's new state to screen readers when it changes: "Run of
 * orders/sync: Succeeded". Silent when first shown, so opening a run is not
 * read out twice, and invisible on screen, where the state is already drawn.
 */
export function StateAnnouncer({ state, label }: { state: State; label: string }) {
  const seen = useRef(state);
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    setSaid(`${label}: ${stateLabel(state)}`);
  }, [state, label]);
  return (
    <span role="status" className="sr-only">
      {said}
    </span>
  );
}
