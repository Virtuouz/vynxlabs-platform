import {
  asDirectory,
  type Change,
  DOC_TYPE_LABELS,
  DOC_TYPES,
  type DocType,
  FEEDBACK_COLUMNS,
  FEEDBACK_TABLE,
  folderType,
  frontmatterOf,
  inverseOf,
  isDocType,
  type Manifest,
  nameProblem,
  type Plan,
  planDelete,
  planDuplicate,
  planMove,
  planNewFolder,
  planNewPage,
  planRename,
  readPage,
  slugOf,
} from "@volvel/docs-engine";
import {
  Button,
  Dialog,
  Doc,
  type DropPosition,
  EmptyState,
  LimitNote,
  Menu,
  Notice,
  Panel,
  SelectField,
  TextField,
  Tree,
  type TreeNode,
} from "@volvel/ui";
import {
  ChevronsDownUp,
  ExternalLink,
  File,
  FilePen,
  FilePlus,
  Folder,
  FolderPlus,
  Funnel,
  Globe,
  GripVertical,
  Info,
  MoreHorizontal,
  Pencil,
  ThumbsUp,
} from "lucide-react";
import { Fragment, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, useLoad } from "../../api.ts";
import { ask, failureText, notify, takenText } from "../../ask.tsx";
import { Diagram } from "../../diagrams/Diagram.tsx";
import { loadManifest } from "../../help/content.ts";
import { useWorkspaceTerms } from "../../help/glossary.tsx";
import { useBrand } from "../../kit/brand.tsx";
import { useNeeds } from "../../kit/Can.tsx";
import { putOnDraftNow, readDraft } from "../../kit/draftApi.ts";
import { listOf } from "../../kit/format.ts";
import { useShortcut } from "../../kit/keys.ts";
import { ErrorState, Pending } from "../../kit/LoadState.tsx";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { removeWords } from "../../kit/RemoveDraftButton.tsx";
import { Code } from "../../kit/status.tsx";
import { useTitleObject } from "../../kit/title.ts";
import { navigate } from "../../router.tsx";
import {
  appFor,
  type DocPage,
  type DocRow,
  type DocsApp,
  type DocsList,
  entriesOf,
  filterRows,
  findRow,
  folderId,
  foldersOf,
  glossaryFor,
  inApp,
  isFolderId,
  movable,
  pathOfId,
  pendingOf,
  resolvers,
  rowsOf,
  setOf,
  sourcesOf,
} from "./model.ts";
import { ServedAfter, ServedEyebrow } from "./Served.tsx";

