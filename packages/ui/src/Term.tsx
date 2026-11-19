import { Info } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import { ICON, STROKE } from "./icons.ts";
import { Popover } from "./Popover.tsx";

/**
 * A few words behind a small ⓘ, for a field or a heading that needs saying
 * more about. It opens when pressed and stays until Escape or a click away,
 * so what it says can be read at any pace and can hold a link, which a
 * tooltip cannot.
 */
export function Toggletip({
  label,
  title,
  children,
  side = "top",
}: {
  /** What the button is for, read aloud: "About the schedule's timezone". */
  label: string;
  /** Heads the panel. */
  title: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Popover
      title={title}
      side={side}
      trigger={
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-5 items-center justify-center rounded-inner align-middle text-ink-muted hover:text-ink"
        >
          <Info size={ICON.sm} strokeWidth={STROKE} aria-hidden />
        </button>
      }
    >
      {children}
    </Popover>
  );
}

const Scope = createContext<Map<string, string> | null>(null);

/**
 * Put around one screen. Inside it a term is underlined where it is first
 * used and is plain words after that, so a page that says "workspace" ten
 * times is not ten links.
 */
export function TermScope({ children }: { children: ReactNode }) {
  const seen = useMemo(() => new Map<string, string>(), []);
  return <Scope.Provider value={seen}>{children}</Scope.Provider>;
}

/** Whether this is the first use of a term in the scope around it. With no scope, every use is. */
function useFirstUse(id: string | undefined): boolean {
  const seen = useContext(Scope);
  const owner = useId();
  const claimed = useRef(false);
  if (seen && id !== undefined && !seen.has(id)) {
    seen.set(id, owner);
    claimed.current = true;
  }
  useEffect(() => {
    if (!seen || id === undefined) return;
    if (!seen.has(id)) seen.set(id, owner);
    return () => {
      if (seen.get(id) === owner) seen.delete(id);
    };
  }, [seen, id, owner]);
  return !seen || id === undefined || seen.get(id) === owner;
}

/**
 * A word with its meaning behind it. Pressing it, or Enter or Space on it,
 * opens what it means. Escape closes that and puts focus back on the word.
 */
export function Term({
  id,
  word,
  short,
  more,
  children,
}: {
  /** The term's id. Within a `TermScope`, only its first use is underlined. */
  id?: string;
  /** The term as plain text, to name the panel. */
  word: string;
  /** What it means. With neither this nor `more`, the word is drawn alone. */
  short?: ReactNode;
  /** A link or a button to read more, put after the meaning. */
  more?: ReactNode;
  children: ReactNode;
}) {
  const first = useFirstUse(id);
  if (!first || (!short && !more)) return <>{children}</>;
  return (
    <Popover
      title={word}
      trigger={
        <button
          type="button"
          data-term={id}
          className="cursor-help rounded-inner underline decoration-dotted underline-offset-[3px]"
        >
          {children}
        </button>
      }
    >
      {short}
      {more ? <div className={short ? "mt-2" : ""}>{more}</div> : null}
    </Popover>
  );
}
