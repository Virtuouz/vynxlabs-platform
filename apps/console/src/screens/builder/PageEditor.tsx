import {
  MAX_PAGE_WIDGETS,
  MAX_WIDGET_HEIGHT,
  newWidget,
  PAGE_COLUMNS,
  type Page,
  type PageFilter,
  type PageWidget,
} from "@volvel/manifest";
import { Button, EmptyState } from "@volvel/ui";
import type { Surface, WidgetDefinition } from "@volvel/widgets";
import { Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { notify } from "../../ask.tsx";
import { useCatalog } from "../../kit/inspector/catalog.ts";
import { Inspector } from "../../kit/inspector/Inspector.tsx";
import {
  bindFilter,
  defaultInputs,
  duplicated,
  mainTable,
  newId,
  settleOnGrid,
  withoutWidget,
} from "../../kit/inspector/model.ts";
import { AddFormDialog } from "./AddFormDialog.tsx";
import { AddToPage } from "./AddToPage.tsx";
import { type PageSource, pageClient } from "./client.ts";
import { EditorShell } from "./EditorShell.tsx";
import { type FilterChange, PageFilterSettings } from "./PageFilters.tsx";
import { PageSettings } from "./PageSettings.tsx";
import { MODAL_WIDTH, SHEET_WIDTH } from "./pageKinds.ts";
import { RowClickOffer } from "./RowClickOffer.tsx";
import {
  type Edit,
  type FormPlan,
  formEdit,
  manyOf,
  type PageContext,
  pageTable,
  suggestionEdit,
  suggestionsFor,
} from "./records.ts";
import { definitionOf, views } from "./registry.ts";
import { type Box, type CarryRequest, type FilterValues, PageView, placed } from "./renderer.ts";
import { SampleBar, useSampleRecords, useTableInfo } from "./SampleRecord.tsx";

/** What the editor changes: a page's widgets and its filters. Everything else about a page or a dashboard is its host's. */
export interface PageValue {
  widgets: PageWidget[];
  filters: PageFilter[];
  /** Pages this change also makes: the detail a click opens, the modal a button opens. Added with it, as one step. */
  addPages?: Page[];
}

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
  onRemovePage: (() => void) | undefined;
}

