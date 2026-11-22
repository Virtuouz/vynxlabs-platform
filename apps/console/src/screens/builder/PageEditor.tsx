import {
  FILTER_WIDGET,
  filtersOf,
  MAX_PAGE_WIDGETS,
  MAX_WIDGET_HEIGHT,
  newWidget,
  PAGE_COLUMNS,
  type Page,
  type PageWidget,
} from "@volvel/manifest";
import { GRID } from "@volvel/screens";
import { Button, EmptyState, Kbd } from "@volvel/ui";
import type { Surface, WidgetDefinition } from "@volvel/widgets";
import { Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { notify } from "../../ask.tsx";
import { useActionLists, useCatalog } from "../../kit/inspector/catalog.ts";
import { Inspector } from "../../kit/inspector/Inspector.tsx";
import {
  bindFilter,
  bindHolderFilters,
  defaultInputs,
  insertFilterWidget,
  mainTable,
  settleOnGrid,
  unbindDeclared,
} from "../../kit/inspector/model.ts";
import { useShortcut } from "../../kit/keys.ts";
import { EditOnPage } from "../../kit/markdown/onThePage.ts";
import { AddFormDialog } from "./AddFormDialog.tsx";
import { AddToPage } from "./AddToPage.tsx";
import { ButtonOffers } from "./ButtonOffers.tsx";
import { type PageSource, pageClient } from "./client.ts";
import {
  duplicateWidget,
  fitContainers,
  holds,
  moveInto,
  nameOf,
  nextId,
  placedAtBottom,
  placesFor,
  removalWords,
  removeTab,
  removeWidget,
  resolved,
  targetOfSelection,
  targetWords,
  withoutOrphans,
} from "./containers.ts";
import { EditorShell } from "./EditorShell.tsx";
import { GroupButtonsDialog } from "./GroupButtonsDialog.tsx";
import { Outline } from "./Outline.tsx";
import { PageSettings } from "./PageSettings.tsx";
import { SIZE_NAMES, SIZE_WIDTH, sizeOf, snapSize, withSize } from "./pageKinds.ts";
import "../../kit/inspector/widgets/registerTables.tsx";
import { requestColumn } from "../../kit/inspector/widgets/columnRequest.ts";
import { RowClickOffer } from "./RowClickOffer.tsx";
import { choiceOf, openedPage } from "./RowClickEditor.tsx";
import { SheetPreviewHost } from "./SheetPreview.tsx";
import {
  type Edit,
  type FormPlan,
  formEdit,
  manyOf,
  type PageContext,
  pageTable,
  suggestionsFor,
} from "./records.ts";
import { definitionOf, views } from "./registry.ts";
import { type Box, type CarryRequest, type FilterValues, PageView, placed } from "./renderer.ts";
import { SampleBar, useSampleRecords, useTableInfo } from "./SampleRecord.tsx";
import { SizeHandle } from "./SizeHandle.tsx";
import { detailActionsEdit, groupCandidates, groupEdit, suggestedEdit } from "./suggest.ts";
import { TextOnPage } from "./TextOnPage.tsx";

/**
 * What the editor changes: a page's widgets. Its filters are those of its Search and filter
 * widgets (`filtersOf`). Everything else about a page or a dashboard is its host's.
 */
export interface PageValue {
  widgets: PageWidget[];
  /** Pages this change also makes: the detail a click opens, the modal a button opens. Added with it, as one step. */
  addPages?: Page[];
}

/**
 * The page grid's columns, faintly, behind the widgets: twelve columns of equal width with `GRID.gap`
 * between them, over the grid's own box (the frame's padding is outside it).
 */
const GUIDES = {
  backgroundImage: `repeating-linear-gradient(to right, color-mix(in srgb, var(--color-action) 8%, transparent) 0, color-mix(in srgb, var(--color-action) 8%, transparent) calc((100% - ${(GRID.columns - 1) * GRID.gap}px) / ${GRID.columns}), transparent calc((100% - ${(GRID.columns - 1) * GRID.gap}px) / ${GRID.columns}), transparent calc((100% + ${GRID.gap}px) / ${GRID.columns}))`,
} as const;

/** What a page of an app is, to the editor: its kind and record, the app's other pages, and what is changed about the page itself. */
export interface PageInfo {
  page: Page;
  pages: Page[];
  /** The record a page opened on one is drawn with, if one was chosen. */
  record: string | undefined;
  onRecord: (id: string) => void;
  /** An `open` or `close` step in the preview: the builder shows that page. */
  onOpen: (
    to: { page: string; record?: string; as: "page" | "sheet" | "modal" } | { close: true },
  ) => void;
  /** The page's own settings are showing (narrow screens show them as a sheet). */
  settingsOpen: boolean;
  onCloseSettings: () => void;
  onPage: (next: Page, label: string, key?: string) => void;
  /** Another page of the app is changed, found by its id: the detail a row opens, made another kind. */
  onSetPage?: (next: Page, label: string) => void;
  onRemovePage: (() => void) | undefined;
}

/**
 * The one editor of a page of widgets, in an app's builder and in a dashboard
 * (S9): "On this page" and "Add to page" on the left, the page drawn from the
 * workspace's rows in the middle, and the chosen
 * widget's settings on the right, generated from its definition.
 *
 * It is controlled: it is given the page and says what it should become. Its
 * host keeps what is about the host (an app's pages and publishing, a
 * dashboard's sharing and refresh), saves, and keeps undo (`shell.history`).
 */
export function PageEditor({
  root,
  link,
  surface,
  source,
  draft = false,
  value,
  onChange: hostChange,
  selected,
  onSelect,
  shell,
  pages,
  canvasHead,
  frame,
  refreshKey,
  pageInfo,
}: {
  root: string;
  /** The workspace's console address, for the links the settings give to other screens. */
  link: string;
  surface: Surface;
  /** What the page's data is read for. */
  source: PageSource;
  /** Read the page as it is being built, not as it is published. */
  draft?: boolean;
  value: PageValue;
  /** Every change goes through here, with words for Undo; `key` joins quick changes into one step. */
  onChange: (next: PageValue, label: string, key?: string) => void;
  selected: string | undefined;
  onSelect: (widget: string | undefined) => void;
  /** The toolbar and its notices, as the host around the page has them. */
  shell: Omit<
    Parameters<typeof EditorShell>[0],
    "outline" | "canvas" | "inspector" | "inspectorOpen" | "onCloseInspector"
  >;
  /** An app's pages, above what is on this one. */
  pages?: ReactNode;
  /** Above the page: for an app, the screen sizes it can be previewed at. */
  canvasHead?: ReactNode;
  /** The preview's width, when it is not the whole room. `name` marks which. */
  frame?: { name: string; width: number | undefined };
  /** Bumped by the host after a save, so each widget reads the page as it now is. */
  refreshKey?: number;
  /** For an app's page: its kind, its record and the app's pages. Left out for a dashboard. */
  pageInfo?: PageInfo;
}) {
  const { catalog } = useCatalog(root);
  // Every change leaves each container as tall as what it holds (phase 27).
  const onChange: typeof hostChange = (next, label, key) =>
    hostChange({ ...next, widgets: fitContainers(next.widgets) }, label, key);
  const [adding, setAdding] = useState(false);
  const [forming, setForming] = useState(false);
  /** The button whose "Group with other buttons…" is open. */
  // The button asked about, and what it may be grouped with, as they were when asked: the
  // grouping removes them, and the dialog still leaves as a dialog does.
  const [grouping, setGrouping] = useState<{
    id: string;
    open: boolean;
    asked: number;
    button: PageWidget;
    others: PageWidget[];
  }>();
  const sample = useSampleRecords(root, pageInfo?.page, catalog, pageInfo?.record);
  const lists = useActionLists(root);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  // A host passes a new `source` object on every render; what it names is what matters.
  const named = JSON.stringify(source);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `named` is `source` as one value
  const client = useMemo(
    () => pageClient(root, source, draft, sample.record),
    [root, draft, named, sample.record],
  );
  const { widgets } = value;
  const filters = filtersOf(widgets);
  const context: PageContext = {
    widgets,
    filters,
    pages: pageInfo?.pages ?? [],
    page: pageInfo?.page ?? { id: "", title: "", widgets },
  };
  const suggested = pageInfo ? pageTable(context, mainTable(widgets, catalog)) : undefined;
  const suggestedInfo = useTableInfo(root, suggested);
  const nextSteps = suggestionsFor(context, suggestedInfo);
  const widget = widgets.find((one) => one.id === selected);
  const full = widgets.length >= MAX_PAGE_WIDGETS;
  // "Add to page" adds into the container that is chosen (or that holds the widget that is).
  const addsTo = resolved(widgets, targetOfSelection(widgets, selected));

  // A opens "Add to page" when focus is not in a field (`useShortcut` leaves single keys to the page).
  useShortcut("add.widget", () => setAdding(true), { enabled: !full && !adding });

  const put = (next: PageWidget[], label: string, key?: string) =>
    onChange({ widgets: next }, label, key);
  // A Text widget being written where it is on the canvas ("Edit on the page").
  const [writing, setWriting] = useState<string>();
  const writingWidget = widgets.find((one) => one.id === writing && one.type === "core/text");

  /** A change that also touches filters and pages (a detail, a form, a next step): one step to Undo. */
  const apply = (edit: Edit, label: string) => {
    onChange({ widgets: edit.widgets, addPages: edit.addPages }, label);
    if (edit.select) onSelect(edit.select);
    setAdding(false);
    setForming(false);
    setTold(edit.told);
  };
  const makeForm = (plan: FormPlan) => apply(formEdit(context, plan), "adding a form");
  const pickNext = (key: string) => {
    if (key === "form") {
      setAdding(false);
      setForming(true);
      return;
    }
    const found = nextSteps.find((one) => one.key === key);
    if (!found || found.key === "form" || !suggestedInfo) return;
    apply(
      suggestedEdit(context, found, suggestedInfo, catalog),
      `adding ${found.label.toLowerCase()}`,
    );
  };

  /** Buttons made one group, or a detail's moved out to one: said in a toast that can be undone. */
  const regroup = (edit: Edit, label: string) => {
    apply(edit, label);
    notify.success(edit.told, { action: { label: "Undo", onClick: shell.history.undo } });
  };

  /** A widget changed in the inspector; if its place changed, what it now lies on moves out of its way. */
  const edit = (changed: PageWidget, label: string, key?: string) => {
    const before = widgets.find((one) => one.id === changed.id);
    const next = widgets.map((one) => (one.id === changed.id ? changed : one));
    const moved = before && JSON.stringify(before.at) !== JSON.stringify(changed.at);
    put(moved ? settleOnGrid(next, changed.id) : next, label, key);
  };

  /** Adds a widget: at the end of the page, or where it was carried to (`at`). */
  const add = (definition: WidgetDefinition, at?: Box) => {
    // A Search and filter goes at the top, where the reader looks for it, with what follows it bound.
    if (definition.role === "filters" && !at) {
      const made = insertFilterWidget(widgets, definition, undefined, catalog);
      put(made.widgets, `adding ${definition.title.toLowerCase()}`);
      onSelect(made.id);
      setAdding(false);
      setTold(`${definition.title} is added at the top of the page.`);
      return;
    }
    const id = nextId(definition.type, widgets);
    let added: PageWidget = newWidget(definition, id, widgets);
    // Into the container that is chosen (or its child's), at the bottom of its grid; else at the end of the page.
    // A Section or Tabs is never put in one: it goes on the page, whatever is chosen.
    const into = at || definition.role === "container" ? undefined : addsTo;
    if (at) added = { ...added, at };
    else added = placedAtBottom(widgets, added, into);
    added = {
      ...added,
      ...(Object.keys(definition.data).length > 0
        ? { data: defaultInputs(definition, mainTable(widgets, catalog), catalog) }
        : {}),
    };
    if (added.data && Object.keys(added.data).length === 0) delete added.data;
    for (const filter of filters) added = bindFilter(added, filter, catalog, widgets);
    let next = at ? placed([...widgets, added], id, at) : [...widgets, added];
    if (definition.role === "filters") {
      next = bindHolderFilters(next, filtersOf([added]), catalog);
    }
    put(next, `adding ${definition.title.toLowerCase()}`);
    onSelect(id);
    setAdding(false);
    setTold(
      at
        ? `${definition.title} is added at column ${at.x + 1}, row ${at.y + 1}.`
        : into
          ? `${definition.title} is added to ${targetWords(widgets, into)}.`
          : `${definition.title} is added at the end of the page.`,
    );
  };

  // A widget dragged out of "Add to page" is carried by the canvas until it is let go.
  const [carrying, setCarrying] = useState<CarryRequest>();
  const [told, setTold] = useState("");
  const carry = (definition: WidgetDefinition, from: { x: number; y: number }) => {
    setAdding(false);
    setCarrying({
      card: {
        title: definition.title,
        kind: definition.description,
        size: definition.layout.default,
        limits: {
          min: definition.layout.min,
          max: definition.layout.max ?? { w: PAGE_COLUMNS, h: MAX_WIDGET_HEIGHT },
        },
      },
      from,
      onDrop: (at) => {
        setCarrying(undefined);
        if (at) add(definition, at);
        else setTold(`${definition.title} was not added.`);
      },
    });
  };

  /** A widget removed, a container with all it holds: one step to Undo, and the toast says what went. */
  const remove = (id: string) => {
    const gone = removeWidget(widgets, id);
    if (gone.removed.length === 0) return;
    const words = removalWords(gone.removed);
    // What a removed Search and filter declared is no longer followed by anything.
    const next = gone.removed.reduce((list, one) => unbindDeclared(list, one), gone.widgets);
    put(next, `removing ${words}`);
    onSelect(undefined);
    notify.success(`Removed ${words}.`, { action: { label: "Undo", onClick: shell.history.undo } });
  };

  /** A widget copied just under itself; a container with all it holds. */
  const duplicate = (id: string) => {
    const copy = duplicateWidget(widgets, id);
    if (copy.id === undefined) {
      setTold(copy.reason);
      return;
    }
    put(
      copy.widgets,
      copy.count > 1
        ? `duplicating ${nameOf(widgets.find((one) => one.id === id) as PageWidget)} and the ${copy.count - 1 === 1 ? "widget" : `${copy.count - 1} widgets`} in it`
        : "duplicating a widget",
    );
    onSelect(copy.id);
  };

  /** ⋯ › Move to: the widget put in a Section, a tab, or back on the page. It stays chosen. */
  const move = (id: string, key: string) => {
    const place = placesFor(widgets, id).find((one) => one.key === key);
    const one = widgets.find((other) => other.id === id);
    if (!place || !one) return;
    const result = moveInto(widgets, id, place.target);
    if (!result.moved) {
      setTold(result.reason ?? "It could not be moved.");
      return;
    }
    put(result.widgets, `moving ${nameOf(one)} to ${place.label}`);
    onSelect(id);
    setTold(`${nameOf(one)} is moved to ${place.label}.`);
  };

  /**
   * A change the canvas made (a drag, a resize, a rename, its own Delete key). A container it
   * removed takes what it held, which is said, and can be undone.
   */
  const fromCanvas = (next: PageWidget[], label: string) => {
    // A Search and filter the canvas removed takes its filters' bindings with it.
    const kept0 = widgets
      .filter((one) => !next.some((other) => other.id === one.id))
      .reduce((list, gone) => unbindDeclared(list, gone), next);
    const { widgets: kept, orphans } = withoutOrphans(kept0);
    if (orphans.length === 0) return put(kept0, label);
    const ids = new Set(next.map((one) => one.id));
    const container = widgets.find((one) => !ids.has(one.id) && one.id === orphans[0]?.in?.widget);
    const words = removalWords(container ? [container, ...orphans] : orphans);
    put(kept, `removing ${words}`);
    onSelect(undefined);
    notify.success(`Removed ${words}.`, { action: { label: "Undo", onClick: shell.history.undo } });
  };

  const outline = (
    <>
      {pages}
      <section aria-labelledby="on-the-page" className="flex min-h-0 flex-col gap-1">
        <h2 id="on-the-page" className="m-0 px-1 text-label text-ink-subtle uppercase">
          On this page
        </h2>
        {widgets.length === 0 ? (
          <p className="m-0 px-1 text-body-sm text-ink-muted">Nothing yet.</p>
        ) : (
          <Outline
            widgets={widgets}
            selected={selected}
            onSelect={onSelect}
            onReorder={(next, label) => put(next, label)}
            onSaid={setTold}
          />
        )}
      </section>
      <Button
        variant="quiet"
        disabled={full}
        aria-label="Add to page"
        aria-keyshortcuts="A"
        tooltip={full ? `A page holds at most ${MAX_PAGE_WIDGETS} widgets.` : undefined}
        className="w-full justify-center border border-action bg-action-soft"
        onClick={() => setAdding(true)}
      >
        <Plus aria-hidden="true" size={14} /> Add to page <Kbd>A</Kbd>
      </Button>
      <p className="m-0 hidden px-1 text-meta text-ink-muted lg:block">
        Drag in the outline or on the page to reorder. Alt with the arrow keys moves the chosen
        widget in the outline.
      </p>
    </>
  );

  // A side sheet is drawn at a sheet's width, a modal at a modal's, never wider than the screen size chosen.
  const kind = pageInfo?.page.kind;
  const overlay = pageInfo !== undefined && (kind === "sheet" || kind === "modal");
  const size = pageInfo ? sizeOf(pageInfo.page) : "medium";
  // While it is dragged the frame follows the pointer; it is written when it is let go.
  const [dragged, setDragged] = useState<number>();
  const kindWidth = overlay ? SIZE_WIDTH[size] : undefined;
  const width =
    dragged !== undefined
      ? dragged
      : kindWidth !== undefined
        ? Math.min(kindWidth, frame?.width ?? kindWidth)
        : frame?.width;
  // What the renderer is told beyond the data (phase 26): the page's record, and what its steps open.
  const opens = pageInfo
    ? {
        pages: pageInfo.pages,
        onNavigate: pageInfo.onOpen,
        ...(sample.record ? { record: sample.record } : {}),
      }
    : {};
  // A table whose click opens a side sheet shows that sheet over the canvas while it is chosen (board 3).
  const [previewHidden, setPreviewHidden] = useState<ReadonlySet<string>>(new Set());
  const rowSheetPage =
    widget && pageInfo && choiceOf(widget, pageInfo.pages) === "detail"
      ? openedPage(widget, pageInfo.pages)
      : undefined;
  const rowSheet =
    widget && rowSheetPage && rowSheetPage.kind === "sheet" && rowSheetPage.id !== pageInfo?.page.id
      ? { id: widget.id, page: rowSheetPage }
      : undefined;
  const canvas = (
    <>
      {canvasHead}
      {pageInfo ? (
        <SampleBar page={pageInfo.page} sample={sample} onChoose={pageInfo.onRecord} />
      ) : null}
      <div
        className={overlay ? "relative mx-auto" : "relative"}
        style={overlay && width ? { maxWidth: `${width}px` } : undefined}
      >
        <div
          data-preview={frame?.name}
          data-page-kind={kind ?? "page"}
          data-page-size={overlay ? size : undefined}
          className={`mx-auto overflow-x-auto rounded-panel border border-line bg-canvas p-3 ${dragged === undefined ? "transition-[max-width] motion-slow" : ""}`}
          style={width && !overlay ? { maxWidth: `${width}px` } : undefined}
        >
          {/* The twelve column guides, drawn behind the widgets while building: GRID's columns and gap. */}
          <div data-column-guides="" style={GUIDES}>
            {widgets.length === 0 ? (
              <EmptyState
                title="Nothing on this page yet"
                action={
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    <Plus aria-hidden="true" size={16} /> Add to page
                  </Button>
                }
              >
                Add a table, a chart or a number. What you see is drawn from this workspace's rows,
                as you may read them.
              </EmptyState>
            ) : (
              <PageView
                widgets={widgets}
                filters={filters}
                registry={views}
                client={client}
                filterValues={filterValues}
                onFilterValues={setFilterValues}
                {...(refreshKey !== undefined ? { refreshKey } : {})}
                {...opens}
                editing={{
                  selected,
                  onSelect,
                  onChange: fromCanvas,
                  onRename: (id, title) =>
                    put(
                      widgets.map((one) => (one.id === id ? { ...one, title } : one)),
                      "renaming a widget",
                      `title:${id}`,
                    ),
                  onColumn: (id, column) => {
                    onSelect(id);
                    requestColumn(id, column);
                  },
                  onEditText: (id) => {
                    onSelect(id);
                    setWriting(id);
                  },
                  carrying,
                }}
              />
            )}
          </div>
        </div>
        {rowSheet && pageInfo && !previewHidden.has(rowSheet.id) ? (
          <SheetPreviewHost
            key={rowSheet.page.id}
            root={root}
            source={source}
            page={rowSheet.page}
            pages={pageInfo.pages}
            catalog={catalog}
            onEditLayout={() => pageInfo.onOpen({ page: rowSheet.page.id, as: "page" })}
            onClose={() => setPreviewHidden((before) => new Set(before).add(rowSheet.id))}
          />
        ) : null}
        {overlay && pageInfo ? (
          <SizeHandle
            size={size}
            onDrag={setDragged}
            onSize={(next, key) =>
              pageInfo.onPage(
                withSize(pageInfo.page, next),
                `making ${pageInfo.page.title} ${SIZE_NAMES[next].toLowerCase()}`,
                key,
              )
            }
            snap={snapSize}
          />
        ) : null}
      </div>
    </>
  );

  return (
    <EditOnPage.Provider value={(id) => setWriting(id)}>
      <EditorShell
        {...shell}
        outline={outline}
        canvas={canvas}
        inspectorOpen={widget !== undefined || pageInfo?.settingsOpen === true}
        onCloseInspector={() => {
          onSelect(undefined);
          pageInfo?.onCloseSettings();
        }}
        inspector={
          widget ? (
            <>
              {pageInfo ? (
                <RowClickOffer
                  root={root}
                  widget={widget}
                  context={context}
                  onApply={apply}
                  {...(pageInfo.onSetPage ? { onSetPage: pageInfo.onSetPage } : {})}
                  onEditLayout={(opened) => pageInfo.onOpen({ page: opened.id, as: "page" })}
                />
              ) : null}
              {pageInfo ? (
                <ButtonOffers
                  widget={widget}
                  widgets={widgets}
                  onGroup={() =>
                    setGrouping((before) => ({
                      id: widget.id,
                      open: true,
                      asked: (before?.asked ?? 0) + 1,
                      button: widget,
                      others: groupCandidates(widgets, widget),
                    }))
                  }
                  onMove={() =>
                    regroup(
                      detailActionsEdit(context, widget.id),
                      "moving buttons to an action group",
                    )
                  }
                />
              ) : null}
              <Inspector
                key={widget.id}
                widget={widget}
                definition={definitionOf(widget.type)}
                surface={surface}
                filters={filters}
                neighbours={widgets.filter((one) => one.id !== widget.id)}
                catalog={catalog}
                onChange={edit}
                widgets={widgets}
                onChangeWidgets={put}
                onUndo={shell.history.undo}
                onRemoveTab={(tab, fate) => {
                  const done = removeTab(
                    widgets,
                    widget.id,
                    tab,
                    "move" in fate ? fate.move : null,
                  );
                  if (done.what === "refused") return setTold(done.words);
                  put(done.widgets, done.words.replace(/\.$/, "").toLowerCase());
                  notify.success(done.words, {
                    action: { label: "Undo", onClick: shell.history.undo },
                  });
                }}
                {...(definitionOf(FILTER_WIDGET)
                  ? { onAddFilters: () => add(definitionOf(FILTER_WIDGET) as WidgetDefinition) }
                  : {})}
                onDuplicate={() => duplicate(widget.id)}
                onRemove={() => remove(widget.id)}
                places={placesFor(widgets, widget.id)}
                onMove={(key) => move(widget.id, key)}
                holds={holds(widgets, widget)}
                rowRules={(table) => `${link}/tables/${table}?view=definition`}
                // What an action may touch and open: this page's kind and record, the app's pages,
                // and the workspace's flows, scripts and groups.
                {...(pageInfo ? { page: pageInfo.page, pages: pageInfo.pages } : {})}
                flows={lists.flows}
                scripts={lists.scripts}
                groups={lists.groups}
              />
            </>
          ) : pageInfo ? (
            <PageSettings
              key={pageInfo.page.id}
              page={pageInfo.page}
              catalog={catalog}
              mostReadTable={mainTable(widgets, catalog)}
              onChange={pageInfo.onPage}
              onRemove={() => pageInfo.onRemovePage?.()}
              canRemove={pageInfo.onRemovePage !== undefined}
            />
          ) : (
            <p className="m-0 text-ink-muted">
              Choose a widget on the page to change it, or add one. What you see is drawn from this
              workspace's rows, as you may read them.
            </p>
          )
        }
      />
      <AddToPage
        open={adding}
        onClose={() => setAdding(false)}
        surface={surface}
        target={addsTo ? targetWords(widgets, addsTo) : undefined}
        catalog={catalog}
        startTable={suggested}
        onAdd={(definition) => {
          // A form is made from a table: it asks what it should do first.
          if (definition.type === "core/form" && pageInfo) {
            setAdding(false);
            setForming(true);
          } else add(definition);
        }}
        {...(widgets.length > 0 ? { onCarry: carry } : {})}
        {...(suggested && nextSteps.length > 0
          ? {
              suggestions: {
                table: manyOf(suggested),
                items: nextSteps.map(({ key, label, hint }) => ({ key, label, hint })),
                onPick: pickNext,
              },
            }
          : {})}
      />
      {pageInfo && grouping ? (
        <GroupButtonsDialog
          key={grouping.asked}
          open={grouping.open}
          onClose={() => setGrouping({ ...grouping, open: false })}
          button={grouping.button}
          others={grouping.others}
          onGroup={(ids) => {
            setGrouping({ ...grouping, open: false });
            regroup(groupEdit(context, ids), "grouping buttons");
          }}
        />
      ) : null}
      {pageInfo ? (
        <AddFormDialog
          open={forming}
          onClose={() => setForming(false)}
          root={root}
          catalog={catalog}
          initialTable={suggested}
          takenTitles={(pageInfo?.pages ?? []).map((one) => one.title)}
          onMake={makeForm}
        />
      ) : null}
      {writingWidget ? (
        <TextOnPage
          key={writingWidget.id}
          widget={writingWidget.id}
          title={nameOf(writingWidget)}
          text={typeof writingWidget.config?.text === "string" ? writingWidget.config.text : ""}
          onCancel={() => setWriting(undefined)}
          onDone={(text) => {
            setWriting(undefined);
            if (text === (writingWidget.config?.text ?? "")) return;
            put(
              widgets.map((one) =>
                one.id === writingWidget.id ? { ...one, config: { ...one.config, text } } : one,
              ),
              `writing ${nameOf(writingWidget)}`,
            );
          }}
        />
      ) : null}
      <span role="status" className="sr-only">
        {told}
      </span>
    </EditOnPage.Provider>
  );
}