/** The product's own help, for the terms a tenant's page may use. Loaded once. */
export function useProduct(): Manifest | undefined {
  const [product, setProduct] = useState<Manifest>();
  useEffect(() => {
    let current = true;
    loadManifest().then(
      (loaded) => current && setProduct(loaded),
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);
  return product;
}

const STATE = {
  deployed: undefined,
  changed: "Draft · not deployed",
  new: "New · not deployed",
  removed: "To be removed",
} as const;

/** A page's path as it is typed: lowercase letters, digits, hyphens and underscores, in folders. */
export const PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/** The mark of a page that is not deployed as it is: right of its title, in the tree and over the page. */
export function DraftMark({ state }: { state: DocPage["state"] }) {
  const said = STATE[state];
  if (!said) return null;
  return (
    <span title={said} className="inline-flex shrink-0 text-attention">
      <FilePen aria-hidden="true" size={14} strokeWidth={1.75} />
      <span className="sr-only">{said}</span>
    </span>
  );
}

/** What is being edited in the tree: a row renamed, or a new one being named in a folder. */
type Editing = { kind: "rename"; id: string } | { kind: "new-page" | "new-folder"; parent: string };

const NEW_ROW = "new:";

/**
 * A workspace's documentation: its pages as their folders on one side, and
 * the page that is chosen on the other, drawn as its readers see it. In a dev
 * workspace the tree is where pages and folders are made, named, put in
 * order, moved and removed, without opening a page. A page kept in the
 * repository is read here and changed there.
 */
export function Docs({
  root,
  link,
  tenantId,
  workspaceId,
  path,
  editable: editableHere,
}: {
  root: string;
  link: string;
  tenantId: string;
  workspaceId: string;
  /** The page shown, by its path in the workspace. None shows the first there is. */
  path: string | undefined;
  /** Whether pages can be changed here: only in a dev workspace. */
  editable: boolean;
}) {
  // A doc writer holds `doc:write` alone, which is enough for pages and the docs apps.
  const may = useNeeds({
    base: root,
    permission: "resource:write",
    alone: ["doc:write"],
    what: "this workspace's pages",
  });
  const editable = editableHere && may.can;
  const list = useLoad<DocsList>(`${root}/docs`);
  // Tree changes go out one after another, each with the revisions the one before left.
  const ordered = useRef<Promise<unknown>>(Promise.resolve());
  const inOrder = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = ordered.current.then(task);
    ordered.current = run.catch(() => undefined);
    return run;
  };
  const [deploying, setDeploying] = useState(false);
  const [editing, setEditing] = useState<Editing>();
  const [filter, setFilter] = useState("");
  const [moving, setMoving] = useState<DocRow>();
  const [publishing, setPublishing] = useState<DocRow>();
  const [asking, setAsking] = useState<DocRow>();
  // Changing it draws the tree afresh: every folder closed, or every folder open again.
  const [treeKey, setTreeKey] = useState({ n: 0, open: true });
  const rows = useMemo(() => (list.data ? rowsOf(list.data) : []), [list.data]);

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Pending of={list} />;
  const data = list.data;
  const first = data.pages.find((page) => page.state !== "removed");
  const chosen = data.pages.find((page) => page.path === path) ?? (path ? undefined : first);
  const pending = pendingOf(data);
  const changes = pending.count;

  const deploy = async () => {
    const tables = pending.tables.map((table) => table.path);
    const sure = await ask.confirm({
      title: `Deploy ${changes} ${changes === 1 ? "change" : "changes"} to the documentation?`,
      text:
        tables.length === 0
          ? "Readers see them at once. Nothing but documentation is deployed."
          : `Readers see them at once. With the documentation goes the ${
              tables.length === 1 ? "table" : "tables"
            } ${listOf(tables)}, where a site keeps its readers' answers. Nothing else is deployed.`,
      action: "Deploy",
    });
    if (!sure) return;
    setDeploying(true);
    try {
      await api.post(`${root}/changes/deploy`, {
        paths: pending.paths,
        message: "Documentation",
      });
      notify.success("The documentation is deployed.");
      list.reload();
    } catch (error) {
      notify.error(error);
    } finally {
      setDeploying(false);
    }
  };

  /** Saves a plan's drafts as one, and offers to take them back. */
  const apply = (
    plan: Plan,
    done: string,
    options: Omit<ApplyOptions, "reload" | "back"> & { follows?: boolean } = {},
  ) =>
    applyPlan(root, data, plan, done, {
      ...options,
      reload: list.reload,
      inOrder,
      // Undoing a move puts the address back with the page, as doing it took it along.
      ...(options.follows
        ? { back: (forward: Change[], inverse: Change[]) => followBack(forward, inverse) }
        : {}),
    });
  const report = (problem: string | undefined) => {
    if (problem) notify.error(new Error(problem));
  };

  /** Where the chosen page goes when what is under it moves. */
  const follow = (changes: Change[]) => {
    const own = changes.find((change) => change.path === chosen?.path && change.to);
    if (own?.to) navigate(`${link}/docs/${own.to}`, { replace: true });
  };

  /** Where the chosen page goes back to when a move of it is undone. */
  const followBack = (forward: readonly Change[], inverse: readonly Change[]) => {
    const own = forward.find((change) => change.path === chosen?.path && change.to);
    const back = inverse.find((change) => change.path === own?.to && change.to);
    if (back?.to) navigate(`${link}/docs/${back.to}`, { replace: true });
  };

  const move = (dragged: string, target: string, position: DropPosition) => {
    const sources = sourcesOf(data);
    const from = pathOfId(dragged);
    const onto = pathOfId(target);
    const parent = onto.split("/").slice(0, -1).join("/");
    const name = onto.split("/").at(-1) as string;
    const place =
      position === "inside"
        ? { folder: onto }
        : position === "before"
          ? { folder: parent, before: name }
          : { folder: parent, after: name };
    const plan = planMove(sources, from, place);
    const what = findRow(rows, dragged)?.title ?? from;
    const into = findRow(rows, folderId(place.folder))?.title ?? place.folder;
    const sameFolder = from.split("/").slice(0, -1).join("/") === place.folder;
    void apply(plan, sameFolder ? `Put ${what} in its new place.` : `Moved ${what} into ${into}.`, {
      after: follow,
      follows: true,
    }).then(report);
  };

  const canMove = (dragged: string, target: string, position: DropPosition) => {
    if (dragged === target || target.startsWith(NEW_ROW)) return false;
    const from = pathOfId(dragged);
    const onto = pathOfId(target);
    // A row goes into a folder, or beside a row in a folder: never at the top beside a site.
    if (position !== "inside" && !onto.includes("/")) return false;
    if (position === "inside" && !isFolderId(target)) return false;
    if (isFolderId(dragged) && (onto === from || onto.startsWith(`${from}/`))) return false;
    return true;
  };

  const canGrab = (id: string) => {
    if (id.startsWith(NEW_ROW)) return false;
    const row = findRow(rows, id);
    if (!row) return false;
    if (row.kind === "page") return movable(row.page);
    // A folder moves with everything in it, so all of it must be the console's.
    return row.path.includes("/") && everyMovable(row);
  };

  const rename = (id: string) => {
    const row = findRow(rows, id);
    if (!row || !editable) return;
    if (row.kind === "page" ? !movable(row.page) : !everyMovable(row)) return;
    setEditing({ kind: "rename", id });
  };

  const remove = async (row: DocRow) => {
    report(
      await deletePage({
        root,
        data,
        reload: list.reload,
        path: row.path,
        title: row.title,
        name: row.name,
        folder: row.kind === "folder" ? { pages: countPages(row) } : undefined,
      }),
    );
  };

  /** Saves the app of a site with one setting changed, and offers to put it back. */
  const changeSite = async (site: DocsApp, body: Record<string, unknown>, done: string) => {
    const put = (to: Record<string, unknown>) =>
      putOnDraftNow(root, site.path, { kind: "app", schemaVersion: 1, body: to });
    try {
      await put(body);
      list.reload();
      notify.success(done, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await put(site.body);
              list.reload();
              notify.info("Undone.");
            } catch (error) {
              notify.error(error);
            }
          },
        },
      });
    } catch (error) {
      notify.error(error);
    }
  };

  /** The switch on a site: off stops serving it and keeps its pages and its app; on serves it again. */
  const switchPublishing = async (site: DocsApp, on: boolean) => {
    const sure = await ask.confirm({
      title: on ? `Publish ${site.title} again?` : `Stop publishing ${site.title}?`,
      text: on
        ? "It is served again once this is deployed. Its pages and its address are as they were."
        : "Once this is deployed, readers are told there is nothing at its address. Its pages and its app are kept, and it can be published again.",
      action: on ? "Publish again" : "Stop publishing",
      danger: !on,
    });
    if (!sure) return;
    const { published: _was, ...rest } = site.body;
    await changeSite(
      site,
      on ? rest : { ...rest, published: false },
      on
        ? `${site.title} will be served again when you deploy.`
        : `${site.title} will stop being served when you deploy.`,
    );
  };

  const turnOffFeedback = async (site: DocsApp) => {
    const sure = await ask.confirm({
      title: `Turn off page feedback on ${site.title}?`,
      text: `Its pages stop asking readers whether they helped, once this is deployed. The table ${site.feedback} and the answers in it are kept.`,
      action: "Turn off",
    });
    if (!sure) return;
    const { feedback: _table, ...rest } = site.body;
    await changeSite(site, rest, `${site.title} will stop asking its readers when you deploy.`);
  };

  /** Removing the app of a site: the pages stay, and the site stops being served. */
  const removeSiteApp = async (site: DocsApp) => {
    const sure = await ask.confirm({
      title: `Remove the app of ${site.title}?`,
      text: site.deployed
        ? "The site stops being served once this is deployed, and readers are told there is nothing at its address. Its pages stay here, and it can be published again."
        : "It was never deployed, so nothing is being served. Its pages stay here.",
      action: "Remove",
      danger: true,
    });
    if (!sure) return;
    try {
      if (site.deployed)
        await putOnDraftNow(root, site.path, {
          kind: "app",
          schemaVersion: 1,
          body: {},
          deleted: true,
        });
      else await api.delete(`${root}/drafts/${site.path}`);
      list.reload();
      notify.success(`${site.title} will stop being served when you deploy.`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              if (site.deployed) await api.delete(`${root}/drafts/${site.path}`);
              else
                await api.put(`${root}/drafts/${site.path}`, {
                  kind: "app",
                  schemaVersion: 1,
                  body: site.body,
                  create: true,
                });
              list.reload();
              notify.info("Undone.");
            } catch (error) {
              notify.error(error);
            }
          },
        },
      });
    } catch (error) {
      notify.error(error);
    }
  };

  /** Throws away the draft that removes a page: it stays as it was last deployed. */
  const keep = async (page: DocPage) => {
    const kept = await keepPage(root, page);
    if (kept) list.reload();
  };

  const duplicate = async (row: DocRow) => {
    report(
      await apply(planDuplicate(sourcesOf(data), row.path), `Made a copy of ${row.title}.`, {
        undo: true,
      }),
    );
  };

  const nodes = toNodes({
    rows: filterRows(rows, filter),
    editable,
    editing,
    onRename: rename,
    onCancel: () => setEditing(undefined),
    commitRename: async (row, next) =>
      apply(planRename(sourcesOf(data), row.path, next), `Renamed ${row.title}.`, {
        after: follow,
        follows: true,
      }),
    folderTypeOf: (folder) =>
      folderType(
        `${folder}/page`,
        (at) => frontmatterOf(data.pages.find((one) => one.path === at)?.source ?? "")?.type,
      ),
    commitNew: async (kind, parent, next) => {
      const plan =
        kind === "new-folder"
          ? planNewFolder(sourcesOf(data), parent, next)
          : planNewPage(sourcesOf(data), parent, next);
      return apply(
        plan,
        kind === "new-folder" ? `Made the folder ${next.title}.` : `Made ${next.title}.`,
        {
          after: (made) => {
            if (kind === "new-page" && made[0]) navigate(`${link}/docs/edit/${made[0].path}`);
          },
        },
      );
    },
    onKeep: (page) => void keep(page),
    menu: (row) => [
      ...(row.kind === "folder"
        ? [
            {
              label: "New page here",
              icon: <FilePlus aria-hidden size={14} />,
              onSelect: () => newHere("new-page", row.path),
            },
            {
              label: "New folder here",
              icon: <FolderPlus aria-hidden size={14} />,
              onSelect: () => newHere("new-folder", row.path),
            },
          ]
        : []),
      {
        label: "Rename",
        keys: "F2",
        separated: row.kind === "folder",
        onSelect: () => rename(row.id),
      },
      { label: "Move to…", onSelect: () => setMoving(row) },
      { label: "Duplicate", onSelect: () => duplicate(row) },
      ...(row.kind === "folder" && !row.path.includes("/") && !row.site
        ? [
            {
              label: "Publish as a site…",
              separated: true,
              detail: "Top-level folders only",
              icon: <Globe aria-hidden size={14} />,
              onSelect: () => setPublishing(row),
            },
          ]
        : []),
      ...(row.site && !row.site.feedback
        ? [
            {
              label: "Turn on page feedback…",
              separated: true,
              detail: "Ask readers whether a page helped",
              icon: <ThumbsUp aria-hidden size={14} />,
              onSelect: () => setAsking(row),
            },
          ]
        : []),
      ...(row.site?.feedback
        ? [
            {
              label: "Turn off page feedback…",
              separated: true,
              detail: "Stop asking readers",
              icon: <ThumbsUp aria-hidden size={14} />,
              onSelect: () => void turnOffFeedback(row.site as DocsApp),
            },
          ]
        : []),
      ...(row.site
        ? [
            row.site.published
              ? {
                  label: "Stop publishing…",
                  separated: !row.site.feedback,
                  detail: "Keeps its pages and its app",
                  icon: <Globe aria-hidden size={14} />,
                  onSelect: () => void switchPublishing(row.site as DocsApp, false),
                }
              : {
                  label: "Publish again…",
                  separated: !row.site.feedback,
                  detail: "Served again once deployed",
                  icon: <Globe aria-hidden size={14} />,
                  onSelect: () => void switchPublishing(row.site as DocsApp, true),
                },
            {
              label: "Remove the site's app…",
              detail: "Stops serving it; the pages stay",
              icon: <Globe aria-hidden size={14} />,
              onSelect: () => void removeSiteApp(row.site as DocsApp),
            },
          ]
        : []),
      {
        label: row.kind === "folder" ? "Delete folder…" : "Delete…",
        danger: true,
        separated: true,
        onSelect: () => remove(row),
      },
    ],
  });

  function newHere(kind: "new-page" | "new-folder", parent: string) {
    setFilter("");
    setTreeKey((before) => ({ n: before.n + 1, open: true }));
    setEditing({ kind, parent });
  }

  const selected = chosen
    ? chosen.path.endsWith("/index")
      ? folderId(chosen.path.slice(0, -"/index".length))
      : chosen.path
    : undefined;

  return (
    <section className="flex flex-col gap-5">
      <RenameKey onRename={() => selected !== undefined && rename(selected)} />
      {editableHere ? may.line : null}
      <PageHeader
        title="Documentation"
        description="Pages your team writes. Any top-level folder can be published as its own docs site."
        actions={
          editable ? (
            <>
              <Button onClick={() => newHere("new-folder", "")}>
                <FolderPlus aria-hidden="true" size={14} />
                New folder
              </Button>
              <Button
                onClick={() => {
                  const into = chosen ? chosen.path.split("/").slice(0, -1).join("/") : "";
                  if (into === "") notify.info("A page goes in a folder. Make a folder first.");
                  else newHere("new-page", into);
                }}
                disabled={rows.every((row) => row.kind !== "folder")}
                title={
                  rows.every((row) => row.kind !== "folder")
                    ? "Make a folder first: a page goes in a folder."
                    : undefined
                }
              >
                <FilePlus aria-hidden="true" size={14} />
                New page
              </Button>
              {changes > 0 ? (
                <Button variant="primary" disabled={deploying} onClick={deploy}>
                  Deploy {changes} {changes === 1 ? "change" : "changes"}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {data.issues?.length ? (
        <Notice tone="attention">
          {data.issues.length === 1 ? "A page takes" : `${data.issues.length} pages take`} a term or
          a topic that the product's own help has, so a site leaves it out and a deploy is refused:{" "}
          {[...new Set(data.issues.map((issue) => issue.path))].join(", ")}. Give it another id in
          the page.
        </Notice>
      ) : null}
      {data.pages.length === 0 && data.apps.length === 0 && !editing ? (
        <EmptyState
          title="No documentation yet"
          action={
            editable ? (
              <Button variant="primary" onClick={() => newHere("new-folder", "")}>
                <FolderPlus aria-hidden="true" size={14} />
                New folder
              </Button>
            ) : undefined
          }
        >
          A folder of pages, published as a site, serves your staff, your customers or anyone, as
          you choose. Pages are written here, or as Markdown files in the repository.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <Panel className="flex min-w-0 flex-col p-0">
            <div className="flex items-center gap-2 border-line border-b p-2">
              <label className="flex h-control min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface px-2 text-ink-muted focus-within:border-action">
                <Funnel aria-hidden="true" size={14} />
                <span className="sr-only">Filter pages</span>
                <input
                  type="search"
                  value={filter}
                  placeholder="Filter pages"
                  onChange={(event) => setFilter(event.currentTarget.value)}
                  className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-subtle"
                />
              </label>
              <Button
                variant="quiet"
                aria-label={treeKey.open ? "Close every folder" : "Open every folder"}
                onClick={() => setTreeKey((before) => ({ n: before.n + 1, open: !before.open }))}
              >
                <ChevronsDownUp aria-hidden="true" size={16} />
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-1.5 lg:max-h-[calc(100vh-16rem)]">
              <Tree
                key={treeKey.n}
                label="Pages"
                nodes={nodes}
                {...(treeKey.open ? {} : { defaultExpanded: [] })}
                {...(selected ? { selected } : {})}
                {...(editable
                  ? { canDrag: canGrab, canDrop: canMove, onMove: move, onRename: rename }
                  : {})}
                onSelect={(id) => {
                  if (id.startsWith(NEW_ROW)) return;
                  const row = findRow(rows, id);
                  // A folder with a page of its own opens that page. One without is opened and closed.
                  if (row?.kind === "folder") {
                    if (row.page) navigate(`${link}/docs/${row.page.path}`);
                  } else navigate(`${link}/docs/${pathOfId(id)}`);
                }}
              />
            </div>
            {editable ? (
              <p className="m-0 flex items-center gap-1.5 border-line border-t px-3 py-2 text-meta text-ink-muted">
                <GripVertical aria-hidden="true" size={14} />
                Drag to reorder or move into a folder. F2 renames.
              </p>
            ) : null}
          </Panel>
          {chosen ? (
            <Reader
              key={chosen.path}
              root={root}
              link={link}
              tenantId={tenantId}
              workspaceId={workspaceId}
              list={data}
              rows={rows}
              page={chosen}
              editable={editable}
              reload={list.reload}
            />
          ) : path ? (
            <Notice tone="attention">There is no page at {path}. Choose one from the list.</Notice>
          ) : (
            <Notice tone="plain">Choose a page from the list, or make one.</Notice>
          )}
        </div>
      )}
      <MoveDialog
        row={moving}
        rows={rows}
        onClose={() => setMoving(undefined)}
        onMove={async (folder) => {
          if (!moving) return undefined;
          const problem = await apply(
            planMove(sourcesOf(data), moving.path, { folder }),
            `Moved ${moving.title} into ${findRow(rows, folderId(folder))?.title ?? folder}.`,
            { after: follow, follows: true },
          );
          if (!problem) setMoving(undefined);
          return problem;
        }}
      />
      <FeedbackDialog
        row={asking}
        list={data}
        onClose={() => setAsking(undefined)}
        onTurnOn={async (makeTable) => {
          const site = asking?.site;
          if (!site) return undefined;
          const table = FEEDBACK_TABLE;
          try {
            const seen = await readDraft(root, site.path);
            await api.post(`${root}/drafts/batch`, {
              changes: [
                // The workspace's one table of answers: made once, by whichever site is first.
                ...(makeTable ? [feedbackTableChange()] : []),
                {
                  path: site.path,
                  kind: "app",
                  schemaVersion: 1,
                  body: { ...site.body, feedback: { table } },
                  // Based on the draft there is now, or none.
                  ...(seen ? { revision: seen.revision } : {}),
                },
              ],
            });
            list.reload();
            notify.success(`${site.title} will ask its readers when you deploy.`, {
              action: {
                label: "Undo",
                onClick: async () => {
                  try {
                    if (makeTable) await api.delete(`${root}/drafts/${table}`);
                    await putOnDraftNow(root, site.path, {
                      kind: "app",
                      schemaVersion: 1,
                      body: site.body,
                    });
                    list.reload();
                    notify.info("Undone.");
                  } catch (error) {
                    notify.error(error);
                  }
                },
              },
            });
            setAsking(undefined);
            return undefined;
          } catch (error) {
            return failureText(error);
          }
        }}
      />
      <PublishDialog
        row={publishing}
        list={data}
        onClose={() => setPublishing(undefined)}
        onPublish={async (address, title) => {
          if (!publishing) return undefined;
          try {
            await api.post(`${root}/drafts/batch`, {
              changes: [
                {
                  path: address,
                  kind: "app",
                  schemaVersion: 1,
                  body: { title, docs: publishing.path },
                  create: true,
                },
              ],
            });
            list.reload();
            const made = publishing;
            notify.success(`${made.title} will be a site once deployed.`, {
              action: {
                label: "Undo",
                onClick: async () => {
                  try {
                    await api.delete(`${root}/drafts/${address}`);
                    list.reload();
                    notify.info("Undone.");
                  } catch (error) {
                    notify.error(error);
                  }
                },
              },
            });
            setPublishing(undefined);
            return undefined;
          } catch (error) {
            return takenText(error) ?? failureText(error);
          }
        }}
      />
    </section>
  );
}

/**
 * Sends a plan's drafts, each with the revision of the draft it changes. The revisions are read
 * as the workspace has them when it goes out, not as the list was last drawn: a second change
 * made before the list reloaded must not carry the revisions from before the first.
 */
async function send(root: string, changes: readonly Change[]) {
  const list = await api.get<DocsList>(`${root}/docs`);
  const revision = new Map(list.pages.map((page) => [page.path, page.revision]));
  await api.post(`${root}/drafts/batch`, {
    changes: changes.map((change) => {
      const at = revision.get(change.path);
      return {
        path: change.path,
        ...(change.to !== undefined ? { to: change.to } : {}),
        ...(change.source !== undefined ? { source: change.source } : {}),
        ...(change.deleted ? { deleted: true } : {}),
        ...(at ? { revision: at } : {}),
      };
    }),
  });
}

/** What applying a plan does besides saving it. */
export interface ApplyOptions {
  undo?: boolean;
  after?: (changes: Change[]) => void;
  /** Called once an undo has put the pages back, with what was done and what undid it. */
  back?: (forward: Change[], inverse: Change[]) => void;
  reload: () => void;
  /** Runs the save after the ones before it, so each carries the revisions they left. */
  inOrder?: <T>(task: () => Promise<T>) => Promise<T>;
}

/**
 * Saves a plan's drafts as one, and offers to take them back with Undo. The
 * one place a change to the pages is made, whether from the tree or the editor.
 */
export async function applyPlan(
  root: string,
  data: DocsList,
  plan: Plan,
  done: string,
  options: ApplyOptions,
): Promise<string | undefined> {
  if ("problem" in plan) return plan.problem;
  if (plan.changes.length === 0) return undefined;
  const before = sourcesOf(data);
  const queue = options.inOrder ?? (<T,>(task: () => Promise<T>) => task());
  try {
    await queue(() => send(root, plan.changes));
    options.reload();
    options.after?.(plan.changes);
    notify.success(
      done,
      options.undo === false
        ? {}
        : {
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  const inverse = inverseOf(before, plan.changes);
                  await queue(() => send(root, inverse));
                  options.reload();
                  options.back?.(plan.changes, inverse);
                  notify.info("Undone.");
                } catch (error) {
                  notify.error(error);
                }
              },
            },
          },
    );
    return undefined;
  } catch (error) {
    return failureText(error);
  }
}

