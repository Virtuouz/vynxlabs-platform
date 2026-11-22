import { type InterfaceBody, MAX_PAGES } from "@volvel/manifest";
import { Button, Notice } from "@volvel/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, useLoad } from "../../api.ts";
import { ask, failureText, notify, takenText } from "../../ask.tsx";
import { ago } from "../../kit/format.ts";
import { useHistory } from "../../kit/history.ts";
import { heading } from "../../kit/inspector/model.ts";
import {
  DeviceSwitch,
  DraftPill,
  FixPill,
  PreviewButton,
  PublishSplit,
  VIEW_AS_ME,
  VIEWPORTS,
  type ViewAs,
  ViewAsMenu,
} from "./BuilderHeader.tsx";
import { BuilderSkeleton } from "./BuilderSkeleton.tsx";
import { draftChangeCount } from "./changes.ts";
import { DraftHistory } from "./DraftHistory.tsx";
import { type DraftAnswer, type Listed, slug } from "./data.ts";
import { useGroupKeys } from "./groupKeys.ts";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { runsActions } from "./outline.ts";
import { PageEditor } from "./PageEditor.tsx";
import { PagesList } from "./PagesList.tsx";
import { PublishCheck } from "./PublishCheck.tsx";
import { canAddPage, inMenu, movedPage } from "./pageKinds.ts";
import { problemWords } from "./publishCheck.ts";
import { ReadOnlyLine, useReadOnly } from "./ReadOnly.tsx";
import { syncSheetActions } from "./sheetActions.ts";
import type { Start, Started } from "./starters.ts";

export { VIEWPORTS };

// ----- The builder -----

export type { Saving } from "./EditorShell.tsx";

import type { Saving } from "./EditorShell.tsx";

