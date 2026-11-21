import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { terms } from "./client.ts";

export interface Help {
  /** The title of the page of documentation. */
  title: string;
  /** Where it is served. */
  url: string;
  /** Whether it can be shown inside this app: only a page served at this app's own address can. */
  framed: boolean;
}

/**
 * The page of the workspace's documentation with a topic, when there is one
 * and the person using the app may open it. Undefined until that is known,
 * and null when there is none for them: no page has the topic, or it is not
 * theirs to read. The topic stays the same when the page moves.
 */
export function useHelp(topic: string | undefined): Help | null | undefined {
  const [help, setHelp] = useState<Help | null | undefined>(undefined);
  useEffect(() => {
    if (!topic) {
      setHelp(null);
      return;
    }
    let current = true;
    setHelp(undefined);
    terms().then(
      (found) => {
        if (!current) return;
        const page = found.topics.find((one) => one.topic === topic)?.page;
        if (!page) return setHelp(null);
        let framed = false;
        try {
          framed =
            new URL(page.url, globalThis.location.href).origin === globalThis.location.origin;
        } catch {
          // An address that does not read is linked to, and nothing more.
        }
        setHelp({ title: page.title, url: page.url, framed });
      },
      // Help that cannot be found out is help that is not offered.
      () => {
        if (current) setHelp(null);
      },
    );
    return () => {
      current = false;
    };
  }, [topic]);
  return help;
}

const sheet: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "min(32rem, 100vw)",
  display: "flex",
  flexDirection: "column",
  // The app's own `--vx-*` tokens when it has them. Without them the sheet still follows the
  // system's light or dark, as the kit's sheets do.
  colorScheme: "light dark",
  background: "var(--vx-surface, light-dark(#ffffff, #1b2430))",
  color: "var(--vx-ink, light-dark(#16202e, #e6ebf1))",
  borderLeft: "1px solid var(--vx-line, light-dark(#d3dae2, #34404f))",
  boxShadow: "-8px 0 24px rgb(0 0 0 / 0.12)",
  zIndex: 1000,
};
/** How long a sheet takes to leave, which is how long it stays mounted after it is closed. */
const LEAVING_MS = 200;
const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const bar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.75rem 1rem",
  borderBottom: "1px solid var(--vx-line, light-dark(#d3dae2, #34404f))",
};
const plain: CSSProperties = {
  font: "inherit",
  color: "var(--vx-action, light-dark(#0e5f7a, #7cc4dc))",
  background: "transparent",
  border: "1px solid var(--vx-line-control, light-dark(#748090, #8a96a6))",
  borderRadius: "var(--vx-radius-control, 6px)",
  padding: "0.25rem 0.75rem",
  cursor: "pointer",
};

/**
 * A Help button for an app, and the page it opens beside the app's own: the
 * page of the workspace's documentation with this topic, as its docs app
 * serves it.
 *
 * It draws nothing unless there is such a page and the person may open it, so
 * it can be put on a screen whether or not anyone has written its help yet.
 * Where the documentation is served at another address than the app, the
 * button opens the page in a new tab.
 *
 *     <HelpPanel topic="desk-booking" />
 */
export function HelpPanel({
  topic,
  children = "Help",
  className,
}: {
  /** The `topic:` of a page of the workspace's documentation. */
  topic: string;
  /** What the button says. */
  children?: ReactNode;
  /** For the button, to make it one of the app's own. Without it, it is drawn plainly. */
  className?: string;
}) {
  const help = useHelp(topic);
  const [open, setOpen] = useState(false);
  // The sheet stays drawn while it arrives and while it leaves, so each is a movement.
  const [present, setPresent] = useState(false);
  const [phase, setPhase] = useState<"starting" | "ending" | undefined>(undefined);
  const was = useRef(false);
  if (was.current !== open) {
    was.current = open;
    if (open) {
      setPresent(true);
      setPhase(still() ? undefined : "starting");
    } else if (still()) {
      setPresent(false);
      setPhase(undefined);
    } else {
      setPhase("ending");
    }
  }
  useEffect(() => {
    if (phase === "starting") {
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
      }, LEAVING_MS);
      return () => clearTimeout(gone);
    }
    return undefined;
  }, [phase]);
  const aside = useRef<HTMLElement>(null);
  const heading = useId();
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // A press anywhere but on the sheet or its own button closes it.
    const onPress = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (aside.current?.contains(target) || button.current?.contains(target))) return;
      setOpen(false);
    };
    globalThis.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    const opener = button.current;
    return () => {
      globalThis.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
      // Whoever closed it is put back where they were.
      opener?.focus();
    };
  }, [open]);

  if (!help) return null;
  const looks = className ? { className } : { style: plain };
  if (!help.framed) {
    return (
      <a href={help.url} target="_blank" rel="noopener noreferrer" {...looks}>
        {children}
      </a>
    );
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
        {...looks}
      >
        {children}
      </button>
      {present ? (
        <aside
          ref={aside}
          aria-labelledby={heading}
          data-drawer=""
          data-starting-style={phase === "starting" ? "" : undefined}
          data-ending-style={phase === "ending" ? "" : undefined}
          inert={phase === "ending"}
          style={{
            ...sheet,
            transition: still()
              ? "none"
              : `translate ${LEAVING_MS}ms ease, opacity ${LEAVING_MS}ms ease`,
            ...(phase ? { translate: "2rem 0", opacity: 0 } : {}),
          }}
        >
          <div style={bar}>
            <h2 id={heading} style={{ margin: 0, flex: 1, fontSize: "1rem" }}>
              {help.title}
            </h2>
            <a
              href={help.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--vx-action, light-dark(#0e5f7a, #7cc4dc))" }}
            >
              Open in a new tab
            </a>
            <button ref={close} type="button" style={plain} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <iframe src={help.url} title={help.title} style={{ flex: 1, border: 0, width: "100%" }} />
        </aside>
      ) : null}
    </>
  );
}