/**
 * Deletes a page or a folder: the same words, the same asking to type the name,
 * and the same Undo wherever it is done from. A page is gone once this is deployed.
 */
export async function deletePage(options: {
  root: string;
  data: DocsList;
  reload: () => void;
  path: string;
  title: string;
  name: string;
  /** Set for a folder: how many pages it holds. */
  folder: { pages: number } | undefined;
  /** Called once it is saved, as the editor leaves the page that is gone. */
  after?: () => void;
}): Promise<string | undefined> {
  const { folder } = options;
  const sure = await ask.typeToConfirm({
    title: folder ? `Delete the folder ${options.title}?` : `Delete ${options.title}?`,
    text: folder
      ? `Its ${folder.pages} ${folder.pages === 1 ? "page goes" : "pages go"} with it, once this is deployed. Readers of the old addresses are told there is no page there.`
      : "It is gone once this is deployed.",
    expected: options.name,
    action: "Delete",
    danger: true,
  });
  if (!sure) return undefined;
  return applyPlan(
    options.root,
    options.data,
    planDelete(sourcesOf(options.data), options.path),
    `${options.title} will be deleted when you deploy.`,
    { reload: options.reload, ...(options.after ? { after: options.after } : {}) },
  );
}

/** Says first what keeping does, then throws away the draft that removes a page. */
export async function keepPage(root: string, page: Pick<DocPage, "path" | "title">) {
  const words = removeWords("removed", "page");
  const sure = await ask.confirm({
    title: `Keep ${page.title}?`,
    text: words.text,
    action: words.action,
  });
  if (!sure) return false;
  try {
    await api.delete(`${root}/drafts/${page.path}`);
    notify.success(`${page.title} is kept.`);
    return true;
  } catch (error) {
    notify.error(error);
    return false;
  }
}

