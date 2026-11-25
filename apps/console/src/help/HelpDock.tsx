import { Appear } from "@volvel/ui";
import { useEffect, useRef } from "react";
import { ErrorBoundary } from "../kit/ErrorBoundary.tsx";
import { Docking, useInspectorDocked, useWide, WIDE } from "../kit/layout.tsx";
import { useUrlParam } from "../router.tsx";
import { HelpPanel } from "./HelpPanel.tsx";
import { closeHelp, openHelp, takeOpener, useHelp } from "./store.ts";

/** From here up there is room for a list, its inspector and the help, all three side by side. */
const THREE_ACROSS = 1680;

/**
 * Where the help panel sits. On a wide screen it is docked beside the work
 * and takes room from it, the room given and taken back smoothly. Narrower, or
 * while an inspector is already beside a list, it slides over the right edge
 * on a scrim. On a phone it takes the screen.
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
  const wasOpen = useRef(false);
  const shell = useRef<HTMLDivElement>(null);

  // Closed: put focus back where it was when the panel opened, if it was in the panel. What had
  // focus is kept by the store when it opens, as the panel's own mount moves focus to its heading
  // before this effect could ask.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const was = takeOpener();
    // Focus is on the body once the leaving panel is put out of reach, or still in it before then.
    const here = document.activeElement;
    const lost = !here || here === document.body || shell.current?.contains(here);
    if (was instanceof HTMLElement && was.isConnected && lost) {
      was.focus();
    }
  }, [open]);

  const docked = wide && (!inspector || widest);
  const panel = (leaving: boolean) => (
    <aside
      aria-label="Help"
      data-help-panel={docked ? "docked" : tablet ? "over" : "full"}
      inert={leaving}
      className="flex min-h-0 flex-1 flex-col"
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
  if (docked) {
    // Beside the work: the room it takes is given and taken back over the same time and curve
    // as the inspector's (`Docking`), so the page reflows as the panel moves, not after it.
    return (
      <Docking open={open}>
        {(leaving) => (
          <div
            ref={shell}
            className="flex min-h-0 w-[380px] shrink-0 flex-col border-line border-l"
          >
            {panel(leaving)}
          </div>
        )}
      </Docking>
    );
  }
  // Over the work, it slides in from its edge as the other sheets do, over a scrim that is not a
  // trap: a click on it closes the panel, but the keyboard and the page behind stay as they were.
  return (
    <>
      {tablet ? (
        <Appear
          open={open}
          data-help-scrim=""
          aria-hidden="true"
          onClick={() => closeHelp()}
          // overlay-allowed: the scrim is drawn by the kit's Appear, which carries the motion.
          className="fixed inset-0 layer-sheet bg-scrim transition-opacity motion-slow data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
        >
          {null}
        </Appear>
      ) : null}
      <Appear
        open={open}
        ref={shell}
        className={`flex min-h-0 flex-col bg-surface transition-[translate] motion-slow data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full ${
          tablet
            ? "fixed inset-y-0 right-0 layer-sheet w-[380px] max-w-full border-line border-l shadow-overlay"
            : "fixed inset-0 layer-sheet"
        }`}
      >
        {panel(false)}
      </Appear>
    </>
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
    // docs:dynamic an address a reader or an older link gave: pageFor answers for what it does not know
    openHelp(asked === "" ? undefined : asked);
    setAsked(undefined);
  }, [asked, setAsked]);
}
