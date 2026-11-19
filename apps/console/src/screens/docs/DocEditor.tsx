import { checkPageAmong, type DocIssue } from "@volvel/docs-engine";
import { Button, Doc, Notice, TextField } from "@volvel/ui";
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ApiError, api, useLoad } from "../../api.ts";
import { ask, notify } from "../../ask.tsx";
import type { Marker } from "../../editor/CodeEditor.tsx";
import { useWorkspaceTerms } from "../../help/glossary.tsx";
import { useHelpTopic } from "../../help/store.ts";
import { useBrand } from "../../kit/brand.tsx";
import { ErrorState, Pending } from "../../kit/LoadState.tsx";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { SaveBar } from "../../kit/SaveBar.tsx";
import { SplitPane } from "../../kit/SplitPane.tsx";
import { Code, Tag } from "../../kit/status.tsx";
import { RemoveButton } from "../../ListScreen.tsx";
import { navigate, useQueryValue } from "../../router.tsx";
import { PATH, useProduct } from "./Docs.tsx";
import {
  appFor,
  type DocPage,
  type DocsList,
  inApp,
  indexOf,
  resolvers,
  termsOf,
} from "./model.ts";

const CodeEditor = lazy(() =>
  import("../../editor/CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })),
);

interface Opened {
  page: DocPage;
  source: string;
  revision: number | null;
  deployedSource: string | null;
}

const starter = (title: string) =>
  `---\ntitle: ${JSON.stringify(title)}\ndescription: \n---\n\nWrite here.\n`;

/**
 * Where a page of documentation is written: its source on one side, and on
 * the other the page as it will be served, drawn from the same reading the
 * server makes. What is wrong with it is marked on its lines as it is typed,
 * by the rules a deploy holds it to.
 */
export function DocEditor({
  root,
  link,
  tenantId,
  workspaceId,
  path,
}: {
  root: string;
  link: string;
  tenantId: string;
  workspaceId: string;
  /** The page being changed. None for a page being made. */
  path: string | undefined;
}) {
  useHelpTopic("build-docs-editor");
  const list = useLoad<DocsList>(`${root}/docs`);
  const opened = useLoad<Opened>(path ? `${root}/docs/page/${path}` : null);
  const [at] = useQueryValue("at");
  const startAt = at ?? "";
  const [named] = useQueryValue("title");
  const startTitle = named ?? "New page";
  const [where, setWhere] = useState(path ?? startAt);
  const [source, setSource] = useState<string>();
  const [revision, setRevision] = useState<number | null>(null);
  const [saved, setSaved] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [clash, setClash] = useState(false);
  const [reveal, setReveal] = useState<{ line: number; at: number }>();
  const product = useProduct();
  const brand = useBrand();
  const { resources } = useWorkspaceTerms(tenantId, workspaceId);

  // What was opened is what is edited, once. Typing is never overwritten by a reload.
  useEffect(() => {
    if (source !== undefined) return;
    if (!path) {
      setSource(starter(startTitle));
      setSaved(undefined);
    } else if (opened.data) {
      setSource(opened.data.source);
      setSaved(opened.data.source);
      setRevision(opened.data.revision);
    }
  }, [path, opened.data, source, startTitle]);

  const typed = useDeferredValue(source ?? "");
  const app = list.data ? appFor(list.data.apps, where) : undefined;
  const checked = useMemo(() => {
    if (!list.data) return undefined;
    const workspaceTerms = termsOf(list.data).map((term) => term.id);
    return checkPageAmong(inApp(app, where) || "untitled", typed, indexOf(list.data, app), {
      ...(product
        ? { reservedTerms: Object.keys(product.terms), reservedTopics: Object.keys(product.topics) }
        : {}),
      knownTerms: workspaceTerms,
      // Said only of what this writer may see. The deploy says the rest.
      resource: (kind, at, column) => {
        const found = resources.find((one) => one.kind === kind && one.path === at);
        if (!found) return undefined;
        if (column === undefined || kind !== "table") return true;
        return found.columns?.some((one) => one.name === column) ? true : undefined;
      },
    });
  }, [list.data, app, where, typed, product, resources]);
  const issues: DocIssue[] = checked?.issues ?? [];
  const problems = useMemo<Marker[]>(
    () =>
      issues.map((issue) => ({
        line: issue.line,
        column: issue.column,
        message: issue.message,
        severity: issue.severity,
      })),
    [issues],
  );
  const drawn = useMemo(
    () =>
      list.data
        ? resolvers({
            list: list.data,
            page: { path: where },
            address: (to) => `${link}/docs/${to}`,
            product,
            described: resources,
          })
        : {},
    [list.data, where, link, product, resources],
  );

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (opened.error) return <ErrorState error={opened.error} onRetry={opened.reload} />;
  if (!list.data) return <Pending of={list} />;
  if (source === undefined) return path ? <Pending of={opened} /> : null;

  const page = opened.data?.page;
  const fresh = path === undefined;
  const dirty = source !== saved;
  const wherePage = list.data.pages.find((one) => one.path === where);
  const placed = fresh
    ? !PATH.test(where)
      ? "A path is lowercase letters, digits, hyphens and underscores, in folders."
      : wherePage
        ? "There is a page at that path already."
        : !app
          ? `No docs app serves that folder. A page goes under one of: ${list.data.apps.map((one) => `${one.docs}/`).join(", ") || "none yet"}.`
          : undefined
    : undefined;
  const title = checked?.entry.frontmatter.title || (fresh ? "New page" : (page?.title ?? where));

  const save = async () => {
    if (placed) return;
    setSaving(true);
    try {
      const answer = await api.put<{ revision: number }>(`${root}/drafts/${where}`, {
        kind: "doc",
        schemaVersion: 1,
        title,
        body: { source },
        ...(revision !== null ? { revision } : {}),
      });
      setSaved(source);
      setRevision(answer.revision);
      setClash(false);
      list.reload();
      notify.success(
        issues.length > 0
          ? "Saved as a draft. It has problems to mend before it can be deployed."
          : "Saved as a draft. Deploy it from Documentation when it is ready.",
      );
      if (fresh) navigate(`${link}/docs/edit/${where}`, { replace: true });
    } catch (error) {
      // Someone else saved it since it was opened: say so, and keep what was typed.
      if (error instanceof ApiError && error.code === "draft_changed") setClash(true);
      else notify.error(error);
    } finally {
      setSaving(false);
    }
  };

  const move = async () => {
    const to = await ask.prompt({
      title: `Move ${where}`,
      label: "New path",
      hint: "Its folders are its place in the site. Its old address leads here for 90 days once this is deployed.",
      initial: where,
      action: "Move",
    });
    if (!to || to === where) return;
    if (!PATH.test(to)) {
      notify.error(
        new Error("A path is lowercase letters, digits, hyphens and underscores, in folders."),
      );
      return;
    }
    try {
      await api.put(`${root}/drafts/${where}`, {
        kind: "doc",
        schemaVersion: 1,
        title,
        body: { source: saved ?? source },
        path: to,
        ...(revision !== null ? { revision } : {}),
      });
      notify.success(`Moved to ${to}. It takes effect when it is deployed.`);
      navigate(`${link}/docs/edit/${to}`, { replace: true });
    } catch (error) {
      notify.error(error);
    }
  };

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <PageHeader
        compact
        title={title}
        state={
          fresh ? (
            <Tag tone="draft">Not saved yet</Tag>
          ) : page && page.state !== "deployed" ? (
            <Tag tone="draft">Draft</Tag>
          ) : undefined
        }
        actions={
          <>
            <Button onClick={() => navigate(fresh ? `${link}/docs` : `${link}/docs/${where}`)}>
              {dirty ? "Close" : "Done"}
            </Button>
            {!fresh ? <Button onClick={move}>Move</Button> : null}
            {!fresh && page ? (
              <RemoveButton
                label="Remove"
                confirm={`Remove the page ${where}? It is removed for its readers when that is deployed.`}
                typeToConfirm={page.state === "new" ? undefined : where.split("/").at(-1)}
                run={() =>
                  page.state === "new"
                    ? api.delete(`${root}/drafts/${where}`)
                    : api.put(`${root}/drafts/${where}`, {
                        kind: "doc",
                        schemaVersion: 1,
                        body: {},
                        deleted: true,
                        ...(revision !== null ? { revision } : {}),
                      })
                }
                onDone={() => navigate(`${link}/docs`)}
              />
            ) : null}
            <Button
              variant="primary"
              disabled={!dirty || saving || placed !== undefined}
              onClick={save}
            >
              Save draft
            </Button>
          </>
        }
        after={
          fresh ? (
            <div className="max-w-[40rem]">
              <TextField
                label="Path"
                name="path"
                value={where}
                required
                hint="Where the page is. Its folders are its place in the site."
                {...(where !== "" && placed ? { error: placed } : {})}
                onChange={setWhere}
              />
            </div>
          ) : (
            <p className="m-0 text-meta text-ink-subtle">
              <Code>{where}</Code>
              {app ? ` in ${app.title}` : " · no docs app serves this page"}
            </p>
          )
        }
      />
      {clash ? (
        <Notice
          tone="danger"
          action={
            <Button
              size="small"
              onClick={async () => {
                const theirs = await api.get<Opened>(`${root}/docs/page/${where}`);
                const sure = await ask.confirm({
                  title: "Take their version?",
                  text: "What you typed since you opened the page is replaced by what they saved. Copy anything you want to keep first.",
                  action: "Take theirs",
                  danger: true,
                });
                if (!sure) return;
                setSource(theirs.source);
                setSaved(theirs.source);
                setRevision(theirs.revision);
                setClash(false);
              }}
            >
              See what they saved
            </Button>
          }
        >
          Someone else saved this page after you opened it. Nothing of theirs was overwritten, and
          what you typed is still here.
        </Notice>
      ) : null}
      <SplitPane
        id="doc-editor"
        label="Resize the page's source and its preview"
        paneLabels={{ first: "the source", second: "the preview" }}
        collapsible="second"
        initial={50}
        className="min-h-[32rem]"
        first={
          <Suspense fallback={<p className="p-3 text-ink-muted">Loading the editor…</p>}>
            <CodeEditor
              label={`Source of ${where || "the new page"}`}
              language="markdown"
              path={`docs/${where || "new"}.md`}
              value={source}
              onChange={setSource}
              onSave={save}
              problems={problems}
              wrap
              height="70vh"
              reveal={reveal}
            />
          </Suspense>
        }
        second={
          <section
            className="h-[70vh] overflow-y-auto border-line border-l bg-surface p-5"
            aria-label="The page as it will be served"
          >
            {/* The served page's own title. Here it is a part of this screen, which has its heading already. */}
            <h2 className="m-0 mb-1 text-display-lg">{title}</h2>
            {checked?.entry.frontmatter.description ? (
              <p className="m-0 mb-5 text-ink-muted">{checked.entry.frontmatter.description}</p>
            ) : (
              <div className="mb-5" />
            )}
            {checked ? (
              <Doc
                tree={checked.entry.tree}
                profile="docs"
                headingShift={1}
                productName={brand.productName}
                asServed
                idPrefix="preview"
                {...drawn}
              />
            ) : null}
          </section>
        }
      />
      <section aria-label="Problems" className="flex flex-col gap-2">
        <h2 className="m-0 text-label text-ink-subtle uppercase">
          {issues.length === 0
            ? "No problems"
            : `${issues.length} ${issues.length === 1 ? "problem" : "problems"}`}
        </h2>
        {issues.length === 0 ? (
          <p className="m-0 text-ink-muted">This page would deploy as it is.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {issues.map((issue, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: two problems may be on one line with one message.
              <li key={index}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-3 rounded-control border-0 bg-transparent px-2 py-1 text-left hover:bg-sunken"
                  onClick={() => setReveal({ line: issue.line, at: Date.now() })}
                >
                  <span className="shrink-0 font-mono text-code-sm text-ink-subtle">
                    Line {issue.line}
                  </span>
                  <span>{issue.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <SaveBar
        dirty={dirty && placed === undefined}
        saving={saving}
        onSave={save}
        onDiscard={() => setSource(saved ?? starter(startTitle))}
        what={`the page ${where || "you are writing"}`}
      />
    </section>
  );
}
