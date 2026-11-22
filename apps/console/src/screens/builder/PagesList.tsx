import type { Page } from "@volvel/manifest";
import { Button, LIFTED, MoveButtons, useSortable } from "@volvel/ui";
import type { LucideIcon } from "lucide-react";
import { AppWindow, File, FileText, GripVertical, PanelRight, Plus } from "lucide-react";
import type { PageKind } from "./contract.ts";
import { KIND_NAMES, kindOf } from "./pageKinds.ts";

/** What each kind of page looks like in the list: a page, a record page, a side sheet, a modal. */
const KIND_ICONS: Record<PageKind, LucideIcon> = {
  page: File,
  record: FileText,
  sheet: PanelRight,
  modal: AppWindow,
};

/**
 * "PAGES" (board 1): the app's pages, a "+" in the heading that adds one, and each page one row,
 * its kind's icon, its title and its kind at the right. Choosing one shows it in the builder and
 * its own settings in the inspector. A page can be moved earlier or later (the order of the app's
 * menu): the arrows are there when the row is pointed at or has focus.
 */
export function PagesList({
  pages,
  current,
  onChoose,
  onAdd,
  onMove,
  onReorder,
}: {
  pages: readonly Page[];
  current: string | undefined;
  onChoose: (id: string) => void;
  /** Absent when the app holds as many pages as it may. */
  onAdd: (() => void) | undefined;
  /** Left out when the pages may not be reordered (read only). */
  onMove?: ((id: string, by: -1 | 1) => void) | undefined;
  /** Dragging a page by its grip: the ids in their new order. */
  onReorder?: ((ids: string[]) => void) | undefined;
}) {
  const byId = new Map(pages.map((one) => [one.id, one]));
  const sort = useSortable({
    ids: pages.map((one) => one.id),
    nameOf: (id) => byId.get(id)?.title ?? "the page",
    onReorder: (ids) => onReorder?.(ids),
  });
  const draggable = pages.length > 1 && onReorder !== undefined;
  return (
    <section aria-labelledby="pages" className="flex shrink-0 flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <h2 id="pages" className="m-0 text-label text-ink-muted uppercase">
          Pages
        </h2>
        {onAdd ? (
          <Button
            size="small"
            variant="quiet"
            aria-label="Add a page"
            tooltip="Add a page"
            className="-mr-1 px-1.5 text-ink-muted"
            onClick={onAdd}
          >
            <Plus size={14} aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <ul ref={sort.list} className="m-0 flex list-none flex-col gap-0.5 p-0">
        {pages.map((one, at) => {
          const here = one.id === current;
          const kind = kindOf(one);
          const Icon = KIND_ICONS[kind];
          return (
            <li
              key={one.id}
              {...sort.row(one.id)}
              onKeyDown={(event) => {
                if (draggable) sort.rowKeyDown(event, one.id);
              }}
              className={`group relative flex items-center rounded-inner ${LIFTED} ${
                here ? "bg-selected text-action" : "text-ink hover:bg-sunken"
              }`}
            >
              {draggable ? (
                <button
                  type="button"
                  {...sort.handle(one.id)}
                  // For the pointer: the row itself is the keyboard's, and the arrows beside it move it.
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => onChoose(one.id)}
                  className="-mr-1 ml-0.5 grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded-inner text-ink-subtle opacity-0 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus group-hover:opacity-100 pointer-coarse:opacity-100"
                >
                  <GripVertical aria-hidden="true" size={14} />
                </button>
              ) : null}
              <button
                type="button"
                aria-pressed={here}
                onClick={() => onChoose(one.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-inner px-2 py-1.5 text-left"
              >
                <Icon aria-hidden="true" size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-body-sm">{one.title}</span>
                <span
                  className={`shrink-0 text-meta text-ink-muted group-has-[:focus-visible]:invisible group-hover:invisible ${
                    here ? "max-lg:invisible" : ""
                  }`}
                >
                  {KIND_NAMES[kind]}
                </span>
              </button>
              {pages.length > 1 && onMove ? (
                <span
                  className={`absolute inset-y-0 right-0.5 flex items-center rounded-inner opacity-0 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100 ${
                    here ? "max-lg:opacity-100" : ""
                  } ${here ? "bg-selected" : "bg-sunken"}`}
                >
                  <MoveButtons
                    label={one.title}
                    at={at}
                    count={pages.length}
                    onMove={(by) => onMove(one.id, by)}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <span role="status" className="sr-only">
        {sort.said}
      </span>
    </section>
  );
}
