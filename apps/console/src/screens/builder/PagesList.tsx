import type { Page } from "@volvel/manifest";
import { Button, MoveButtons, useFlip } from "@volvel/ui";
import { Plus } from "lucide-react";
import { KIND_NAMES, kindOf } from "./pageKinds.ts";

/**
 * The app's pages, each with its kind: "Money — Page", "Invoice detail — Side
 * sheet", "New invoice — Modal". Choosing one shows it in the builder and its
 * own settings in the inspector. The chosen one can be moved earlier or later
 * (the order of the app's menu), and a page can be added.
 */
export function PagesList({
  pages,
  current,
  onChoose,
  onAdd,
  onMove,
}: {
  pages: readonly Page[];
  current: string | undefined;
  onChoose: (id: string) => void;
  /** Absent when the app holds as many pages as it may. */
  onAdd: (() => void) | undefined;
  onMove: (id: string, by: -1 | 1) => void;
}) {
  const flip = useFlip<HTMLUListElement>(pages.map((one) => one.id).join(","));
  return (
    <section aria-labelledby="pages" className="flex flex-col gap-1">
      <h2 id="pages" className="m-0 text-label text-ink-subtle uppercase">
        Pages
      </h2>
      <ul ref={flip} className="m-0 flex list-none flex-wrap gap-1 p-0 lg:flex-col">
        {pages.map((one, at) => {
          const here = one.id === current;
          return (
            <li key={one.id} data-flip-key={one.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={here}
                onClick={() => onChoose(one.id)}
                className={`flex min-w-0 flex-1 flex-col rounded-inner px-2 py-1 text-left ${
                  here ? "bg-selected text-action" : "text-ink hover:bg-sunken"
                }`}
              >
                <span className="truncate text-body-sm">{one.title}</span>
                <span className="text-meta text-ink-muted">{KIND_NAMES[kindOf(one)]}</span>
              </button>
              {here && pages.length > 1 ? (
                <MoveButtons
                  label={one.title}
                  at={at}
                  count={pages.length}
                  onMove={(by) => onMove(one.id, by)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {onAdd ? (
        <div>
          <Button size="small" variant="quiet" className="lg:justify-start" onClick={onAdd}>
            <Plus size={14} aria-hidden="true" /> Page
          </Button>
        </div>
      ) : null}
    </section>
  );
}