function everyMovable(row: DocRow): boolean {
  if (row.kind === "page") return movable(row.page);
  return (row.page === undefined || movable(row.page)) && (row.children ?? []).every(everyMovable);
}

function countPages(row: DocRow): number {
  if (row.kind === "page") return 1;
  return (row.page ? 1 : 0) + (row.children ?? []).reduce((sum, one) => sum + countPages(one), 0);
}

/** The tree's rows as the kit's tree draws them: with their file names, their state, and what can be done to them. */
function toNodes(options: {
  rows: readonly DocRow[];
  editable: boolean;
  editing: Editing | undefined;
  onRename: (id: string) => void;
  onCancel: () => void;
  commitRename: (row: DocRow, next: { title: string; name: string }) => Promise<string | undefined>;
  commitNew: (
    kind: "new-page" | "new-folder",
    parent: string,
    next: { title: string; name: string; type?: DocType },
  ) => Promise<string | undefined>;
  /** The type a folder gives the pages in it that say none. */
  folderTypeOf: (folder: string) => DocType | undefined;
  menu: (row: DocRow) => Parameters<typeof Menu>[0]["items"];
  /** Throws away the draft that removes a page. */
  onKeep: (page: DocPage) => void;
}): TreeNode[] {
  const { editing } = options;
  const newRow = (parent: string): TreeNode[] => {
    if (editing?.kind !== "new-page" && editing?.kind !== "new-folder") return [];
    if (editing.parent !== parent) return [];
    const folder = editing.kind === "new-folder";
    return [
      {
        id: `${NEW_ROW}${parent}`,
        label: folder ? "New folder" : "New page",
        icon: folder ? <Folder aria-hidden size={16} /> : <File aria-hidden size={16} />,
        editing: (
          <NameEditor
            initialTitle=""
            initialName=""
            suffix={folder ? "/" : ".md"}
            titleLabel={folder ? "Folder title" : "Page title"}
            follows
            {...(folder ? {} : { types: { inherited: options.folderTypeOf(parent) } })}
            onCancel={options.onCancel}
            onSubmit={async (next) => {
              const problem = await options.commitNew(editing.kind, parent, next);
              if (!problem) options.onCancel();
              return problem;
            }}
          />
        ),
      },
    ];
  };
  const one = (row: DocRow): TreeNode => {
    const folder = row.kind === "folder";
    const state = row.page?.state;
    const changeable =
      options.editable &&
      (folder ? row.page === undefined || movable(row.page) : movable(row.page));
    const renaming = editing?.kind === "rename" && editing.id === row.id;
    const node: TreeNode = {
      id: row.id,
      label: row.title,
      icon: folder ? (
        <Folder aria-hidden size={16} className="shrink-0 text-ink-muted" />
      ) : (
        <File aria-hidden size={16} className="shrink-0 text-ink-muted" />
      ),
      detail: folder ? (row.page ? `${row.name}/ · index.md` : `${row.name}/`) : `${row.name}.md`,
      ...(state && state !== "deployed" ? { badge: <DraftMark state={state} /> } : {}),
      ...(row.site
        ? {
            trailing: (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-action/50 px-1.5 text-meta text-action">
                <Globe aria-hidden size={14} />
                {row.site.published ? "Site" : "Site, not published"}
              </span>
            ),
          }
        : row.page?.file
          ? { trailing: <span className="shrink-0 text-meta text-ink-subtle">repository</span> }
          : {}),
      ...(changeable && !renaming
        ? {
            actions: (
              <>
                <button
                  type="button"
                  aria-label={`Rename ${row.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onRename(row.id);
                  }}
                  className="inline-flex size-6 items-center justify-center rounded-inner text-ink-muted hover:bg-surface hover:text-ink"
                >
                  <Pencil aria-hidden size={14} />
                </button>
                <Menu
                  ariaLabel={`More for ${row.title}`}
                  align="end"
                  triggerClassName="inline-flex size-6 items-center justify-center rounded-inner text-ink-muted hover:bg-surface hover:text-ink"
                  label={<MoreHorizontal aria-hidden size={14} />}
                  items={options.menu(row)}
                />
              </>
            ),
          }
        : {}),
      ...(options.editable && !folder && row.page?.state === "removed" && !row.page.file
        ? {
            actions: (
              <button
                type="button"
                aria-label={`Keep ${row.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (row.page) options.onKeep(row.page);
                }}
                className="inline-flex h-6 items-center rounded-inner px-1.5 text-meta text-action hover:bg-surface"
              >
                Keep
              </button>
            ),
          }
        : {}),
      ...(renaming
        ? {
            editing: (
              <NameEditor
                initialTitle={row.title}
                initialName={row.name}
                suffix={folder ? "/" : ".md"}
                titleLabel={folder ? "Folder title" : "Page title"}
                nameLocked={!folder && row.name === "index"}
                hint={
                  folder
                    ? undefined
                    : "Renaming the file moves its address. The old address leads to the new one for 90 days."
                }
                onCancel={options.onCancel}
                onSubmit={async (next) => {
                  const problem = await options.commitRename(row, next);
                  if (!problem) options.onCancel();
                  return problem;
                }}
              />
            ),
          }
        : {}),
    };
    if (folder) node.children = [...newRow(row.path), ...(row.children ?? []).map(one)];
    return node;
  };
  return [...newRow(""), ...options.rows.map(one)];
}

