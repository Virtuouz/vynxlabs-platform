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
  background: "var(--vx-surface, #fff)",
  color: "var(--vx-ink, #16202e)",
  borderLeft: "1px solid var(--vx-line, #d3dae2)",
  boxShadow: "-8px 0 24px rgb(0 0 0 / 0.12)",
  zIndex: 1000,
};
const bar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.75rem 1rem",
  borderBottom: "1px solid var(--vx-line, #d3dae2)",
};
const plain: CSSProperties = {
  font: "inherit",
  color: "var(--vx-action, #0e5f7a)",
  background: "transparent",
  border: "1px solid var(--vx-line-control, #748090)",
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
  const heading = useId();
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    globalThis.addEventListener("keydown", onKey);
    const opener = button.current;
    return () => {
      globalThis.removeEventListener("keydown", onKey);
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
      {open ? (
        <aside aria-labelledby={heading} style={sheet}>
          <div style={bar}>
            <h2 id={heading} style={{ margin: 0, flex: 1, fontSize: "1rem" }}>
              {help.title}
            </h2>
            <a
              href={help.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--vx-action, #0e5f7a)" }}
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