/** Builds one interface: a preview drawn from live rows, and the settings of what is chosen. */
export function AppBuilder({
  root,
  link,
  path,
}: {
  root: string;
  /** The workspace's console address. The breadcrumb leads back to the list now. */
  link: string;
  path: string;
}) {
  const [body, setBody] = useState<InterfaceBody>();
  const [missing, setMissing] = useState<string>();
  // The page being edited is kept in the address (`?page=`), so that a reload opens the same one.
  const [pageId, setPageId] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("page") ?? undefined,
  );
  const [selected, setSelected] = useState<string>();
  /** The page's own settings are showing in the inspector (a page was chosen, not a widget). */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The record each page that opens on one is drawn with while building, by page. */
  const [samples, setSamples] = useState<Record<string, string>>({});
  /** The pages a side sheet or a modal was opened from, so closing goes back. */
  const [trail, setTrail] = useState<string[]>([]);
  const [viewport, setViewport] = useState<keyof typeof VIEWPORTS>("desktop");
  /**
   * Who the page is looked at as: the maker ("Me") or one of the app's groups. The header records
   * the choice and shows it; what is drawn for a group follows from `viewAs`.
   */
  const [viewAs, setViewAs] = useState<ViewAs>(VIEW_AS_ME);
  /** Counted up when a save is kept, so the preview reads the draft as it now is. */
  const [kept, setKept] = useState(0);
  const [saving, setSaving] = useState<Saving>("saved");
  const [problems, setProblems] = useState<{ path: string; message: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
  /** "+ Page" is asking what to start from. */
  const [addingPage, setAddingPage] = useState(false);
  /** "A list of Invoices" asked for on an empty page: that page is what the start becomes. */
  const [starting, setStarting] = useState<{ start: Start; table: string; page: string }>();
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
  const apps = useLoad<{ items: { path: string; url: string; preview?: string }[] }>(
    `${root}/apps`,
  );
  /** What people see now: what the draft's changes are counted against. Not there until it is published. */
  const deployed = useLoad<{ body: InterfaceBody }>(`${root}/interfaces/${path}`);
  const { groups } = useGroupKeys(root);
  /** Someone who may not edit here reads the app as it is published; nothing is changed, saved or published. */
  const { known, readOnly, why } = useReadOnly(root);
  /** The screen sizes whose hand-made layout the builder has agreed to write, until the page is left. */
  const agreed = useRef(new Set<string>());
  const [restoring, setRestoring] = useState(false);

  // What is saved and not deployed, or else what is deployed. Someone who may not edit reads what
  // is deployed (the draft only when nothing is deployed yet). The deployed page is read once, by
  // `deployed`, and this takes it from there.
  const [noDraft, setNoDraft] = useState(false);
  useEffect(() => {
    if (!known || readOnly) return;
    let current = true;
    api.get<DraftAnswer>(`${root}/drafts/${path}`).then(
      (draft) => {
        if (!current) return;
        revision.current = draft.revision;
        setProblems(draft.problems ?? []);
        setBody(draft.body);
      },
      () => current && setNoDraft(true),
    );
    return () => {
      current = false;
    };
  }, [root, path, known, readOnly]);
  useEffect(() => {
    if (!known || body || !(readOnly || noDraft)) return;
    if (deployed.data) {
      setBody(deployed.data.body);
    } else if (deployed.error) {
      if (!readOnly) {
        setMissing(deployed.error.message);
        return;
      }
      let current = true;
      api.get<DraftAnswer>(`${root}/drafts/${path}`).then(
        (draft) => current && setBody(draft.body),
        (error: ApiError) => current && setMissing(error.message),
      );
      return () => {
        current = false;
      };
    }
  }, [known, body, readOnly, noDraft, deployed.data, deployed.error, root, path]);

  const save = useCallback(
    async (next: InterfaceBody) => {
      if (readOnly) return false;
      setSaving("saving");
      try {
        const saved = await api.put<DraftAnswer>(`${root}/drafts/${path}`, {
          kind: "interface",
          schemaVersion: 2,
          body: next,
          ...(revision.current !== undefined ? { revision: revision.current } : {}),
        });
        revision.current = saved.revision;
        setProblems(saved.problems ?? []);
        setSaving("saved");
        setKept((count) => count + 1);
        return true;
      } catch (error) {
        setSaving({ failed: failureText(error) });
        return false;
      }
    },
    [root, path, readOnly],
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
    if (readOnly) return;
    if (latest.current) history.record(label, key);
    setBody((before) => {
      if (!before) return before;
      const next = structuredClone(before);
      apply(next);
      dirty.current = true;
      return next;
    });
  };

  const ids = body?.pages.map((one) => one.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ids` stands for the pages
  useEffect(() => {
    const first = body?.pages[0]?.id;
    if (!first) return;
    const here = body?.pages.some((one) => one.id === pageId) ? pageId : first;
    const url = new URL(window.location.href);
    if (here === first) url.searchParams.delete("page");
    else url.searchParams.set("page", here as string);
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, "", url);
  }, [pageId, ids]);

  if (missing) return <Notice tone="danger">{missing}</Notice>;
  if (!body || !known) return <BuilderSkeleton />;
  const page = body.pages.find((candidate) => candidate.id === pageId) ?? body.pages[0];
  const listed = list.data?.items.find((item) => item.path === path);
  const appPath = listed?.app ?? null;
  const pending = new Set(drafts.data?.items.map((draft) => draft.path));
  const changes =
    deployed.data === undefined && !deployed.error
      ? undefined
      : draftChangeCount(deployed.data?.body, body);
  // A draft that says what is published already is not a change: "Published." until it differs.
  const hasChanges =
    saving !== "saved" ||
    (appPath !== null && pending.has(appPath)) ||
    (pending.has(path) && (changes === undefined || changes > 0));
  const served = apps.data?.items.find((app) => app.path === appPath);
  const url = served?.url;
  const acts = runsActions(page?.widgets ?? []);
  /** Writes the draft only when there is something unsaved: looking at the check changes nothing. */
  const settle = async () => {
    if (!dirty.current && saving === "saved") return true;
    dirty.current = false;
    return save(body);
  };
  /** The draft, drawn as the app will be used, in a new tab: what is unsaved is saved first. */
  const openPreview = async () => {
    // Opened now, in the click, so a pop-up blocker lets it through; pointed at the preview once the draft is saved.
    const tab = window.open("", "_blank");
    if (!(await settle())) {
      tab?.close();
      return;
    }
    // The page being edited, when it is one the app's menu has; the others open on a record.
    const editing = page && inMenu(page) && page.id !== body.pages[0]?.id ? `/${page.id}` : "";
    const address = `${link}/screens/${path}/preview${editing}`;
    if (tab) tab.location.href = address;
    else window.open(address, "_blank");
  };
  const review = async () => {
    if (await settle()) {
      deployed.reload();
      setReviewing(true);
    }
  };
  /** Dragging on the phone or tablet preview writes that screen's own layout: asked once, then it is the builder's choice. */
  const askLayout = async (device: "tablet" | "phone") => {
    if (agreed.current.has(device)) return true;
    const sure = await ask.confirm({
      title: `Change the ${device} layout by hand?`,
      text: `The ${device} layout is made from the desktop one. Moving a widget here gives it a place of its own on the ${device}, and it stops following the desktop. "Go back to automatic" in its Layout undoes that.`,
      action: `Change the ${device} layout`,
    });
    if (sure) agreed.current.add(device);
    return sure;
  };
  /** An earlier draft becomes the current one: one step, which Undo takes back. */
  const restoreDraft = (earlier: InterfaceBody, savedAt: string) => {
    change((draft) => {
      for (const key of Object.keys(draft) as (keyof InterfaceBody)[]) delete draft[key];
      Object.assign(draft, structuredClone(earlier));
    }, "restoring an earlier draft");
    setRestoring(false);
    setPageId(undefined);
    setSelected(undefined);
    notify.success(`Restored the draft saved ${ago(savedAt)}.`, {
      action: { label: "Undo", onClick: history.undo },
    });
  };
  const publish = async () => {
    setPublishing(true);
    try {
      if (!(await settle())) return;
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
      // One truth: what is deployed is read again, and the drafts waiting, before "Published." is said, so the header never reads both.
      await Promise.all([deployed.reload(), drafts.reload()]);
      // An app published for the first time is not in the list read when the builder opened: its address is read now.
      const address =
        url ??
        (await api.get<{ items: { path: string; url: string }[] }>(`${root}/apps`).then(
          (now) => now.items.find((one) => one.path === appPath)?.url,
          () => undefined,
        ));
      notify.success("Published. People who open the app now see this.", {
        ...(address ? { link: { label: "Open the app", href: address } } : {}),
      });
      void list.reload();
      void apps.reload();
    } catch (error) {
      // Someone who may edit but not deploy here is told so, in plain words, and the draft stays.
      if (error instanceof ApiError && error.status === 403) {
        notify.error(
          "You can change this app but not publish it here. Ask someone who may deploy to this workspace: your draft is kept.",
        );
      } else notify.error(error);
    } finally {
      setPublishing(false);
    }
  };

  const choosePage = (id: string) => {
    setPageId(id);
    setSelected(undefined);
    setSettingsOpen(true);
  };
  /** A page made by "+ Page", with the sheet and the modal it needs: one step, which Undo takes back whole. */
  const addPage = (started: Started) => {
    const empty = starting?.page;
    change((draft) => {
      // Started on an empty page: that page is the start's first, not left behind empty.
      const was = empty ? draft.pages.findIndex((one) => one.id === empty) : -1;
      if (was >= 0 && draft.pages[was]?.widgets.length === 0 && draft.pages.length > 1) {
        draft.pages.splice(was, 1);
      } else if (was >= 0 && draft.pages[was]?.widgets.length === 0) {
        draft.pages.length = 0;
      }
      for (const added of started.pages) {
        if (draft.pages.length < MAX_PAGES && !draft.pages.some((one) => one.id === added.id)) {
          draft.pages.push(added);
        }
      }
    }, "adding a page");
    setAddingPage(false);
    setStarting(undefined);
    setPageId(started.open);
    setSelected(undefined);
    if (started.told)
      notify.success(started.told, { action: { label: "Undo", onClick: history.undo } });
  };
  const removePage = async () => {
    if (!page) return;
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
    setSettingsOpen(false);
  };
  /**
   * A step of the preview that opens a page or closes one: the builder shows that page, on
   * the record the step passed. Closing goes back to the page that opened it.
   */
  const openPage = (
    to: { page: string; record?: string; as: "page" | "sheet" | "modal" } | { close: true },
  ) => {
    if ("close" in to) {
      const back = trail.at(-1);
      setTrail((before) => before.slice(0, -1));
      if (back) setPageId(back);
      setSelected(undefined);
      return;
    }
    if (!body.pages.some((one) => one.id === to.page)) return;
    if (page && to.as !== "page") setTrail((before) => [...before, page.id]);
    else setTrail([]);
    if (to.record) setSamples((before) => ({ ...before, [to.page]: to.record as string }));
    setPageId(to.page);
    setSelected(undefined);
  };

  /** Where a problem is, in the words of the page: its page and widget. */
  const shell = {
    bleed: true,
    title: body.title || "Untitled app",
    saving,
    savedWords: hasChanges ? "Saved. Not published yet." : "Published.",
    history,
    saveNow,
    onRename: readOnly
      ? undefined
      : (title: string) =>
          change(
            (draft) => {
              draft.title = title;
            },
            "renaming the app",
            "title",
          ),
    // Beside the name whenever something is waiting; with the count once it is known. Nothing waiting is quiet words ("Published.").
    pill: readOnly ? null : (
      <span className="inline-flex items-center gap-1.5">
        {changes || (changes === undefined && hasChanges) ? (
          <span className="max-md:hidden">
            <DraftPill count={changes} onOpen={() => void review()} />
          </span>
        ) : null}
        <FixPill words={problems.map((problem) => `${problemWords(problem, body)}.`)} />
      </span>
    ),
    tools: (
      <>
        <DeviceSwitch value={viewport} onChange={setViewport} />
        <ViewAsMenu value={viewAs} groups={groups} onChange={setViewAs} />
      </>
    ),
    more: readOnly ? null : (
      <PreviewButton
        onOpen={() => void openPreview()}
        note="Opens the draft as people will use it, in a new tab. Actions change this workspace's rows."
      />
    ),
    primary: readOnly ? (
      url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center rounded-control border border-line-control px-3 text-body-sm text-ink no-underline hover:bg-sunken"
        >
          Open the app
        </a>
      ) : null
    ) : (
      <PublishSplit
        disabled={problems.length > 0 || typeof saving === "object"}
        onPublish={() => void review()}
        openHref={url}
        restore={() => setRestoring(true)}
        check={{
          open: reviewing,
          onOpenChange: setReviewing,
          content: (
            <PublishCheck
              root={root}
              path={path}
              appPath={appPath}
              drafted={[...pending]}
              body={body}
              deployed={deployed.data ? deployed.data.body : deployed.error ? null : undefined}
              problems={problems}
              publishing={publishing}
              onPublish={() => void publish()}
              onGo={(at) => {
                setPageId(at.page);
                setSelected(at.widget);
                setReviewing(false);
              }}
              onTry={(group) => {
                setViewAs({ as: "group", group: group.key, name: group.name });
                setReviewing(false);
              }}
            />
          ),
        }}
      />
    ),
    notices: (
      <>
        {readOnly ? <ReadOnlyLine what="Apps" why={why} /> : null}
        {!readOnly && appPath === null && list.data ? (
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
      </>
    ),
  };

  return (
    <>
      {page ? (
        <PageEditor
          root={root}
          link={link}
          surface="app"
          source={{ of: "interface", path, page: page.id }}
          draft={!readOnly}
          readOnly={readOnly}
          value={{ widgets: page.widgets }}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
            if (id) setSettingsOpen(false);
          }}
          shell={shell}
          refreshKey={kept}
          frame={{ name: viewport, width: VIEWPORTS[viewport].width }}
          layout={{
            viewAs: viewAs.as === "group" ? { key: viewAs.group, name: viewAs.name } : undefined,
            askLayout,
          }}
          pageInfo={{
            page,
            pages: body.pages,
            record: samples[page.id],
            onRecord: (id) => setSamples((before) => ({ ...before, [page.id]: id })),
            onStart: (start, table) => {
              setStarting({ start, table, page: page.id });
              setAddingPage(true);
            },
            onOpen: openPage,
            settingsOpen,
            onCloseSettings: () => setSettingsOpen(false),
            onPage: (next, label, key) =>
              change(
                (draft) => {
                  const at = draft.pages.findIndex((one) => one.id === page.id);
                  if (at >= 0) draft.pages[at] = next;
                },
                label,
                key,
              ),
            onSetPage: (next, label) =>
              change((draft) => {
                const at = draft.pages.findIndex((one) => one.id === next.id);
                if (at >= 0) draft.pages[at] = next;
              }, label),
            onRemovePage: !readOnly && body.pages.length > 1 ? removePage : undefined,
          }}
          pages={
            <PagesList
              pages={body.pages}
              current={page.id}
              onChoose={choosePage}
              onAdd={!readOnly && canAddPage(body.pages) ? () => setAddingPage(true) : undefined}
              {...(readOnly
                ? {}
                : {
                    onReorder: (ids: string[]) =>
                      change((draft) => {
                        const by = new Map(draft.pages.map((one) => [one.id, one]));
                        draft.pages = ids.flatMap((id) => {
                          const one = by.get(id);
                          return one ? [one] : [];
                        });
                      }, "moving a page"),
                    onMove: (id: string, by: -1 | 1) =>
                      change((draft) => {
                        draft.pages = movedPage(draft.pages, id, by);
                      }, "moving a page"),
                  })}
            />
          }
          onChange={(next, label, key) =>
            change(
              (draft) => {
                const target = draft.pages.find((one) => one.id === page.id);
                if (!target) return;
                const before = target.widgets;
                target.widgets = next.widgets;
                // What the change also made: the sheet a click opens, the modal a button opens.
                for (const added of next.addPages ?? []) {
                  if (
                    draft.pages.length < MAX_PAGES &&
                    !draft.pages.some((one) => one.id === added.id)
                  ) {
                    draft.pages.push(added);
                  }
                }
                // A table's row actions are also its sheet's toolbar: kept in step here, once.
                syncSheetActions(draft.pages, page.id, before);
              },
              label,
              key,
            )
          }
        />
      ) : null}
      <NewPageDialog
        open={addingPage}
        onClose={() => {
          setAddingPage(false);
          setStarting(undefined);
        }}
        preset={starting}
        root={root}
        pages={body.pages}
        onMake={addPage}
      />
      <DraftHistory
        open={restoring}
        onClose={() => setRestoring(false)}
        root={root}
        path={path}
        current={body}
        onRestore={restoreDraft}
      />
    </>
  );
}

// ----- The list -----

/** The builder by its former name, for the routes and tests that use it. */
export const InterfaceBuilder = AppBuilder;
