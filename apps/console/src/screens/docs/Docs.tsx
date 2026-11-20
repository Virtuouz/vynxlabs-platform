import { type Manifest, readPage } from "@volvel/docs-engine";
import { Button, Dialog, Doc, EmptyState, Notice, Panel, TextField, Tree } from "@volvel/ui";
import { ExternalLink, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, useLoad } from "../../api.ts";
import { ask, failureText, notify } from "../../ask.tsx";
import { loadManifest } from "../../help/content.ts";
import { useWorkspaceTerms } from "../../help/glossary.tsx";
import { useBrand } from "../../kit/brand.tsx";
import { ErrorState, Pending } from "../../kit/LoadState.tsx";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { Code, Tag } from "../../kit/status.tsx";
import { navigate } from "../../router.tsx";
import {
  appFor,
  type DocPage,
  type DocsList,
  inApp,
  movable,
  movedTo,
  resolvers,
  treeOf,
} from "./model.ts";

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
  changed: "Changed, not deployed",
  new: "New, not deployed",
  removed: "To be removed",
} as const;

/** A page's path as it is typed: lowercase letters, digits, hyphens and underscores, in folders. */
export const PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/**
 * A workspace's documentation: its pages as their folders on one side, and
 * the page that is chosen on the other, drawn as its readers see it. In a dev
 * workspace a page made in the console can be changed from here. A page kept
 * in the repository is read here and changed there.
 */
