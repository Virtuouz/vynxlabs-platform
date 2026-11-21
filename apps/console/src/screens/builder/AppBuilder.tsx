import type { InterfaceBody } from "@volvel/manifest";
import { heading } from "@volvel/screens";
import { Button, Notice, TextField } from "@volvel/ui";
import { Monitor, Plus, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../../api.ts";
import { ask, failureText, notify, takenText } from "../../ask.tsx";
import { useHistory } from "../../kit/history.ts";
import { Loading } from "../../kit/LoadState.tsx";
import { type DraftAnswer, type Listed, slug } from "./data.ts";
import { PageEditor } from "./PageEditor.tsx";
import { PublishDialog } from "./PublishDialog.tsx";

/** The sizes the preview can be drawn at. */
export const VIEWPORTS = {
  desktop: { label: "Desktop", width: undefined, icon: Monitor },
  tablet: { label: "Tablet", width: 768, icon: Tablet },
  phone: { label: "Phone", width: 390, icon: Smartphone },
} as const;

// ----- The builder -----

export type { Saving } from "./EditorShell.tsx";

import type { Saving } from "./EditorShell.tsx";

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
  const [reviewing, setReviewing] = useState(false);
  const revision = useRef<number | undefined>(undefined);
  const latest = useRef<InterfaceBody | undefined>(undefined);
  latest.current = body;
  // Every change is a step that can be undone: the app as it was before it.
  const history = useHistory<InterfaceBody | undefined>(
    () => latest.current,
    (back) => {
      if (!back) return;
      dirty.current = true;
      setBody(back);
    },
  );
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
  // ⌘S saves at once.
  const hurried = useRef(false);
  const [hurry, setHurry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `hurry` only starts the save now
  useEffect(() => {
    if (!body || !dirty.current) return;
    setSaving("waiting");
    const wait = hurried.current ? 0 : 700;
    hurried.current = false;
    const timer = setTimeout(() => {
      dirty.current = false;
      void save(body);
    }, wait);
    return () => clearTimeout(timer);
  }, [body, save, hurry]);
  const saveNow = () => {
    hurried.current = true;
    setHurry((count) => count + 1);
  };

  const change = (apply: (draft: InterfaceBody) => void, label = "a change", key?: string) => {
    if (latest.current) history.record(label, key);
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
      setReviewing(false);
      notify.success("Published. People who open the app now see this.", {
        ...(url ? { link: { label: "Open the app", href: url } } : {}),
      });
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

  const shell = {
    title: body.title || "Untitled app",
    saving,
    savedWords: hasChanges ? "Saved. Not published yet." : "Published.",
    history,
    saveNow,
    more: url ? (
      <a href={url} target="_blank" rel="noreferrer" className="text-body-sm text-action">
        Open the app
      </a>
    ) : null,
    primary: (
      <Button
        variant="primary"
        disabled={problems.length > 0 || typeof saving === "object"}
        onClick={async () => {
          dirty.current = false;
          if (await save(body)) setReviewing(true);
        }}
      >
        Publish
      </Button>
    ),
    after: (
      <div className="w-80 max-w-full">
        <TextField
          label="Name of the app"
          name="app-title"
          value={body.title}
          maxLength={200}
          required
          onChange={(title) =>
            change(
              (draft) => {
                if (title) draft.title = title;
              },
              "renaming the app",
              "title",
            )
          }
        />
      </div>
    ),
    notices: (
      <>
        {appPath === null && list.data ? (
          <Notice
            tone="attention"
            action={
              <Button
                onClick={async () => {
                  let made = false;
                  const address = await ask.prompt({
                    title: "Make an app for it",
                    text: "The app's address ends with this. Lower-case letters, digits and dashes.",
                    label: "Address",
                    initial: slug(body.title),
                    action: "Make the app",
                    submit: async (value) => {
                      try {
                        await api.put(`${root}/drafts/${slug(value)}`, {
                          kind: "app",
                          schemaVersion: 1,
                          body: { title: body.title, interface: path },
                          create: true,
                        });
                        made = true;
                        return undefined;
                      } catch (error) {
                        return takenText(error) ?? failureText(error);
                      }
                    },
                  });
                  if (!address || !made) return;
                  list.reload();
                  drafts.reload();
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
      </>
    ),
  };

  return (
    <>
      {page ? (
        <PageEditor
          root={root}
          interfacePath={path}
          page={page}
          selected={selected}
          onSelect={setSelected}
          shell={shell}
          pages={
            <section aria-labelledby="pages" className="flex flex-col gap-1">
              <h2 id="pages" className="m-0 text-label text-ink-subtle uppercase">
                Pages
              </h2>
              <div className="flex flex-wrap gap-1 lg:flex-col">
                {body.pages.map((one) => (
                  <Button
                    key={one.id}
                    size="small"
                    className="lg:justify-start"
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
                    size="small"
                    variant="quiet"
                    className="lg:justify-start"
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
                      }, "adding a page");
                    }}
                  >
                    <Plus size={14} aria-hidden="true" /> Page
                  </Button>
                ) : null}
                {page ? (
                  <>
                    <Button
                      size="small"
                      variant="quiet"
                      className="lg:justify-start"
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
                        }, "renaming the page");
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="small"
                      variant="quiet"
                      className="lg:justify-start"
                      onClick={async () => {
                        const topic = await ask.prompt({
                          title: `Help for the page ${page.title}`,
                          label: "Topic",
                          hint: "The topic: of a page of your documentation. Whoever uses the app, and may open that documentation, gets a Help button that shows the page. Leave it empty for no help.",
                          initial: page.help ?? "",
                          action: "Save",
                          required: false,
                        });
                        if (topic === null) return;
                        const named = topic.trim();
                        if (named !== "" && !/^[a-z0-9][a-z0-9_-]*$/.test(named)) {
                          notify.error(
                            new Error(
                              "A topic is lowercase letters, digits, hyphens and underscores, as it is written in the page's frontmatter.",
                            ),
                          );
                          return;
                        }
                        change((draft) => {
                          const target = draft.pages.find((one) => one.id === page.id);
                          if (!target) return;
                          if (named === "") delete target.help;
                          else target.help = named;
                        }, "setting the page's help");
                      }}
                    >
                      {page.help ? "Help: on" : "Help"}
                    </Button>
                    {body.pages.length > 1 ? (
                      <Button
                        size="small"
                        variant="quiet"
                        className="lg:justify-start"
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
                          }, "removing a page");
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
            </section>
          }
          onChange={(apply, label, key) =>
            change(
              (draft) => {
                const target = draft.pages.find((one) => one.id === page.id);
                if (target) apply(target);
              },
              label,
              key,
            )
          }
        />
      ) : null}
      <PublishDialog
        open={reviewing}
        onClose={() => setReviewing(false)}
        root={root}
        path={path}
        appPath={appPath}
        body={body}
        publishing={publishing}
        onPublish={() => void publish()}
      />
    </>
  );
}

// ----- The list -----

/** The builder by its former name, for the routes and tests that use it. */
export const InterfaceBuilder = AppBuilder;