/** The keys of the naming field and of the tree around it: they stay in the field. */
const NAME_FIELD_KEYS = new Set([
  "Enter",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "F2",
]);

/**
 * A title and a file name, edited together in a row of the tree. Enter saves
 * and Escape cancels. A name made from a title follows it until it is typed
 * in itself.
 */
export function NameEditor({
  initialTitle,
  initialName,
  suffix,
  titleLabel,
  nameLocked = false,
  follows = false,
  hint,
  types,
  onSubmit,
  onCancel,
}: {
  initialTitle: string;
  initialName: string;
  suffix: ".md" | "/";
  titleLabel: string;
  nameLocked?: boolean;
  /** Whether the name is made from the title until it is typed in. */
  follows?: boolean;
  hint?: string | undefined;
  /** For a new page: offers its type, and says what the folder gives one that is left without. */
  types?: { inherited: DocType | undefined };
  onSubmit: (next: { title: string; name: string; type?: DocType }) => Promise<string | undefined>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [type, setType] = useState("");
  const [name, setName] = useState(initialName);
  const [own, setOwn] = useState(!follows);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);
  const wrong = name === "" ? undefined : nameProblem(name);
  const fixed = wrong ? slugOf(name) : undefined;
  const submit = async () => {
    if (busy) return;
    if (title.trim() === "") {
      setProblem("A title is needed.");
      return;
    }
    if (title.length > 120 || name.length > 80) {
      setProblem("Shorten what is past its limit first.");
      return;
    }
    if (name === "" || wrong) {
      setProblem(name === "" ? "A file name is needed." : wrong);
      return;
    }
    setBusy(true);
    const answer = await onSubmit({
      title: title.trim(),
      name,
      ...(isDocType(type) ? { type } : {}),
    });
    setBusy(false);
    setProblem(answer);
  };
  const keys = (event: KeyboardEvent) => {
    // Only the keys the field and the tree use are kept from the page. Every other key,
    // F1 for help and ⌘K for the palette among them, reaches the shortcuts above.
    if (NAME_FIELD_KEYS.has(event.key)) event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keys typed into the fields are theirs, not the tree's.
    <div className="flex flex-col gap-1 py-0.5" onKeyDown={keys}>
      <input
        ref={first}
        aria-label={titleLabel}
        placeholder={titleLabel}
        value={title}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setTitle(next);
          if (!own) setName(slugOf(next));
        }}
        className="h-7 w-full rounded-inner border border-action bg-surface px-2 text-ink outline-none"
      />
      <LimitNote value={title} max={120} />
      <div
        className={`flex h-7 items-center rounded-inner border bg-surface px-2 font-mono text-code-sm ${
          wrong ? "border-danger" : "border-line"
        }`}
      >
        <input
          aria-label="File name"
          placeholder="made from the title"
          value={name}
          disabled={nameLocked}
          onChange={(event) => {
            setOwn(true);
            setName(event.currentTarget.value);
          }}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-subtle disabled:text-ink-muted"
        />
        <span className="text-ink-subtle">{suffix}</span>
      </div>
      <LimitNote value={name} max={80} />
      {types ? (
        <SelectField
          name="new-page-type"
          label="Type"
          required={false}
          value={type}
          options={[
            {
              value: "",
              label: types.inherited ? `Folder: ${DOC_TYPE_LABELS[types.inherited]}` : "None",
            },
            ...DOC_TYPES.map((one) => ({ value: one, label: DOC_TYPE_LABELS[one] })),
          ]}
          onChange={setType}
        />
      ) : null}
      {wrong ? (
        <p className="m-0 text-meta text-danger">
          Use lowercase letters, numbers, - and _.
          {fixed ? (
            <>
              {" "}
              <button
                type="button"
                className="text-action underline"
                onClick={() => setName(fixed)}
              >
                Use {fixed}
              </button>
            </>
          ) : null}
        </p>
      ) : problem ? (
        <p className="m-0 text-meta text-danger">{problem}</p>
      ) : hint ? (
        <p className="m-0 text-meta text-ink-muted">{hint}</p>
      ) : name === "index" && suffix === ".md" ? (
        <p className="m-0 flex items-center gap-1 text-meta text-ink-muted">
          <Info aria-hidden size={14} />
          Naming a page index makes it the folder's own page. A folder can have one.
        </p>
      ) : null}
      <div className="flex gap-1.5">
        <Button variant="primary" size="small" disabled={busy} onClick={() => void submit()}>
          Save
        </Button>
        <Button variant="quiet" size="small" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function MoveDialog({
  row,
  rows,
  onClose,
  onMove,
}: {
  row: DocRow | undefined;
  rows: readonly DocRow[];
  onClose: () => void;
  onMove: (folder: string) => Promise<string | undefined>;
}) {
  const [folder, setFolder] = useState("");
  const [problem, setProblem] = useState<string>();
  useEffect(() => {
    setFolder(row ? row.path.split("/").slice(0, -1).join("/") : "");
    setProblem(undefined);
  }, [row]);
  const places = foldersOf(rows).filter(
    (one) =>
      row?.kind !== "folder" || (one.path !== row.path && !one.path.startsWith(`${row.path}/`)),
  );
  const depth = (path: string) => path.split("/").length - 1;
  return (
    <Dialog
      open={row !== undefined}
      onClose={onClose}
      title={row ? `Move ${row.title}` : "Move"}
      description="Its address changes with its folder. The old one leads to the new one for 90 days."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setProblem(await onMove(folder));
        }}
      >
        <SelectField
          label="Into the folder"
          name="folder"
          value={folder}
          options={places.map((one) => ({
            value: one.path,
            label: `${" ".repeat(depth(one.path))}${one.title}`,
          }))}
          onChange={setFolder}
        />
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Move
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Turning on "Was this page helpful?" for a site. It says, before anything is
 * made, what will be made: a table of the workspace's, and a change to the
 * site. Nothing is a surprise later in the list of tables.
 */
