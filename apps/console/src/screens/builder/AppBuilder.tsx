import type { InterfaceBody } from "@vynxlabs/manifest";
import { heading } from "@vynxlabs/screens";
import { Button, Notice, TextField } from "@vynxlabs/ui";
import { Monitor, Plus, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../../api.ts";
import { ask, failureText, notify } from "../../ask.tsx";
import { Loading } from "../../kit/LoadState.tsx";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { type DraftAnswer, type Listed, slug } from "./data.ts";
import { PageEditor } from "./PageEditor.tsx";

/** The sizes the preview can be drawn at. */
export const VIEWPORTS = {
  desktop: { label: "Desktop", width: undefined, icon: Monitor },
  tablet: { label: "Tablet", width: 768, icon: Tablet },
  phone: { label: "Phone", width: 390, icon: Smartphone },
} as const;

// ----- The builder -----

export type Saving = "saved" | "waiting" | "saving" | { failed: string };

/** Builds one interface: a preview drawn from live rows, and the settings of what is chosen. */
export function AppBuilder({
  root,
  path,
}: {
  root: string;
  /** The workspace's console address. The breadcrumb leads back to the list now. */
  link?: string;
  path: string;
}) {
  const [body, setBody] = useState<InterfaceBody>();
  const [missing, setMissing] = useState<string>();
  const [pageId, setPageId] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [saving, setSaving] = useState<Saving>("saved");
  const [problems, setProblems] = useState<{ path: string; message: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
  const revision = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const list = useLoad<{ items: Listed[] }>(`${root}/interfaces`);
  const drafts = useLoad<{ items: { path: string }[] }>(`${root}/drafts`);
  const apps = useLoad<{ items: { path: string; url: string }[] }>(`${root}/apps`);

  // What is saved and not deployed, or else what is deployed.
  useEffect(() => {
    let current = true;
    api.get<DraftAnswer>(`${root}/drafts/${path}`).then(
      (draft) => {
        if (!current) return;
        revision.current = draft.revision;
        setBody(draft.body);
      },
      () =>
        api.get<{ interface: InterfaceBody }>(`${root}/interfaces/${path}`).then(
          (view) => current && setBody(view.interface),
          (error: ApiError) => current && setMissing(error.message),
        ),
    );
    return () => {
      current = false;
    };
  }, [root, path]);

  const save = useCallback(
    async (next: InterfaceBody) => {
      setSaving("saving");
      try {
        const saved = await api.put<DraftAnswer>(`${root}/drafts/${path}`, {
          kind: "interface",
          schemaVersion: 1,
          body: next,
          ...(revision.current !== undefined ? { revision: revision.current } : {}),
        });
        revision.current = saved.revision;
        setProblems(saved.problems ?? []);
        setSaving("saved");
        return true;
      } catch (error) {
        setSaving({ failed: failureText(error) });
        return false;
      }
    },
    [root, path],
  );
  // A change is saved a moment after the last one, so that typing does not save every letter.
  useEffect(() => {
    if (!body || !dirty.current) return;
    setSaving("waiting");
    const timer = setTimeout(() => {
      dirty.current = false;
      void save(body);
    }, 700);
    return () => clearTimeout(timer);
  }, [body, save]);

  const change = (apply: (draft: InterfaceBody) => void) => {
    setBody((before) => {
      if (!before) return before;
      const next = structuredClone(before);
      apply(next);
      dirty.current = true;
      return next;
    });
  };

  if (missing) return <Notice tone="danger">{missing}</Notice>;
  if (!body) return <Loading />;
  const page = body.pages.find((candidate) => candidate.id === pageId) ?? body.pages[0];
  const listed = list.data?.items.find((item) => item.path === path);
  const appPath = listed?.app ?? null;
  const pending = new Set(drafts.data?.items.map((draft) => draft.path));
  const hasChanges =
    pending.has(path) || (appPath !== null && pending.has(appPath)) || saving !== "saved";
  const url = apps.data?.items.find((app) => app.path === appPath)?.url;
  const publish = async () => {
    setPublishing(true);
    try {
      dirty.current = false;
      if (!(await save(body))) return;
      const fresh = await api.get<{ items: { path: string }[] }>(`${root}/drafts`);
      const waiting = new Set(fresh.items.map((draft) => draft.path));
      const paths = [path, ...(appPath ? [appPath] : [])].filter((one) => waiting.has(one));
      if (paths.length === 0) {
        notify.success("Nothing has changed since it was last published.");
        return;
      }
      await api.post(`${root}/changes/deploy`, { paths, message: `Publish ${body.title}` });
      revision.current = undefined;
      notify.success("Published. People who open the app now see this.");
      list.reload();
      drafts.reload();
      apps.reload();
    } catch (error) {
      notify.error(error);
    } finally {
      setPublishing(false);
    }
  };

  /** Where a problem is, in the words of the page: its page and widget. */
  const where = (problemPath: string) => {
    const match = /^\/body\/pages\/(\d+)(?:\/widgets\/(\d+))?/.exec(problemPath);
    const at = match ? body.pages[Number(match[1])] : undefined;
    const on = at && match?.[2] !== undefined ? at.widgets[Number(match[2])] : undefined;
    return [at?.title, on ? on.title || heading(on.id) : undefined].filter(Boolean).join(" › ");
  };

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        compact
        title={body.title || "Untitled app"}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-ink-muted" role="status">
              {saving === "saved"
                ? hasChanges
                  ? "Saved. Not published yet."
                  : "Published."
                : saving === "saving" || saving === "waiting"
                  ? "Saving…"
                  : `Not saved: ${saving.failed}`}
            </span>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="text-action">
                Open the app
              </a>
            ) : null}
            <Button
              variant="primary"
              disabled={publishing || problems.length > 0 || typeof saving === "object"}
              onClick={publish}
            >
              Publish
            </Button>
          </span>
        }
        after={
          <div className="w-80 max-w-full">
            <TextField
              label="Name of the app"
              name="app-title"
              value={body.title}
              maxLength={200}
              required
              onChange={(title) =>
                change((draft) => {
                  if (title) draft.title = title;
                })
              }
            />
          </div>
        }
      />
      {appPath === null && list.data ? (
        <Notice
          tone="attention"
          action={
            <Button
              onClick={async () => {
                const address = await ask.prompt({
                  title: "Make an app for it",
                  text: "The app's address ends with this. Lower-case letters, digits and dashes.",
                  label: "Address",
                  initial: slug(body.title),
                  action: "Make the app",
                });
                if (!address) return;
                try {
                  await api.put(`${root}/drafts/${slug(address)}`, {
                    kind: "app",
                    schemaVersion: 1,
                    body: { title: body.title, interface: path },
                  });
                  list.reload();
                  drafts.reload();
                } catch (error) {
                  notify.error(error);
                }
              }}
            >
              Make an app for it
            </Button>
          }
        >
          No app serves this yet, so nobody can open it.
        </Notice>
      ) : null}
      {problems.length > 0 ? (
        <Notice tone="attention">
          <strong>To fix before it can be published:</strong>
          <ul className="mt-1 mb-0 pl-5">
            {problems.map((problem) => (
              <li key={`${problem.path} ${problem.message}`}>
                {where(problem.path)}: {problem.message}.
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-line border-b pb-2">
        {body.pages.map((one) => (
          <Button
            key={one.id}
            variant={one.id === page?.id ? "primary" : "quiet"}
            aria-pressed={one.id === page?.id}
            onClick={() => {
              setPageId(one.id);
              setSelected(undefined);
            }}
          >
            {one.title}
          </Button>
        ))}
        {body.pages.length < 20 ? (
          <Button
            onClick={async () => {
              const title = await ask.prompt({
                title: "Add a page",
                label: "Name of the page",
                action: "Add the page",
              });
              if (!title) return;
              change((draft) => {
                let id = slug(title).replace(/^[^a-z]+/, "") || "page";
                for (let count = 2; draft.pages.some((one) => one.id === id); count += 1) {
                  id = `${slug(title) || "page"}-${count}`;
                }
                draft.pages.push({ id, title, widgets: [] });
                setPageId(id);
                setSelected(undefined);
              });
            }}
          >
            <Plus size={14} aria-hidden="true" /> Page
          </Button>
        ) : null}
        {page ? (
          <>
            <Button
              variant="quiet"
              onClick={async () => {
                const title = await ask.prompt({
                  title: "Rename the page",
                  label: "Name of the page",
                  initial: page.title,
                  action: "Rename",
                });
                if (!title) return;
                change((draft) => {
                  const target = draft.pages.find((one) => one.id === page.id);
                  if (target) target.title = title;
                });
              }}
            >
              Rename
            </Button>
            {body.pages.length > 1 ? (
              <Button
                variant="quiet"
                onClick={async () => {
                  const sure = await ask.confirm({
                    title: `Remove the page ${page.title}?`,
                    text: "Its widgets go with it. Nothing in any table is touched.",
                    action: "Remove the page",
                    danger: true,
                  });
                  if (!sure) return;
                  change((draft) => {
                    draft.pages = draft.pages.filter((one) => one.id !== page.id);
                  });
                  setPageId(undefined);
                  setSelected(undefined);
                }}
              >
                Remove page
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {page ? (
        <PageEditor
          root={root}
          interfacePath={path}
          page={page}
          selected={selected}
          onSelect={setSelected}
          onChange={(apply) =>
            change((draft) => {
              const target = draft.pages.find((one) => one.id === page.id);
              if (target) apply(target);
            })
          }
        />
      ) : null}
    </section>
  );
}

// ----- The list -----

/** The builder by its former name, for the routes and tests that use it. */
export const InterfaceBuilder = AppBuilder;
