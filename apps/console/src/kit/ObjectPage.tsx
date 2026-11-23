import { Tabs } from "@volvel/ui";
import type { ReactNode } from "react";
import { useUrlParam } from "../router.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { useTitleObject } from "./title.ts";

/**
 * The page every kind of thing has (06 §6.3): its kind and name, what can be
 * done with it, a few facts, then tabs. Where it is, is the shell's breadcrumb. The tab is in the address,
 * so a link can open on "Used by".
 */
export function ObjectPage({
  eyebrow,
  title,
  state,
  actions,
  meta,
  line,
  tabs,
}: {
  /** Where it is listed. The shell's breadcrumb leads back there now; kept for callers. */
  back?: { to: string; label: string };
  /** The kind: "Connection". */
  eyebrow: string;
  title: string;
  state?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  /** What this member may not do here and what it takes: the lines of `useNeeds`, shown under the head. */
  line?: ReactNode;
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  useTitleObject(title);
  const [tab, setTab] = useUrlParam("tab", tabs[0]?.id ?? "", { push: true });
  return (
    <div className="flex flex-col gap-5">
      <div className="border-line border-b pb-4">
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          mono
          state={state}
          actions={actions}
          after={meta}
        />
      </div>
      {line}
      <Tabs
        label={`About ${title}`}
        value={tabs.some((one) => one.id === tab) ? tab : (tabs[0]?.id ?? "")}
        onChange={setTab}
        tabs={tabs}
      />
    </div>
  );
}
