import { type HTMLAttributes, type ReactNode, type Ref, useEffect, useRef, useState } from "react";

/**
 * Whether a sheet or dialog is open, as its own parts are told. One that is
 * put on the page already open is told it is shut first and open a moment
 * later, so it arrives with the same motion as one that was waiting there:
 * anything born open would otherwise skip its opening.
 */
export function useOpening(open: boolean): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return open && mounted;
}

/**
 * The last thing there was to show. A sheet stays on the page while it
 * closes, and whoever opened it has already forgotten what it was about; this
 * remembers, so the sheet closes showing what it showed.
 */
export function useLast<T>(value: T | undefined): T | undefined {
  const last = useRef(value);
  if (value !== undefined) last.current = value;
  return last.current;
}

/** As long as `motion-slow` and a little more: the time a sheet or dialog takes to close. */
const CLOSING_MS = 280;

const still = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A sheet or dialog that is about something: a row, a widget, a role. It is
 * on the page while there is a subject, told it is open, and stays for as long
 * as closing takes once there is none, told it is shut and still given the
 * subject it had. So it leaves with the motion it arrived with, and the next
 * one starts afresh.
 *
 * This is how a sheet is opened for a subject. Rendering one only while the
 * subject is there, with `open` written bare, takes it away in one frame.
 */
export function Closing<T>({
  subject,
  children,
}: {
  subject: T | undefined | null | false;
  children: (subject: T, open: boolean) => ReactNode;
}) {
  const here = subject !== undefined && subject !== null && subject !== false;
  const last = useRef<T | undefined>(undefined);
  if (here) last.current = subject as T;
  const [present, setPresent] = useState(here);
  if (here && !present) setPresent(true);
  useEffect(() => {
    if (here || !present) return;
    if (still()) {
      setPresent(false);
      return;
    }
    const gone = setTimeout(() => setPresent(false), CLOSING_MS);
    return () => clearTimeout(gone);
  }, [here, present]);
  if (!present && !here) return null;
  return <>{children(last.current as T, here)}</>;
}

/**
 * A panel drawn by hand, such as a list of things to add under its button,
 * that arrives and leaves with motion. It carries `data-starting-style` for
 * its first frame and `data-ending-style` while it leaves, as a sheet or
 * dialog does, so the same classes move it:
 * `transition-[opacity,translate] motion-base data-[starting-style]:opacity-0`.
 * It is marked `data-drawer`, which is what the browser tests watch.
 */
export function Appear({
  open,
  children,
  ref,
  ...rest
}: {
  open: boolean;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
} & HTMLAttributes<HTMLDivElement>) {
  const [present, setPresent] = useState(open);
  const [phase, setPhase] = useState<"starting" | "ending" | undefined>(
    open ? "starting" : undefined,
  );
  const was = useRef(open);
  if (was.current !== open) {
    was.current = open;
    if (open) {
      setPresent(true);
      setPhase("starting");
    } else {
      setPhase(still() ? undefined : "ending");
      if (still()) setPresent(false);
    }
  }
  useEffect(() => {
    if (phase === "starting") {
      // Two frames: one for the starting style to be drawn, one to leave it.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setPhase(undefined));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    if (phase === "ending") {
      const gone = setTimeout(() => {
        setPresent(false);
        setPhase(undefined);
      }, CLOSING_MS);
      return () => clearTimeout(gone);
    }
    return undefined;
  }, [phase]);
  if (!present) return null;
  return (
    <div
      {...rest}
      ref={ref}
      data-drawer=""
      data-starting-style={phase === "starting" ? "" : undefined}
      data-ending-style={phase === "ending" ? "" : undefined}
      inert={phase === "ending"}
    >
      {children}
    </div>
  );
}