function FeedbackDialog({
  row,
  list,
  onClose,
  onTurnOn,
}: {
  row: DocRow | undefined;
  list: DocsList;
  onClose: () => void;
  onTurnOn: (makeTable: boolean) => Promise<string | undefined>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const site = row?.site;
  const table = FEEDBACK_TABLE;
  // One table keeps the answers of every site of the workspace. A table that is being removed is
  // as good as none: making it again replaces that removal.
  const exists = list.tables.some((one) => one.path === table && one.state !== "removed");
  const taken =
    !exists &&
    (list.pages.some((page) => page.path === table) || list.apps.some((app) => app.path === table));
  useEffect(() => {
    if (row) setError(undefined);
  }, [row]);
  return (
    <Dialog
      open={row !== undefined}
      onClose={onClose}
      title={site ? `Ask readers of ${site.title} whether a page helped` : "Page feedback"}
      description="Each page ends with “Was this page helpful? Yes / No”. Here is what turning it on does."
    >
      <div className="flex flex-col gap-3">
        <ul className="m-0 flex flex-col gap-2 pl-5 text-body">
          {exists ? (
            <li>
              The table <Code>{table}</Code> already keeps the answers of this workspace's sites. It
              is used as it is: only the site changes.
            </li>
          ) : (
            <li>
              A table, <Code>{table}</Code>, that keeps the answers of every site of this workspace,
              with the columns{" "}
              {Object.keys(FEEDBACK_COLUMNS).map((name, index, all) => (
                <Fragment key={name}>
                  <Code>{name}</Code>
                  {index < all.length - 2 ? ", " : index === all.length - 2 ? " and " : ""}
                </Fragment>
              ))}
              . Each answer is one row of it, with the site it was given on.
            </li>
          )}
          <li>
            A change to the site <Code>{site?.path}</Code>: it keeps its readers' answers in that
            table.
          </li>
          <li>
            Nothing about who answered is kept: no name, no address. A reader answers once for each
            page, remembered by their own browser.
          </li>
          <li>
            {exists ? "The site change is a draft" : "Both are drafts"} until you deploy. The table
            is queried like any other. Turning this off later keeps the table and what is in it.
          </li>
        </ul>
        {taken ? (
          <Notice tone="danger">Something already has the path {table}.</Notice>
        ) : error ? (
          <Notice tone="danger">{error}</Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || taken}
            onClick={async () => {
              setBusy(true);
              setError(await onTurnOn(!exists));
              setBusy(false);
            }}
          >
            {exists ? "Turn it on" : "Make the table and turn it on"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** The draft of the workspace's table of answers. */
function feedbackTableChange() {
  return {
    path: FEEDBACK_TABLE,
    kind: "table",
    schemaVersion: 1,
    body: {
      description:
        "What readers of the workspace's documentation sites said of each page: whether it helped them.",
      columns: Object.fromEntries(
        Object.entries(FEEDBACK_COLUMNS).map(([name, column]) => [
          name,
          {
            type: column.type,
            ...(column.required ? { required: true } : {}),
            description: column.description,
          },
        ]),
      ),
    },
  };
}

function PublishDialog({
  row,
  list,
  onClose,
  onPublish,
}: {
  row: DocRow | undefined;
  list: DocsList;
  onClose: () => void;
  onPublish: (address: string, title: string) => Promise<string | undefined>;
}) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTitle(row?.title ?? "");
    setAddress(row ? `${row.name}-site` : "");
    setError(undefined);
  }, [row]);
  const problem = !PATH.test(address)
    ? "The address is lowercase letters, digits, hyphens and underscores: handbook."
    : list.pages.some((page) => page.path === address) ||
        list.apps.some((app) => app.path === address)
      ? "Something already has that path."
      : undefined;
  return (
    <Dialog
      open={row !== undefined}
      onClose={onClose}
      title={row ? `Publish ${row.title} as a site` : "Publish as a site"}
      description="Every page in the folder is a page of the site. Nobody outside sees it until you deploy it and say who may open it."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (problem || title.trim() === "") return;
          setBusy(true);
          setError(await onPublish(address, title.trim()));
          setBusy(false);
        }}
      >
        <TextField
          label="Site title"
          name="title"
          value={title}
          required
          maxLength={120}
          onChange={setTitle}
        />
        <TextField
          label="Address"
          name="path"
          value={address}
          required
          hint="The last part of the site's address, and the app's path: handbook-site."
          onChange={setAddress}
        />
        {(address !== "" && problem) || error ? (
          <Notice tone="danger">{error ?? problem}</Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || problem !== undefined || title.trim() === ""}
          >
            Publish
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Reader({
  root,
  link,
  tenantId,
  workspaceId,
  list,
  rows,
  page,
  editable,
  reload,
}: {
  root: string;
  link: string;
  tenantId: string;
  workspaceId: string;
  list: DocsList;
  rows: readonly DocRow[];
  page: DocPage;
  editable: boolean;
  reload: () => void;
}) {
  const product = useProduct();
  const brand = useBrand();
  useTitleObject(page.title);
  const { resources } = useWorkspaceTerms(tenantId, workspaceId);
  const app = appFor(list.apps, page.path);
  const read = useMemo(
    () => readPage(inApp(app, page.path), page.source),
    [app, page.path, page.source],
  );
  const site = useMemo(() => setOf(entriesOf(list, app), read.entry), [list, app, read.entry]);
  const here = inApp(app, page.path);
  const drawn = useMemo(
    () =>
      resolvers({
        list,
        page,
        address: (path) => `${link}/docs/${path}`,
        product,
        described: resources,
      }),
    [list, page, link, product, resources],
  );
  // What its readers said of it, when its site asks them and this reader may read the answers.
  const answers = useLoad<{
    items: { by: { page?: string; helpful?: boolean }; values: { count?: number } }[];
  }>(
    app?.feedback && app.deployed
      ? `${root}/aggregate/${app.feedback}?group=page,helpful&measure=count&filter=${encodeURIComponent(
          JSON.stringify({ and: [{ column: "site_key", op: "eq", value: app.key }] }),
        )}`
      : null,
  );
  const said = (helpful: boolean) =>
    answers.data?.items
      .filter((one) => one.by.page === inApp(app, page.path) && one.by.helpful === helpful)
      .reduce((sum, one) => sum + Number(one.values.count ?? 0), 0) ?? 0;
  const served = app?.deployed ? app.url : undefined;
  // Something of this page, or of its app, is not deployed: the preview shows it as it would be.
  const drafted = editable && app?.preview && (page.state !== "deployed" || !app.deployed);
  const state = STATE[page.state];
  // The folders the page is in, by their titles.
  const parts = page.path.split("/");
  const folders = parts.slice(0, page.path.endsWith("/index") ? -2 : -1);
  const trail = folders.map((_, at) => {
    const path = folders.slice(0, at + 1).join("/");
    return findRow(rows, folderId(path))?.title ?? path;
  });

  return (
    <Panel className="flex min-w-0 flex-col p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-line border-b px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          {trail.length > 0 ? (
            <p className="m-0 text-meta text-ink-muted">{trail.join(" › ")}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <ServedEyebrow set={site} path={here} />
            <h2 className="m-0 text-display">{page.title}</h2>
            {state ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-attention/60 bg-attention-soft px-2 py-0.5 text-meta text-attention">
                <FilePen aria-hidden="true" size={14} />
                {state}
              </span>
            ) : null}
          </div>
          <p className="m-0 text-meta text-ink-subtle">
            <Code>{page.path}.md</Code>
            {app ? null : " · no site publishes this page"}
          </p>
          {answers.data ? (
            <p className="m-0 flex items-center gap-1.5 text-meta text-ink-muted">
              <ThumbsUp aria-hidden="true" size={14} />
              {said(true)} found it helpful · {said(false)} didn't
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {editable && !page.file && page.state === "changed" ? (
            <Button onClick={() => navigate(`${link}/docs/edit/${page.path}?compare=1`)}>
              Compare with deployed
            </Button>
          ) : null}
          {served && page.state !== "new" ? (
            <a
              href={`${served}${page.url ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-control items-center gap-1 rounded-control border border-line px-3 text-meta text-ink hover:bg-sunken"
            >
              Open as readers see it
              <ExternalLink aria-hidden="true" size={14} />
            </a>
          ) : null}
          {drafted && page.state !== "removed" ? (
            <a
              href={`${app?.preview}${page.url ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-control items-center gap-1 rounded-control border border-line px-3 text-meta text-ink hover:bg-sunken"
            >
              Preview with drafts
              <ExternalLink aria-hidden="true" size={14} />
            </a>
          ) : null}
          {editable && !page.file && page.state !== "removed" ? (
            <Button variant="primary" onClick={() => navigate(`${link}/docs/edit/${page.path}`)}>
              <Pencil aria-hidden="true" size={14} />
              Edit
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">
        {page.file ? (
          <Notice tone="plain">
            This page lives in the repository, at <Code>{page.file}</Code>. Change it there: what is
            pushed to the workspace's branch is what is shown here.
          </Notice>
        ) : null}
        {page.state === "removed" ? (
          <Notice
            tone="attention"
            action={
              editable && !page.file ? (
                <Button
                  size="small"
                  onClick={async () => {
                    if (await keepPage(root, page)) reload();
                  }}
                >
                  Keep this page
                </Button>
              ) : undefined
            }
          >
            A draft removes this page. It is gone once that is deployed.
          </Notice>
        ) : null}
        {read.issues.some((issue) => issue.severity === "error") ? (
          <Notice tone="attention">
            This page has {read.issues.length} {read.issues.length === 1 ? "problem" : "problems"}{" "}
            and would not deploy as it is. {read.issues[0]?.message}
          </Notice>
        ) : null}
        <div className="mx-auto w-full max-w-4xl">
          <Doc
            tree={asDirectory(inApp(app, page.path), read.entry.tree)}
            profile="docs"
            headingShift={2}
            productName={brand.productName}
            asServed
            folder={() => folderItems(rows, page, link)}
            glossary={(scope) => glossaryFor(list, page, scope, (to) => `${link}/docs/${to}`)}
            {...drawn}
            components={{
              code: ({ value, lang }) =>
                lang === "mermaid" ? <Diagram source={value} /> : undefined,
              link: ({ href, external, children }) =>
                external ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ) : (
                  <a
                    href={href}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      navigate(href);
                    }}
                  >
                    {children}
                  </a>
                ),
            }}
          />
          <ServedAfter
            set={site}
            path={here}
            address={(to) => `${link}/docs/${app ? `${app.docs}/` : ""}${to}`}
          />
        </div>
      </div>
    </Panel>
  );
}

/** What a page's folder holds, for `::pages` and for a folder's own page with nothing written in it. */
export function folderItems(rows: readonly DocRow[], page: Pick<DocPage, "path">, link: string) {
  const parts = page.path.split("/");
  const folder = parts.slice(0, -1).join("/");
  const held = folder === "" ? rows : (findRow(rows, folderId(folder))?.children ?? []);
  return held.map((row) => ({
    title: row.title,
    href: `${link}/docs/${row.kind === "folder" ? (row.page?.path ?? row.path) : row.path}`,
    ...(row.page?.description ? { description: row.page.description } : {}),
    ...(row.kind === "folder" ? { folder: true } : {}),
  }));
}

/**
 * F2 renames the page that is open, wherever focus is on the screen. The tree's own rows handle
 * the key when they have focus, but a page chosen in the tree moves focus to the page's heading.
 */
function RenameKey({ onRename }: { onRename: () => void }) {
  useShortcut("rename", () => onRename());
  return null;
}