export function Docs({
  root,
  link,
  tenantId,
  workspaceId,
  path,
  editable,
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
  const list = useLoad<DocsList>(`${root}/docs`);
  const [creating, setCreating] = useState<"page" | "app">();
  const [deploying, setDeploying] = useState(false);
  const tree = useMemo(() => (list.data ? treeOf(list.data) : []), [list.data]);

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Pending of={list} />;
  const data = list.data;
  const first = data.pages.find((page) => page.state !== "removed");
  const chosen = data.pages.find((page) => page.path === path) ?? (path ? undefined : first);
  const drafts = data.pages.filter((page) => page.state !== "deployed");
  const draftApps = data.apps.filter((app) => !app.deployed);

  const deploy = async () => {
    const sure = await ask.confirm({
      title: `Deploy ${drafts.length + draftApps.length} ${drafts.length + draftApps.length === 1 ? "change" : "changes"} to the documentation?`,
      text: "Readers see them at once. Nothing but documentation is deployed.",
      action: "Deploy",
    });
    if (!sure) return;
    setDeploying(true);
    try {
      await api.post(`${root}/changes/deploy`, {
        paths: [...drafts.map((page) => page.path), ...draftApps.map((app) => app.path)],
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

  // A page let go on a folder goes into it, as a draft, as Move in its editor would put it.
  const move = async (dragged: string, onto: string) => {
    const place = movedTo(data, dragged, onto);
    if (!place) return;
    if ("problem" in place) {
      notify.error(new Error(place.problem));
      return;
    }
    try {
      const page = await api.get<{ source: string; revision: number | null; page: DocPage }>(
        `${root}/docs/page/${dragged}`,
      );
      await api.put(`${root}/drafts/${dragged}`, {
        kind: "doc",
        schemaVersion: 1,
        title: page.page.title,
        body: { source: page.source },
        path: place.to,
        ...(page.revision !== null ? { revision: page.revision } : {}),
      });
      notify.success(`Moved to ${place.to}. It takes effect when it is deployed.`);
      list.reload();
      if (chosen?.path === dragged) navigate(`${link}/docs/${place.to}`, { replace: true });
    } catch (error) {
      notify.error(error);
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title="Documentation"
        description="Pages your team writes: handbooks, procedures, and what your tables and scripts are for. Each docs app serves a folder of pages as a site."
        actions={
          editable ? (
            <>
              {drafts.length + draftApps.length > 0 ? (
                <Button variant="primary" disabled={deploying} onClick={deploy}>
                  Deploy {drafts.length + draftApps.length}{" "}
                  {drafts.length + draftApps.length === 1 ? "change" : "changes"}
                </Button>
              ) : null}
              <Button onClick={() => setCreating("page")} disabled={data.apps.length === 0}>
                New page
              </Button>
              <Button onClick={() => setCreating("app")}>New docs app</Button>
            </>
          ) : null
        }
      />
      {data.pages.length === 0 && data.apps.length === 0 ? (
        <EmptyState
          title="No documentation yet"
          action={
            editable ? (
              <Button variant="primary" onClick={() => setCreating("app")}>
                New docs app
              </Button>
            ) : undefined
          }
        >
          A docs app serves a folder of pages as a site, to your staff, to your customers or to
          anyone, as you choose. Pages are written here, or as Markdown files in the repository.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Panel className="p-2">
            <Tree
              label="Pages"
              nodes={tree}
              {...(chosen ? { selected: chosen.path } : {})}
              {...(editable
                ? {
                    canDrag: (id: string) => movable(data.pages.find((page) => page.path === id)),
                    canDrop: (dragged: string, onto: string) =>
                      movedTo(data, dragged, onto) !== undefined,
                    onMove: move,
                  }
                : {})}
              // An app or a folder is opened and closed, not chosen.
              onSelect={(id) => {
                if (!id.startsWith("app:") && !id.startsWith("dir:"))
                  navigate(`${link}/docs/${id}`);
              }}
            />
          </Panel>
          {chosen ? (
            <Reader
              key={chosen.path}
              root={root}
              link={link}
              tenantId={tenantId}
              workspaceId={workspaceId}
              list={data}
              page={chosen}
              editable={editable}
            />
          ) : (
            <Notice tone="attention">There is no page at {path}. Choose one from the list.</Notice>
          )}
        </div>
      )}
      <NewDialog
        kind={creating}
        root={root}
        link={link}
        list={data}
        onClose={() => setCreating(undefined)}
        onMade={list.reload}
      />
    </section>
  );
}

function Reader({
  root,
  link,
  tenantId,
  workspaceId,
  list,
  page,
  editable,
}: {
  root: string;
  link: string;
  tenantId: string;
  workspaceId: string;
  list: DocsList;
  page: DocPage;
  editable: boolean;
}) {
  const loaded = useLoad<{ source: string }>(`${root}/docs/page/${page.path}`);
  const product = useProduct();
  const brand = useBrand();
  const { resources } = useWorkspaceTerms(tenantId, workspaceId);
  const app = appFor(list.apps, page.path);
  const read = useMemo(
    () => (loaded.data ? readPage(inApp(app, page.path), loaded.data.source) : undefined),
    [loaded.data, app, page.path],
  );
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
  const served = app?.deployed ? app.url : undefined;
  // Something of this page, or of its app, is not deployed: the preview shows it as it would be.
  const drafted = editable && app?.preview && (page.state !== "deployed" || !app.deployed);
  const state = STATE[page.state];

  return (
    <Panel className="flex min-w-0 flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-display">{page.title}</h2>
            {state ? <Tag tone="draft">{state}</Tag> : null}
          </div>
          {page.description ? <p className="m-0 text-ink-muted">{page.description}</p> : null}
          <p className="m-0 text-meta text-ink-subtle">
            <Code>{page.path}</Code>
            {app ? ` in ${app.title}` : " · no docs app serves this page"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {served && page.state !== "new" ? (
            <a
              href={`${served}${page.url ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-meta text-action"
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
              className="inline-flex items-center gap-1 text-meta text-action"
            >
              Preview with drafts
              <ExternalLink aria-hidden="true" size={14} />
            </a>
          ) : null}
          {editable && !page.file && page.state !== "removed" ? (
            <Button onClick={() => navigate(`${link}/docs/edit/${page.path}`)}>
              <Pencil aria-hidden="true" size={14} />
              Edit
            </Button>
          ) : null}
        </div>
      </div>
      {page.file ? (
        <Notice tone="plain">
          This page lives in the repository, at <Code>{page.file}</Code>. Change it there: what is
          pushed to the workspace's branch is what is shown here.
        </Notice>
      ) : null}
      {page.state === "removed" ? (
        <Notice tone="attention">
          A draft removes this page. It is gone once that is deployed.
        </Notice>
      ) : null}
      {loaded.error ? (
        <ErrorState error={loaded.error} onRetry={loaded.reload} />
      ) : !read ? (
        <Pending of={loaded} />
      ) : (
        <>
          {read.issues.length > 0 ? (
            <Notice tone="attention">
              This page has {read.issues.length} {read.issues.length === 1 ? "problem" : "problems"}{" "}
              and would not deploy as it is. {read.issues[0]?.message}
            </Notice>
          ) : null}
          <Doc
            tree={read.entry.tree}
            profile="docs"
            headingShift={2}
            productName={brand.productName}
            {...drawn}
            components={{
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
        </>
      )}
    </Panel>
  );
}

function NewDialog({
  kind,
  root,
  link,
  list,
  onClose,
  onMade,
}: {
  kind: "page" | "app" | undefined;
  root: string;
  link: string;
  list: DocsList;
  onClose: () => void;
  onMade: () => void;
}) {
  const [title, setTitle] = useState("");
  const [where, setWhere] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Starts where the reader is most likely to want it: under the first app's folder.
  // biome-ignore lint/correctness/useExhaustiveDependencies: set afresh each time the dialog opens.
  useEffect(() => {
    setTitle("");
    setError(undefined);
    setWhere(kind === "page" ? `${list.apps[0]?.docs ?? ""}/` : "");
    setFolder("");
  }, [kind]);

  const taken = (path: string) => list.pages.some((page) => page.path === path);
  const problem =
    kind === "page"
      ? !PATH.test(where)
        ? "A path is lowercase letters, digits, hyphens and underscores, in folders: handbook/support/refunds."
        : taken(where)
          ? "There is a page at that path already."
          : !appFor(list.apps, where)
            ? `No docs app serves that folder. A page goes under one of: ${list.apps.map((app) => `${app.docs}/`).join(", ")}.`
            : undefined
      : kind === "app"
        ? !PATH.test(where)
          ? "The app's address is lowercase letters, digits and hyphens: handbook."
          : !PATH.test(folder)
            ? "The folder its pages go in is written the same way: handbook."
            : list.apps.some(
                  (app) =>
                    app.docs === folder ||
                    app.docs.startsWith(`${folder}/`) ||
                    folder.startsWith(`${app.docs}/`),
                )
              ? "Another docs app already serves that folder, or one inside it."
              : undefined
        : undefined;

  return (
    <Dialog
      open={kind !== undefined}
      onClose={onClose}
      title={kind === "app" ? "New docs app" : "New page"}
      description={
        kind === "app"
          ? "A site made of the pages in one folder. It starts with a home page. Nobody outside sees it until you deploy it and say who may open it."
          : "A page starts as a draft. Nobody reads it until it is deployed."
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (problem || title.trim() === "") return;
          setBusy(true);
          setError(undefined);
          const named = title.trim();
          try {
            if (kind === "app") {
              await api.put(`${root}/drafts/${folder}/index`, {
                kind: "doc",
                schemaVersion: 1,
                title: named,
                body: { source: `---\ntitle: ${JSON.stringify(named)}\n---\n\nStart here.\n` },
              });
              await api.put(`${root}/drafts/${where}`, {
                kind: "app",
                schemaVersion: 1,
                body: { title: named, docs: folder },
              });
              onMade();
              onClose();
              navigate(`${link}/docs/edit/${folder}/index`);
            } else {
              onClose();
              navigate(
                `${link}/docs/new?at=${encodeURIComponent(where)}&title=${encodeURIComponent(named)}`,
              );
            }
          } catch (caught) {
            setError(failureText(caught));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Title"
          name="title"
          value={title}
          required
          maxLength={120}
          onChange={setTitle}
        />
        {kind === "app" ? (
          <>
            <TextField
              label="Address"
              name="path"
              value={where}
              required
              hint="The last part of the site's address: handbook."
              onChange={(next) => {
                setWhere(next);
                // The folder follows the address until it is given a name of its own.
                if (folder === "" || folder === where) setFolder(next);
              }}
            />
            <TextField
              label="Folder of pages"
              name="folder"
              value={folder}
              required
              hint="Every page whose path is under this folder is a page of the site."
              onChange={setFolder}
            />
          </>
        ) : (
          <TextField
            label="Path"
            name="path"
            value={where}
            required
            hint="Its folders are its place in the site: the first is its collection, the second its group."
            onChange={setWhere}
          />
        )}
        {(where !== "" && problem) || error ? (
          <Notice tone="danger">{error ?? problem}</Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || problem !== undefined || title.trim() === ""}
          >
            {kind === "app" ? "Make it" : "Write it"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
