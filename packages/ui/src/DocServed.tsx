import type { Components } from "@volvel/markup/react";
import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/**
 * A page's components as a served site draws them, for a preview that must
 * look and behave as the site does: the same elements and classes the HTML
 * renderer writes, and what the site's own script does to them, done here by
 * React. Tabs are tabs, a fold opens and closes as it moves, a term opens as a
 * button does.
 *
 * Each listens for `vd-reveal`, sent from something inside it, and shows that
 * thing: a tab chooses itself, a fold opens. An editor's preview sends it to
 * follow the cursor into a part of the page that is hidden.
 */

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const still = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Asks every tab and fold a node is in to show it. */
export function reveal(node: Element): void {
  node.dispatchEvent(new CustomEvent("vd-reveal", { bubbles: true }));
}

function ServedTabs({
  tabs,
  marks,
}: {
  tabs: { label: string; children: ReactNode; marks: Record<string, string> }[];
  marks: Record<string, string>;
}) {
  const [shown, setShown] = useState(0);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = useRef(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const show = (event: Event) => {
      const from = event.target as Node;
      const at = sections.current.findIndex((section) => section?.contains(from));
      if (at !== -1) setShown(at);
    };
    element.addEventListener("vd-reveal", show);
    return () => element.removeEventListener("vd-reveal", show);
  }, []);

  // A tab chosen fades in, as on the site.
  useEffect(() => {
    if (!chosen.current) return;
    const section = sections.current[shown];
    if (!section || still() || typeof section.animate !== "function") return;
    section.animate(
      [
        { opacity: 0, transform: "translateY(2px)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: 160,
        easing: EASE,
      },
    );
  }, [shown]);

  if (tabs.length < 2) {
    return (
      <div className="vd-tabs" data-vd-tabs="1" {...marks}>
        {tabs.map((tab, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tabs have no identity but their place.
          <section key={index} className="vd-tab" {...tab.marks}>
            <h4 className="vd-tab-label">{tab.label}</h4>
            <div className="vd-tab-body">{tab.children}</div>
          </section>
        ))}
      </div>
    );
  }
  const choose = (index: number, focus: boolean) => {
    chosen.current = true;
    setShown(index);
    if (focus) buttons.current[index]?.focus();
  };
  const keys = (event: KeyboardEvent, index: number) => {
    const move = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[event.key];
    if (move) choose((index + move + tabs.length) % tabs.length, true);
    else if (event.key === "Home") choose(0, true);
    else if (event.key === "End") choose(tabs.length - 1, true);
    else return;
    event.preventDefault();
  };
  return (
    <div ref={root} className="vd-tabs vd-tabs-on" data-vd-tabs="1" {...marks}>
      <div className="vd-tablist" role="tablist">
        {tabs.map((tab, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: tabs have no identity but their place.
            key={index}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            className="vd-tab-button"
            aria-selected={index === shown}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={index === shown ? 0 : -1}
            onClick={() => choose(index, false)}
            onKeyDown={(event) => keys(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <section
          // biome-ignore lint/suspicious/noArrayIndexKey: tabs have no identity but their place.
          key={index}
          ref={(section) => {
            sections.current[index] = section;
          }}
          className="vd-tab"
          hidden={index !== shown}
          {...tab.marks}
        >
          <h4 className="vd-tab-label" hidden>
            {tab.label}
          </h4>
          <div
            className="vd-tab-body"
            id={`${id}-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${index}`}
          >
            {tab.children}
          </div>
        </section>
      ))}
    </div>
  );
}

function ServedDetails({
  summary,
  children,
  marks,
}: {
  summary: string;
  children: ReactNode;
  marks: Record<string, string>;
}) {
  const fold = useRef<HTMLDetailsElement>(null);
  const moving = useRef<Animation | null>(null);

  const set = (open: boolean) => {
    const element = fold.current;
    if (!element || element.open === open) return;
    moving.current?.cancel();
    if (still() || typeof element.animate !== "function") {
      element.open = open;
      return;
    }
    const from = element.getBoundingClientRect().height;
    element.open = open;
    const to = element.getBoundingClientRect().height;
    element.open = true;
    element.style.overflow = "hidden";
    const run = element.animate(
      { height: [`${from}px`, `${to}px`] },
      { duration: 200, easing: EASE },
    );
    moving.current = run;
    run.onfinish = () => {
      moving.current = null;
      element.style.overflow = "";
      element.open = open;
    };
    run.oncancel = () => {
      element.style.overflow = "";
    };
  };

  useEffect(() => {
    const element = fold.current;
    if (!element) return;
    const show = () => {
      if (!element.open) element.open = true;
    };
    element.addEventListener("vd-reveal", show);
    return () => element.removeEventListener("vd-reveal", show);
  }, []);

  return (
    <details ref={fold} className="vd-details" {...marks}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a summary is the fold's own button. */}
      <summary
        onClick={(event: SyntheticEvent) => {
          event.preventDefault();
          set(!fold.current?.open);
        }}
      >
        {summary}
      </summary>
      <div className="vd-details-body">{children}</div>
    </details>
  );
}

function ServedTerm({
  word,
  info,
  children,
  more,
}: {
  word: string;
  info: { short?: string; href?: string } | null;
  children: ReactNode;
  more?: ((href: string, word: string) => ReactNode) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const holder = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  if (!info || (!info.short && !info.href)) return <>{children}</>;
  return (
    <span ref={holder} className={`vd-term vd-term-on${open ? " vd-term-open" : ""}`}>
      <button
        type="button"
        className="vd-term-word"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) setOpen(false);
        }}
      >
        {children}
      </button>
      <span className="vd-term-tip" role="tooltip" id={id}>
        {info.short}
        {info.href ? (
          <>
            {info.short ? " " : null}
            {more ? more(info.href, word) : <a href={info.href}>More about {word}</a>}
          </>
        ) : null}
      </span>
    </span>
  );
}

/** The components of a served page, for a preview. `more` draws a term's link to read more. */
export function servedComponents(more?: (href: string, word: string) => ReactNode): Components {
  return {
    tabs: ({ tabs, marks }) => <ServedTabs tabs={tabs} marks={marks} />,
    details: ({ summary, children, marks }) => (
      <ServedDetails summary={summary} marks={marks}>
        {children}
      </ServedDetails>
    ),
    term: ({ word, info, children }) => (
      <ServedTerm word={word} info={info} more={more}>
        {children}
      </ServedTerm>
    ),
  };
}
