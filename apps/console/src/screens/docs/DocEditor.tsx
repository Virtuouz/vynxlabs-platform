import {
  asDirectory,
  checkPageAmong,
  type DocIssue,
  frontmatterOf,
  nameProblem,
  planMove,
  planRename,
  setFrontmatter,
} from "@volvel/docs-engine";
import { Button, Doc, Notice, Panel, TextField } from "@volvel/ui";
import { CircleAlert, CircleCheck, ExternalLink, FilePen, Pencil } from "lucide-react";
import { type KeyboardEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, useLoad } from "../../api.ts";
import { failureText, notify, takenText } from "../../ask.tsx";
import { Diagram } from "../../diagrams/Diagram.tsx";
import type { CodeEditorHandle, Marker } from "../../editor/CodeEditor.tsx";
import { useWorkspaceTerms } from "../../help/glossary.tsx";
import { useHelpTopic } from "../../help/store.ts";
import { useBrand } from "../../kit/brand.tsx";
import { DiffView } from "../../kit/DiffView.tsx";
import { DraftClash } from "../../kit/DraftClash.tsx";
import { useDraftSave } from "../../kit/draftSave.ts";
import { useShortcut } from "../../kit/keys.ts";
import { ErrorState, Pending } from "../../kit/LoadState.tsx";
import { MarkdownEditor } from "../../kit/markdown/MarkdownEditor.tsx";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { useTitleObject } from "../../kit/title.ts";
import { navigate, useNavigationGuard, useQueryValue } from "../../router.tsx";
import { deletePage, folderItems, keepPage, MoveDialog, PATH, useProduct } from "./Docs.tsx";
import {
  appFor,
  type DocPage,
  type DocsList,
  findRow,
  folderId,
  glossaryFor,
  inApp,
  indexOf,
  resolvers,
  rowsOf,
  sourcesOf,
  termsOf,
} from "./model.ts";
import { PageDetails } from "./PageDetails.tsx";

interface Opened {
  page: DocPage;
  source: string;
  revision: number | null;
  deployedSource: string | null;
}

const starter = (title: string) =>
  `---\ntitle: ${JSON.stringify(title)}\ndescription: \n---\n\nWrite here.\n`;

/** What the top of a page holds, in a few words, for beside it when it is folded. */
function topSays(source: string): string {
  const top = frontmatterOf(source);
  if (!top) return "";
  const said: string[] = [];
  if (top.title) said.push("Title");
  if (top.description) said.push("description");
  if (top.topic) said.push("topic");
  const count = (list: unknown, one: string, many: string) => {
    const n = Array.isArray(list) ? list.length : 0;
    if (n > 0) said.push(`${n} ${n === 1 ? one : many}`);
  };
  count(top.terms, "term", "terms");
  count(top.about, "resource", "resources");
  count(top.pages, "page listed", "pages listed");
  return said.length > 0 ? `${said.join(", ")} · Edit in Page details` : "Edit in Page details";
}

