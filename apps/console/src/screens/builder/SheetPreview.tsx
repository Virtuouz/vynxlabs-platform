import type { Page } from "@volvel/manifest";
import { Button } from "@volvel/ui";
import { ChevronLeft, ChevronRight, Eye, Pencil, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { Catalog } from "../../kit/inspector/model.ts";
import { pageClient } from "./client.ts";
import { views } from "./registry.ts";
import { type FilterValues, PageView } from "./renderer.ts";
import { useSampleRecords } from "./SampleRecord.tsx";

/**
 * The side sheet a row opens, drawn over the canvas as it will be (board 3): "Preview of
 * Invoice detail for INV-9339" and "Edit layout" along the top, the record's page in the
 * middle, and a stepper along the foot that names the records on either side by their
 * heading column ("‹ INV-9338 · 2 of 236 · INV-9340 ›"). Presentation only: its host
 * reads the records.
 */
export function SheetPreview({
  title,
  record,
  position,
  before,
  after,
  onStep,
  onEditLayout,
  onClose,
  children,
}: {
  /** The sheet's page: "Invoice detail". */
  title: string;
  /** The record it is drawn for, by its heading: "INV-9339". */
  record: string | undefined;
  /** Where the record is among those it can step through. */
  position?: { at: number; of: number };
  /** The records on either side, named. */
  before?: string | undefined;
  after?: string | undefined;
  onStep: (by: -1 | 1) => void;
  onEditLayout: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    // An anchor that stays at the top of what is in view as the canvas scrolls, so the sheet is
    // always as tall as the canvas is: on a wide screen the canvas is the window onto the page.
    <div className="pointer-events-none sticky top-0 z-10 h-0 w-full">
      <aside
        aria-label={`Preview of ${title}`}
        data-sheet-preview=""
        className="pointer-events-auto absolute top-0 right-0 flex h-[calc(100vh-9rem)] w-[min(26rem,100%)] flex-col overflow-hidden rounded-panel border border-line-strong bg-surface shadow-modal lg:h-[calc(100cqh-2.5rem)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-action-soft px-3 py-2">
          <p className="m-0 flex min-w-0 items-center gap-2 text-body-sm text-ink-muted">
            <Eye aria-hidden="true" size={14} className="shrink-0 text-action" />
            <span className="truncate">
              Preview of <strong className="font-medium text-ink">{title}</strong>
              {record ? (
                <>
                  {" "}
                  for <strong className="font-mono font-medium text-ink">{record}</strong>
                </>
              ) : null}
            </span>
          </p>
          <span className="flex shrink-0 items-center gap-1">
            <Button size="small" variant="primary" onClick={onEditLayout}>
              <Pencil aria-hidden="true" size={14} /> Edit layout
            </Button>
            <Button size="small" variant="quiet" aria-label="Hide the preview" onClick={onClose}>
              <X aria-hidden="true" size={14} />
            </Button>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
        {position ? (
          <nav
            aria-label="Records"
            className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-2 text-body-sm text-ink-muted"
          >
            <button
              type="button"
              disabled={!before}
              onClick={() => onStep(-1)}
              className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-mono text-ink-muted hover:text-ink disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" size={14} /> {before ?? ""}
            </button>
            <span className="tabular-nums">
              {position.at} of {position.of}
            </span>
            <button
              type="button"
              disabled={!after}
              onClick={() => onStep(1)}
              className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-mono text-ink-muted hover:text-ink disabled:cursor-default disabled:opacity-40"
            >
              {after ?? ""} <ChevronRight aria-hidden="true" size={14} />
            </button>
          </nav>
        ) : null}
      </aside>
    </div>
  );
}

/**
 * `SheetPreview` for a real sheet page: its widgets drawn from a sample record of its
 * table, and a stepper through the table's first rows.
 */
export function SheetPreviewHost({
  root,
  source,
  page,
  pages,
  catalog,
  onEditLayout,
  onClose,
}: {
  root: string;
  source: Parameters<typeof pageClient>[1];
  /** The sheet's page. */
  page: Page;
  pages: readonly Page[];
  catalog: Catalog;
  onEditLayout: () => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string>();
  const sample = useSampleRecords(root, page, catalog, chosen);
  const [values, setValues] = useState<FilterValues>({});
  const named = JSON.stringify(source);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `named` is `source` as one value
  const client = useMemo(
    () =>
      pageClient(
        root,
        source.of === "interface" ? { ...source, page: page.id } : source,
        true,
        sample.record,
      ),
    [root, named, page.id, sample.record],
  );
  const at = sample.items.findIndex((one) => one.id === sample.record);
  const step = (by: -1 | 1) => {
    const to = sample.items[at + by];
    if (to) setChosen(to.id);
  };
  return (
    <SheetPreview
      title={page.title}
      record={sample.name}
      {...(at >= 0 ? { position: { at: at + 1, of: sample.items.length } } : {})}
      before={sample.items[at - 1]?.label}
      after={sample.items[at + 1]?.label}
      onStep={step}
      onEditLayout={onEditLayout}
      onClose={onClose}
    >
      {sample.record ? (
        <PageView
          widgets={page.widgets}
          filters={[]}
          registry={views}
          client={client}
          filterValues={values}
          onFilterValues={setValues}
          record={sample.record}
          pages={pages}
          over
        />
      ) : (
        <p className="m-0 text-body-sm text-ink-muted">
          {sample.loading
            ? "Finding a record to preview with…"
            : "The table has no rows to preview with."}
        </p>
      )}
    </SheetPreview>
  );
}
