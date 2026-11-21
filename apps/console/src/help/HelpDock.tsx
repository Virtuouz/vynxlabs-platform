import { useEffect, useRef } from "react";
import { ErrorBoundary } from "../kit/ErrorBoundary.tsx";
import { useInspectorDocked, useWide, WIDE } from "../kit/layout.tsx";
import { useUrlParam } from "../router.tsx";
import { HelpPanel } from "./HelpPanel.tsx";
import { closeHelp, openHelp, useHelp } from "./store.ts";

/** From here up there is room for a list, its inspector and the help, all three side by side. */
const THREE_ACROSS = 1680;

/**
 * Where the help panel sits. On a wide screen it is docked beside the work
 * and takes room from it. Narrower, or while an inspector is already beside
 * a list, it lies over the right edge. On a phone it takes the screen.
 *
 * It is never a dialog: nothing behind it is dimmed or put out of reach, and
 * the keyboard is not held in it. Escape closes it while focus is inside.
 */
export function HelpDock({
  tenantId,
  workspaceId,
}: {
  /** Where the reader is, for what their own team has added to the help. */
  tenantId?: string | undefined;
  workspaceId?: string | undefined;
} = {}) {
  const { open } = useHelp();
  const wide = useWide(WIDE.inspector);
  const widest = useWide(THREE_ACROSS);
  const tablet = useWide(WIDE.rail);
  const inspector = useInspectorDocked();
  const before = useRef<Element | null>(null);

  // Opened: remember where focus was. Closed: put it back, if it was in the panel.
  useEffect(() => {
    if (open) {
      before.current = document.activeElement;
      return;
    }
    const was = before.current;
    before.current = null;
    if (was instanceof HTMLElement && was.isConnected && document.activeElement === document.body) {
      was.focus();
    }
  }, [open]);

  if (!open) return null;
  const docked = wide && (!inspector || widest);
  const place = docked
    ? "relative w-[380px] shrink-0 border-line border-l"
    : tablet
      ? "absolute inset-y-0 right-0 layer-sheet w-[380px] max-w-full border-line border-l shadow-overlay"
      : "fixed inset-0 layer-sheet";
  return (
    <aside
      aria-label="Help"
      data-help-panel={docked ? "docked" : tablet ? "over" : "full"}
      className={`flex min-h-0 flex-col ${place}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // A popover inside the panel closes itself first.
        if ((event.target as HTMLElement).closest("[role=dialog]")) return;
        event.stopPropagation();
        closeHelp();
      }}
    >
      <ErrorBoundary what="The help" compact>
        <HelpPanel tenantId={tenantId} workspaceId={workspaceId} />
      </ErrorBoundary>
    </aside>
  );
}

/**
 * Opens the help from the address: `?help=data-tables` opens the panel at
 * that topic, or at a page by its path. The address is then put back as it
 * was, so that moving on does not carry the help along. The panel's own
 * "copy a link" writes such an address.
 */
export function useHelpInAddress() {
  const [asked, setAsked] = useUrlParam("help");
  useEffect(() => {
    if (asked === undefined) return;
    openHelp(asked === "" ? undefined : asked);
    setAsked(undefined);
  }, [asked, setAsked]);
}
