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
          // A term may sit in a heading that sorts or a row that opens. Pressing the term does neither.
          onClick={(event) => event.stopPropagation()}
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

/** A word the people of a workspace use, and what they mean by it. */
export interface GlossaryTerm {
  id: string;
  /** The term as it is written in text. */
  term: string;
  /** Other ways it is written. */
  aliases?: readonly string[];
  /** What it means, in plain text. */
  short: string;
}

interface Glossary {
  find: RegExp | null;
  byWord: Map<string, GlossaryTerm>;
  more: ((term: GlossaryTerm) => ReactNode) | undefined;
}

const GlossaryContext = createContext<Glossary | null>(null);

const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Gives a screen its glossary. Inside it, `TermText` underlines a term where
 * a label first uses it. It is also a `TermScope`, so a term met again further
 * down the same screen is plain words.
 *
 * A term is matched as whole words, whatever its capitals, and the longest
 * term that fits wins: "dev workspace" before "workspace".
 */
export function GlossaryProvider({
  terms,
  more,
  children,
}: {
  terms: readonly GlossaryTerm[];
  /** Draws the way to read more about a term, when there is somewhere to. */
  more?: (term: GlossaryTerm) => ReactNode;
  children: ReactNode;
}) {
  const glossary = useMemo<Glossary>(() => {
    const byWord = new Map<string, GlossaryTerm>();
    for (const term of terms) {
      for (const word of [term.term, ...(term.aliases ?? [])]) {
        const key = word.trim().toLowerCase();
        if (key !== "" && !byWord.has(key)) byWord.set(key, term);
      }
    }
    const words = [...byWord.keys()].sort((a, b) => b.length - a.length);
    return {
      byWord,
      more,
      find:
        words.length === 0
          ? null
          : new RegExp(
              `(?<![\\p{L}\\p{N}])(${words.map(escaped).join("|")})(?![\\p{L}\\p{N}])`,
              "giu",
            ),
    };
  }, [terms, more]);
  return (
    <GlossaryContext.Provider value={glossary}>
      <TermScope>{children}</TermScope>
    </GlossaryContext.Provider>
  );
}

/**
 * The first term of the glossary that a piece of text uses, if any. For a
 * label that cannot hold a button of its own, such as one that is already a
 * button: what the term means is then said beside it.
 */
export function useGlossaryMatch(text: string): GlossaryTerm | undefined {
  const glossary = useContext(GlossaryContext);
  if (!glossary?.find) return undefined;
  for (const match of text.matchAll(glossary.find)) {
    const term = glossary.byWord.get(match[0].toLowerCase());
    if (term) return term;
  }
  return undefined;
}

/**
 * Text that names things: a column's heading, a resource's title, a
 * description. Where it uses a term of the glossary around it, the term says
 * what it means. Never put around a value from a row, or around free text:
 * a common word would light up down a whole column, and in data it may mean
 * something else.
 */
export function TermText({ children }: { children: string }) {
  const glossary = useContext(GlossaryContext);
  if (!glossary?.find) return <>{children}</>;
  const parts: ReactNode[] = [];
  let last = 0;
  const seen = new Set<string>();
  for (const match of children.matchAll(glossary.find)) {
    const term = glossary.byWord.get(match[0].toLowerCase());
    // Once in one piece of text is enough.
    if (!term || seen.has(term.id)) continue;
    seen.add(term.id);
    const at = match.index;
    if (at > last) parts.push(children.slice(last, at));
    parts.push(
      <Term key={at} id={term.id} word={term.term} short={term.short} more={glossary.more?.(term)}>
        {match[0]}
      </Term>,
    );
    last = at + match[0].length;
  }
  if (parts.length === 0) return <>{children}</>;
  if (last < children.length) parts.push(children.slice(last));
  return <>{parts}</>;
}
