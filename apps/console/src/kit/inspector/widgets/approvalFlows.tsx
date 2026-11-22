/**
 * The workflows an Approvals widget may ask of: those of the workspace with an approval step,
 * each with its real title and what its steps show their approvers. The builder wraps the
 * inspector in `ApprovalFlowsProvider` (as it does for the groups the Rules tab names); without
 * one the drawer knows only the workflows the widget already lists.
 */
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useLoad } from "../../../api.ts";

/** A workflow with an approval step. */
export interface ApprovalFlow {
  path: string;
  /** What it is called: its own title, or its path read as words. */
  title: string;
  /** Whether the title is the workflow's own, not its path read as words. */
  titled?: boolean;
  steps: { node: string; title: string; fields: string[] }[];
}

interface Listed {
  path: string;
  title?: string | null;
  approvals?: { node: string; title: string; fields: string[] }[];
}

const words = (path: string) => {
  const last = path.split("/").at(-1) ?? path;
  const text = last.replace(/[_-]+/g, " ").trim();
  return text === "" ? path : (text[0] as string).toUpperCase() + text.slice(1);
};

/** The title a workflow goes by in a drawer. */
export const flowTitle = (path: string, title?: string | null) => title || words(path);

export interface Held {
  flows: readonly ApprovalFlow[] | undefined;
  /** The workspace's address in the console: where a workflow is opened. */
  link: string | undefined;
}

export const ApprovalFlowsContext = createContext<Held>({ flows: undefined, link: undefined });

/** Reads the workspace's workflows once, and gives those with an approval step to the drawer. */
export function ApprovalFlowsProvider({
  root,
  link,
  children,
}: {
  root: string;
  link?: string | undefined;
  children: ReactNode;
}) {
  const listed = useLoad<{ items: Listed[] }>(`${root}/flows`);
  const flows = useMemo<ApprovalFlow[] | undefined>(
    () =>
      listed.data?.items
        .filter((one) => (one.approvals ?? []).length > 0)
        .map((one) => ({
          path: one.path,
          title: flowTitle(one.path, one.title),
          titled: Boolean(one.title),
          steps: one.approvals ?? [],
        })),
    [listed.data],
  );
  return (
    <ApprovalFlowsContext.Provider value={{ flows, link }}>
      {children}
    </ApprovalFlowsContext.Provider>
  );
}

/** The workflows with an approval step, or undefined while they are being read (or when nothing reads them). */
export function useApprovalFlows(): Held {
  return useContext(ApprovalFlowsContext);
}
