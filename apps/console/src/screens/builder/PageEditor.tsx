import { MAX_PAGE_WIDGETS, newWidget, type PageFilter, type PageWidget } from "@volvel/manifest";
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
import { AddToPage } from "./AddToPage.tsx";
import { type PageSource, pageClient } from "./client.ts";
import { EditorShell } from "./EditorShell.tsx";
import { type FilterChange, PageFilterSettings } from "./PageFilters.tsx";
import { definitionOf, views } from "./registry.ts";
import { type FilterValues, PageView } from "./stand-in.tsx";

/** What the editor changes: a page's widgets and its filters. Everything else about a page or a dashboard is its host's. */
export interface PageValue {
  widgets: PageWidget[];
  filters: PageFilter[];
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
}) {
  const { catalog } = useCatalog(root);
  const [adding, setAdding] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  // A host passes a new `source` object on every render; what it names is what matters.
  const named = JSON.stringify(source);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `named` is `source` as one value
  const client = useMemo(() => pageClient(root, source, draft), [root, draft, named]);
  const { widgets, filters } = value;
  const widget = widgets.find((one) => one.id === selected);
  const full = widgets.length >= MAX_PAGE_WIDGETS;

  const put = (next: PageWidget[], label: string, key?: string) =>
    onChange({ widgets: next, filters }, label, key);

  /** A widget changed in the inspector; if its place changed, what it now lies on moves out of its way. */
  const edit = (changed: PageWidget, label: string, key?: string) => {
    const before = widgets.find((one) => one.id === changed.id);
    const next = widgets.map((one) => (one.id === changed.id ? changed : one));
    const moved = before && JSON.stringify(before.at) !== JSON.stringify(changed.at);
    put(moved ? settleOnGrid(next, changed.id) : next, label, key);
  };

  const add = (definition: WidgetDefinition) => {
    const id = newId(definition.type, widgets);
    let added: PageWidget = newWidget(definition, id, widgets);
    added = {
      ...added,
      ...(Object.keys(definition.data).length > 0
        ? { data: defaultInputs(definition, mainTable(widgets, catalog), catalog) }
        : {}),
    };
    if (added.data && Object.keys(added.data).length === 0) delete added.data;
    for (const filter of filters) added = bindFilter(added, filter, catalog);
    put([...widgets, added], `adding ${definition.title.toLowerCase()}`);
    onSelect(id);
    setAdding(false);
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

  const canvas = (
    <>
      {canvasHead}
      <div
        data-preview={frame?.name}
        className={
          frame
            ? "mx-auto overflow-x-auto rounded-panel border border-line bg-canvas p-3 transition-[max-width] motion-slow"
            : ""
        }
        style={frame?.width ? { maxWidth: `${frame.width}px` } : undefined}
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
        inspectorOpen={widget !== undefined}
        onCloseInspector={() => onSelect(undefined)}
        inspector={
          widget ? (
            <Inspector
              key={widget.id}
              widget={widget}
              definition={definitionOf(widget.type)}
              surface={surface}
              filters={filters}
              catalog={catalog}
              onChange={edit}
              onDuplicate={() => duplicate(widget.id)}
              onRemove={() => remove(widget.id)}
              rowRules={(table) => `${link}/tables/${table}?view=definition`}
            />
          ) : (
            <p className="m-0 text-ink-muted">
              Choose a widget on the page to change it, or add one. What you see is drawn from this
              workspace's rows, as you may read them.
            </p>
          )
        }
      />
      <AddToPage open={adding} onClose={() => setAdding(false)} surface={surface} onAdd={add} />
    </>
  );
}
