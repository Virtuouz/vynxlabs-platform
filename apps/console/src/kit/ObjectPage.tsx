import { Tabs } from "@vynxlabs/ui";
import type { ReactNode } from "react";
import { Link, useUrlParam } from "../router.tsx";
import { useTitleObject } from "./title.ts";

/**
 * The page every kind of thing has (06 §6.3): where it is, its kind and name,
 * what can be done with it, a few facts, then tabs. The tab is in the address,
 * so a link can open on "Used by".
 */
export function ObjectPage({
  back,
  eyebrow,
  title,
  state,
  actions,
  meta,
  tabs,
}: {
  back: { to: string; label: string };
  /** The kind: "Connection". */
  eyebrow: string;
  title: string;
  state?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  useTitleObject(title);
  const [tab, setTab] = useUrlParam("tab", tabs[0]?.id ?? "", { push: true });
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 border-line border-b pb-4">
        <nav aria-label="Where this is" className="flex items-center gap-1.5 text-meta">
          <Link to={back.to} className="text-ink-muted">
            {back.label}
          </Link>
          <span aria-hidden="true" className="text-ink-subtle">
            ›
          </span>
          <span className="text-ink-muted">{eyebrow}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="m-0 font-mono text-title break-all">{title}</h1>
            {state ? <div className="flex flex-wrap items-center gap-2">{state}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {meta}
      </header>
      <Tabs
        label={`About ${title}`}
        value={tabs.some((one) => one.id === tab) ? tab : (tabs[0]?.id ?? "")}
        onChange={setTab}
        tabs={tabs}
      />
    </div>
  );
}