/**
 * The one editor of a page of widgets, in an app's builder and in a dashboard
 * (S9): "On this page" and "Add to page" on the left, the page drawn from the
 * workspace's rows in the middle, with its filters under it, and the chosen
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
  onChange,
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
  const [adding, setAdding] = useState(false);
  const [forming, setForming] = useState(false);
  const sample = useSampleRecords(root, pageInfo?.page, catalog, pageInfo?.record);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  // A host passes a new `source` object on every render; what it names is what matters.
  const named = JSON.stringify(source);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `named` is `source` as one value
  const client = useMemo(
    () => pageClient(root, source, draft, sample.record),
    [root, draft, named, sample.record],
  );
  const { widgets, filters } = value;
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

  const put = (next: PageWidget[], label: string, key?: string) =>
    onChange({ widgets: next, filters }, label, key);

  /** A change that also touches filters and pages (a detail, a form, a next step): one step to Undo. */
  const apply = (edit: Edit, label: string) => {
    onChange({ widgets: edit.widgets, filters: edit.filters, addPages: edit.addPages }, label);
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
      suggestionEdit(context, found, suggestedInfo, catalog),
      `adding ${found.label.toLowerCase()}`,
    );
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
    const id = newId(definition.type, widgets);
    let added: PageWidget = newWidget(definition, id, widgets);
    if (at) added = { ...added, at };
    added = {
      ...added,
      ...(Object.keys(definition.data).length > 0
        ? { data: defaultInputs(definition, mainTable(widgets, catalog), catalog) }
        : {}),
    };
    if (added.data && Object.keys(added.data).length === 0) delete added.data;
    for (const filter of filters) added = bindFilter(added, filter, catalog, widgets);
    const next = at ? placed([...widgets, added], id, at) : [...widgets, added];
    put(next, `adding ${definition.title.toLowerCase()}`);
    onSelect(id);
    setAdding(false);
    setTold(
      at
        ? `${definition.title} is added at column ${at.x + 1}, row ${at.y + 1}.`
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

  const remove = (id: string) => {
    const gone = widgets.find((one) => one.id === id);
    const name = gone?.title ? `“${gone.title}”` : "the widget";
    put(withoutWidget(widgets, id), `removing ${name}`);
    onSelect(undefined);
    notify.success(`Removed ${name}.`, { action: { label: "Undo", onClick: shell.history.undo } });
  };

  const duplicate = (id: string) => {
    const copy = duplicated(widgets, id);
    if (!copy) return;
    put(copy.widgets, "duplicating a widget");
    onSelect(copy.id);
  };

  const filtersChanged = (next: FilterChange, label: string, key?: string) =>
    onChange({ widgets: next.widgets, filters: next.filters }, label, key);

  const outline = (
    <>
      {pages}
      <section aria-labelledby="on-the-page" className="flex flex-col gap-1">
        <h2 id="on-the-page" className="m-0 text-label text-ink-subtle uppercase">
          On this page
        </h2>
        {widgets.length === 0 ? (
          <p className="m-0 text-body-sm text-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {[...widgets]
              .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
              .map((one) => (
                <li key={one.id}>
                  <button
                    type="button"
                    aria-current={one.id === selected ? "true" : undefined}
                    onClick={() => onSelect(one.id)}
                    className={`w-full truncate rounded-inner px-2 py-1 text-left text-body-sm ${
                      one.id === selected ? "bg-selected text-action" : "text-ink hover:bg-sunken"
                    }`}
                  >
                    {one.title || definitionOf(one.type)?.title || one.id}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
      <div>
        <Button
          size="small"
          variant="primary"
          disabled={full}
          tooltip={full ? `A page holds at most ${MAX_PAGE_WIDGETS} widgets.` : undefined}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden="true" size={14} /> Add to page
        </Button>
      </div>
    </>
  );

  // A side sheet is drawn at a sheet's width, a modal at a modal's, never wider than the screen size chosen.
  const kind = pageInfo?.page.kind;
  const kindWidth = kind === "sheet" ? SHEET_WIDTH : kind === "modal" ? MODAL_WIDTH : undefined;
  const width =
    kindWidth !== undefined ? Math.min(kindWidth, frame?.width ?? kindWidth) : frame?.width;
  const acts = widgets.some(
    (one) =>
      (one.on && Object.keys(one.on).length > 0) ||
      (Array.isArray(one.config?.rowActions) && one.config.rowActions.length > 0) ||
      (Array.isArray(one.config?.actions) && one.config.actions.length > 0) ||
      one.config?.submit !== undefined,
  );
  // What the renderer is told beyond the data (phase 26): the page's record, and what its steps open.
  const opens = pageInfo
    ? {
        pages: pageInfo.pages,
        onNavigate: pageInfo.onOpen,
        ...(sample.record ? { record: sample.record } : {}),
      }
    : {};
  const canvas = (
    <>
      {canvasHead}
      {pageInfo ? (
        <SampleBar page={pageInfo.page} sample={sample} onChoose={pageInfo.onRecord} />
      ) : null}
      {acts && pageInfo ? (
        <p className="m-0 mb-3 text-body-sm text-ink-muted">
          Actions run for real in this workspace: a button that changes a record changes it here.
        </p>
      ) : null}
      <div
        data-preview={frame?.name}
        data-page-kind={kind ?? "page"}
        className={
          frame || kindWidth
            ? "mx-auto overflow-x-auto rounded-panel border border-line bg-canvas p-3 transition-[max-width] motion-slow"
            : ""
        }
        style={width ? { maxWidth: `${width}px` } : undefined}
      >
        {widgets.length === 0 ? (
          <EmptyState
            title="Nothing on this page yet"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" size={16} /> Add to page
              </Button>
            }
          >
            Add a table, a chart or a number. What you see is drawn from this workspace's rows, as
            you may read them.
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
              onChange: (next, label) => put(next, label),
              onRename: (id, title) =>
                put(
                  widgets.map((one) => (one.id === id ? { ...one, title } : one)),
                  "renaming a widget",
                  `title:${id}`,
                ),
              onColumn: (id) => onSelect(id),
              carrying,
            }}
          />
        )}
      </div>
      <PageFilterSettings
        filters={filters}
        widgets={widgets}
        catalog={catalog}
        onChange={filtersChanged}
      />
    </>
  );

  return (
    <>
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
                <RowClickOffer root={root} widget={widget} context={context} onApply={apply} />
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
                onDuplicate={() => duplicate(widget.id)}
                onRemove={() => remove(widget.id)}
                rowRules={(table) => `${link}/tables/${table}?view=definition`}
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
        onAdd={(definition) => {
          // A form is made from a table: it asks what it should do first.
          if (definition.type === "core/form" && pageInfo) {
            setAdding(false);
            setForming(true);
          } else add(definition);
        }}
        {...(widgets.length > 0 ? { onCarry: carry } : {})}
        {...(suggested && nextSteps.length > 0
          ? { suggestions: { table: manyOf(suggested), items: nextSteps, onPick: pickNext } }
          : {})}
      />
      {pageInfo ? (
        <AddFormDialog
          open={forming}
          onClose={() => setForming(false)}
          root={root}
          catalog={catalog}
          initialTable={suggested}
          onMake={makeForm}
        />
      ) : null}
      <span role="status" className="sr-only">
        {told}
      </span>
    </>
  );
}