/**
 * Where a page of documentation is written: its source on one side, and on
 * the other the page as it will be served, drawn from the same reading the
 * server makes, following the cursor. What is wrong with it is marked on its
 * lines as it is typed, by the rules a deploy holds it to. Every change, typed
 * or made by the form beside it, is undone and redone the same way.
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
  const [compareAsked] = useQueryValue("compare");
  const [where, setWhere] = useState(path ?? startAt);
  const [source, setSource] = useState<string>();
  const [saved, setSaved] = useState<string>();
  // What was typed last is what a save sends, and what is typed while one is in flight is
  // saved after it. The page's revision is the newest the hook has been given.
  const sent = useRef({ title: "", fresh: false, problems: false, path: path ?? startAt });
  const draft = useDraftSave<string, { revision: number }>({
    send: (text, at) =>
      api.put<{ revision: number }>(`${root}/drafts/${sent.current.path}`, {
        kind: "doc",
        schemaVersion: 1,
        title: frontmatterOf(text)?.title || sent.current.title,
        body: { source: text },
        // A new page is a create: a path that is taken is refused, never overwritten.
        ...(at !== undefined ? { revision: at } : sent.current.fresh ? { create: true } : {}),
      }),
    applied: (_answer, text, newest) => {
      setSaved(text);
      list.reload();
      if (newest) {
        notify.success(
          sent.current.problems
            ? "Saved as a draft. It has problems to mend before it can be deployed."
            : "Saved as a draft. Deploy it from Documentation when it is ready.",
        );
      }
      if (sent.current.fresh) navigate(`${link}/docs/edit/${sent.current.path}`, { replace: true });
    },
    failed: (error) => {
      // Someone else saved it since it was opened: say so, and keep what was typed.
      if (takenText(error)) setTaken(takenText(error));
      else notify.error(error);
    },
  });
  const saving = draft.saving;
  /** The text changed, in the editor or from outside it. */
  const typeSource = (next: string) => {
    setSource(next);
    draft.edit(next);
  };
  const [taken, setTaken] = useState<string>();
  const [reveal, setReveal] = useState<{ line: number; at: number }>();
  const [comparing, setComparing] = useState(compareAsked === "1");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [moving, setMoving] = useState(false);
  const [retitling, setRetitling] = useState(false);
  const handle = useRef<CodeEditorHandle | null>(null);
  const product = useProduct();
  const brand = useBrand();
  const { resources } = useWorkspaceTerms(tenantId, workspaceId);

  // What was opened is what is edited, once. Typing is never overwritten by a reload.
  useEffect(() => {
    if (source !== undefined) return;
    if (!path) {
      setSource(starter(startTitle));
      draft.reset(starter(startTitle));
      setSaved(undefined);
    } else if (opened.data) {
      setSource(opened.data.source);
      setSaved(opened.data.source);
      draft.reset(opened.data.source, opened.data.revision ?? undefined);
    }
  }, [path, opened.data, source, startTitle, draft.reset]);

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
  const errors = issues.filter((issue) => issue.severity === "error");
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
  const rows = useMemo(() => (list.data ? rowsOf(list.data) : []), [list.data]);
  const dirty = source !== undefined && source !== saved;
  useNavigationGuard(
    dirty,
    `Your changes to the page ${where || "you are writing"} are not saved.`,
  );

  const save = async () => {
    // A page drafted for removal is kept first: saving would bring it back without being asked.
    if (placed || source === undefined || opened.data?.page.state === "removed") return;
    setTaken(undefined);
    sent.current = { title, fresh, problems: errors.length > 0, path: where };
    await draft.save(fresh);
  };
  // ⌘S saves what is typed now: the text is the hook's, not the last render's.
  useShortcut("save", () => {
    void save();
  });

  // The crumb and the tab name the page by its title, as it is typed.
  useTitleObject(
    checked?.entry.frontmatter.title ||
      (path === undefined ? "New page" : (opened.data?.page.title ?? where)),
  );

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (opened.error) return <ErrorState error={opened.error} onRetry={opened.reload} />;
  if (!list.data) return <Pending of={list} />;
  if (source === undefined) return path ? <Pending of={opened} /> : null;
  const data = list.data;

  const page = opened.data?.page;
  const fresh = path === undefined;
  // What readers see now, when this page has been deployed before: what was deployed under
  // the draft that was opened, or, with no draft yet, the page as it was opened.
  const deployed = fresh
    ? null
    : (opened.data?.deployedSource ??
      (opened.data?.page.state === "deployed" ? opened.data.source : null));
  const wherePage = data.pages.find((one) => one.path === where);
  const placed = fresh
    ? !PATH.test(where)
      ? "A path is lowercase letters, digits, hyphens and underscores, in folders."
      : wherePage
        ? "There is a page at that path already."
        : !where.includes("/")
          ? "A page goes in a folder: handbook/refunds."
          : undefined
    : undefined;
  const title = checked?.entry.frontmatter.title || (fresh ? "New page" : (page?.title ?? where));
  const folder = where.split("/").slice(0, -1).join("/");
  const name = where.split("/").at(-1) ?? "";
  const trail = folder
    .split("/")
    .filter(Boolean)
    .map((_, index, parts) => {
      const at = parts.slice(0, index + 1).join("/");
      return findRow(rows, folderId(at))?.title ?? at;
    });

  const retitle = (typed: string) => {
    setRetitling(false);
    const next = typed.trim();
    if (next === "" || next === title) return;
    const written = setFrontmatter(source, { title: next });
    if (written === undefined) {
      notify.error(new Error("The top of this page cannot be read. Mend it in the source first."));
      return;
    }
    change(written);
  };

  /** Changes the text as one step of its history, through the editor where it is there. */
  const change = (next: string, select?: { start: number; end: number }) => {
    if (handle.current) handle.current.apply(next, select);
    else typeSource(next);
  };
  /** The pages as they would be with this one as it is typed: what a rename or a move is planned over. */
  const withThis = () =>
    sourcesOf(data).map((one) => (one.path === where ? { path: where, source } : one));

  const relocate = async (plan: ReturnType<typeof planRename>, done: string) => {
    if ("problem" in plan) return plan.problem;
    try {
      const revisions = new Map(data.pages.map((one) => [one.path, one.revision]));
      await api.post(`${root}/drafts/batch`, {
        changes: plan.changes.map((one) => {
          const rev = one.path === where ? draft.known() : revisions.get(one.path);
          return {
            path: one.path,
            ...(one.to !== undefined ? { to: one.to } : {}),
            ...(one.source !== undefined ? { source: one.source } : {}),
            ...(one.deleted ? { deleted: true } : {}),
            ...(rev ? { revision: rev } : {}),
          };
        }),
      });
      const own = plan.changes.find((one) => one.path === where);
      const next = own?.to ?? where;
      setSaved(own?.source ?? source);
      if (own?.source !== undefined) typeSource(own.source);
      draft.reset(own?.source ?? source);
      list.reload();
      notify.success(done);
      if (next !== where) {
        setWhere(next);
        navigate(`${link}/docs/edit/${next}`, { replace: true });
      }
      return undefined;
    } catch (error) {
      return failureText(error);
    }
  };

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <PageHeader
        compact
        eyebrow={
          trail.length > 0 ? (
            <span>
              <a
                href={`${link}/docs`}
                className="text-ink-muted no-underline hover:text-ink"
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`${link}/docs`);
                }}
              >
                Documentation
              </a>
              {trail.map((one) => ` › ${one}`).join("")}
            </span>
          ) : undefined
        }
        title={
          retitling ? (
            <input
              aria-label="Page title"
              // biome-ignore lint/a11y/noAutofocus: it is opened by pressing its pencil, to be typed in.
              autoFocus
              defaultValue={title}
              maxLength={120}
              onBlur={(event) => retitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") retitle(event.currentTarget.value);
                if (event.key === "Escape") setRetitling(false);
              }}
              className="w-full min-w-[16rem] rounded-control border border-action bg-surface px-2 text-ink outline-none"
            />
          ) : (
            title
          )
        }
        state={
          <span className="flex items-center gap-2">
            {retitling ? null : (
              <Button
                size="small"
                variant="quiet"
                aria-label="Change the title"
                onClick={() => setRetitling(true)}
              >
                <Pencil aria-hidden size={14} />
              </Button>
            )}
            {fresh ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-attention/60 bg-attention-soft px-2 py-0.5 text-meta text-attention">
                <FilePen aria-hidden="true" size={14} />
                Not saved yet
              </span>
            ) : page && page.state !== "deployed" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-attention/60 bg-attention-soft px-2 py-0.5 text-meta text-attention">
                <FilePen aria-hidden="true" size={14} />
                {page.state === "removed" ? "To be removed" : "Draft"}
              </span>
            ) : null}
          </span>
        }
        after={
          fresh ? (
            <div className="max-w-[40rem]">
              <TextField
                label="Path"
                name="path"
                value={where}
                required
                hint="Where the page is: its folder, then its file's name. A page goes in a folder."
                {...(where !== "" && (placed ?? taken) ? { error: placed ?? taken } : {})}
                onChange={(value) => {
                  setTaken(undefined);
                  setWhere(value);
                }}
              />
            </div>
          ) : (
            <FileName
              folder={folder}
              name={name}
              locked={name === "index"}
              onRename={(next) =>
                relocate(planRename(withThis(), where, { name: next }), `Renamed to ${next}.md.`)
              }
              onMove={() => setMoving(true)}
            />
          )
        }
        actions={
          <>
            {deployed !== null ? (
              <Button aria-pressed={comparing} onClick={() => setComparing((now) => !now)}>
                {comparing ? "Hide what is deployed" : "Compare with deployed"}
              </Button>
            ) : null}
            {app?.preview && !fresh ? (
              <a
                href={`${app.preview}${inApp(app, where).replace(/(^|\/)index$/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-control items-center gap-1 rounded-control border border-line px-3 text-meta text-ink no-underline hover:bg-sunken"
              >
                Preview in the app
                <ExternalLink aria-hidden="true" size={14} />
              </a>
            ) : null}
            {!fresh && page ? (
              <Button
                variant="danger"
                onClick={async () => {
                  const problem = await deletePage({
                    root,
                    data,
                    reload: list.reload,
                    path: where,
                    title,
                    name: where.split("/").at(-1) as string,
                    folder: undefined,
                    after: () => navigate(`${link}/docs`),
                  });
                  if (problem) notify.error(new Error(problem));
                }}
              >
                Delete…
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => navigate(fresh ? `${link}/docs` : `${link}/docs/${where}`)}
            >
              {dirty ? "Close" : "Done"}
            </Button>
          </>
        }
      />
      {page?.state === "removed" ? (
        <Notice
          tone="attention"
          action={
            <Button
              size="small"
              onClick={async () => {
                if (!(await keepPage(root, page))) return;
                setSource(undefined);
                list.reload();
                opened.reload();
              }}
            >
              Keep this page
            </Button>
          }
        >
          A draft removes this page. It is gone once that is deployed. What is shown is what is
          deployed now; keep the page to change it.
        </Notice>
      ) : null}
      {draft.clashed ? (
        <DraftClash
          what="page"
          mine={() => source}
          onTake={async () => {
            const theirs = await api.get<Opened>(`${root}/docs/page/${where}`);
            setSource(theirs.source);
            setSaved(theirs.source);
            draft.reset(theirs.source, theirs.revision ?? undefined);
          }}
        />
      ) : null}

      <Panel className="flex min-h-0 flex-col overflow-hidden p-0">
        <MarkdownEditor
          profile="docs"
          label={`Source of ${where || "the new page"}`}
          path={`docs/${where || "new"}.md`}
          value={source}
          readOnly={page?.state === "removed"}
          onChange={typeSource}
          onSave={save}
          problems={problems}
          reveal={reveal}
          handle={handle}
          onCursor={setCursor}
          frontmatter={{ hint: topSays(source) }}
          {...(checked ? { tree: checked.entry.tree } : {})}
          previewLabel="The page as it will be served"
          preview={
            <>
              {/* The served page's own title. Here it is a part of this screen, which has its heading already. */}
              <h2 className="m-0 mb-1 text-display-lg">{title}</h2>
              {checked?.entry.frontmatter.description ? (
                <p className="m-0 mb-5 text-ink-muted">{checked.entry.frontmatter.description}</p>
              ) : (
                <div className="mb-5" />
              )}
              {checked ? (
                <Doc
                  tree={asDirectory(inApp(app, where), checked.entry.tree)}
                  profile="docs"
                  headingShift={1}
                  productName={brand.productName}
                  asServed
                  lines
                  idPrefix="preview"
                  folder={() => folderItems(rows, { path: where }, link)}
                  glossary={(scope) =>
                    glossaryFor(data, { path: where }, scope, (to) => `${link}/docs/${to}`)
                  }
                  {...drawn}
                  components={{
                    code: ({ value, lang }) =>
                      lang === "mermaid" ? <Diagram source={value} /> : undefined,
                  }}
                />
              ) : null}
            </>
          }
          sideTabs={[
            {
              id: "details",
              label: "Page details",
              content: (
                <PageDetails
                  source={source}
                  onChange={change}
                  index={where === "index" || where.endsWith("/index")}
                  product={product}
                />
              ),
            },
          ]}
        />
      </Panel>

      {comparing && deployed !== null ? (
        <section aria-label="What changes" className="flex flex-col gap-2">
          <h2 className="m-0 text-label text-ink-subtle uppercase">What changes</h2>
          {deployed === source ? (
            <p className="m-0 text-ink-muted">Nothing: this is what is deployed.</p>
          ) : (
            <DiffView
              before={deployed}
              after={source}
              beforeLabel="Deployed"
              afterLabel="As it is here"
              maxHeight="40vh"
            />
          )}
        </section>
      ) : null}

      <div className="sticky bottom-0 layer-sticky flex flex-col gap-1 rounded-panel border border-line bg-raised px-3 py-2">
        <section aria-label="Problems" className="flex flex-col gap-1">
          {issues.length > 0 ? (
            <ul className="m-0 flex max-h-40 list-none flex-col gap-0.5 overflow-y-auto p-0">
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
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2
              className={`m-0 flex items-center gap-1.5 text-meta font-medium ${
                errors.length > 0
                  ? "text-danger"
                  : issues.length > 0
                    ? "text-attention"
                    : "text-success"
              }`}
            >
              {issues.length === 0 ? (
                <CircleCheck aria-hidden size={14} />
              ) : (
                <CircleAlert aria-hidden size={14} />
              )}
              {issues.length === 0
                ? "No problems"
                : `${issues.length} ${issues.length === 1 ? "problem" : "problems"}`}
            </h2>
            <p className="m-0 text-meta text-ink-muted">
              {errors.length === 0
                ? "This page would deploy as it is."
                : "Mend these before it can be deployed."}
            </p>
            <span className="font-mono text-code-sm text-ink-subtle">
              Ln {cursor.line}, Col {cursor.column}
            </span>
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty ? (
            <span className="flex items-center gap-1.5 text-meta text-ink">
              <span aria-hidden className="size-2 rounded-full bg-attention" />
              Unsaved changes
            </span>
          ) : null}
          <Button
            size="small"
            disabled={!dirty || saving}
            onClick={() => change(saved ?? starter(startTitle))}
          >
            Discard
          </Button>
          <Button
            size="small"
            variant="primary"
            disabled={!dirty || saving || placed !== undefined}
            onClick={save}
          >
            Save draft
          </Button>
        </div>
      </div>
      <MoveDialog
        row={
          moving
            ? {
                id: where,
                kind: "page",
                path: where,
                name,
                title,
                page: data.pages.find((one) => one.path === where),
                site: undefined,
              }
            : undefined
        }
        rows={rows}
        onClose={() => setMoving(false)}
        onMove={async (into) => {
          const problem = await relocate(
            planMove(withThis(), where, { folder: into }),
            `Moved to ${findRow(rows, folderId(into))?.title ?? into}.`,
          );
          if (!problem) setMoving(false);
          return problem;
        }}
      />
    </section>
  );
}

/** The page's folder, and its file's name, which can be changed in place. */
function FileName({
  folder,
  name,
  locked,
  onRename,
  onMove,
}: {
  folder: string;
  name: string;
  locked: boolean;
  onRename: (name: string) => Promise<string | undefined>;
  onMove: () => void;
}) {
  const [typed, setTyped] = useState(name);
  const [problem, setProblem] = useState<string>();
  useEffect(() => setTyped(name), [name]);
  const commit = async () => {
    if (typed === name) return;
    const wrong = nameProblem(typed);
    if (wrong) {
      setProblem(wrong);
      return;
    }
    setProblem(await onRename(typed));
  };
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 flex flex-wrap items-center gap-1 font-mono text-code-sm text-ink-subtle">
        <span>{folder}/</span>
        <span className="inline-flex items-center rounded-inner border border-dashed border-line-strong px-1">
          <input
            aria-label="File name"
            value={typed}
            disabled={locked}
            size={Math.max(4, typed.length)}
            onChange={(event) => {
              setTyped(event.currentTarget.value);
              setProblem(undefined);
            }}
            onBlur={() => void commit()}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === "Enter") void commit();
              if (event.key === "Escape") setTyped(name);
            }}
            className="bg-transparent text-ink outline-none disabled:text-ink-muted"
          />
          <span>.md</span>
        </span>
        <button
          type="button"
          onClick={onMove}
          className="ml-1 font-sans text-meta text-action underline"
        >
          Move…
        </button>
      </p>
      {problem ? <p className="m-0 text-meta text-danger">{problem}</p> : null}
    </div>
  );
}
